// Server state: one place for query keys, cache rules and mutations, so every
// screen stays consistent after an edit and works from cache when offline.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { friendlyError } from "./errorText";
import { ApiError } from "./errors";
import i18n from "./i18n";
import { authStorage } from "./storage";
import type {
  Case, CaseDocument, CaseForm, CaseStatus, Draft, FormField, HelpKind, HelpSpecialty, HelpWhere, NewCase, PickedFile, Task, UserFact,
} from "./types";

export const keys = {
  profile: ["profile"] as const,
  usage: ["usage"] as const,
  cases: ["cases"] as const,
  case: (id: string) => ["case", id] as const,
  timeline: (id: string) => ["case", id, "timeline"] as const,
  documents: (caseId: string) => ["case", caseId, "documents"] as const,
  document: (id: string) => ["document", id] as const,
  pages: (id: string) => ["document", id, "pages"] as const,
  tasks: (filter: { caseId?: string; openOnly?: boolean }) => ["tasks", filter] as const,
  drafts: (caseId: string) => ["case", caseId, "drafts"] as const,
  forms: (caseId: string) => ["case", caseId, "forms"] as const,
  form: (id: string) => ["form", id] as const,
  draft: (id: string) => ["draft", id] as const,
  messages: (caseId: string) => ["case", caseId, "messages"] as const,
  search: (q: string) => ["search", q] as const,
  facts: ["facts"] as const,
  help: (kind: string, where: unknown, radiusKm: number, specialty?: string | null) => ["help", kind, specialty ?? null, where, radiusKm] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 3600_000,
      retry: (count, error) => !(error instanceof ApiError && ["auth", "not_found", "consent"].includes(error.code)) && count < 2,
    },
    mutations: { retry: 0 },
  },
});

export const persister = createAsyncStoragePersister({
  key: "bueroki.cache",
  storage: authStorage
    ? {
      getItem: async (k) => authStorage!.getItem(k),
      setItem: async (k, v) => authStorage!.setItem(k, v),
      removeItem: async (k) => authStorage!.removeItem(k),
    }
    : undefined,
  throttleTime: 2000,
});

/** Signed URLs and search results expire or are cheap; never persist them. */
export const shouldPersist = (key: readonly unknown[]) => key[0] !== "search" && key[2] !== "pages" && key[0] !== "usage";

// Queries --------------------------------------------------------------------

export const useProfile = (enabled = true) => useQuery({ queryKey: keys.profile, queryFn: api.getProfile, enabled });
export const useUsage = () => useQuery({ queryKey: keys.usage, queryFn: api.getUsage, staleTime: 0 });
export const useCases = () => useQuery({ queryKey: keys.cases, queryFn: api.listCases });
export const useCase = (id: string) => useQuery({ queryKey: keys.case(id), queryFn: () => api.getCase(id), enabled: !!id });
export const useTimeline = (id: string) => useQuery({ queryKey: keys.timeline(id), queryFn: () => api.getTimeline(id) });
const busy = (d: CaseDocument) => d.status === "analyzing" || d.status === "uploaded";
// While a letter is being read (possibly started from another screen), check back every few seconds.
export const useDocuments = (caseId: string) =>
  useQuery({
    queryKey: keys.documents(caseId),
    queryFn: () => api.listDocuments(caseId),
    refetchInterval: (q) => (q.state.data?.some(busy) ? 4000 : false),
  });
export const useDocument = (id: string) =>
  useQuery({
    queryKey: keys.document(id),
    queryFn: () => api.getDocument(id),
    refetchInterval: (q) => (q.state.data && busy(q.state.data) ? 4000 : false),
  });
export const usePageUrls = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.pages(id),
    queryFn: async () => api.getPageUrls(await api.getDocument(id)),
    enabled,
    staleTime: 5 * 60_000,
  });
const formBusy = (f: CaseForm) => f.status === "analyzing" || f.status === "uploaded";
export const useForms = (caseId: string) =>
  useQuery({
    queryKey: keys.forms(caseId),
    queryFn: () => api.listForms(caseId),
    refetchInterval: (q) => (q.state.data?.some(formBusy) ? 4000 : false),
  });
export const useForm = (id: string) =>
  useQuery({
    queryKey: keys.form(id),
    queryFn: () => api.getForm(id),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && formBusy(q.state.data) ? 4000 : false),
  });
