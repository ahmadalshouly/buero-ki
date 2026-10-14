// One wrapper for every function: CORS, sign-in check, input validation,
// structured logs with a request id, and consistent error responses.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { z } from "npm:zod@4.6.7";
import { AgentError, isApiError, isRateLimit } from "./anthropic.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export interface Profile {
  language: string;
  full_name: string | null;
  plan: "free" | "plus" | "org";
  ai_consent_at: string | null;
}

export interface Ctx<I> {
  req: Request;
  input: I;
  requestId: string;
  userId: string;
  /** The sign-in email address, if the login has one. */
  userEmail: string | null;
  supabase: SupabaseClient;
  profile: Profile;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  logError: (msg: string, extra?: Record<string, unknown>) => void;
}

export type Logger = (level: "info" | "error", msg: string, extra?: Record<string, unknown>) => void;

export function makeLogger(fn: string, requestId: string, userId?: string): Logger {
  return (level, msg, extra = {}) => {
    const line = JSON.stringify({ level, fn, requestId, userId, msg, ...extra, at: new Date().toISOString() });
    if (level === "error") console.error(line);
    else console.log(line);
  };
}

export function toErrorResponse(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof HttpError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof AgentError) return { status: 422, code: "agent", message: error.message };
  if (isRateLimit(error)) {
    return { status: 429, code: "busy", message: "The assistant is busy. Please try again in a minute." };
  }
  if (isApiError(error)) {
    return { status: 502, code: "upstream", message: "The assistant is unavailable right now. Please try again." };
  }
  return { status: 500, code: "internal", message: "Something went wrong on our side." };
}

export function handler<S extends z.ZodType>(
  name: string,
  input: S,
  run: (ctx: Ctx<z.infer<S>>) => Promise<unknown>,
  opts: { requireConsent?: boolean } = { requireConsent: true },
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    let logger = makeLogger(name, requestId);
    const started = Date.now();
    try {
      if (req.method !== "POST") throw new HttpError(405, "Use POST", "method");
      const authorization = req.headers.get("Authorization");
      if (!authorization) throw new HttpError(401, "Not signed in", "auth");

      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: auth, error: authError } = await supabase.auth.getUser(authorization.replace("Bearer ", ""));
      if (authError || !auth.user) throw new HttpError(401, "Not signed in", "auth");
      const userId = auth.user.id;
      logger = makeLogger(name, requestId, userId);

      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        throw new HttpError(400, "Request body must be JSON", "input");
      }
      const parsed = input.safeParse(raw);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), "input");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("language, full_name, plan, ai_consent_at").eq("id", userId).single();
      if (profileError || !profile) throw new HttpError(404, "Profile not found", "profile");
      if (opts.requireConsent !== false && !profile.ai_consent_at) {
        throw new HttpError(403, "Please agree to AI processing in the app settings first.", "consent");
      }

      const result = await run({
        req,
        input: parsed.data,
        requestId,
        userId,
        userEmail: auth.user.email ?? null,
        supabase,
        profile: profile as Profile,
        log: (msg, extra) => logger("info", msg, extra),
        logError: (msg, extra) => logger("error", msg, extra),
      });
      if (result instanceof Response) {
        logger("info", "streaming", { ms: Date.now() - started });
        result.headers.set("x-request-id", requestId);
        return result;
      }
      logger("info", "done", { ms: Date.now() - started });
      return json(result, 200, { "x-request-id": requestId });
    } catch (error) {
      const { status, code, message } = toErrorResponse(error);
      logger(status >= 500 ? "error" : "info", "failed", {
        status,
        code,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: message, code, requestId }, status, { "x-request-id": requestId });
    }
  };
}

export function wantsStream(req: Request): boolean {
  return (req.headers.get("Accept") ?? "").includes("text/event-stream");
}

export type SendEvent = (event: { type: string } & Record<string, unknown>) => void;

/**
 * Answers with server-sent events, one JSON object per event. Once the stream is open the
 * status is 200, so a failure arrives as an "error" event with the same fields as a JSON error.
 */
export function eventStream(ctx: Ctx<unknown>, work: (send: SendEvent) => Promise<void>): Response {
  const started = Date.now();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SendEvent = (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await work(send);
        ctx.log("done", { ms: Date.now() - started });
      } catch (error) {
        const { status, code, message } = toErrorResponse(error);
        (status >= 500 ? ctx.logError : ctx.log)("failed", {
          status,
          code,
          ms: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        });
        send({ type: "error", error: message, code, requestId: ctx.requestId });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
