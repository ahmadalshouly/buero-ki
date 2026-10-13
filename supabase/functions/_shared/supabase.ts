import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { HttpError } from "./anthropic.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// A client that acts as the calling user, so row level security applies to every query.
export async function userClient(req: Request): Promise<{ supabase: SupabaseClient; userId: string }> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new HttpError(401, "Not signed in");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data, error } = await supabase.auth.getUser(authorization.replace("Bearer ", ""));
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  return { supabase, userId: data.user.id };
}

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
  language: string;
  fullName: string | null;
  documents: { id: string; title_de: string | null; sender: string | null; document_date: string | null; summary: string | null; created_at: string }[];
  openTasks: { title: string; due_date: string | null }[];
}

export async function loadCaseContext(supabase: SupabaseClient, userId: string, caseId: string): Promise<CaseContext> {
  const [caseRes, profileRes, docsRes, tasksRes] = await Promise.all([
    supabase.from("cases").select("id, title, category, authority, reference_number, summary, facts").eq("id", caseId).single(),
    supabase.from("profiles").select("language, full_name").eq("id", userId).single(),
    supabase.from("documents").select("id, title_de, sender, document_date, summary, created_at")
      .eq("case_id", caseId).eq("status", "ready").order("created_at", { ascending: true }).limit(40),
    supabase.from("tasks").select("title, due_date").eq("case_id", caseId).eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  if (caseRes.error || !caseRes.data) throw new HttpError(404, "Case not found");
  return {
    caseRow: caseRes.data,
    language: profileRes.data?.language ?? "en",
    fullName: profileRes.data?.full_name ?? null,
    documents: docsRes.data ?? [],
    openTasks: tasksRes.data ?? [],
  };
}

// Plain-text view of the case the agent reads before answering.
export function renderCase(ctx: CaseContext): string {
  const c = ctx.caseRow;
  const lines = [
    `Case: ${c.title}`,
    `Category: ${c.category}`,
    `Authority: ${c.authority ?? "unknown"}`,
    `Reference number: ${c.reference_number ?? "unknown"}`,
    `Person's name: ${ctx.fullName ?? "unknown"}`,
    "",
    `Current summary: ${c.summary ?? "(none yet)"}`,
    `Known facts: ${JSON.stringify(c.facts ?? {})}`,
    "",
    "Documents so far (oldest first):",
    ...(ctx.documents.length
      ? ctx.documents.map((d) =>
        `- [${d.document_date ?? d.created_at.slice(0, 10)}] ${d.title_de ?? "Untitled"} from ${d.sender ?? "unknown"}: ${d.summary ?? ""}`
      )
      : ["- none"]),
    "",
    "Open tasks:",
    ...(ctx.openTasks.length
      ? ctx.openTasks.map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`)
      : ["- none"]),
  ];
  return lines.join("\n");
}
