// Answers the person's questions about one case, in their language, with the case as context.
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { z } from "npm:zod@4.6.7";
import { languageName, streamText } from "../_shared/anthropic.ts";
import { loadCaseContext, renderCase } from "../_shared/case.ts";
import { eventStream, handler, wantsStream } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";

const HISTORY_LIMIT = 30;

const SYSTEM = (language: string) => `Task: answer the person's questions about their case in ${languageName(language)}, unless they write in another language, then answer in that language.
Keep answers short (under 150 words) unless they ask for detail. Use simple Markdown lists when listing steps.
If they want a letter written, tell them to tap "Write a reply" in the case. If they need someone to come along to an appointment, suggest a Beratungsstelle.`;

const Input = z.strictObject({
  case_id: z.uuid(),
  message: z.string().trim().min(1, "Message is empty").max(4000),
});

Deno.serve(handler("case-chat", Input, async (ctx) => {
  const { supabase, input, profile } = ctx;
  // Independent reads run together; a failure here still answers with a plain JSON error.
  const [, caseCtx, { data: history }] = await Promise.all([
    enforceLimit(ctx, "case-chat"),
    loadCaseContext(supabase, input.case_id),
    supabase.from("messages")
      .select("role, content").eq("case_id", input.case_id)
      .order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
  ]);

  // Case state first, then the conversation, so later turns extend the same prefix.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Here is the current state of my case:\n\n${renderCase(caseCtx, profile.full_name)}` },
    { role: "assistant", content: "Thank you, I have read your case. What would you like to know?" },
    ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: input.message },
  ];

  async function answer(onText: (text: string) => void) {
    // Save the question while the assistant starts writing.
    const [{ error: insertError }, { text, usage }] = await Promise.all([
      supabase.from("messages")
        .insert({ case_id: input.case_id, user_id: ctx.userId, role: "user", content: input.message }),
      streamText({ system: SYSTEM(profile.language), messages, effort: "low", onText }),
    ]);
    if (insertError) throw new Error(insertError.message);
    await recordUsage(ctx, "case-chat", usage);

    const { data: saved, error } = await supabase.from("messages")
      .insert({ case_id: input.case_id, user_id: ctx.userId, role: "assistant", content: text })
      .select().single();
    if (error) throw new Error(error.message);
    return saved;
  }

  if (!wantsStream(ctx.req)) return { message: await answer(() => {}) };
  return eventStream(ctx, async (send) => {
    const message = await answer((text) => send({ type: "delta", text }));
    send({ type: "done", message });
  });
}));
