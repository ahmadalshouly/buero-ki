// Drafts a German letter or email for a case, with a translation in the user's language.
import { describeError, generateJson, HttpError, languageName } from "../_shared/anthropic.ts";
import { corsHeaders, json, loadCaseContext, renderCase, userClient } from "../_shared/supabase.ts";

interface Draft {
  subject: string;
  body_de: string;
  body_translation: string;
  notes: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body_de", "body_translation", "notes"],
  properties: {
    subject: { type: "string", description: "German subject line (Betreff), including the reference number if known." },
    body_de: {
      type: "string",
      description: "The complete German letter or email, ready to send. Letters include sender block, recipient block, place and date, Betreff, salutation, body, closing and a signature line. Use [square brackets] for anything the person must fill in.",
    },
    body_translation: { type: "string", description: "Faithful translation of body_de in the user's language." },
    notes: {
      type: "string",
      description: "Short notes in the user's language: what to check before sending, what to attach, how to send it (email, post, Einschreiben, in person) and by when.",
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, userId } = await userClient(req);
    const body = await req.json();
    const caseId: string | undefined = body.case_id;
    const documentId: string | null = body.document_id ?? null;
    const kind: "letter" | "email" = body.kind === "email" ? "email" : "letter";
    const instructions: string = (body.instructions ?? "").toString().slice(0, 4000);
    if (!caseId) throw new HttpError(400, "case_id is required");
    if (!instructions.trim()) throw new HttpError(400, "Please describe what the letter should say.");

    const ctx = await loadCaseContext(supabase, userId, caseId);

    let replyTo = "";
    if (documentId) {
      const { data: doc } = await supabase.from("documents")
        .select("title_de, sender, document_date, analysis").eq("id", documentId).eq("case_id", caseId).single();
      if (doc) {
        replyTo = `\n\nThe person is replying to this document:\n${JSON.stringify(doc)}`;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const draft = await generateJson<Draft>({
      system: `Task: draft a ${kind === "email" ? "short formal German email" : "formal German letter (DIN 5008 style)"} on behalf of the person, in correct, polite, simple official German.
Write only what the person asked for and what the case supports. Never invent facts, amounts or dates; use [square brackets] placeholders instead.
If the person asks for an objection (Widerspruch) and the reasons are not clear, draft a deadline-preserving Widerspruch that requests Akteneinsicht and says the reasons will follow, and mention in the notes that a Beratungsstelle should check the case.
The translation and notes must be in ${languageName(ctx.language)}. Today's date is ${today}.`,
      content: `${renderCase(ctx)}${replyTo}\n\nWhat the person wants the ${kind} to say:\n${instructions}`,
      schema: SCHEMA,
      effort: "high",
    });

    const { data: saved, error } = await supabase.from("drafts").insert({
      case_id: caseId,
      user_id: userId,
      document_id: documentId,
      kind,
      subject: draft.subject,
      body_de: draft.body_de,
      body_translation: draft.body_translation,
      notes: draft.notes,
    }).select().single();
    if (error) throw new Error(error.message);

    return json({ draft: saved });
  } catch (error) {
    const { status, message } = describeError(error);
    return json({ error: message }, status);
  }
});
