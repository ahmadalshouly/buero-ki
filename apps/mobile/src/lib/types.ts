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

export interface Profile {
  id: string;
  full_name: string | null;
  language: Language;
  city: string | null;
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
}

export interface CaseDocument {
  id: string;
  case_id: string;
  storage_path: string;
  mime_type: string;
  file_name: string | null;
  status: "uploaded" | "analyzing" | "ready" | "failed";
  sender: string | null;
  document_date: string | null;
  title_de: string | null;
  summary: string | null;
  urgency: "low" | "medium" | "high" | null;
  analysis: Analysis | null;
  error: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  case_id: string;
  document_id: string | null;
  title: string;
  due_date: string | null;
  done: boolean;
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
  created_at: string;
}

export interface ChatMessage {
  id: string;
  case_id: string;
  role: "user" | "assistant";
  content: string;
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
  authority?: string;
  reference_number?: string;
}
