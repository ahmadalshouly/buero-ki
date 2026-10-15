// Temporary: runs the real backend AI code against Lyceum. Removed before merge.
import { runAgent } from "../../supabase/functions/_shared/agent.ts";
import { generateJson, systemMessage } from "../../supabase/functions/_shared/ai.ts";
import { taskTools } from "../../supabase/functions/_shared/caseTools.ts";
import { pageParts } from "../../supabase/functions/_shared/pages.ts";
import { Analysis, Draft } from "../../supabase/functions/_shared/schemas.ts";

const dir = new URL(".", import.meta.url);
async function timed<T>(label: string, fn: () => Promise<T>) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`\n### ${label}: OK in ${Date.now() - t}ms\n${JSON.stringify(out, null, 1).slice(0, 3000)}`);
  } catch (e) {
    console.log(`\n### ${label}: FAILED in ${Date.now() - t}ms: ${e instanceof Error ? e.stack : e}`);
  }
}
void systemMessage;

const system = `Task: read the attached letter and explain it. The person is Amina Haddad. Write explanations in English. Today's date is 2026-10-15.`;
for (const [label, mime, file] of [["letter photo", "image/jpeg", "letter.jpg"], ["letter PDF", "application/pdf", "letter.pdf"]]) {
  await timed(`Analysis from ${label}`, async () => {
    const parts = await pageParts(mime, await Deno.readFile(new URL(file, dir)));
    const { data, usage } = await generateJson({ system, content: [...parts, { type: "text", text: "Analyse the letter now." }], schema: Analysis });
    return { usage, belongs_to: data.belongs_to, sender: data.sender, title: data.title_de, date: data.document_date, actions: data.actions, summary: data.summary };
  });
}
await timed("Draft", async () => {
  const { data, usage } = await generateJson({
    system: "Task: draft a formal German letter on behalf of the person. Translation and notes in Arabic. Today's date is 2026-10-15.",
    content: "Case: Jobcenter Berlin Mitte, BG 12345/0067890. The person Amina Haddad wants to ask for a one-week extension to send her bank statements.",
    schema: Draft,
  });
  return { usage, subject: data.subject, body: data.body_de.slice(0, 400), notes: data.notes.slice(0, 200) };
});
await timed("Chat with a tool", async () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "select", "eq", "insert"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve({ data: { id: "new", title: "Send payslips" }, error: null });
  let streamed = "";
  const out = await runAgent({
    system: "Task: answer the person's questions about their case in English. You can change the person's task list with your tools. Refer to tasks by their short name like T1.",
    messages: [
      { role: "user", content: "My case: Jobcenter letter. Open tasks: [T1] Send payslips (due 2026-10-20)" },
      { role: "assistant", content: "Thank you, I have read your case. What would you like to know?" },
      { role: "user", content: "I already sent the payslips yesterday. Please mark it as done." },
    ],
    tools: taskTools,
    toolContext: { supabase: { from: () => chain } as never, userId: "u", caseId: "c", taskRefs: new Map([["T1", "a"]]) },
    onText: (t) => (streamed += t),
  });
  return { ...out, streamedMatches: streamed === out.text };
});
