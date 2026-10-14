// Answers the person's questions about one case, in their language, with the case as context.
// The agent can also change the case's tasks when the person asks (see _shared/caseTools.ts).
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { z } from "npm:zod@4.6.7";
import { runAgent } from "../_shared/agent.ts";
import { languageName } from "../_shared/anthropic.ts";
import { loadCaseContext, renderCase } from "../_shared/case.ts";
import { historyContent, taskRefsFor, taskTools } from "../_shared/caseTools.ts";
import { handler } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";

const HISTORY_LIMIT = 30;

const Input = z.strictObject({
  case_id: z.uuid(),
  message: z.string().trim().min(1, "Message is empty").max(4000),
});

Deno.serve(handler("case-chat", Input, async (ctx) => {
  const { supabase, input, profile } = ctx;
  await enforceLimit(ctx, "case-chat");
  const caseCtx = await loadCaseContext(supabase, input.case_id);

  const { data: history } = await supabase.from("messages")
    .select("role, content, actions").eq("case_id", input.case_id)
    .order("created_at", { ascending: false }).limit(HISTORY_LIMIT);

  const { error: insertError } = await supabase.from("messages")
    .insert({ case_id: input.case_id, user_id: ctx.userId, role: "user", content: input.message });
  if (insertError) throw new Error(insertError.message);

  // Case state first, then the conversation, so later turns extend the same prefix.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Here is the current state of my case:\n\n${renderCase(caseCtx, profile.full_name)}` },
    { role: "assistant", content: "Thank you, I have read your case. What would you like to know?" },
    ...(history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: historyContent(m.content, m.actions),
    })),
    { role: "user", content: input.message },
  ];

  const { text, usage, actions } = await runAgent({
    system: `Task: answer the person's questions about their case in ${languageName(profile.language)}, unless they write in another language, then answer in that language.
Keep answers short (under 150 words) unless they ask for detail. Use simple Markdown lists when listing steps.
If they want a letter written, tell them to tap "Write a reply" in the case. If they need someone to come along to an appointment, suggest a Beratungsstelle.

You can change the person's task list with your tools. Do it when they ask, or when what they tell you makes a task wrong, done or missing (for example: the letter was misread, they do not have a required document, they already sent something). Refer to tasks by their short name from the case, like T2. Prefer changing a task over removing it when only a detail is wrong. If it is unclear which task they mean or whether they want a change, ask first instead of guessing.
After changing tasks, say in one short sentence what you changed. Never claim a change you did not make with a tool. Task titles are short actions in the person's language, starting with a verb.`,
    messages,
    tools: taskTools,
    toolContext: { supabase, userId: ctx.userId, caseId: input.case_id, taskRefs: taskRefsFor(caseCtx.openTasks) },
    effort: "medium",
  });
  await recordUsage(ctx, "case-chat", usage);
  if (actions.length) ctx.log("chat actions", { kinds: actions.map((a) => a.kind) });

  const { data: saved, error } = await supabase.from("messages")
    .insert({ case_id: input.case_id, user_id: ctx.userId, role: "assistant", content: text, actions })
    .select().single();
  if (error) throw new Error(error.message);
  return { message: saved };
}));
