// Answers the person's questions about one case, in their language, with the case as context.
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { describeError, generateText, HttpError, languageName } from "../_shared/anthropic.ts";
import { corsHeaders, json, loadCaseContext, renderCase, userClient } from "../_shared/supabase.ts";

const HISTORY_LIMIT = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, userId } = await userClient(req);
    const body = await req.json();
    const caseId: string | undefined = body.case_id;
    const message: string = (body.message ?? "").toString().trim().slice(0, 4000);
    if (!caseId) throw new HttpError(400, "case_id is required");
    if (!message) throw new HttpError(400, "Message is empty");

    const ctx = await loadCaseContext(supabase, userId, caseId);
    const { data: history } = await supabase.from("messages")
      .select("role, content").eq("case_id", caseId)
      .order("created_at", { ascending: false }).limit(HISTORY_LIMIT);

    const { error: insertError } = await supabase.from("messages")
      .insert({ case_id: caseId, user_id: userId, role: "user", content: message });
    if (insertError) throw new Error(insertError.message);

    // Case state goes first so the conversation that follows stays an append-only prefix.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: `Here is the current state of my case:\n\n${renderCase(ctx)}` },
      { role: "assistant", content: "Thank you, I have read your case. What would you like to know?" },
      ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: message },
    ];

    const answer = await generateText({
      system: `Task: answer the person's questions about their case in ${languageName(ctx.language)}, unless they write in another language, then answer in that language.
Keep answers short (under 150 words) unless they ask for detail. Use simple Markdown lists when listing steps.
If they want a letter written, tell them to tap "Draft a reply" in the case. If they need someone to come along to an appointment, suggest a community translator or a Beratungsstelle.`,
      messages,
      effort: "medium",
    });

    const { data: saved, error } = await supabase.from("messages")
      .insert({ case_id: caseId, user_id: userId, role: "assistant", content: answer })
      .select().single();
    if (error) throw new Error(error.message);

    return json({ message: saved });
  } catch (error) {
    const { status, message } = describeError(error);
    return json({ error: message }, status);
  }
});
