// Reads an uploaded letter (one PDF or up to 10 photographed pages), explains it in
// the user's language, turns deadlines into tasks and updates the case summary.
// BüroKI only reads the person's own letters: a letter addressed to someone else is
// declined (that person can make their own account), and when it can't tell, it asks.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { z } from "npm:zod@4.6.7";
import { generateJson, languageName } from "../_shared/ai.ts";
import { type CaseContext, loadCaseContext, renderCase, today } from "../_shared/case.ts";
import { isEmailAddress } from "../_shared/email.ts";
import { type Ctx, handler, HttpError } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";
import { MAX_PAGES, pageParts } from "../_shared/pages.ts";
import { Analysis } from "../_shared/schemas.ts";

const Input = z.strictObject({
  document_id: z.uuid(),
  // The person's answer when BüroKI asked whether a letter is theirs.
  owner: z.enum(["mine", "not_mine"]).optional(),
});
type Input = z.infer<typeof Input>;

interface DocRow {
  id: string;
  case_id: string;
  storage_path: string;
  page_paths: string[] | null;
  mime_type: string;
  status: string;
  analysis: Analysis | null;
}

type KnownFact = { id: string; category: string; fact: string; status: string };

const OWNERSHIP_RULES = `First decide whose letter this is (addressed_to, belongs_to). BüroKI helps only with the person's own paperwork.
- "person": addressed to them. Spelling variants, transliterations, a missing middle name, swapped name order or a married name count as the same person. Also "person" when addressed to them together with others ("Herrn und Frau …", "Familie …", a Bedarfsgemeinschaft they belong to), to the parents of a child, or when the letter names no addressee.
- "someone_else": clearly addressed only to another adult, e.g. a different first name.
- "unsure": the person's name is unknown, or you cannot tell.
Fill in every other field as usual either way.`;

async function loadPerson(supabase: SupabaseClient, userId: string, caseId: string) {
  const [caseCtx, memory, known] = await Promise.all([
    loadCaseContext(supabase, caseId),
    supabase.from("profiles").select("memory_enabled").eq("id", userId).single(),
    supabase.from("user_facts").select("id, category, fact, status").order("created_at", { ascending: true }).limit(80),
  ]);
  return { caseCtx, memoryEnabled: memory.data?.memory_enabled !== false, knownFacts: (known.data ?? []) as KnownFact[] };
}

Deno.serve(handler("analyze-document", Input, async (ctx) => {
  const { supabase, input } = ctx;

  const { data, error: docError } = await supabase.from("documents")
    .select("id, case_id, storage_path, page_paths, mime_type, status, analysis").eq("id", input.document_id).single();
  if (docError || !data) throw new HttpError(404, "Letter not found", "not_found");
  const doc = data as DocRow;

  if (input.owner) return answerOwner(ctx, doc, input.owner);

  await enforceLimit(ctx, "analyze-document");
  const paths: string[] = doc.page_paths?.length ? doc.page_paths : [doc.storage_path];
  if (paths.length > MAX_PAGES) throw new HttpError(400, `A letter can have at most ${MAX_PAGES} pages.`, "pages");

  await supabase.from("documents").update({ status: "analyzing", error: null }).eq("id", doc.id);
  try {
    const person = await loadPerson(supabase, ctx.userId, doc.case_id);
    const pages = await Promise.all(paths.map(async (path) => {
      const { data: file, error } = await supabase.storage.from("documents").download(path);
      if (error || !file) throw new HttpError(404, "A page of this letter is missing from storage.", "file_missing");
      const mime = path.endsWith(".pdf") ? "application/pdf" : file.type || doc.mime_type;
      return pageParts(mime, new Uint8Array(await file.arrayBuffer()));
    }));

    const lang = languageName(ctx.profile.language);
    const { data: analysis, usage } = await generateJson({
      system: `Task: read the attached letter (${paths.length} page${paths.length > 1 ? "s" : ""}, in order) and explain it.
${OWNERSHIP_RULES}
Write every explanation, summary, task and meaning in ${lang}. Keep German official names and terms in German where the person will need to recognise them, followed by the explanation.
Today's date is ${today()}. Use it to calculate deadlines that are given as a period.`,
      content: [
        ...pages.flat(),
        {
          type: "text",
          text: `The letter above was added to this case:\n\n${renderCase(person.caseCtx, ctx.profile.full_name)}\n\n` +
            `Already remembered or suggested about the person (do not repeat these in about_person):\n` +
            (person.knownFacts.length
              ? person.knownFacts.map((f) => `- id ${f.id} [${f.category}, ${f.status}] ${f.fact}`).join("\n")
              : "- nothing yet") +
            "\n\nAnalyse the letter now.",
        },
      ],
      schema: Analysis,
    });
    await recordUsage(ctx, "analyze-document", usage);
    // The app offers this address when the person sends an email; they can still change it.
    const email = analysis.sender_email?.trim().toLowerCase() ?? "";
    analysis.sender_email = isEmailAddress(email) ? email : null;

    if (analysis.belongs_to === "someone_else") return await decline(ctx, doc.id, analysis.addressed_to);
    if (analysis.belongs_to === "unsure") {
      // Kept until the person answers, so saying "it's mine" doesn't read the letter twice.
      const { error } = await supabase.from("documents")
        .update({ status: "needs_owner", addressed_to: analysis.addressed_to, analysis }).eq("id", doc.id);
      if (error) throw new Error(error.message);
      return { document_id: doc.id, ownership: "ask", addressed_to: analysis.addressed_to };
    }
    await apply(ctx, doc, analysis, person);
    return { document_id: doc.id, analysis };
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "Could not read this letter. Please try again.";
    await supabase.from("documents").update({ status: "failed", error: message }).eq("id", doc.id);
    throw error;
  }
}));

