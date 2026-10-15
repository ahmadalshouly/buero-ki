// Daily limits per plan, counted from the append-only ai_usage table.
import type { Usage } from "./ai.ts";
import { type Ctx, HttpError, type Profile } from "./http.ts";

// learn-facts runs in the background after a chat answer; the app does not show its count.
export type AgentFunction = "analyze-document" | "draft-reply" | "case-chat" | "fill-form" | "learn-facts";

export const DAILY_LIMITS: Record<Profile["plan"], Record<AgentFunction, number>> = {
  free: { "analyze-document": 10, "draft-reply": 10, "case-chat": 40, "fill-form": 20, "learn-facts": 40 },
  plus: { "analyze-document": 60, "draft-reply": 60, "case-chat": 300, "fill-form": 120, "learn-facts": 300 },
  org: { "analyze-document": 300, "draft-reply": 300, "case-chat": 1500, "fill-form": 600, "learn-facts": 1500 },
};

export function limitFor(plan: Profile["plan"], fn: AgentFunction): number {
  return (DAILY_LIMITS[plan] ?? DAILY_LIMITS.free)[fn];
}

export async function enforceLimit(ctx: Ctx<unknown>, fn: AgentFunction): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("ai_calls_last_day", { fn });
  if (error) throw new Error(error.message);
  const limit = limitFor(ctx.profile.plan, fn);
  if ((data as number) >= limit) {
    throw new HttpError(429, `You reached today's limit of ${limit} for this feature. It resets within 24 hours.`, "limit");
  }
}

export async function recordUsage(ctx: Ctx<unknown>, fn: AgentFunction, usage: Usage): Promise<void> {
  const { error } = await ctx.supabase.from("ai_usage").insert({
    user_id: ctx.userId,
    function_name: fn,
    model: usage.model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
  });
  // Usage tracking must never fail the user's request.
  if (error) ctx.log("usage insert failed", { error: error.message });
  else ctx.log("usage", { ...usage });
}
