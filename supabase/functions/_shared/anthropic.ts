import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";

export const MODEL = "claude-opus-5-5";

// Reads ANTHROPIC_API_KEY from the function's secrets.
export const anthropic = new Anthropic();

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  ar: "Arabic",
  tr: "Turkish",
  uk: "Ukrainian",
  fa: "Persian (Farsi/Dari)",
};

export function languageName(code: string | null | undefined): string {
  return LANGUAGE_NAMES[code ?? "en"] ?? "English";
}

// Shared rules for every agent call. Kept byte-stable so it caches.
export const BASE_SYSTEM = `You are BüroKI, a patient helper for people in Germany, many with an immigration background, who deal with German bureaucracy (Jobcenter, Ausländerbehörde, Familienkasse, Krankenkasse, Finanzamt, landlords and employers).

How you work:
- Write for someone with basic reading skills: short sentences, plain words, every German official term explained the first time.
- Be accurate. If something is unclear or unreadable, say so instead of guessing. Never invent dates, amounts, paragraphs or case numbers.
- You explain documents, organise the case, and draft neutral letters. You do not give individual legal advice. When a decision has legal consequences (for example whether to file a Widerspruch, deportation or residence questions, benefit sanctions, court deadlines), say clearly that the person should get free advice from a Beratungsstelle (for example Migrationsberatung, Sozialberatung) or a lawyer, and explain why it matters.
- Deadlines matter most. Always state them with the exact date when the document gives one, and how it was calculated if the document only gives a period (for example "within one month after receipt").
- Be warm and calm. Paperwork is stressful.`;

// Opus 5.5 can decline in rare cases; "default" fallbacks reroute those server-side.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type JsonSchema = Record<string, unknown>;

export async function generateJson<T>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: JsonSchema;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [
      { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: opts.system },
    ],
    output_config: {
      effort: opts.effort ?? "medium",
      format: { type: "json_schema", schema: opts.schema },
    },
    messages: [{ role: "user", content: opts.content }],
  });

  if (response.stop_reason === "refusal") {
    throw new AgentError("The assistant could not process this request.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AgentError("The answer was too long. Please try again.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

export async function generateText(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: "low" | "medium" | "high";
}): Promise<string> {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [
      { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: opts.system },
    ],
    output_config: { effort: opts.effort ?? "medium" },
    messages: opts.messages,
  });
  if (response.stop_reason === "refusal") {
    throw new AgentError("The assistant could not answer this message.");
  }
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export class AgentError extends Error {}

export function describeError(error: unknown): { status: number; message: string } {
  if (error instanceof AgentError) return { status: 422, message: error.message };
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "The assistant is busy. Please try again in a minute." };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: `The assistant is unavailable (${error.status}).` };
  }
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  return { status: 500, message: error instanceof Error ? error.message : "Unknown error" };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
