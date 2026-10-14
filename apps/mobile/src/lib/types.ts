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
  amounts?: { label: string; amount_eur: number }[];
}

export interface CaseDocument {
  id: string;
  case_id: string;
  storage_path: string;
  page_paths: string[];
  page_count: number;
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
  revision_of: string | null;
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
  authority?: string | null;
  reference_number?: string | null;
}

export interface TimelineItem {
  case_id: string;
  item_id: string;
  kind: "document" | "draft" | "sent" | "task_done";
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

export type AgentFunction = "analyze-document" | "draft-reply" | "case-chat" | "fill-form";

export interface UsageToday {
  plan: Plan;
  used: Record<AgentFunction, number>;
  limits: Record<AgentFunction, number>;
}
