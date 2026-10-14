import { FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { fetch as streamingFetch } from "expo/fetch";
import { demoApi } from "./demo";
import { ApiError, EXTENSIONS, validatePages } from "./errors";
import { DAILY_LIMITS } from "./limits";
import { sseParser } from "./sse";
import { isDemo, supabase, supabaseKey, supabaseUrl } from "./supabase";
import type {
  AgentFunction, Case, CaseDocument, CaseStatus, ChatMessage, Draft, NewCase, PickedFile, Profile, SearchResult, Task,
  TimelineItem, UsageToday, UserFact,
} from "./types";

export { ApiError, MAX_PAGES, TERMS_VERSION, type ApiErrorCode } from "./errors";

export type ProfilePatch = Partial<Pick<Profile, "full_name" | "language" | "city" | "onboarded_at" | "ai_consent_at" | "memory_enabled">> & {
  terms_version?: string;
};

export interface Api {
  getProfile(): Promise<Profile>;
  updateProfile(patch: ProfilePatch): Promise<void>;
  getUsage(): Promise<UsageToday>;
  exportData(): Promise<unknown>;
  deleteAccount(): Promise<void>;

  listCases(): Promise<Case[]>;
  getCase(id: string): Promise<Case>;
  createCase(input: NewCase): Promise<Case>;
  updateCase(id: string, patch: Partial<NewCase> & { status?: CaseStatus }): Promise<void>;
  deleteCase(id: string): Promise<void>;
  getTimeline(caseId: string): Promise<TimelineItem[]>;

  listDocuments(caseId: string): Promise<CaseDocument[]>;
  getDocument(id: string): Promise<CaseDocument>;
  getPageUrls(doc: CaseDocument): Promise<string[]>;
  /** Uploads the pages, then has the agent read them. Resolves when the analysis is done. */
  addDocument(caseId: string, pages: PickedFile[]): Promise<CaseDocument>;
  retryDocument(id: string): Promise<CaseDocument>;
  deleteDocument(id: string): Promise<void>;

  listTasks(filter: { caseId?: string; openOnly?: boolean }): Promise<Task[]>;
  createTask(input: { caseId: string; title: string; dueDate: string | null }): Promise<Task>;
  setTaskDone(id: string, done: boolean): Promise<void>;
  deleteTask(id: string): Promise<void>;

  listDrafts(caseId: string): Promise<Draft[]>;
  getDraft(id: string): Promise<Draft>;
  createDraft(input: {
    caseId: string;
    documentId?: string | null;
    kind: "letter" | "email";
    instructions: string;
    reviseDraftId?: string | null;
  }): Promise<Draft>;
  updateDraft(id: string, patch: { subject?: string; body_de?: string }): Promise<void>;
  setDraftStatus(id: string, status: Draft["status"]): Promise<void>;
  deleteDraft(id: string): Promise<void>;

  listMessages(caseId: string): Promise<ChatMessage[]>;
  /** onText receives the answer so far while it is being written. */
  sendMessage(caseId: string, text: string, onText?: (soFar: string) => void): Promise<ChatMessage>;

  search(q: string): Promise<SearchResult[]>;

  /** Kept facts and suggestions still waiting for the person's answer. */
  listFacts(): Promise<UserFact[]>;
  /** Asks the agent whether the latest chat turn holds something worth remembering. */
  learnFacts(caseId: string): Promise<UserFact[]>;
  keepFact(id: string): Promise<void>;
  /** Deletes a fact for good: ignoring a suggestion and forgetting a kept fact are the same. */
  forgetFact(id: string): Promise<void>;
  forgetAllFacts(): Promise<void>;
}

function must<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new ApiError(result.error.message, result.error.code === "PGRST116" ? "not_found" : "error");
  if (result.data === null) throw new ApiError("Not found", "not_found");
  return result.data;
}

function ok(result: { error: { message: string } | null }): void {
  if (result.error) throw new ApiError(result.error.message);
}

async function invoke<T>(db: SupabaseClient, name: string, body: object): Promise<T> {
  const { data, error } = await db.functions.invoke(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null);
    throw new ApiError(payload?.error ?? error.message, payload?.code ?? "error", payload?.requestId);
  }
  if (error instanceof FunctionsFetchError) throw new ApiError(error.message, "offline");
  throw new ApiError(error.message);
}

