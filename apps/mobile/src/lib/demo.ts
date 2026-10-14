// Demo mode: an in-memory backend with one sample case, used when no Supabase
// project is configured. Lets anyone click through the app without an account.
import type { Api } from "./api";
import { ApiError, validatePages } from "./errors";
import { DAILY_LIMITS } from "./limits";
import { authStorage } from "./storage";
import type {
  AgentFunction, Analysis, Case, CaseDocument, CaseForm, ChatMessage, Draft, FormField, HelpKind, HelpPlace, Profile, Task, TimelineItem,
  UserFact,
} from "./types";

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
  amounts: [{ label: "Monthly Bürgergeld applied for", amount_eur: 1124 }],
};

const sampleFields = (name: string | null): FormField[] => [
  {
    key: "p1_name", pdf_field: null, page: 1, section: "1. Persönliche Daten", label_de: "Familienname, Vorname",
    explanation: "Your last name and first name, as in your passport.", type: "text", options: [], value: name,
    source_note: name ? "From your profile" : null, question: name ? null : "What is your full name?", required: true,
  },
  {
    key: "p1_birth", pdf_field: null, page: 1, section: "1. Persönliche Daten", label_de: "Geburtsdatum",
    explanation: "Your date of birth.", type: "date", options: [], value: null, source_note: null,
    question: "When were you born? It is on your passport or residence permit.", required: true,
  },
  {
    key: "p1_nationality", pdf_field: null, page: 1, section: "1. Persönliche Daten", label_de: "Staatsangehörigkeit",
    explanation: "Your citizenship.", type: "text", options: [], value: null, source_note: null,
    question: "Which citizenship do you have?", required: true,
  },
  {
    key: "p1_married", pdf_field: null, page: 1, section: "2. Familienstand", label_de: "verheiratet",
    explanation: "Tick this if you are married.", type: "checkbox", options: [], value: "false", source_note: null,
    question: null, required: false,
  },
  {
    key: "p2_bg", pdf_field: null, page: 2, section: "3. Bedarfsgemeinschaft", label_de: "BG-Nummer",
    explanation: "Your Jobcenter number, printed on its letters.", type: "text", options: [], value: "BG 12345//0067890",
    source_note: "From the letter of the Jobcenter", question: null, required: false,
  },
  {
    key: "p2_date", pdf_field: null, page: 2, section: "Unterschrift", label_de: "Ort, Datum",
    explanation: "Place and today's date.", type: "text", options: [], value: `Berlin, ${new Date().toLocaleDateString("de-DE")}`,
    source_note: "From your profile and today's date", question: null, required: true,
  },
  {
    key: "p2_sign", pdf_field: null, page: 2, section: "Unterschrift", label_de: "Unterschrift",
    explanation: "Sign here by hand after printing.", type: "signature", options: [], value: null, source_note: null,
    question: null, required: true,
  },
];

const state = {
  profile: {
    id: "demo-user", full_name: "Amina", language: "en", city: "Berlin",
    onboarded_at: null, ai_consent_at: null, plan: "free", memory_enabled: true,
  } as Profile,
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
    {
      id: "demo-case-2",
      title: "Kindergeld for Yusuf",
      category: "familienkasse",
      authority: "Familienkasse Berlin-Brandenburg",
      reference_number: "123FK456789",
      status: "waiting",
      summary: "You sent the Kindergeld application with Yusuf's birth certificate. The Familienkasse confirmed it arrived and is checking it.",
      facts: {},
      created_at: day(-30) + "T09:00:00Z",
      updated_at: day(-6) + "T09:00:00Z",
    },
  ] as Case[],
  documents: [
    {
      id: "demo-doc-1",
      case_id: "demo-case-1",
      storage_path: "",
      page_paths: [],
      page_count: 2,
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
    {
      id: "demo-doc-2",
      case_id: "demo-case-2",
      storage_path: "",
      page_paths: [],
      page_count: 1,
      mime_type: "image/jpeg",
      file_name: "eingang.jpg",
      status: "ready",
      sender: "Familienkasse Berlin-Brandenburg",
      document_date: day(-6),
      title_de: "Eingangsbestätigung",
      summary: "The Familienkasse confirms it received your Kindergeld application. You do not need to do anything now.",
      urgency: "low",
      analysis: {
        ...sampleAnalysis,
        title_de: "Eingangsbestätigung",
        sender: "Familienkasse Berlin-Brandenburg",
        document_type: "Confirmation of receipt",
        summary: "The Familienkasse confirms it received your Kindergeld application. You do not need to do anything now.",
        explanation: "## What is this letter?\nA confirmation that your application arrived.\n\n## What you should do now\nNothing. Keep this letter. If you hear nothing in 8 weeks, ask about the status.",
        actions: [],
        key_terms: [{ term_de: "Eingangsbestätigung", meaning: "Confirmation that something arrived." }],
        urgency: "low",
        amounts: [],
        reference_number: "123FK456789",
      },
      error: null,
      created_at: day(-6) + "T10:00:00Z",
    },
  ] as CaseDocument[],
  tasks: [
    ...sampleAnalysis.actions.map((a, i) => ({
      id: `demo-task-${i}`,
      case_id: "demo-case-1",
      document_id: "demo-doc-1",
      title: a.title,
      due_date: a.due_date,
      done: false,
      source: "agent",
      completed_at: null,
      created_at: day(-2) + "T10:00:00Z",
    })),
    {
      id: "demo-task-9",
      case_id: "demo-case-2",
      document_id: null,
      title: "Send birth certificate",
      due_date: day(-8),
      done: true,
      source: "user",
      completed_at: day(-8) + "T15:00:00Z",
      created_at: day(-20) + "T10:00:00Z",
    },
  ] as Task[],
  drafts: [] as Draft[],
  forms: [] as CaseForm[],
  messages: [] as ChatMessage[],
  usage: [] as { fn: AgentFunction; at: number }[],
  facts: [] as UserFact[],
  factSuggested: false,
};

