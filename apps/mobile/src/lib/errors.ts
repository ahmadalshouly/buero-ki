import type { PickedFile } from "./types";

export const MAX_PAGES = 10;
export const TERMS_VERSION = "2026-10";

export type ApiErrorCode =
  | "auth" | "consent" | "limit" | "busy" | "upstream" | "agent" | "input" | "not_found" | "file_type" | "offline" | "timeout"
  | "error";

/** Error with a machine-readable code, so screens can react (e.g. show the limit or consent screen). */
export class ApiError extends Error {
  constructor(message: string, public code: ApiErrorCode = "error", public requestId?: string) {
    super(message);
  }
}

/** Rejects with a "timeout" error when the work takes longer than ms, so a spinner never runs forever. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(`Timed out after ${Math.round(ms / 1000)} s`, "timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function validatePages(pages: PickedFile[]): void {
  if (!pages.length) throw new ApiError("Add at least one page.", "input");
  if (pages.length > MAX_PAGES) throw new ApiError(`A letter can have at most ${MAX_PAGES} pages.`, "input");
  if (pages.some((p) => !EXTENSIONS[p.mimeType])) throw new ApiError("Please use JPEG, PNG or PDF files.", "file_type");
  if (pages.length > 1 && pages.some((p) => p.mimeType === "application/pdf")) {
    throw new ApiError("Add a PDF on its own, not together with photos.", "input");
  }
}

