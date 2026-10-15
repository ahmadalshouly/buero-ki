// Form filling. "analyze" reads a form (PDF or photographed pages), lists its fields
// with an explanation in the person's language and pre-fills what is already known.
// "answer" fills fields from something the person tells the agent in their own words.
// "export" writes the values into a fillable PDF and returns a download link.
import { z } from "npm:zod@4.6.7";
import { generateJson, languageName } from "../_shared/ai.ts";
import { loadCaseContext, renderCase, today } from "../_shared/case.ts";
import { type Ctx, handler, HttpError } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";
import { fillPdf, MAX_PDF_FIELDS, readPdfFields } from "../_shared/pdfForm.ts";
import { filesParts, MAX_PAGES } from "../_shared/pages.ts";
import { FormAnalysis, FormAnswers, type FormField } from "../_shared/schemas.ts";

const Input = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("analyze"), form_id: z.uuid() }),
  z.strictObject({ action: z.literal("answer"), form_id: z.uuid(), message: z.string().trim().min(1).max(4000) }),
  z.strictObject({ action: z.literal("export"), form_id: z.uuid() }),
]);
type Input = z.infer<typeof Input>;

const LINK_SECONDS = 60 * 30;

interface FormRow {
  id: string;
  case_id: string;
  storage_path: string;
  page_paths: string[] | null;
  mime_type: string;
  fillable: boolean;
  situation: string | null;
  fields: FormField[];
}

async function loadForm(ctx: Ctx<Input>): Promise<FormRow> {
  const { data, error } = await ctx.supabase.from("forms")
    .select("id, case_id, storage_path, page_paths, mime_type, fillable, situation, fields").eq("id", ctx.input.form_id).single();
  if (error || !data) throw new HttpError(404, "Form not found", "not_found");
  return data as FormRow;
}

async function download(ctx: Ctx<Input>, path: string): Promise<Blob> {
  const { data, error } = await ctx.supabase.storage.from("documents").download(path);
  if (error || !data) throw new HttpError(404, "A page of this form is missing from storage.", "file_missing");
  return data;
}

/** What the agent may use to pre-fill: the profile, this case, and stable facts from the person's other cases. */
async function personContext(ctx: Ctx<Input>, caseId: string): Promise<string> {
  const [caseCtx, others, profile] = await Promise.all([
    loadCaseContext(ctx.supabase, caseId),
    ctx.supabase.from("cases").select("title, authority, reference_number, facts").neq("id", caseId).limit(20),
    ctx.supabase.from("profiles").select("full_name, city").eq("id", ctx.userId).single(),
  ]);
  const otherCases = (others.data ?? [])
    .map((c) => `- ${c.title} (${c.authority ?? "unknown office"}, ref ${c.reference_number ?? "unknown"}): ${JSON.stringify(c.facts ?? {})}`);
  return [
    "<person>",
    `Name: ${profile.data?.full_name ?? "unknown"}`,
    `City: ${profile.data?.city ?? "unknown"}`,
    "Other cases and what is known from them:",
    ...(otherCases.length ? otherCases : ["- none"]),
    "</person>",
    "",
    renderCase(caseCtx, profile.data?.full_name ?? null),
  ].join("\n");
}

async function analyze(ctx: Ctx<Input>) {
  const { supabase, profile } = ctx;
  await enforceLimit(ctx, "fill-form");
  const form = await loadForm(ctx);
  const paths = form.page_paths?.length ? form.page_paths : [form.storage_path];
  if (paths.length > MAX_PAGES) throw new HttpError(400, `A form can have at most ${MAX_PAGES} pages.`, "pages");

  await supabase.from("forms").update({ status: "analyzing", error: null }).eq("id", form.id);
  try {
    const files = await Promise.all(paths.map(async (path) => {
      const blob = await download(ctx, path);
      const mime = path.endsWith(".pdf") ? "application/pdf" : blob.type || form.mime_type;
      return { mime, bytes: new Uint8Array(await blob.arrayBuffer()) };
    }));
    const pdfFields = files[0].mime === "application/pdf" ? await readPdfFields(files[0].bytes) : [];
    const fillable = pdfFields.length > 0;

    const fieldList = fillable
      ? `\n\nThis PDF has fillable fields. Map every field you list to one of them in pdf_field (exact name). For checkboxes the value is 'true' or 'false'; for choice fields use one of the listed options exactly.\n<pdf_fields>\n${
        pdfFields.slice(0, MAX_PDF_FIELDS).map((f) =>
          JSON.stringify({ name: f.name, type: f.type, page: f.page, tooltip: f.tooltip, options: f.options.length ? f.options : undefined })
        ).join("\n")
      }\n</pdf_fields>`
      : "\n\nThe form is a scan or photo without fillable fields. Set pdf_field to null.";

    const context = await personContext(ctx, form.case_id);
    const situation = form.situation?.trim()
      ? `\n\nWhat the person told you about their situation, in their own words. Use it to fill every field it answers:\n<situation>\n${form.situation.trim()}\n</situation>`
      : "";
    const { data: result, usage } = await generateJson({
      system: `Task: help the person fill in the attached German form (${paths.length} file${paths.length > 1 ? "s" : ""}, in order).
List every field the person has to fill in, in the order of the form, and pre-fill every value that the person's data below supports. Write values in German, exactly as they belong on the form.
Never guess personal data: if the data below does not say it, leave the value null and ask a short question instead. Do not fill signature fields; mark them type 'signature'.
Write explanations, questions, notes, the summary and the instructions in ${languageName(profile.language)}. Keep each explanation to one short sentence.
Today's date is ${today()}. Use it for date fields such as 'Datum' next to the signature.`,
      content: [
        ...await filesParts(files),
        { type: "text", text: `The person's data:\n\n${context}${situation}${fieldList}\n\nList the form's fields now.` },
      ],
      schema: FormAnalysis,
      maxTokens: 64000,
    });
    await recordUsage(ctx, "fill-form", usage);

    const known = new Set(pdfFields.map((f) => f.name));
    const fields = result.fields.map((f) => ({
      ...f,
      page: f.page === null ? null : Math.round(f.page),
      pdf_field: f.pdf_field && known.has(f.pdf_field) ? f.pdf_field : null,
    }));
    const usable = result.readable && result.is_form;
    const { data: saved, error } = await supabase.from("forms").update({
      status: usable ? "ready" : "failed",
      error: usable ? null : result.readable ? "not_a_form" : "unreadable",
      fillable,
      title_de: result.title_de,
      title: result.title,
      summary: result.summary,
      instructions: result.instructions,
      fields,
      filled_path: null,
      filled_at: null,
    }).eq("id", form.id).select().single();
    if (error) throw new Error(error.message);
    return { form: saved };
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "Could not read this form. Please try again.";
    await supabase.from("forms").update({ status: "failed", error: message }).eq("id", form.id);
    throw error;
  }
}

