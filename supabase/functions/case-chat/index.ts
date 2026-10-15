// Answers the person's questions about one case, in their language, with the case as context.
// The agent can also change the case's tasks when the person asks (see _shared/caseTools.ts).
import { z } from "npm:zod@4.6.7";
import { runAgent } from "../_shared/agent.ts";
import { type ChatMessage, languageName } from "../_shared/ai.ts";
import { loadCaseContext, renderCase } from "../_shared/case.ts";
import { historyContent, taskRefsFor, taskTools } from "../_shared/caseTools.ts";
import { eventStream, handler, wantsStream } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";

const HISTORY_LIMIT = 30;

const SYSTEM = (language: string) => `Task: answer the person's questions about their case in ${languageName(language)}, unless they write in another language, then answer in that language.
Keep answers short (under 150 words) unless they ask for detail. Use simple Markdown lists when listing steps.
If they want a letter written, tell them to tap "Write a reply" in the case. If they need someone to come along to an appointment, suggest a Beratungsstelle.

You can change the person's task list with your tools. Do it when they ask, or when what they tell you makes a task wrong, done or missing (for example: the letter was misread, they do not have a required document, they already sent something). Refer to tasks by their short name from the case, like T2. Prefer changing a task over removing it when only a detail is wrong. If it is unclear which task they mean or whether they want a change, ask first instead of guessing.
After changing tasks, say in one short sentence what you changed. Never claim a change you did not make with a tool. Task titles are short actions in the person's language, starting with a verb.`;

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
      .select("role, content, actions").eq("case_id", input.case_id)
      .order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
  ]);

  // Case state first, then the conversation, so later turns extend the same prefix.
  const messages: ChatMessage[] = [
    { role: "user", content: `Here is the current state of my case:\n\n${renderCase(caseCtx, profile.full_name)}` },
    { role: "assistant", content: "Thank you, I have read your case. What would you like to know?" },
    ...(history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: historyContent(m.content, m.actions),
    })),
    { role: "user", content: input.message },
  ];

  async function answer(onText: (text: string) => void) {
    // Save the question while the assistant starts writing.
    const [{ error: insertError }, { text, usage, actions }] = await Promise.all([
      supabase.from("messages")
        .insert({ case_id: input.case_id, user_id: ctx.userId, role: "user", content: input.message }),
      runAgent({
        system: SYSTEM(profile.language),
        messages,
        tools: taskTools,
        toolContext: { supabase, userId: ctx.userId, caseId: input.case_id, taskRefs: taskRefsFor(caseCtx.openTasks) },
        onText,
      }),
    ]);
    if (insertError) throw new Error(insertError.message);
    await recordUsage(ctx, "case-chat", usage);
    if (actions.length) ctx.log("chat actions", { kinds: actions.map((a) => a.kind) });

    const { data: saved, error } = await supabase.from("messages")
      .insert({ case_id: input.case_id, user_id: ctx.userId, role: "assistant", content: text, actions })
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
