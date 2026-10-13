// Reads an uploaded letter (one PDF or up to 10 photographed pages), explains it in
// the user's language, turns deadlines into tasks and updates the case summary.
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { z } from "npm:zod@4.6.7";
import { generateJson, languageName } from "../_shared/anthropic.ts";
import { loadCaseContext, renderCase, today } from "../_shared/case.ts";
import { handler, HttpError } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";
import { Analysis, MAX_PAGES, pageBlock } from "../_shared/schemas.ts";

const Input = z.strictObject({ document_id: z.uuid() });

Deno.serve(handler("analyze-document", Input, async (ctx) => {
  const { supabase, input, profile } = ctx;
  await enforceLimit(ctx, "analyze-document");

  const { data: doc, error: docError } = await supabase.from("documents")
    .select("id, case_id, storage_path, page_paths, mime_type").eq("id", input.document_id).single();
  if (docError || !doc) throw new HttpError(404, "Letter not found", "not_found");

  const paths: string[] = doc.page_paths?.length ? doc.page_paths : [doc.storage_path];
  if (paths.length > MAX_PAGES) throw new HttpError(400, `A letter can have at most ${MAX_PAGES} pages.`, "pages");

  await supabase.from("documents").update({ status: "analyzing", error: null }).eq("id", doc.id);
  try {
    const caseCtx = await loadCaseContext(supabase, doc.case_id);
    const pages = await Promise.all(paths.map(async (path) => {
      const { data: file, error } = await supabase.storage.from("documents").download(path);
      if (error || !file) throw new HttpError(404, "A page of this letter is missing from storage.", "file_missing");
      const mime = path.endsWith(".pdf") ? "application/pdf" : file.type || doc.mime_type;
      return pageBlock(mime, encodeBase64(new Uint8Array(await file.arrayBuffer())));
    }));

    const lang = languageName(profile.language);
    const { data: analysis, usage } = await generateJson({
      system: `Task: read the attached letter (${paths.length} page${paths.length > 1 ? "s" : ""}, in order) and explain it.
Write every explanation, summary, task and meaning in ${lang}. Keep German official names and terms in German where the person will need to recognise them, followed by the explanation.
Today's date is ${today()}. Use it to calculate deadlines that are given as a period.`,
      content: [
        ...pages,
        {
          type: "text",
          text: `The letter above was added to this case:\n\n${renderCase(caseCtx, profile.full_name)}\n\nAnalyse the letter now.`,
        },
      ],
      schema: Analysis,
      effort: "high",
    });
    await recordUsage(ctx, "analyze-document", usage);

    const facts: Record<string, unknown> = { ...(caseCtx.caseRow.facts ?? {}) };
    for (const f of analysis.new_facts) facts[f.key] = f.value;

    const writes: PromiseLike<{ error: { message: string } | null }>[] = [
      supabase.from("documents").update({
        status: "ready",
        title_de: analysis.title_de,
        sender: analysis.sender,
        document_date: analysis.document_date,
        summary: analysis.summary,
        urgency: analysis.urgency,
        analysis,
      }).eq("id", doc.id),
      supabase.from("cases").update({
        summary: analysis.case_summary,
        facts,
        ...(caseCtx.caseRow.reference_number || !analysis.reference_number ? {} : { reference_number: analysis.reference_number }),
        ...(caseCtx.caseRow.authority || !analysis.sender ? {} : { authority: analysis.sender }),
      }).eq("id", doc.case_id),
    ];
    if (analysis.readable && analysis.actions.length) {
      writes.push(supabase.from("tasks").insert(analysis.actions.map((a) => ({
        case_id: doc.case_id,
        user_id: ctx.userId,
        document_id: doc.id,
        title: a.title,
        due_date: a.due_date,
        source: "agent",
      }))));
    }
    const failed = (await Promise.all(writes)).find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return { document_id: doc.id, analysis };
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "Could not read this letter. Please try again.";
    await supabase.from("documents").update({ status: "failed", error: message }).eq("id", doc.id);
    throw error;
  }
}));
