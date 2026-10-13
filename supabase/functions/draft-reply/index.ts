// Drafts a German letter or email for a case, with a translation in the user's
// language. Can also revise an earlier draft from the person's feedback.
import { z } from "npm:zod@4.6.7";
import { generateJson, languageName } from "../_shared/anthropic.ts";
import { loadCaseContext, renderCase, today } from "../_shared/case.ts";
import { handler, HttpError } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";
import { Draft } from "../_shared/schemas.ts";

const Input = z.strictObject({
  case_id: z.uuid(),
  document_id: z.uuid().nullable().optional(),
  kind: z.enum(["letter", "email"]).default("letter"),
  instructions: z.string().trim().min(1, "Please describe what the letter should say.").max(4000),
  revise_draft_id: z.uuid().nullable().optional(),
});

Deno.serve(handler("draft-reply", Input, async (ctx) => {
  const { supabase, input, profile } = ctx;
  await enforceLimit(ctx, "draft-reply");
  const caseCtx = await loadCaseContext(supabase, input.case_id);

  let replyTo = "";
  if (input.document_id) {
    const { data: doc } = await supabase.from("documents")
      .select("title_de, sender, document_date, analysis").eq("id", input.document_id).eq("case_id", input.case_id).single();
    if (doc) replyTo = `\n\nThe person is replying to this letter:\n<letter>\n${JSON.stringify(doc)}\n</letter>`;
  }

  let previous = "";
  if (input.revise_draft_id) {
    const { data: prev } = await supabase.from("drafts")
      .select("subject, body_de").eq("id", input.revise_draft_id).eq("case_id", input.case_id).single();
    if (!prev) throw new HttpError(404, "Draft not found", "not_found");
    previous = `\n\nThis is the current draft. Revise it according to the person's request and keep everything else:\n<draft>\nBetreff: ${prev.subject}\n\n${prev.body_de}\n</draft>`;
  }

  const { data: draft, usage } = await generateJson({
    system: `Task: ${input.revise_draft_id ? "revise" : "draft"} a ${input.kind === "email" ? "short formal German email" : "formal German letter (DIN 5008 style)"} on behalf of the person, in correct, polite, simple official German.
Write only what the person asked for and what the case supports. Never invent facts, amounts or dates; use [square brackets] placeholders instead.
If the person asks for an objection (Widerspruch) and the reasons are not clear, draft a deadline-preserving Widerspruch that requests Akteneinsicht and says the reasons will follow, and mention in the notes that a Beratungsstelle should check the case.
The translation and notes must be in ${languageName(profile.language)}. Today's date is ${today()}.`,
    content: `${renderCase(caseCtx, profile.full_name)}${replyTo}${previous}\n\nWhat the person wants:\n<request>\n${input.instructions}\n</request>`,
    schema: Draft,
    effort: "high",
  });
  await recordUsage(ctx, "draft-reply", usage);

  const { data: saved, error } = await supabase.from("drafts").insert({
    case_id: input.case_id,
    user_id: ctx.userId,
    document_id: input.document_id ?? null,
    revision_of: input.revise_draft_id ?? null,
    kind: input.kind,
    ...draft,
  }).select().single();
  if (error) throw new Error(error.message);
  return { draft: saved };
}));