async function answer(ctx: Ctx<Input & { action: "answer" }>) {
  const { supabase, profile, input } = ctx;
  await enforceLimit(ctx, "fill-form");
  const form = await loadForm(ctx);
  const fields = form.fields.map((f) => ({
    key: f.key, label_de: f.label_de, type: f.type, options: f.options.length ? f.options : undefined, value: f.value,
  }));

  const { data: result, usage } = await generateJson({
    system: `Task: the person is filling in a German form and told you something in their own words. Set every field their message gives a value for. Write values in German, exactly as they belong on the form: dates DD.MM.YYYY, checkboxes 'true' or 'false', choices one of the options.
Only use what the message says. Do not change fields the message does not cover. If the message answers a question about one field, set that field, and any other field the answer clearly covers. If the person does not know or does not have something, set nothing and say in the reply where they can find it or what to do. Reply in ${languageName(profile.language)}. Today's date is ${today()}.`,
    content: `<fields>\n${fields.map((f) => JSON.stringify(f)).join("\n")}\n</fields>\n\nWhat the person said:\n<message>\n${input.message}\n</message>`,
    schema: FormAnswers,
  });
  await recordUsage(ctx, "fill-form", usage);

  const updates = new Map(result.updates.map((u) => [u.key, u]));
  const next = form.fields.map((f) => {
    const u = updates.get(f.key);
    return u ? { ...f, value: u.value, source_note: u.source_note, question: null } : f;
  });
  const { data: saved, error } = await supabase.from("forms").update({ fields: next }).eq("id", form.id).select().single();
  if (error) throw new Error(error.message);
  return { form: saved, reply: result.reply, updated: [...updates.keys()].filter((k) => next.some((f) => f.key === k)) };
}

async function exportPdf(ctx: Ctx<Input>) {
  const { supabase, userId } = ctx;
  const form = await loadForm(ctx);
  if (!form.fillable) throw new HttpError(400, "This form has no fillable fields. Use the filling sheet instead.", "input");

  const original = new Uint8Array(await (await download(ctx, form.storage_path)).arrayBuffer());
  const values = form.fields
    .filter((f) => f.pdf_field && f.value !== null && f.value !== "")
    .map((f) => ({ pdf_field: f.pdf_field!, value: f.value! }));
  const { bytes, filled, skipped } = await fillPdf(original, values);

  const { data: old } = await supabase.from("forms").select("filled_path").eq("id", form.id).single();
  const path = `${userId}/${form.case_id}/form-${form.id}-filled-${Date.now()}.pdf`;
  const upload = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
  if (upload.error) throw new Error(upload.error.message);
  if (old?.filled_path) await supabase.storage.from("documents").remove([old.filled_path]);

  const { error } = await supabase.from("forms").update({ filled_path: path, filled_at: new Date().toISOString() }).eq("id", form.id);
  if (error) throw new Error(error.message);
  const { data: link } = await supabase.storage.from("documents").createSignedUrl(path, LINK_SECONDS);
  ctx.log("form exported", { filled, skipped: skipped.length });
  return { url: link?.signedUrl ?? null, path, filled, skipped };
}

Deno.serve(handler("fill-form", Input, (ctx) => {
  const input = ctx.input;
  if (input.action === "analyze") return analyze(ctx);
  if (input.action === "answer") return answer(ctx as Ctx<typeof input>);
  return exportPdf(ctx);
}));