async function answerOwner(ctx: Ctx<Input>, doc: DocRow, owner: "mine" | "not_mine") {
  if (doc.status !== "needs_owner" || !doc.analysis) {
    throw new HttpError(409, "This letter is not waiting for an answer.", "state");
  }
  if (owner === "not_mine") return await decline(ctx, doc.id, doc.analysis.addressed_to);
  await apply(ctx, doc, doc.analysis, await loadPerson(ctx.supabase, ctx.userId, doc.case_id));
  return { document_id: doc.id, analysis: doc.analysis };
}

/** Keeps nothing from someone else's letter except whom it is addressed to. */
async function decline(ctx: Ctx<Input>, docId: string, addressedTo: string | null) {
  const { error } = await ctx.supabase.from("documents").update({
    status: "not_owner",
    addressed_to: addressedTo,
    analysis: null,
    title_de: null,
    sender: null,
    document_date: null,
    summary: null,
    urgency: null,
    error: null,
  }).eq("id", docId);
  if (error) throw new Error(error.message);
  ctx.log("letter addressed to someone else");
  return { document_id: docId, ownership: "not_owner", addressed_to: addressedTo };
}

/** Saves the analysis to the letter and the case, adds its tasks and suggests facts to remember. */
async function apply(
  ctx: Ctx<Input>,
  doc: DocRow,
  analysis: Analysis,
  { caseCtx, knownFacts, memoryEnabled }: { caseCtx: CaseContext; knownFacts: KnownFact[]; memoryEnabled: boolean },
) {
  const { supabase } = ctx;
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
      addressed_to: analysis.addressed_to,
      analysis,
      error: null,
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

  // Facts about the person wait as suggestions; the letter screen asks whether to keep each one.
  if (analysis.readable && analysis.about_person.length && memoryEnabled) {
    const keptIds = new Set(knownFacts.filter((f) => f.status === "kept").map((f) => f.id));
    const { error } = await supabase.from("user_facts").insert(analysis.about_person.slice(0, 3).map((f) => ({
      user_id: ctx.userId,
      case_id: doc.case_id,
      document_id: doc.id,
      origin: "letter",
      category: f.category,
      fact: f.fact.trim().slice(0, 300),
      replaces_id: f.replaces_id && keptIds.has(f.replaces_id) ? f.replaces_id : null,
    })).filter((f) => f.fact));
    // Suggestions are a bonus; the letter itself was read fine.
    if (error) ctx.log("fact suggestions not saved", { error: error.message });
  }
}
