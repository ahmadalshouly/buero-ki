// Demo mode: an in-memory backend with one sample case, used when no Supabase
// project is configured. Lets anyone click through the app without an account.
import type { Api } from "./api";
import type { Analysis, Case, CaseDocument, ChatMessage, Draft, Profile, Task } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
let counter = 100;
const id = () => `demo-${++counter}`;

const sampleAnalysis: Analysis = {
  readable: true,
  title_de: "Aufforderung zur Mitwirkung",
  sender: "Jobcenter Berlin Mitte",
  document_date: day(-3),
  document_type: "Request for documents",
  summary: "The Jobcenter needs more documents before it can decide on your Bürgergeld application. Send them by the deadline or payments may be refused.",
  explanation: `## What is this letter?
An **Aufforderung zur Mitwirkung** (request to cooperate). The Jobcenter is working on your Bürgergeld application and is missing some papers.

## What do they want from you?
- Your **Mietvertrag** (rental contract)
- **Kontoauszüge** (bank statements) for the last 3 months
- A copy of your **residence permit**

## What happens if you do nothing?
After the deadline the Jobcenter can refuse the money (§ 66 SGB I). You can still send the papers later, but payments may start late.

## What you should do now
1. Collect the three documents.
2. Send copies, never originals, by ${day(11)}.
3. Write your BG number on every page.`,
  actions: [
    { title: "Send rental contract to the Jobcenter", due_date: day(11), how_due_date_was_found: "Letter says: bis zum " + day(11) },
    { title: "Send bank statements for the last 3 months", due_date: day(11), how_due_date_was_found: "Same deadline" },
    { title: "Send a copy of your residence permit", due_date: day(11), how_due_date_was_found: "Same deadline" },
  ],
  key_terms: [
    { term_de: "Mitwirkungspflicht", meaning: "Your duty to help the office by giving information and documents." },
    { term_de: "Bedarfsgemeinschaft (BG)", meaning: "Everyone in your household who is counted together for Bürgergeld." },
    { term_de: "Kontoauszüge", meaning: "Bank statements showing money in and out of your account." },
  ],
  urgency: "high",
  needs_advice: false,
  advice_reason: null,
  reference_number: "BG 12345//0067890",
};

const state = {
  profile: { id: "demo-user", full_name: "Amina", language: "en", city: "Berlin" } as Profile,
  cases: [
    {
      id: "demo-case-1",
      title: "Bürgergeld application",
      category: "jobcenter",
      authority: "Jobcenter Berlin Mitte",
      reference_number: "BG 12345//0067890",
      status: "open",
      summary: "You applied for Bürgergeld. The Jobcenter asked for your rental contract, bank statements and residence permit. Send them by the deadline so the application can be decided.",
      facts: { household: "2 adults, 1 child" },
      created_at: day(-10) + "T09:00:00Z",
      updated_at: now(),
    },
  ] as Case[],
  documents: [
    {
      id: "demo-doc-1",
      case_id: "demo-case-1",
      storage_path: "",
      mime_type: "image/jpeg",
      file_name: "letter.jpg",
      status: "ready",
      sender: sampleAnalysis.sender,
      document_date: sampleAnalysis.document_date,
      title_de: sampleAnalysis.title_de,
      summary: sampleAnalysis.summary,
      urgency: "high",
      analysis: sampleAnalysis,
      error: null,
      created_at: day(-2) + "T10:00:00Z",
    },
  ] as CaseDocument[],
  tasks: sampleAnalysis.actions.map((a, i) => ({
    id: `demo-task-${i}`,
    case_id: "demo-case-1",
    document_id: "demo-doc-1",
    title: a.title,
    due_date: a.due_date,
    done: false,
    created_at: day(-2) + "T10:00:00Z",
  })) as Task[],
  drafts: [] as Draft[],
  messages: [] as ChatMessage[],
};

function find<T extends { id: string }>(list: T[], key: string): T {
  const item = list.find((x) => x.id === key);
  if (!item) throw new Error("Not found");
  return item;
}

function touch(caseId: string) {
  const c = state.cases.find((x) => x.id === caseId);
  if (c) c.updated_at = now();
}