export const useTasks = (filter: { caseId?: string; openOnly?: boolean }) =>
  useQuery({ queryKey: keys.tasks(filter), queryFn: () => api.listTasks(filter) });
export const useDrafts = (caseId: string) => useQuery({ queryKey: keys.drafts(caseId), queryFn: () => api.listDrafts(caseId) });
export const useDraft = (id: string) => useQuery({ queryKey: keys.draft(id), queryFn: () => api.getDraft(id), enabled: !!id });
export const useMessages = (caseId: string) =>
  useQuery({ queryKey: keys.messages(caseId), queryFn: () => api.listMessages(caseId) });
export const useFacts = (enabled = true) => useQuery({ queryKey: keys.facts, queryFn: api.listFacts, enabled });
export const useSearch = (q: string) =>
  useQuery({ queryKey: keys.search(q), queryFn: () => api.search(q), enabled: q.trim().length >= 2, staleTime: 10_000 });

// Places change slowly; keep a search for a day and show it offline.
// Lawyers and doctors wait until the person picks a type.
export const useFindHelp = (kind: HelpKind, where: HelpWhere | null, radiusKm = 5, specialty?: HelpSpecialty | null, enabled = true) =>
  useQuery({
    queryKey: keys.help(kind, where, radiusKm, specialty),
    queryFn: () => api.findHelp(kind, where!, radiusKm, specialty ?? undefined),
    enabled: !!where && enabled,
    staleTime: 24 * 3600_000,
  });

// Mutations ------------------------------------------------------------------

function useInvalidate() {
  const qc = useQueryClient();
  return (caseId?: string) => {
    qc.invalidateQueries({ queryKey: keys.cases });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: keys.usage });
    // Reading a letter may have suggested facts to remember.
    qc.invalidateQueries({ queryKey: keys.facts });
    if (caseId) qc.invalidateQueries({ queryKey: ["case", caseId] });
  };
}

export function useCreateCase() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: NewCase) => api.createCase(input), onSuccess: () => invalidate() });
}

export function useUpdateCase(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (patch: Partial<NewCase> & { status?: CaseStatus }) => api.updateCase(id, patch),
    onMutate: (patch) => {
      const prev = qc.getQueryData<Case>(keys.case(id));
      if (prev) qc.setQueryData(keys.case(id), { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.case(id), ctx.prev),
    onSettled: () => invalidate(id),
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteCase(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["case", id] });
      invalidate();
    },
  });
}

export function useAddDocument(caseId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (pages: PickedFile[]) => api.addDocument(caseId, pages),
    onSettled: () => invalidate(caseId),
  });
}

export function useRetryDocument(caseId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.retryDocument(id),
    onSettled: (_d, _e, id) => {
      qc.invalidateQueries({ queryKey: keys.document(id) });
      invalidate(caseId);
    },
  });
}

export function useAnswerOwner(caseId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, owner }: { id: string; owner: "mine" | "not_mine" }) => api.answerOwner(id, owner),
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: keys.document(id) });
      invalidate(caseId);
    },
  });
}

export function useDeleteDocument(caseId: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.deleteDocument(id), onSuccess: () => invalidate(caseId) });
}

export function useAddForm(caseId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ pages, situation }: { pages: PickedFile[]; situation?: string }) => api.addForm(caseId, pages, situation),
    onSettled: () => invalidate(caseId),
  });
}

/** Mutations on one form; each one puts the server's copy of the form into the cache. */
export function useFormActions(form: CaseForm | undefined) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const put = (next: CaseForm) => {
    qc.setQueryData(keys.form(next.id), next);
    qc.invalidateQueries({ queryKey: keys.forms(next.case_id) });
  };
  return {
    save: useMutation({
      mutationFn: async (fields: FormField[]) => {
        await api.saveFormFields(form!.id, fields);
        return { ...form!, fields };
      },
      onSuccess: put,
    }),
    answer: useMutation({
      mutationFn: (message: string) => api.answerForm(form!.id, message),
      onSuccess: (res) => {
        put(res.form);
        qc.invalidateQueries({ queryKey: keys.usage });
      },
    }),
    retry: useMutation({
      mutationFn: () => api.retryForm(form!.id),
      onSettled: () => {
        qc.invalidateQueries({ queryKey: keys.form(form!.id) });
        invalidate(form!.case_id);
      },
    }),
    exportPdf: useMutation({
      mutationFn: () => api.exportForm(form!.id),
      onSuccess: () => qc.invalidateQueries({ queryKey: keys.form(form!.id) }),
    }),
    remove: useMutation({
      mutationFn: () => api.deleteForm(form!.id),
      onSuccess: () => {
        qc.removeQueries({ queryKey: keys.form(form!.id) });
        invalidate(form!.case_id);
      },
    }),
  };
}

