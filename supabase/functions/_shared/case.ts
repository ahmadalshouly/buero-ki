import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { HttpError } from "./http.ts";

export interface CaseContext {
  caseRow: {
    id: string;
    title: string;
    category: string;
    authority: string | null;
    reference_number: string | null;
    summary: string | null;
    facts: Record<string, unknown>;
  };
  documents: {
    id: string;
    title_de: string | null;
    sender: string | null;
    document_date: string | null;
    summary: string | null;
    created_at: string;
  }[];
  openTasks: { id: string; title: string; due_date: string | null }[];
  sentDrafts: { subject: string; sent_at: string | null }[];
  /** Facts the person agreed BüroKI may remember, across all their cases. */
  personFacts?: { category: string; fact: string }[];
}

export async function loadCaseContext(supabase: SupabaseClient, caseId: string): Promise<CaseContext> {
  const [caseRes, docsRes, tasksRes, draftsRes, factsRes] = await Promise.all([
    supabase.from("cases").select("id, title, category, authority, reference_number, summary, facts").eq("id", caseId).single(),
    supabase.from("documents").select("id, title_de, sender, document_date, summary, created_at")
      .eq("case_id", caseId).eq("status", "ready").order("created_at", { ascending: true }).limit(40),
    supabase.from("tasks").select("id, title, due_date").eq("case_id", caseId).eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false }).limit(30),
    supabase.from("drafts").select("subject, sent_at").eq("case_id", caseId).eq("status", "sent")
      .order("sent_at", { ascending: true }).limit(20),
    supabase.from("user_facts").select("category, fact").eq("status", "kept")
      .order("created_at", { ascending: true }).limit(60),
  ]);
  if (caseRes.error || !caseRes.data) throw new HttpError(404, "Case not found", "not_found");
  return {
    caseRow: caseRes.data,
    documents: docsRes.data ?? [],
    openTasks: tasksRes.data ?? [],
    sentDrafts: draftsRes.data ?? [],
    personFacts: factsRes.data ?? [],
  };
}

/** Plain-text view of the case the agent reads before answering. */
export function renderCase(ctx: CaseContext, fullName: string | null): string {
  const c = ctx.caseRow;
  const list = <T>(items: T[], fmt: (t: T, i: number) => string) => (items.length ? items.map(fmt) : ["- none"]);
  return [
    "<case>",
    `Case: ${c.title}`,
    `Category: ${c.category}`,
    `Authority: ${c.authority ?? "unknown"}`,
    `Reference number: ${c.reference_number ?? "unknown"}`,
    `Person's name: ${fullName ?? "unknown"}`,
    "",
    "About the person (they agreed BüroKI may remember this):",
    ...list(ctx.personFacts ?? [], (f) => `- [${f.category}] ${f.fact}`),
    "",
    `Current summary: ${c.summary ?? "(none yet)"}`,
    `Known facts: ${JSON.stringify(c.facts ?? {})}`,
    "",
    "Letters so far (oldest first):",
    ...list(ctx.documents, (d) =>
      `- [${d.document_date ?? d.created_at.slice(0, 10)}] ${d.title_de ?? "Untitled"} from ${d.sender ?? "unknown"}: ${d.summary ?? ""}`),
    "",
    "Letters the person already sent:",
    ...list(ctx.sentDrafts, (d) => `- [${d.sent_at?.slice(0, 10) ?? "?"}] ${d.subject}`),
    "",
    "Open tasks (short name in brackets):",
    ...list(ctx.openTasks, (t, i) => `- [T${i + 1}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`),
    "</case>",
  ].join("\n");
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
