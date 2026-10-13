import type { AgentFunction, Plan } from "./types";

// Mirrors supabase/functions/_shared/limits.ts. The server enforces; the app only displays.
export const DAILY_LIMITS: Record<Plan, Record<AgentFunction, number>> = {
  free: { "analyze-document": 10, "draft-reply": 10, "case-chat": 40 },
  plus: { "analyze-document": 60, "draft-reply": 60, "case-chat": 300 },
  org: { "analyze-document": 300, "draft-reply": 300, "case-chat": 1500 },
};
