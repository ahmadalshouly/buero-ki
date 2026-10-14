// Output schemas the agent must fill, shared by the functions and their tests.
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { z } from "npm:zod@4.6.7";
import { HttpError } from "./http.ts";

export const MAX_PAGES = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export const Analysis = z.strictObject({
  readable: z.boolean().describe("False if the document is too blurry or incomplete to understand."),
  title_de: z.string().describe("The document's own German title or subject line, e.g. 'Aufforderung zur Mitwirkung'."),
  sender: z.string().nullable().describe("Authority or company that sent it."),
  document_date: z.string().nullable().describe("Date printed on the document, YYYY-MM-DD."),
  document_type: z.string().describe("Kind of document in the user's language, e.g. 'Request for documents'."),
  summary: z.string().describe("One or two sentences in the user's language: what this is and what it wants."),
  explanation: z.string().describe(
    "Full explanation in the user's language, Markdown with short ## headings: What is this letter, What they want from you, What happens if you do nothing, What you should do now.",
  ),
  actions: z.array(z.strictObject({
    title: z.string().describe("Short task in the user's language."),
    due_date: z.string().nullable().describe("YYYY-MM-DD if a deadline exists."),
    how_due_date_was_found: z.string().nullable().describe("Quote or calculation behind the date."),
  })).describe("Concrete things the person must do."),
  key_terms: z.array(z.strictObject({
    term_de: z.string(),
    meaning: z.string().describe("Plain meaning in the user's language."),
  })).describe("German official terms from the document."),
  amounts: z.array(z.strictObject({
    label: z.string().describe("What the amount is, in the user's language."),
    amount_eur: z.number(),
  })).describe("Money amounts in the document (benefits, payments, fees, debts)."),
  urgency: z.enum(["low", "medium", "high"]),
  needs_advice: z.boolean().describe("True if the person should get advice from a Beratungsstelle or lawyer."),
  advice_reason: z.string().nullable().describe("Why advice is recommended, in the user's language."),
  reference_number: z.string().nullable().describe("Aktenzeichen, BG-Nummer, Kundennummer or similar, exactly as printed."),
  case_summary: z.string().describe("Updated summary of the whole case after this document, 2 to 4 sentences in the user's language."),
  new_facts: z.array(z.strictObject({ key: z.string(), value: z.string() }))
    .describe("New stable facts about the person or case (e.g. household size, BG number, approved amount)."),
});
export type Analysis = z.infer<typeof Analysis>;

export const Draft = z.strictObject({
  subject: z.string().describe("German subject line (Betreff), including the reference number if known."),
  body_de: z.string().describe(
    "The complete German letter or email, ready to send, as plain text without Markdown. A letter has these parts in this order, separated by one empty line: sender name and address, recipient name and address, place and date (e.g. 'Berlin, 14.10.2026'), a line starting with 'Betreff: ', salutation, body, closing ('Mit freundlichen Grüßen'), a line '[Unterschrift]', then the printed name. Use [square brackets] for anything the person must fill in.",
  ),
  body_translation: z.string().describe("Faithful translation of body_de in the user's language."),
  notes: z.string().describe(
    "Short notes in the user's language: what to check before sending, what to attach, how to send it (email, post, Einschreiben, in person) and by when.",
  ),
});

export function pageBlock(mime: string, data: string): Anthropic.Beta.BetaContentBlockParam {
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  if ((IMAGE_TYPES as readonly string[]).includes(mime)) {
    return { type: "image", source: { type: "base64", media_type: mime as (typeof IMAGE_TYPES)[number], data } };
  }
  throw new HttpError(415, `Unsupported file type ${mime}. Please upload a JPEG, PNG or PDF.`, "file_type");
}


export const FACT_CATEGORIES = ["identity", "residence", "family", "work", "money", "housing", "health", "contact", "other"] as const;

export const FactSuggestions = z.strictObject({
  facts: z.array(z.strictObject({
    category: z.enum(FACT_CATEGORIES),
    fact: z.string().describe("One short sentence in the user's language, addressed to them, e.g. 'You live in Berlin-Neukölln with your wife and two children.'"),
    replaces_id: z.string().nullable().describe("id of a remembered fact this one corrects or updates, else null."),
  })).describe("At most 3 new facts. Empty if nothing new and lasting was said."),
});
export type FactSuggestions = z.infer<typeof FactSuggestions>;