// Keep the demo profile (onboarding, consent, language) across reloads.
const PROFILE_KEY = "bueroki.demo.profile";
try {
  const saved = authStorage?.getItem(PROFILE_KEY);
  if (saved) Object.assign(state.profile, JSON.parse(saved));
} catch {
  // Ignore unreadable storage; the demo starts fresh.
}

function find<T extends { id: string }>(list: T[], key: string): T {
  const item = list.find((x) => x.id === key);
  if (!item) throw new ApiError("Not found", "not_found");
  return item;
}

function touch(caseId: string) {
  const c = state.cases.find((x) => x.id === caseId);
  if (c) c.updated_at = now();
}

function spend(fn: AgentFunction) {
  const since = Date.now() - 86400000;
  const used = state.usage.filter((u) => u.fn === fn && u.at > since).length;
  const limit = DAILY_LIMITS[state.profile.plan][fn];
  if (used >= limit) throw new ApiError(`You reached today's limit of ${limit} for this feature.`, "limit");
  if (!state.profile.ai_consent_at) throw new ApiError("Please agree to AI processing in the app settings first.", "consent");
  state.usage.push({ fn, at: Date.now() });
}

const drop = <T extends { id: string }>(list: T[], key: string) => {
  const i = list.findIndex((x) => x.id === key);
  if (i >= 0) list.splice(i, 1);
};

// Made-up places around Berlin-Neukölln, so the help screens can be tried without a backend.
const HELP_NAMES: Record<HelpKind, string[]> = {
  doctor: ["Hausarztpraxis am Hermannplatz", "Praxis Dr. Yilmaz", "Kinderarztpraxis Sonnenallee"],
  dentist: ["Zahnarztpraxis Karl-Marx-Straße", "Zahnärzte am Rathaus Neukölln"],
  psychotherapy: ["Psychotherapeutische Praxis Weserstraße", "Zentrum Überleben (Beratung für Geflüchtete)"],
  lawyer: ["Kanzlei für Migrationsrecht Özdemir", "Rechtsanwältin Weber, Sozialrecht", "Anwaltskanzlei Mietrecht Neukölln"],
  migration: ["Migrationsberatung für Erwachsene (MBE) Caritas", "Jugendmigrationsdienst Neukölln"],
  social: ["Allgemeine Sozialberatung Diakonie", "Beratungsstelle der AWO"],
  debt: ["Schuldnerberatung Neukölln"],
  tenant: ["Berliner Mieterverein, Beratungszentrum Neukölln"],
  consumer: ["Verbraucherzentrale Berlin"],
  tax: ["Lohnsteuerhilfe Neukölln e.V."],
  patient: ["Unabhängige Patientenberatung, Beratungsstelle Berlin"],
};

