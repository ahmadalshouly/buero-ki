import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { z } from "npm:zod@4.6.7";
import { runAgent } from "../_shared/agent.ts";
import { AgentError, complete, generateJson, isRateLimit, MODEL, parseJson } from "../_shared/ai.ts";
import { taskTools } from "../_shared/caseTools.ts";
import { toErrorResponse } from "../_shared/http.ts";

/** A stand-in for the AI service: each call streams the next list of chunks and records the request. */
function fakeAi(...responses: Record<string, unknown>[][]) {
  const requests: Record<string, unknown>[] = [];
  const send = (body: Record<string, unknown>) => {
    requests.push(body);
    const chunks = responses[requests.length - 1] ?? [];
    // Split one event across two reads, as the network does.
    const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    const cut = Math.floor(sse.length / 2);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse.slice(0, cut)));
        controller.enqueue(new TextEncoder().encode(sse.slice(cut)));
        controller.close();
      },
    });
    return Promise.resolve(new Response(stream, { status: 200 }));
  };
  return { send, requests };
}

const usage = { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } };
const text = (...pieces: string[]) => [
  ...pieces.map((p) => ({ model: MODEL, choices: [{ delta: { content: p }, finish_reason: null }] })),
  { model: MODEL, choices: [{ delta: {}, finish_reason: "stop" }], usage },
];

Deno.test("complete streams text with reasoning off and counts cached tokens", async () => {
  const ai = fakeAi(text("Hal", "lo"));
  const pieces: string[] = [];
  const out = await complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 100, onText: (t) => pieces.push(t), send: ai.send });
  assertEquals(out.content, "Hallo");
  assertEquals(pieces, ["Hal", "lo"]);
  assertEquals(out.usage, { model: MODEL, input_tokens: 20, output_tokens: 30, cache_read_tokens: 100 });
  const req = ai.requests[0];
  assertEquals(req.model, MODEL);
  assertEquals(req.stream, true);
  assertEquals(req.reasoning_effort, "none");
  assertEquals(req.chat_template_kwargs, { thinking: false });
  assert(!("tools" in req));
});

Deno.test("complete reports service errors so the app can say it is busy", async () => {
  const send = () => Promise.resolve(new Response("slow down", { status: 429 }));
  const error = await assertRejects(() => complete({ messages: [], maxTokens: 10, send }));
  assert(isRateLimit(error));
  assertEquals(toErrorResponse(error).code, "busy");
});

Deno.test("generateJson sends the schema and asks once more after an invalid answer", async () => {
  const schema = z.strictObject({ sender: z.string(), date: z.string().nullable() });
  const ai = fakeAi(text('{"sender": 1}'), text("```json\n", '{"sender":"Jobcenter","date":null}', "\n```"));
  const { data, usage: total } = await generateJson({ system: "Extract.", content: "letter", schema, send: ai.send });
  assertEquals(data, { sender: "Jobcenter", date: null });
  assertEquals(ai.requests.length, 2);
  assertEquals(total.output_tokens, 60);
  const format = ai.requests[0].response_format as { type: string; json_schema: { strict: boolean; schema: { required: string[] } } };
  assertEquals(format.type, "json_schema");
  assert(format.json_schema.strict);
  assertEquals(format.json_schema.schema.required.sort(), ["date", "sender"]);
  const messages = ai.requests[0].messages as { role: string; content: string }[];
  assertEquals(messages[0].role, "system");
  assert(messages[0].content.startsWith("You are BüroKI") && messages[0].content.endsWith("Extract."));
});

Deno.test("generateJson gives up after two invalid answers and on cut-off answers", async () => {
  const schema = z.strictObject({ sender: z.string() });
  await assertRejects(() => generateJson({ system: "", content: "x", schema, send: fakeAi(text("no"), text("{}")).send }), AgentError);
  const cut = [{ model: MODEL, choices: [{ delta: { content: '{"sen' }, finish_reason: "length" }], usage }];
  await assertRejects(() => generateJson({ system: "", content: "x", schema, send: fakeAi(cut).send }), AgentError, "too long");
});

Deno.test("runAgent runs streamed tool calls and sends the results back", async () => {
  const call = [
    { model: MODEL, choices: [{ delta: { content: "Ich trage das ein." }, finish_reason: null }] },
    { model: MODEL, choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "complete_task", arguments: '{"task"' } }] }, finish_reason: null }] },
    { model: MODEL, choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"T1"}' } }] }, finish_reason: "tool_calls" }], usage },
  ];
  const ai = fakeAi(call, text("Erledigt."));
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "select", "eq"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve({ data: { title: "Send payslips" }, error: null });
  const supabase = { from: () => chain } as never;
  const pieces: string[] = [];
  const out = await runAgent({
    system: "Chat.",
    messages: [{ role: "user", content: "I sent the payslips." }],
    tools: taskTools,
    toolContext: { supabase, userId: "u", caseId: "c", taskRefs: new Map([["T1", "a"]]) },
    onText: (t) => pieces.push(t),
    send: ai.send,
  });
  assertEquals(out.text, "Ich trage das ein.\n\nErledigt.");
  assertEquals(pieces.join(""), out.text);
  assertEquals(out.actions, [{ kind: "task_done", title: "Send payslips" }]);
  const first = ai.requests[0] as { tools: { type: string; function: { name: string } }[]; tool_choice: string };
  assertEquals(first.tools[0].type, "function");
  assertEquals(first.tool_choice, "auto");
  const second = ai.requests[1].messages as { role: string; tool_call_id?: string; content: string; tool_calls?: unknown[] }[];
  assertEquals(second.at(-2)?.role, "assistant");
  assertEquals(second.at(-2)?.tool_calls?.length, 1);
  assertEquals(second.at(-1), { role: "tool", tool_call_id: "call_1", content: "Marked as done." });
});

Deno.test("parseJson accepts plain and fenced JSON", () => {
  assertEquals(parseJson('{"a":1}'), { a: 1 });
  assertEquals(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(parseJson("nope"), undefined);
});
