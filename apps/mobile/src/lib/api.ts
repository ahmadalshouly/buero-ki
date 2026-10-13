import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { demoApi } from "./demo";
import { isDemo, supabase } from "./supabase";
import type {
  Case, CaseDocument, CaseStatus, ChatMessage, Draft, NewCase, PickedFile, Profile, Task,
} from "./types";

export interface Api {
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, "full_name" | "language" | "city">>): Promise<void>;

  listCases(): Promise<Case[]>;
  getCase(id: string): Promise<Case>;
  createCase(input: NewCase): Promise<Case>;
  setCaseStatus(id: string, status: CaseStatus): Promise<void>;

  listDocuments(caseId: string): Promise<CaseDocument[]>;
  getDocument(id: string): Promise<CaseDocument>;
  getDocumentUrl(doc: CaseDocument): Promise<string | null>;
  /** Uploads the file, then has the agent read it. Resolves when the analysis is done. */
  addDocument(caseId: string, file: PickedFile): Promise<CaseDocument>;
  retryDocument(id: string): Promise<CaseDocument>;

  listTasks(filter: { caseId?: string; openOnly?: boolean }): Promise<Task[]>;
  setTaskDone(id: string, done: boolean): Promise<void>;

  listDrafts(caseId: string): Promise<Draft[]>;
  getDraft(id: string): Promise<Draft>;
  createDraft(input: { caseId: string; documentId?: string | null; kind: "letter" | "email"; instructions: string }): Promise<Draft>;
  setDraftStatus(id: string, status: Draft["status"]): Promise<void>;

  listMessages(caseId: string): Promise<ChatMessage[]>;
  sendMessage(caseId: string, text: string): Promise<ChatMessage>;
}

function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Not found");
  return result.data;
}

async function invoke<T>(db: SupabaseClient, name: string, body: object): Promise<T> {
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw error;
  }
  return data as T;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function supabaseApi(db: SupabaseClient): Api {
  async function userId(): Promise<string> {
    const { data } = await db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error("Not signed in");
    return id;
  }

  async function analyze(documentId: string): Promise<CaseDocument> {
    await invoke(db, "analyze-document", { document_id: documentId });
    return api.getDocument(documentId);
  }

  const api: Api = {
    async getProfile() {
      const id = await userId();
      return must(await db.from("profiles").select("*").eq("id", id).single());
    },
    async updateProfile(patch) {
      const id = await userId();
      const { error } = await db.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async listCases() {
      return must(await db.from("cases").select("*").order("updated_at", { ascending: false }));
    },
    async getCase(id) {
      return must(await db.from("cases").select("*").eq("id", id).single());
    },
    async createCase(input) {
      return must(await db.from("cases").insert({
        title: input.title,
        category: input.category,
        authority: input.authority || null,
        reference_number: input.reference_number || null,
      }).select().single());
    },
    async setCaseStatus(id, status) {
      const { error } = await db.from("cases").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async listDocuments(caseId) {
      return must(await db.from("documents").select("*").eq("case_id", caseId).order("created_at", { ascending: false }));
    },
    async getDocument(id) {
      return must(await db.from("documents").select("*").eq("id", id).single());
    },
    async getDocumentUrl(doc) {
      const { data } = await db.storage.from("documents").createSignedUrl(doc.storage_path, 60 * 10);
      return data?.signedUrl ?? null;
    },
    async addDocument(caseId, file) {
      const uid = await userId();
      const ext = EXTENSIONS[file.mimeType];
      if (!ext) throw new Error("Please choose a JPEG, PNG or PDF file.");
      const path = `${uid}/${caseId}/${Date.now()}.${ext}`;
      const bytes = await (await fetch(file.uri)).arrayBuffer();
      const upload = await db.storage.from("documents").upload(path, bytes, { contentType: file.mimeType });
      if (upload.error) throw new Error(upload.error.message);

      const doc = must(await db.from("documents").insert({
        case_id: caseId,
        storage_path: path,
        mime_type: file.mimeType,
        file_name: file.name,
      }).select().single()) as CaseDocument;
      return analyze(doc.id);
    },
    retryDocument: analyze,

    async listTasks({ caseId, openOnly }) {
      let query = db.from("tasks").select("*");
      if (caseId) query = query.eq("case_id", caseId);
      if (openOnly) query = query.eq("done", false);
      return must(await query.order("due_date", { ascending: true, nullsFirst: false }));
    },
    async setTaskDone(id, done) {
      const { error } = await db.from("tasks").update({ done }).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async listDrafts(caseId) {
      return must(await db.from("drafts").select("*").eq("case_id", caseId).order("created_at", { ascending: false }));
    },
    async getDraft(id) {
      return must(await db.from("drafts").select("*").eq("id", id).single());
    },
    async createDraft({ caseId, documentId, kind, instructions }) {
      const res = await invoke<{ draft: Draft }>(db, "draft-reply", {
        case_id: caseId,
        document_id: documentId ?? null,
        kind,
        instructions,
      });
      return res.draft;
    },
    async setDraftStatus(id, status) {
      const { error } = await db.from("drafts").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async listMessages(caseId) {
      return must(await db.from("messages").select("*").eq("case_id", caseId).order("created_at", { ascending: true }));
    },
    async sendMessage(caseId, text) {
      const res = await invoke<{ message: ChatMessage }>(db, "case-chat", { case_id: caseId, message: text });
      return res.message;
    },
  };
  return api;
}

export const api: Api = isDemo ? demoApi : supabaseApi(supabase!);