export const demoApi: Api = {
  async getProfile() {
    return { ...state.profile };
  },
  async updateProfile(patch) {
    const { terms_version: _ignored, ...rest } = patch;
    Object.assign(state.profile, rest);
    try {
      authStorage?.setItem(PROFILE_KEY, JSON.stringify(state.profile));
    } catch {
      // Storage may be blocked; the change still applies for this session.
    }
  },
  async getUsage() {
    const since = Date.now() - 86400000;
    const used = { "analyze-document": 0, "draft-reply": 0, "case-chat": 0, "fill-form": 0 } as Record<AgentFunction, number>;
    for (const u of state.usage) if (u.at > since) used[u.fn]++;
    return { plan: state.profile.plan, used, limits: DAILY_LIMITS[state.profile.plan] };
  },
  async exportData() {
    return { exported_at: now(), format_version: 1, demo: true, ...state };
  },
  async deleteAccount() {
    throw new ApiError("Demo mode has no account to delete.", "input");
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
      title: input.title.trim(),
      category: input.category,
      authority: input.authority?.trim() || null,
      reference_number: input.reference_number?.trim() || null,
      status: "open",
      summary: null,
      facts: {},
      created_at: now(),
      updated_at: now(),
    };
    state.cases.push(c);
    return c;
  },
  async updateCase(key, patch) {
    Object.assign(find(state.cases, key), patch);
    touch(key);
  },
  async deleteCase(key) {
    drop(state.cases, key);
    for (const list of [state.documents, state.forms, state.tasks, state.drafts, state.messages] as { id: string; case_id: string }[][]) {
      for (const item of list.filter((x) => x.case_id === key)) drop(list, item.id);
    }
  },
  async getTimeline(caseId) {
    const items: TimelineItem[] = [
      ...state.documents.filter((d) => d.case_id === caseId).map((d) => ({
        case_id: caseId, item_id: d.id, kind: "document" as const, at: d.created_at, title: d.title_de ?? d.file_name,
        detail: d.summary, tone: d.urgency,
      })),
      ...state.drafts.filter((d) => d.case_id === caseId).flatMap((d) => [
        { case_id: caseId, item_id: d.id, kind: "draft" as const, at: d.created_at, title: d.subject, detail: d.kind, tone: null },
        ...(d.sent_at
          ? [{ case_id: caseId, item_id: d.id, kind: "sent" as const, at: d.sent_at, title: d.subject, detail: d.kind, tone: null }]
          : []),
      ]),
      ...state.forms.filter((f) => f.case_id === caseId).map((f) => ({
        case_id: caseId, item_id: f.id, kind: "form" as const, at: f.created_at, title: f.title_de ?? f.file_name, detail: f.summary,
        tone: null,
      })),
      ...state.tasks.filter((t) => t.case_id === caseId && t.completed_at).map((t) => ({
        case_id: caseId, item_id: t.id, kind: "task_done" as const, at: t.completed_at!, title: t.title, detail: null, tone: null,
      })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  },

  async listDocuments(caseId) {
    return state.documents.filter((d) => d.case_id === caseId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getDocument(key) {
    return { ...find(state.documents, key) };
  },
  async getPageUrls() {
    return [];
  },
  async addDocument(caseId, pages) {
    validatePages(pages);
    spend("analyze-document");
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
      page_paths: [],
      page_count: pages.length,
      mime_type: pages[0].mimeType,
      file_name: pages[0].name,
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
    // Like the real agent, offer to remember what the letter says about the person (once).
    if (state.profile.memory_enabled !== false && !state.facts.some((f) => f.origin === "letter")) {
      state.facts.push({
        id: id(), category: "money", fact: "The Jobcenter knows you under the number BG 12345//0067890.", status: "pending",
        case_id: caseId, replaces_id: null, source: "agent", origin: "letter", document_id: doc.id, created_at: now(), decided_at: null,
      });
    }
    for (const a of analysis.actions) {
      state.tasks.push({
        id: id(), case_id: caseId, document_id: doc.id, title: a.title, due_date: a.due_date, done: false,
        source: "agent", completed_at: null, created_at: now(),
      });
    }
    touch(caseId);
    return doc;
  },
  async retryDocument(key) {
    return { ...find(state.documents, key) };
  },
  async deleteDocument(key) {
    drop(state.documents, key);
  },

  async listForms(caseId) {
    return state.forms.filter((f) => f.case_id === caseId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getForm(key) {
    const f = find(state.forms, key);
    return { ...f, fields: f.fields.map((x) => ({ ...x })) };
  },
  async addForm(caseId, pages, situation) {
    validatePages(pages);
    spend("fill-form");
    await wait(1800);
    const form: CaseForm = {
      id: id(),
      case_id: caseId,
      storage_path: "",
      page_paths: [],
      mime_type: pages[0].mimeType,
      file_name: pages[0].name,
      situation: situation?.trim() || null,
      status: "ready",
      fillable: false,
      title_de: "Antrag auf Bürgergeld (Demo)",
      title: "Application for Bürgergeld (demo)",
      summary: "Demo mode: sample fields. Connect BüroKI to Supabase so it can read your real form.",
      instructions: "## Before you hand it in\n- Sign and date page 2.\n- Attach a copy of your passport.\n- Keep a copy for yourself.",
      fields: sampleFields(state.profile.full_name),
      filled_path: null,
      filled_at: null,
      error: null,
      created_at: now(),
      updated_at: now(),
    };
    // The demo reads a date from the situation the way the real agent reads everything.
    const date = situation?.match(/\d{1,2}\.\d{1,2}\.\d{4}/)?.[0];
    if (date) {
      form.fields = form.fields.map((x) => (x.type === "date" && !x.value ? { ...x, value: date, source_note: "From what you told me", question: null } : x));
    }
    state.forms.push(form);
    touch(caseId);
    return form;
  },
  async retryForm(key) {
    return demoApi.getForm(key);
  },
  async saveFormFields(key, fields) {
    const f = find(state.forms, key);
    f.fields = fields.map((x) => ({ ...x }));
    f.updated_at = now();
  },
  async answerForm(key, message) {
    spend("fill-form");
    await wait(1000);
    const f = find(state.forms, key);
    const date = message.match(/\d{1,2}\.\d{1,2}\.\d{4}/)?.[0];
    const updated: string[] = [];
    // A guided question names its field; the demo writes the answer into it as given.
    const asked = message.match(/\(key ([^)]+)\)[\s\S]*The person's answer: ([\s\S]+)$/);
    if (asked && !date) {
      f.fields = f.fields.map((x) => (x.key === asked[1] ? { ...x, value: asked[2].trim(), source_note: "From your answer", question: null } : x));
      updated.push(asked[1]);
    }
    if (date) {
      f.fields = f.fields.map((x) => (x.type === "date" && !x.value ? { ...x, value: date, source_note: "From your answer", question: null } : x));
      updated.push(...f.fields.filter((x) => x.value === date).map((x) => x.key));
    }
    return {
      form: await demoApi.getForm(key),
      reply: updated.length
        ? "Demo mode: I filled in your answer."
        : "Demo mode: in the real app I fill every field your message answers. Try a date like 01.02.1990.",
      updated,
    };
  },
  async exportForm() {
    throw new ApiError("Demo mode cannot fill PDF files.", "input");
  },
  async deleteForm(key) {
    drop(state.forms, key);
  },

  async listTasks({ caseId, openOnly }) {
    return state.tasks
      .filter((t) => (!caseId || t.case_id === caseId) && (!openOnly || !t.done))
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  },
  async createTask({ caseId, title, dueDate }) {
    const task: Task = {
      id: id(), case_id: caseId, document_id: null, title: title.trim(), due_date: dueDate, done: false,
      source: "user", completed_at: null, created_at: now(),
    };
    state.tasks.push(task);
    touch(caseId);
    return task;
  },
  async setTaskDone(key, done) {
    const task = find(state.tasks, key);
    task.done = done;
    task.completed_at = done ? now() : null;
  },
  async deleteTask(key) {
    drop(state.tasks, key);
  },

  async listDrafts(caseId) {
    return state.drafts.filter((d) => d.case_id === caseId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getDraft(key) {
    return { ...find(state.drafts, key) };
  },
  async createDraft({ caseId, documentId, kind, instructions, reviseDraftId }) {
    spend("draft-reply");
    await wait(1500);
    const c = find(state.cases, caseId);
    const previous = reviseDraftId ? find(state.drafts, reviseDraftId) : null;
    const draft: Draft = {
      id: id(),
      case_id: caseId,
      document_id: documentId ?? previous?.document_id ?? null,
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
      edited: false,
      sent_at: null,
      revision_of: reviseDraftId ?? null,
      created_at: now(),
    };
    state.drafts.push(draft);
    touch(caseId);
    return draft;
  },
  async updateDraft(key, patch) {
    Object.assign(find(state.drafts, key), patch, { edited: true });
  },
  async setDraftStatus(key, status) {
    const d = find(state.drafts, key);
    d.status = status;
    d.sent_at = status === "sent" ? now() : null;
    d.sent_via = status === "sent" ? "self" : null;
  },
  async sendEmail(key, to) {
    await wait(800);
    const d = find(state.drafts, key);
    Object.assign(d, { status: "sent", sent_at: now(), sent_to: to, sent_via: "bueroki" });
    return { ...d };
  },
  async deleteDraft(key) {
    drop(state.drafts, key);
  },

  async listMessages(caseId) {
    return state.messages.filter((m) => m.case_id === caseId);
  },
  async sendMessage(caseId, text, onText) {
    spend("case-chat");
    state.messages.push({ id: id(), case_id: caseId, role: "user", content: text, created_at: now() });
    const answer = "This is demo mode, so I can't answer for real yet. Once BüroKI is connected, I will answer questions about this case in your language, using every letter you added.";
    await wait(600);
    // Write the answer word by word, like the real assistant streams it.
    const words = answer.split(" ");
    for (let i = 1; i <= words.length; i++) {
      onText?.(words.slice(0, i).join(" "));
      await wait(40);
    }
    const reply: ChatMessage = { id: id(), case_id: caseId, role: "assistant", content: answer, created_at: now() };
    state.messages.push(reply);
    touch(caseId);
    return reply;
  },

  async search(q) {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const hit = (...parts: (string | null)[]) => parts.some((p) => p?.toLowerCase().includes(term));
    return [
      ...state.cases.filter((c) => hit(c.title, c.authority, c.reference_number)).map((c) => ({
        kind: "case" as const, id: c.id, case_id: c.id, title: c.title, detail: c.authority ?? c.summary, at: c.updated_at,
      })),
      ...state.documents.filter((d) => hit(d.title_de, d.sender, d.summary)).map((d) => ({
        kind: "document" as const, id: d.id, case_id: d.case_id, title: d.title_de ?? d.file_name, detail: d.summary, at: d.created_at,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  },

  async findHelp(kind, where) {
    await wait(500);
    const center = "lat" in where ? { lat: where.lat, lon: where.lon, label: null } : { lat: 52.4811, lon: 13.4353, label: where.place };
    const places: HelpPlace[] = HELP_NAMES[kind].map((name, i) => ({
      id: `demo-${kind}-${i}`,
      kind,
      name,
      lat: center.lat + 0.004 * (i + 1),
      lon: center.lon + 0.003 * (i + 1),
      distance_m: 450 * (i + 1) + 120,
      address: `Sonnenallee ${10 + i * 7}, 12045 Berlin`,
      phone: "+49 30 1234567",
      email: i === 0 ? "beratung@example.org" : null,
      website: "https://example.org",
      opening_hours: "Mo-Fr 09:00-16:00",
      languages: i === 1 ? ["ar", "de", "tr"] : [],
      wheelchair: i === 0 ? true : null,
    }));
    return { center, places };
  },

  async listFacts() {
    return [...state.facts];
  },
  async learnFacts(caseId, text, source) {
    if (text) {
      // What the person told a form: the demo offers to remember the answer itself.
      // A finished form: the demo offers to remember the birth date, if one was given.
      const birth = text.startsWith("I filled in the form") ? text.match(/Geburtsdatum: (.+)/)?.[1] : undefined;
      const said = birth ? `You were born on ${birth}.` : (text.match(/The person's answer: ([\s\S]+)$/)?.[1] ?? text).trim();
      if (text.startsWith("I filled in the form") && !birth) return [];
      if (said.length < 3 || state.profile.memory_enabled === false) return [];
      const fact: UserFact = {
        id: id(), category: "other", fact: birth ? said : `You told me: ${said.slice(0, 200)}`, status: "pending",
        case_id: caseId, replaces_id: null, source: "agent", origin: source ?? "form", document_id: null,
        created_at: now(), decided_at: null,
      };
      state.facts.push(fact);
      return [fact];
    }
    // Demo mode suggests one sample fact after the first real question.
    const asked = state.messages.some((m) => m.case_id === caseId && m.role === "user" && m.content.trim().length >= 12);
    if (state.factSuggested || !asked || state.profile.memory_enabled === false) return [];
    state.factSuggested = true;
    const fact: UserFact = {
      id: id(), category: "family", fact: "You live in Berlin with your partner and one child.", status: "pending",
      case_id: caseId, replaces_id: null, source: "agent", origin: "chat", document_id: null, created_at: now(), decided_at: null,
    };
    state.facts.push(fact);
    return [fact];
  },
  async keepFact(key) {
    Object.assign(find(state.facts, key), { status: "kept", decided_at: now() });
  },
  async forgetFact(key) {
    drop(state.facts, key);
  },
  async forgetAllFacts() {
    state.facts.splice(0);
  },
};
