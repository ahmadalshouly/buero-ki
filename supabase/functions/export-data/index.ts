// GDPR Art. 15/20: returns everything stored about the signed-in person as JSON,
// with short-lived links to their uploaded files.
import { z } from "npm:zod@4.6.7";
import { handler } from "../_shared/http.ts";

const TABLES = ["cases", "documents", "forms", "tasks", "drafts", "messages", "user_facts", "ai_usage", "audit_log"] as const;
const LINK_SECONDS = 60 * 60;

Deno.serve(handler("export-data", z.strictObject({}), async ({ supabase, userId }) => {
  const [profile, ...rows] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    ...TABLES.map((t) => supabase.from(t).select("*").eq("user_id", userId)),
  ]);
  const data: Record<string, unknown> = { profile: profile.data };
  TABLES.forEach((t, i) => {
    if (rows[i].error) throw new Error(`${t}: ${rows[i].error!.message}`);
    data[t] = rows[i].data;
  });

  type Stored = { storage_path: string; page_paths: string[] | null; filled_path?: string | null };
  const paths = ([...(data.documents as Stored[] ?? []), ...(data.forms as Stored[] ?? [])])
    .flatMap((d) => [...(d.page_paths?.length ? d.page_paths : [d.storage_path]), ...(d.filled_path ? [d.filled_path] : [])]);
  let files: { path: string; url: string | null }[] = [];
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("documents").createSignedUrls(paths, LINK_SECONDS);
    files = (signed ?? []).map((s) => ({ path: s.path ?? "", url: s.signedUrl ?? null }));
  }

  return { exported_at: new Date().toISOString(), format_version: 1, ...data, files };
}, { requireConsent: false }));
