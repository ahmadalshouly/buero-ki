// After a chat answer, or after the person tells a form something about themselves,
// suggests lasting facts about the person worth remembering.
// Suggestions are stored as pending; the app asks the person to keep or ignore each
// one, and only kept facts are ever given to the agent.
import { z } from "npm:zod@4.6.7";
import { generateJson, languageName } from "../_shared/anthropic.ts";
import { handler } from "../_shared/http.ts";
import { enforceLimit, recordUsage } from "../_shared/limits.ts";
import { FactSuggestions } from "../_shared/schemas.ts";

const RECENT_MESSAGES = 4;
const MAX_SUGGESTIONS = 3;

const Input = z.strictObject({
  case_id: z.uuid(),
  // What the person told a form (their situation, or an answer to one of its questions).
  // Without it, the latest chat messages of the case are used.
  text: z.string().trim().min(1).max(4000).optional(),
});

Deno.serve(handler("learn-facts", Input, async (ctx) => {
  const { supabase, input, profile, userId } = ctx;

  const [settings, recent, known] = await Promise.all([
    supabase.from("profiles").select("memory_enabled").eq("id", userId).single(),
    supabase.from("messages").select("role, content").eq("case_id", input.case_id)
      .order("created_at", { ascending: false }).limit(RECENT_MESSAGES),
    supabase.from("user_facts").select("id, category, fact, status").order("created_at", { ascending: true }).limit(80),
  ]);
  if (settings.data?.memory_enabled === false) return { facts: [] };

  const messages = input.text ? [{ role: "user", content: input.text }] : (recent.data ?? []).reverse();
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  // "ok thanks" and the like never carry a fact; skip the call.
  if (!lastUser || lastUser.content.trim().length < 12) return { facts: [] };

  await enforceLimit(ctx, "learn-facts");
  const facts = known.data ?? [];
  const { data, usage } = await generateJson({
    system: `Task: decide whether the person just told you something about themselves that is worth remembering for future paperwork, in any of their cases.
Good facts are lasting and useful for German bureaucracy: residence status and how long it is valid, nationality, family and household, children, address or city, job or income situation, benefits they receive, health insurance, important customer or reference numbers, languages they speak.
Rules:
- Only use what the person said about themselves in their own messages. Never take facts from your own answers, guesses or the case letters.
- Skip passing details, feelings, questions, one-off plans, and anything already remembered or already suggested (listed below), even if worded differently.
- If the person corrects or updates a remembered fact (for example a new address), suggest the new fact and set replaces_id to the old fact's id.
- Do not suggest health details, religion, ethnicity, political views or sexual orientation unless the person stated it and it clearly matters for their paperwork (for example a disability for a Schwerbehindertenausweis); use category "health" for those.
- At most ${MAX_SUGGESTIONS} facts. Usually there is nothing new; then return an empty list.
- Write each fact in ${languageName(profile.language)}, as one short sentence addressed to the person ("You ...").`,
    content: [
      "Already remembered or suggested:",
      ...(facts.length ? facts.map((f) => `- id ${f.id} [${f.category}, ${f.status}] ${f.fact}`) : ["- nothing yet"]),
      "",
      input.text
        ? "What the person told BüroKI while filling in a form (a question from the form may come before their answer):"
        : "Latest conversation (oldest first):",
      ...messages.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`),
    ].join("\n"),
    schema: FactSuggestions,
    effort: "low",
    maxTokens: 2000,
  });
  await recordUsage(ctx, "learn-facts", usage);

  const knownIds = new Set(facts.filter((f) => f.status === "kept").map((f) => f.id));
  const rows = data.facts.slice(0, MAX_SUGGESTIONS).map((f) => ({
    user_id: userId,
    case_id: input.case_id,
    category: f.category,
    fact: f.fact.trim().slice(0, 300),
    replaces_id: f.replaces_id && knownIds.has(f.replaces_id) ? f.replaces_id : null,
  })).filter((f) => f.fact);
  if (!rows.length) return { facts: [] };

  const { data: saved, error } = await supabase.from("user_facts").insert(rows).select();
  if (error) throw new Error(error.message);
  return { facts: saved };
}));