/** Calls a function that streams its answer as server-sent events; also accepts a plain JSON answer. */
async function invokeStream<T>(
  db: SupabaseClient,
  name: string,
  body: object,
  onDelta: (text: string) => void,
): Promise<T> {
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Not signed in", "auth");

  let res: Awaited<ReturnType<typeof streamingFetch>>;
  try {
    res = await streamingFetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : String(e), "offline");
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.error ?? `Request failed (${res.status})`, payload?.code ?? "error", payload?.requestId);
  }
  if (!res.headers.get("Content-Type")?.includes("text/event-stream") || !res.body) return res.json() as Promise<T>;

  let result: T | undefined;
  let failure: ApiError | undefined;
  const push = sseParser((event) => {
    if (event.type === "delta") onDelta(event.text as string);
    else if (event.type === "done") result = event as T;
    else if (event.type === "error") {
      failure = new ApiError(event.error as string, (event.code as ApiError["code"]) ?? "error", event.requestId as string);
    }
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      push(decoder.decode(value, { stream: true }));
    }
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : String(e), "offline");
  }
  if (failure) throw failure;
  if (!result) throw new ApiError("The answer was cut off. Please try again.", "offline");
  return result;
}

function supabaseApi(db: SupabaseClient): Api {
  async function userId(): Promise<string> {
    const { data } = await db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new ApiError("Not signed in", "auth");
    return id;
  }

  async function analyze(documentId: string): Promise<CaseDocument> {
    // On failure the function marks the letter as failed, so the list shows a retry.
    await invoke(db, "analyze-document", { document_id: documentId });
    return api.getDocument(documentId);
  }

  const api: Api = {
    async getProfile() {
      const id = await userId();
      return must(await db.from("profiles").select("id, full_name, language, city, onboarded_at, ai_consent_at, plan, memory_enabled").eq("id", id).single());
    },
    async updateProfile(patch) {
      ok(await db.from("profiles").update(patch).eq("id", await userId()));
    },
    async getUsage() {
      const profile = await api.getProfile();
      const since = new Date(Date.now() - 86400000).toISOString();
      const rows = must(await db.from("ai_usage").select("function_name").gte("created_at", since));
      const used = { "analyze-document": 0, "draft-reply": 0, "case-chat": 0 } as Record<AgentFunction, number>;
      for (const r of rows as { function_name: AgentFunction }[]) if (r.function_name in used) used[r.function_name]++;
      return { plan: profile.plan, used, limits: DAILY_LIMITS[profile.plan] ?? DAILY_LIMITS.free };
    },
    exportData: () => invoke(db, "export-data", {}),
    async deleteAccount() {
      await invoke(db, "delete-account", { confirm: "DELETE" });
      await db.auth.signOut();
    },

    async listCases() {
      return must(await db.from("cases").select("*").order("updated_at", { ascending: false }));
    },
    async getCase(id) {
      return must(await db.from("cases").select("*").eq("id", id).single());
    },
    async createCase(input) {
      return must(await db.from("cases").insert({
        title: input.title.trim(),
        category: input.category,
        authority: input.authority?.trim() || null,
        reference_number: input.reference_number?.trim() || null,
      }).select().single());
    },
    async updateCase(id, patch) {
      ok(await db.from("cases").update(patch).eq("id", id));
    },
    async deleteCase(id) {
      const uid = await userId();
      const docs = must(await db.from("documents").select("storage_path, page_paths").eq("case_id", id));
      const paths = docs.flatMap((d) => (d.page_paths?.length ? d.page_paths : [d.storage_path]));
      if (paths.length) await db.storage.from("documents").remove(paths);
      // Older uploads may not be referenced by a row any more; clear the case folder too.
      const { data: rest } = await db.storage.from("documents").list(`${uid}/${id}`);
      if (rest?.length) await db.storage.from("documents").remove(rest.map((f) => `${uid}/${id}/${f.name}`));
      ok(await db.from("cases").delete().eq("id", id));
    },
    async getTimeline(caseId) {
      return must(await db.from("case_timeline").select("*").eq("case_id", caseId).order("at", { ascending: false }).limit(100));
    },

    async listDocuments(caseId) {
      return must(await db.from("documents").select("*").eq("case_id", caseId).order("created_at", { ascending: false }));
    },
    async getDocument(id) {
      return must(await db.from("documents").select("*").eq("id", id).single());
    },
    async getPageUrls(doc) {
      const paths = doc.page_paths?.length ? doc.page_paths : [doc.storage_path];
      const { data } = await db.storage.from("documents").createSignedUrls(paths, 60 * 10);
      return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
    },
    async addDocument(caseId, pages) {
      validatePages(pages);
      const uid = await userId();
      const stamp = Date.now();
      const paths = await Promise.all(pages.map(async (page, i) => {
        const path = `${uid}/${caseId}/${stamp}-${i + 1}.${EXTENSIONS[page.mimeType]}`;
        const bytes = await (await fetch(page.uri)).arrayBuffer();
        const upload = await db.storage.from("documents").upload(path, bytes, { contentType: page.mimeType });
        if (upload.error) throw new ApiError(upload.error.message);
        return path;
      }));
      const doc = must(await db.from("documents").insert({
        case_id: caseId,
        storage_path: paths[0],
        page_paths: paths,
        mime_type: pages[0].mimeType,
        file_name: pages[0].name,
      }).select().single()) as CaseDocument;
      return analyze(doc.id);
    },
    retryDocument: analyze,
    async deleteDocument(id) {
      const doc = await api.getDocument(id);
      await db.storage.from("documents").remove(doc.page_paths?.length ? doc.page_paths : [doc.storage_path]);
      ok(await db.from("documents").delete().eq("id", id));
    },

    async listTasks({ caseId, openOnly }) {
      let query = db.from("tasks").select("*");
      if (caseId) query = query.eq("case_id", caseId);
      if (openOnly) query = query.eq("done", false);
      return must(await query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at"));
    },
    async createTask({ caseId, title, dueDate }) {
      return must(await db.from("tasks").insert({
        case_id: caseId,
        title: title.trim(),
        due_date: dueDate,
        source: "user",
      }).select().single());
    },
    async setTaskDone(id, done) {
      ok(await db.from("tasks").update({ done }).eq("id", id));
    },
    async deleteTask(id) {
      ok(await db.from("tasks").delete().eq("id", id));
    },

    async listDrafts(caseId) {
      return must(await db.from("drafts").select("*").eq("case_id", caseId).order("created_at", { ascending: false }));
    },
    async getDraft(id) {
      return must(await db.from("drafts").select("*").eq("id", id).single());
    },
    async createDraft({ caseId, documentId, kind, instructions, reviseDraftId }) {
      const res = await invoke<{ draft: Draft }>(db, "draft-reply", {
        case_id: caseId,
        document_id: documentId ?? null,
        kind,
        instructions,
        revise_draft_id: reviseDraftId ?? null,
      });
      return res.draft;
    },
    async updateDraft(id, patch) {
      ok(await db.from("drafts").update({ ...patch, edited: true }).eq("id", id));
    },
    async setDraftStatus(id, status) {
      ok(await db.from("drafts").update({ status, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", id));
    },
    async deleteDraft(id) {
      ok(await db.from("drafts").delete().eq("id", id));
    },

    async listMessages(caseId) {
      return must(await db.from("messages").select("*").eq("case_id", caseId).order("created_at", { ascending: true }));
    },
    async sendMessage(caseId, text, onText) {
      let soFar = "";
      const res = await invokeStream<{ message: ChatMessage }>(db, "case-chat", { case_id: caseId, message: text }, (delta) => {
        soFar += delta;
        onText?.(soFar);
      });
      return res.message;
    },

    async search(q) {
      const term = q.trim();
      if (term.length < 2) return [];
      return must(await db.rpc("search_everything", { q: term }));
    },

    async listFacts() {
      return must(await db.from("user_facts").select("*").order("created_at", { ascending: true }));
    },
    async learnFacts(caseId) {
      const res = await invoke<{ facts: UserFact[] }>(db, "learn-facts", { case_id: caseId });
      return res.facts;
    },
    async keepFact(id) {
      ok(await db.from("user_facts").update({ status: "kept" }).eq("id", id));
    },
    async forgetFact(id) {
      ok(await db.from("user_facts").delete().eq("id", id));
    },
    async forgetAllFacts() {
      ok(await db.from("user_facts").delete().eq("user_id", await userId()));
    },
  };
  return api;
}

export const api: Api = isDemo ? demoApi : supabaseApi(supabase!);
