// Output schemas the agent must fill, shared by the functions and their tests.
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { z } from "npm:zod@4.6.7";
import { HttpError } from "./http.ts";
import { HELP_KINDS, SPECIALTIES } from "./places.ts";

export const MAX_PAGES = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Whose letter it is. BüroKI only reads letters addressed to the signed-in person. */
export const OWNERSHIP = ["person", "someone_else", "unsure"] as const;

export const Analysis = z.strictObject({
  readable: z.boolean().describe("False if the document is too blurry or incomplete to understand."),
  addressed_to: z.string().nullable().describe(
    "Name of the person or people the letter is addressed to, exactly as printed in the address field or salutation. Null if it names no one.",
  ),
  belongs_to: z.enum(OWNERSHIP).describe(
    "Whose letter this is, compared with the person's name: 'person' if it is theirs, 'someone_else' if it is clearly addressed to another adult, 'unsure' if their name is unknown or you cannot tell.",
  ),
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
  sender_email: z.string().nullable().describe(
    "The sender's email address for replies, exactly as printed in the letter (letterhead, footer or contact box). Prefer the address of the responsible team over a general one. Null if none is printed; never guess one.",
  ),
  advice_search: z.strictObject({
    kind: z.enum(HELP_KINDS).describe(
      "doctor, dentist, psychotherapy, lawyer, or an advice centre: migration (Migrationsberatung), social (Sozialberatung), debt (Schuldnerberatung), tenant (Mieterverein), consumer (Verbraucherzentrale), tax (Lohnsteuerhilfeverein), patient (Patientenberatung).",
    ),
    specialty: z.enum(SPECIALTIES).nullable().describe(
      "For a lawyer, the area of law: migration, social (Jobcenter, Krankenkasse, Rente), tenancy, labour, family, criminal, traffic, tax, insolvency, contract, inheritance, medical. For a doctor: general, paediatrics, gynaecology, ophthalmology, otolaryngology, dermatology, orthopaedics, internal, neurology, psychiatry, urology, cardiology. Null for other kinds.",
    ),
  }).nullable().describe(
    "When needs_advice is true: the best kind of help to look for nearby. A free advice centre is often enough; choose a lawyer for objections with deadlines, court letters, criminal matters or lost benefits. Null when no advice is needed.",
  ),
  reference_number: z.string().nullable().describe("Aktenzeichen, BG-Nummer, Kundennummer or similar, exactly as printed."),
  case_summary: z.string().describe("Updated summary of the whole case after this document, 2 to 4 sentences in the user's language."),
  new_facts: z.array(z.strictObject({ key: z.string(), value: z.string() }))
    .describe("New stable facts about the person or case (e.g. household size, BG number, approved amount)."),
  about_person: z.array(z.strictObject({
    category: z.enum(["identity", "residence", "family", "work", "money", "housing", "health", "contact", "other"]),
    fact: z.string().describe("One short sentence in the user's language, addressed to them, e.g. 'Your address is Hauptstraße 5, 12345 Berlin.'"),
    replaces_id: z.string().nullable().describe("id of a remembered fact this one corrects or updates, else null."),
  })).describe(
    "At most 3 lasting facts about the person this letter is addressed to, worth remembering for other paperwork (address, date of birth, nationality, residence permit and its end date, household members, customer or insurance numbers, approved benefits). Skip anything already remembered or suggested. The person will be asked before anything is kept.",
  ),
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


export const FIELD_TYPES = ["text", "date", "number", "checkbox", "choice", "signature"] as const;

export const FormField = z.strictObject({
  key: z.string().describe("Short unique id for the field, e.g. 'p1_familienname'. Unique within the form."),
  pdf_field: z.string().nullable().describe("Exact name of the matching fillable PDF field from the list given, or null."),
  // A plain number: structured outputs reject the min/max bounds zod adds to .int().
  page: z.number().nullable().describe("Page number, starting at 1."),
  section: z.string().nullable().describe("German section heading the field belongs to, as printed."),
  label_de: z.string().describe("The field's German label as printed on the form."),
  explanation: z.string().describe("One short sentence in the user's language: what to put here."),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string()).describe("Allowed values for choice fields (the PDF's own option values when given), else empty."),
  value: z.string().nullable().describe(
    "Value to enter, written as it must appear on the German form: dates DD.MM.YYYY, checkboxes 'true' or 'false', choices one of options. Null if unknown.",
  ),
  source_note: z.string().nullable().describe("Where the value came from, in the user's language (e.g. 'From your profile'). Null if no value."),
  question: z.string().nullable().describe("If value is null: a plain question in the user's language that the person can answer, with a hint where to find it."),
  required: z.boolean().describe("True if the form marks the field as required or it is clearly needed."),
});
export type FormField = z.infer<typeof FormField>;

export const FormAnalysis = z.strictObject({
  readable: z.boolean().describe("False if the pages are too blurry or incomplete."),
  is_form: z.boolean().describe("False if this is not a form to fill in (e.g. a letter)."),
  title_de: z.string().describe("The form's German title, e.g. 'Antrag auf Bürgergeld (Hauptantrag)'."),
  title: z.string().describe("The form's title in the user's language."),
  summary: z.string().describe("Two or three sentences in the user's language: what the form is for and who it goes to."),
  instructions: z.string().describe(
    "Short Markdown in the user's language: documents to attach, where and how to hand it in, deadline if known, and what not to forget (signature, date).",
  ),
  fields: z.array(FormField).describe(
    "Every field the person fills in, in the order of the form. Leave out fields reserved for the office ('Vom Amt auszufüllen').",
  ),
});
export type FormAnalysis = z.infer<typeof FormAnalysis>;

export const FormAnswers = z.strictObject({
  updates: z.array(z.strictObject({
    key: z.string().describe("Key of the field to set."),
    value: z.string().describe("New value, written as it must appear on the German form."),
    source_note: z.string().describe("Short note in the user's language, e.g. 'From your answer'."),
  })).describe("Only fields the person's message gives a value for."),
  reply: z.string().describe("One or two sentences in the user's language: what was filled in, and what is still missing."),
});

export const FACT_CATEGORIES = ["identity", "residence", "family", "work", "money", "housing", "health", "contact", "other"] as const;

export const FactSuggestions = z.strictObject({
  facts: z.array(z.strictObject({
    category: z.enum(FACT_CATEGORIES),
    fact: z.string().describe("One short sentence in the user's language, addressed to them, e.g. 'You live in Berlin-Neukölln with your wife and two children.'"),
    replaces_id: z.string().nullable().describe("id of a remembered fact this one corrects or updates, else null."),
  })).describe("At most a few new facts. Empty if nothing new and lasting was said."),
});
export type FactSuggestions = z.infer<typeof FactSuggestions>;
