export type Language = "en" | "de" | "ar" | "tr" | "uk" | "fa";

export const LANGUAGES: { code: Language; name: string; rtl: boolean }[] = [
  { code: "en", name: "English", rtl: false },
  { code: "de", name: "Deutsch", rtl: false },
  { code: "ar", name: "العربية", rtl: true },
  { code: "tr", name: "Türkçe", rtl: false },
  { code: "uk", name: "Українська", rtl: false },
  { code: "fa", name: "فارسی", rtl: true },
];

export const CATEGORIES = [
  "jobcenter",
  "auslaenderbehoerde",
  "familienkasse",
  "krankenkasse",
  "finanzamt",
  "buergeramt",
  "housing",
  "work",
  "school",
  "other",
] as const;
export type CaseCategory = (typeof CATEGORIES)[number];

export type CaseStatus = "open" | "waiting" | "closed";

export type Plan = "free" | "plus" | "org";

export interface Profile {
  id: string;
  full_name: string | null;
  language: Language;
  city: string | null;
  onboarded_at: string | null;
  ai_consent_at: string | null;
  plan: Plan;
  /** False: the agent stops suggesting facts to remember. */
  memory_enabled: boolean;
  /** Where replies go when BüroKI sends an email; asked for before the first send. */
  contact_email?: string | null;
}

export interface Case {
  id: string;
  title: string;
  category: CaseCategory;
  authority: string | null;
  reference_number: string | null;
  status: CaseStatus;
  summary: string | null;
  facts: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  readable: boolean;
  /** Whom the letter is addressed to, as printed. Missing on letters read before this was checked. */
  addressed_to?: string | null;
  belongs_to?: "person" | "someone_else" | "unsure";
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
  /** The sender's email for replies, as printed in the letter; offered when sending an email. */
  sender_email?: string | null;
  amounts?: { label: string; amount_eur: number }[];
  about_person?: { category: FactCategory; fact: string; replaces_id: string | null }[];
}

export interface CaseDocument {
  id: string;
  case_id: string;
  storage_path: string;
  page_paths: string[];
  page_count: number;
  mime_type: string;
  file_name: string | null;
  /** needs_owner: BüroKI asks whether the letter is the person's. not_owner: it is someone else's, so it was not read. */
  status: "uploaded" | "analyzing" | "ready" | "failed" | "needs_owner" | "not_owner";
  addressed_to?: string | null;
  sender: string | null;
  document_date: string | null;
  title_de: string | null;
  summary: string | null;
  urgency: "low" | "medium" | "high" | null;
  analysis: Analysis | null;
  error: string | null;
  created_at: string;
}

export interface FormField {
  key: string;
  pdf_field: string | null;
  page: number | null;
  section: string | null;
  label_de: string;
  explanation: string;
  type: "text" | "date" | "number" | "checkbox" | "choice" | "signature";
  options: string[];
  value: string | null;
  source_note: string | null;
  question: string | null;
  required: boolean;
}

export interface CaseForm {
  id: string;
  case_id: string;
  storage_path: string;
  page_paths: string[];
  mime_type: string;
  file_name: string | null;
  /** What the person told BüroKI about their situation when adding the form. */
  situation: string | null;
  status: "uploaded" | "analyzing" | "ready" | "failed";
  /** The PDF has real form fields, so it can be returned filled in. */
  fillable: boolean;
  title_de: string | null;
  title: string | null;
  summary: string | null;
  instructions: string | null;
  fields: FormField[];
  filled_path: string | null;
  filled_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  case_id: string;
  document_id: string | null;
  title: string;
  due_date: string | null;
  done: boolean;
  source: "agent" | "user";
  completed_at: string | null;
  created_at: string;
}

export interface Draft {
  id: string;
  case_id: string;
  document_id: string | null;
  kind: "letter" | "email";
  subject: string;
  body_de: string;
  body_translation: string | null;
  notes: string | null;
  status: "draft" | "approved" | "sent";
  edited: boolean;
  sent_at: string | null;
  /** Where the email went when BüroKI sent it. */
  sent_to?: string | null;
  /** "bueroki" when BüroKI sent it, "self" or empty when the person sent it themselves. */
  sent_via?: "self" | "bueroki" | null;
  revision_of: string | null;
  created_at: string;
}

/** A change the assistant made while answering, such as a task it added or removed. */
export interface ChatAction {
  kind: "task_added" | "task_updated" | "task_done" | "task_removed" | (string & {});
  title: string;
}

export interface ChatMessage {
  id: string;
  case_id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
  created_at: string;
}

export interface PickedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export interface NewCase {
  title: string;
  category: CaseCategory;
  authority?: string | null;
  reference_number?: string | null;
}

export interface TimelineItem {
  case_id: string;
  item_id: string;
  kind: "document" | "draft" | "sent" | "task_done" | "form";
  at: string;
  title: string | null;
  detail: string | null;
  tone: "low" | "medium" | "high" | null;
}

export interface SearchResult {
  kind: "case" | "document";
  id: string;
  case_id: string;
  title: string | null;
  detail: string | null;
  at: string;
}

export const FACT_CATEGORIES = ["identity", "residence", "family", "work", "money", "housing", "health", "contact", "other"] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** Something about the person the agent suggested remembering (pending) or the person kept. */
export interface UserFact {
  id: string;
  category: FactCategory;
  fact: string;
  status: "pending" | "kept";
  case_id: string | null;
  replaces_id: string | null;
  source: "agent" | "user";
  /** Where it came up; null for facts from before this was recorded. */
  origin: FactOrigin | null;
  document_id: string | null;
  created_at: string;
  decided_at: string | null;
}

export type FactOrigin = "chat" | "letter" | "form" | "draft" | "note" | "user";

export type AgentFunction = "analyze-document" | "draft-reply" | "case-chat" | "fill-form";

export interface UsageToday {
  plan: Plan;
  used: Record<AgentFunction, number>;
  limits: Record<AgentFunction, number>;
}

export const HELP_KINDS = [
  "doctor", "dentist", "psychotherapy", "lawyer", "migration", "social", "debt", "tenant", "consumer", "tax", "patient",
] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

/** Where to look: the phone's position, or a city, district or postcode. */
export type HelpWhere = { lat: number; lon: number } | { place: string };

/** A doctor, lawyer or Beratungsstelle from OpenStreetMap. */
export interface HelpPlace {
  id: string;
  kind: HelpKind;
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  /** ISO 639-1 codes of languages the place says it speaks. Most places don't say. */
  languages: string[];
  wheelchair: boolean | null;
}

export interface HelpResult {
  center: { lat: number; lon: number; label: string | null };
  /** Where the places come from, for the attribution line. */
  source?: "google" | "osm";
  places: HelpPlace[];
}