export const demoApi: Api = {
  async getProfile() {
    return { ...state.profile };
  },
  async updateProfile(patch) {
    Object.assign(state.profile, patch);
  },

  async listCases() {
    return [...state.cases].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async getCase(key) {
    return { ...find(state.cases, key) };
  },
  async createCase(input) {
    const c: Case = {
      id: id(),
      title: input.title,
      category: input.category,
      authority: input.authority || null,
      reference_number: input.reference_number || null,
      status: "open",
      summary: null,
      facts: {},
      created_at: now(),
      updated_at: now(),
    };
    state.cases.push(c);
    return c;
  },
  async setCaseStatus(key, status) {
    find(state.cases, key).status = status;
  },

  async listDocuments(caseId) {
    return state.documents.filter((d) => d.case_id === caseId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getDocument(key) {
    return { ...find(state.documents, key) };
  },
  async getDocumentUrl() {
    return null;
  },
  async addDocument(caseId, file) {
    await wait(1800);
    const analysis: Analysis = {
      ...sampleAnalysis,
      title_de: "Demo letter",
      summary: "Demo mode: this is sample text. Connect Supabase and an Anthropic API key so BüroKI can read your real letter.",
      actions: [{ title: "Connect BüroKI to Supabase to read real letters", due_date: day(7), how_due_date_was_found: null }],
      urgency: "low",
    };
    const doc: CaseDocument = {
      id: id(),
      case_id: caseId,
      storage_path: "",
      mime_type: file.mimeType,
      file_name: file.name,
      status: "ready",
      sender: analysis.sender,
      document_date: day(0),
      title_de: analysis.title_de,
      summary: analysis.summary,
      urgency: analysis.urgency,
      analysis,
      error: null,
      created_at: now(),
    };
    state.documents.push(doc);
    for (const a of analysis.actions) {
      state.tasks.push({ id: id(), case_id: caseId, document_id: doc.id, title: a.title, due_date: a.due_date, done: false, created_at: now() });
    }
    touch(caseId);
    return doc;
  },
  async retryDocument(key) {
    return { ...find(state.documents, key) };
  },

  async listTasks({ caseId, openOnly }) {
    return state.tasks
      .filter((t) => (!caseId || t.case_id === caseId) && (!openOnly || !t.done))
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  },
  async setTaskDone(key, done) {
    find(state.tasks, key).done = done;
  },

  async listDrafts(caseId) {
    return state.drafts.filter((d) => d.case_id === caseId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getDraft(key) {
    return { ...find(state.drafts, key) };
  },
  async createDraft({ caseId, documentId, kind, instructions }) {
    await wait(1500);
    const c = find(state.cases, caseId);
    const draft: Draft = {
      id: id(),
      case_id: caseId,
      document_id: documentId ?? null,
      kind,
      subject: `${c.reference_number ?? c.title}: Einreichung von Unterlagen`,
      body_de: `[Ihr Name]
[Ihre Adresse]

${c.authority ?? "[Behörde]"}
[Adresse der Behörde]

Berlin, ${new Date().toLocaleDateString("de-DE")}

Betreff: ${c.reference_number ?? ""} – Einreichung von Unterlagen

Sehr geehrte Damen und Herren,

bezugnehmend auf Ihr Schreiben übersende ich Ihnen anbei die angeforderten Unterlagen:

- Mietvertrag
- Kontoauszüge der letzten drei Monate
- Kopie meines Aufenthaltstitels

Bitte bestätigen Sie mir den Eingang.

Mit freundlichen Grüßen

[Unterschrift]`,
      body_translation: `Demo translation. Your request was: "${instructions}". In the real app, this is a full translation of the German letter in your language.`,
      notes: "Demo mode. Check names and addresses, attach copies (not originals), and keep a photo of everything you send.",
      status: "draft",
      created_at: now(),
    };
    state.drafts.push(draft);
    touch(caseId);
    return draft;
  },
  async setDraftStatus(key, status) {
    find(state.drafts, key).status = status;
  },

  async listMessages(caseId) {
    return state.messages.filter((m) => m.case_id === caseId);
  },
  async sendMessage(caseId, text) {
    state.messages.push({ id: id(), case_id: caseId, role: "user", content: text, created_at: now() });
    await wait(1200);
    const reply: ChatMessage = {
      id: id(),
      case_id: caseId,
      role: "assistant",
      content: "This is demo mode, so I can't answer for real yet. Once BüroKI is connected, I will answer questions about this case in your language, using every letter you added.",
      created_at: now(),
    };
    state.messages.push(reply);
    touch(caseId);
    return reply;
  },
};
