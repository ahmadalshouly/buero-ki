// Reads an uploaded letter (photo or PDF), explains it in the user's language,
// pulls out deadlines as tasks, and updates the case summary and facts.
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { describeError, generateJson, HttpError, languageName } from "../_shared/anthropic.ts";
import { corsHeaders, json, loadCaseContext, renderCase, userClient } from "../_shared/supabase.ts";

interface Analysis {
  readable: boolean;
  title_de: string;
  sender: string | null;
  document_date: string | null;
  document_type: string;
  summary: string;
  explanation: string;
  actions: { title: string; due_date: string | null; how_due_date_was_found: string | null }[];
  key_terms: { term_de: string; meaning: string }[];
  urgency: "low" | "medium" | "high";
  needs_advice: boolean;
  advice_reason: string | null;
  reference_number: string | null;
  case_summary: string;
  new_facts: { key: string; value: string }[];
}

const nullableString = { type: ["string", "null"] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "readable", "title_de", "sender", "document_date", "document_type", "summary", "explanation",
    "actions", "key_terms", "urgency", "needs_advice", "advice_reason", "reference_number",
    "case_summary", "new_facts",
  ],
  properties: {
    readable: { type: "boolean", description: "False if the document is too blurry or incomplete to understand." },
    title_de: { type: "string", description: "The document's own German title or subject line, e.g. 'Aufforderung zur Mitwirkung'." },
    sender: { ...nullableString, description: "Authority or company that sent it." },
    document_date: { ...nullableString, description: "Date printed on the document, YYYY-MM-DD." },
    document_type: { type: "string", description: "Kind of document in the user's language, e.g. 'Request for documents'." },
    summary: { type: "string", description: "One or two sentences in the user's language: what this is and what it wants." },
    explanation: {
      type: "string",
      description: "Full explanation in the user's language, Markdown with short headings: What is this letter, What they want from you, What happens if you do nothing, What you should do now.",
    },
    actions: {
      type: "array",
      description: "Concrete things the person must do, each as a short task in the user's language.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "due_date", "how_due_date_was_found"],
        properties: {
          title: { type: "string" },
          due_date: { ...nullableString, description: "YYYY-MM-DD if a deadline exists." },
          how_due_date_was_found: { ...nullableString, description: "Quote or calculation behind the date." },
        },
      },
    },
    key_terms: {
      type: "array",
      description: "German official terms from the document with a plain meaning in the user's language.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term_de", "meaning"],
        properties: { term_de: { type: "string" }, meaning: { type: "string" } },
      },
    },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
    needs_advice: { type: "boolean", description: "True if the person should get advice from a Beratungsstelle or lawyer." },
    advice_reason: { ...nullableString, description: "Why advice is recommended, in the user's language." },
    reference_number: { ...nullableString, description: "Aktenzeichen, BG-Nummer, Kundennummer or similar, exactly as printed." },
    case_summary: {
      type: "string",
      description: "Updated summary of the whole case after this document, 2 to 4 sentences in the user's language.",
    },
    new_facts: {
      type: "array",
      description: "New stable facts about the person or case learned from this document (e.g. household size, Bedarfsgemeinschaft number, approved amount).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value"],
        properties: { key: { type: "string" }, value: { type: "string" } },
      },
    },
  },
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let documentId: string | undefined;
  let supabaseForError: Awaited<ReturnType<typeof userClient>>["supabase"] | undefined;
  try {
    const { supabase, userId } = await userClient(req);
    supabaseForError = supabase;
    ({ document_id: documentId } = await req.json());
    if (!documentId) throw new HttpError(400, "document_id is required");

    const { data: doc, error: docError } = await supabase
      .from("documents").select("id, case_id, storage_path, mime_type").eq("id", documentId).single();
    if (docError || !doc) throw new HttpError(404, "Document not found");

    await supabase.from("documents").update({ status: "analyzing", error: null }).eq("id", doc.id);

    const ctx = await loadCaseContext(supabase, userId, doc.case_id);
    const { data: file, error: fileError } = await supabase.storage.from("documents").download(doc.storage_path);
    if (fileError || !file) throw new HttpError(404, "File not found in storage");
    const data = encodeBase64(new Uint8Array(await file.arrayBuffer()));

    let block: Anthropic.Beta.BetaContentBlockParam;
    if (doc.mime_type === "application/pdf") {
      block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (IMAGE_TYPES.has(doc.mime_type)) {
      block = {
        type: "image",
        source: { type: "base64", media_type: doc.mime_type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
      };
    } else {
      throw new HttpError(415, `Unsupported file type ${doc.mime_type}. Please upload a JPEG, PNG or PDF.`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const lang = languageName(ctx.language);
    const analysis = await generateJson<Analysis>({
      system: `Task: read the attached document that the person received or photographed, and explain it.
Write every explanation, summary, task and meaning in ${lang}. Keep German official names and terms in German where the person will need to recognise them, followed by the explanation.
Today's date is ${today}. Use it to calculate deadlines that are given as a period.`,
      content: [
        block,
        {
          type: "text",
          text: `This document was added to the following case:\n\n${renderCase(ctx)}\n\nAnalyse the document now.`,
        },
      ],
      schema: SCHEMA,
      effort: "high",
    });

    const facts = { ...(ctx.caseRow.facts ?? {}) } as Record<string, string>;
    for (const f of analysis.new_facts) facts[f.key] = f.value;

    const updates: PromiseLike<{ error: { message: string } | null }>[] = [
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
        ...(ctx.caseRow.reference_number || !analysis.reference_number
          ? {}
          : { reference_number: analysis.reference_number }),
        ...(ctx.caseRow.authority || !analysis.sender ? {} : { authority: analysis.sender }),
      }).eq("id", doc.case_id),
    ];
    if (analysis.readable && analysis.actions.length) {
      updates.push(
        supabase.from("tasks").insert(analysis.actions.map((a) => ({
          case_id: doc.case_id,
          user_id: userId,
          document_id: doc.id,
          title: a.title,
          due_date: a.due_date,
        }))),
      );
    }
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return json({ document_id: doc.id, analysis });
  } catch (error) {
    const { status, message } = describeError(error);
    if (documentId && supabaseForError) {
      await supabaseForError.from("documents").update({ status: "failed", error: message }).eq("id", documentId);
    }
    return json({ error: message }, status);
  }
});