/** Ticks a task off everywhere at once, and rolls back if the server refuses. */
export function useToggleTask() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (task: Task) => api.setTaskDone(task.id, !task.done),
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = qc.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      qc.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (list) =>
        list?.map((x) => (x.id === task.id ? { ...x, done: !x.done, completed_at: x.done ? null : new Date().toISOString() } : x)));
      return { snapshot };
    },
    onError: (_e, _t, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (_d, _e, task) => invalidate(task.case_id),
  });
}

export function useCreateTask(caseId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { title: string; dueDate: string | null }) => api.createTask({ caseId, ...input }),
    onSuccess: () => invalidate(caseId),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (task: Task) => api.deleteTask(task.id), onSuccess: (_d, task) => invalidate(task.case_id) });
}

export function useCreateDraft(caseId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { documentId?: string | null; kind: "letter" | "email"; instructions: string; reviseDraftId?: string | null }) =>
      api.createDraft({ caseId, ...input }),
    onSettled: () => invalidate(caseId),
  });
}

export function useUpdateDraft(draft: Draft | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { subject?: string; body_de?: string }) => api.updateDraft(draft!.id, patch),
    onSuccess: (_d, patch) => {
      qc.setQueryData(keys.draft(draft!.id), { ...draft!, ...patch, edited: true });
      qc.invalidateQueries({ queryKey: keys.drafts(draft!.case_id) });
    },
  });
}

export function useSetDraftStatus(draft: Draft | undefined) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (status: Draft["status"]) => api.setDraftStatus(draft!.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.draft(draft!.id) });
      invalidate(draft!.case_id);
    },
  });
}

export function useSendEmail(draft: Draft | undefined) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ to, replyTo }: { to: string; replyTo: string }) => api.sendEmail(draft!.id, to, replyTo),
    onSuccess: (sent) => {
      qc.invalidateQueries({ queryKey: keys.profile });
      qc.setQueryData(keys.draft(sent.id), sent);
      invalidate(sent.case_id);
    },
  });
}

export function useDeleteDraft() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (d: Draft) => api.deleteDraft(d.id), onSuccess: (_r, d) => invalidate(d.case_id) });
}

export function useSendMessage(caseId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ text, onText }: { text: string; onText?: (soFar: string) => void }) =>
      api.sendMessage(caseId, text, onText),
    onSettled: (message) => {
      qc.invalidateQueries({ queryKey: keys.messages(caseId) });
      // The assistant may have changed tasks while answering.
      if (message?.actions?.length) invalidate(caseId);
      else qc.invalidateQueries({ queryKey: keys.usage });
    },
  });
}

/**
 * Asks for suggestions after a chat answer, or about what the person told a form (text).
 * Runs in the background, so failures stay quiet.
 */
export function useLearnFacts(caseId: string, source?: "form" | "draft" | "note") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string | void) => api.learnFacts(caseId, text || undefined, source),
    onSuccess: (facts) => {
      if (facts.length) qc.invalidateQueries({ queryKey: keys.facts });
    },
  });
}

/** Keep or forget a fact; removes it from the list at once and rolls back on failure. */
export function useDecideFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fact, keep }: { fact: UserFact; keep: boolean }) => (keep ? api.keepFact(fact.id) : api.forgetFact(fact.id)),
    onMutate: async ({ fact, keep }) => {
      await qc.cancelQueries({ queryKey: keys.facts });
      const prev = qc.getQueryData<UserFact[]>(keys.facts);
      qc.setQueryData<UserFact[]>(keys.facts, (list) => list
        ?.filter((f) => f.id !== fact.id && !(keep && f.id === fact.replaces_id))
        .concat(keep ? [{ ...fact, status: "kept", decided_at: new Date().toISOString() }] : []));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.facts, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.facts }),
  });
}

/** Error text for screens, translated where we can (see friendlyError). */
export function errorMessage(error: unknown): string {
  return friendlyError(error, i18n.t);
}
