// Temporary: checks what deepseek/deepseek-v4.1-flash on Lyceum supports. Removed before merge.
import { readFileSync } from "node:fs";

const URL = "https://api.lyceum.technology/openai/v1/chat/completions";
const MODEL = process.env.PROBE_MODEL || "deepseek/deepseek-v4.1-flash";
const key = process.env.LYCEUM_API_KEY;
const dir = new globalThis.URL(".", import.meta.url).pathname;

async function call(label, body) {
  const started = Date.now();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, ...body }),
    });
    const ms = Date.now() - started;
    if (body.stream) {
      const text = await res.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data:"));
      const keys = new Set();
      let content = "", reasoning = "", usage = null, toolDeltas = 0;
      for (const l of lines) {
        const d = l.slice(5).trim();
        if (d === "[DONE]") continue;
        try {
          const j = JSON.parse(d);
          if (j.usage) usage = j.usage;
          const delta = j.choices?.[0]?.delta ?? {};
          Object.keys(delta).forEach((k) => keys.add(k));
          content += delta.content ?? "";
          reasoning += delta.reasoning_content ?? delta.reasoning ?? "";
          if (delta.tool_calls) toolDeltas++;
        } catch { /* ignore */ }
      }
      console.log(`\n### ${label}: HTTP ${res.status} in ${ms}ms`);
      console.log(JSON.stringify({ deltaKeys: [...keys], content: content.slice(0, 300), reasoningChars: reasoning.length, toolDeltas, usage, first: lines[0]?.slice(0, 400), last: lines.at(-2)?.slice(0, 600) }, null, 1));
      if (res.status >= 400) console.log(text.slice(0, 800));
      return;
    }
    const j = await res.json().catch(async () => ({ raw: await res.text() }));
    const msg = j.choices?.[0]?.message ?? {};
    console.log(`\n### ${label}: HTTP ${res.status} in ${ms}ms`);
    console.log(JSON.stringify({
      finish: j.choices?.[0]?.finish_reason,
      model: j.model,
      content: typeof msg.content === "string" ? msg.content.slice(0, 600) : msg.content,
      reasoningChars: (msg.reasoning_content ?? msg.reasoning ?? "").length,
      msgKeys: Object.keys(msg),
      tool_calls: msg.tool_calls,
      usage: j.usage,
      error: j.error ?? j.detail ?? j.raw?.slice?.(0, 800),
    }, null, 1));
  } catch (e) {
    console.log(`\n### ${label}: FAILED ${e}`);
  }
}

const hi = [{ role: "user", content: "Is 1013 a prime number? Answer yes or no and one short reason." }];
await call("default", { messages: hi });
await call("reasoning_effort none (top level)", { messages: hi, reasoning_effort: "none" });
await call("ctk thinking false", { messages: hi, chat_template_kwargs: { thinking: false } });
await call("ctk reasoning_effort 0", { messages: hi, chat_template_kwargs: { reasoning_effort: 0 } });
await call("ctk reasoning_effort none", { messages: hi, chat_template_kwargs: { reasoning_effort: "none" } });
await call("ctk thinking false + enable_thinking false", { messages: hi, chat_template_kwargs: { thinking: false, enable_thinking: false } });

const jpg = readFileSync(dir + "letter.jpg").toString("base64");
const pdf = readFileSync(dir + "letter.pdf").toString("base64");
const ask = "Who wrote this letter, to which office, on what date, and what reference number? Answer in one line.";
await call("image (no reasoning)", {
  reasoning_effort: "none",
  messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpg}` } }, { type: "text", text: ask }] }],
});
await call("pdf as file part", {
  reasoning_effort: "none",
  messages: [{ role: "user", content: [{ type: "file", file: { filename: "letter.pdf", file_data: `data:application/pdf;base64,${pdf}` } }, { type: "text", text: ask }] }],
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["sender", "date", "items"],
  properties: {
    sender: { type: "string" },
    date: { type: ["string", "null"] },
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" } } } },
  },
};
await call("json_schema strict", {
  reasoning_effort: "none",
  messages: [{ role: "system", content: "Extract data." }, { role: "user", content: "Letter from Jobcenter Berlin dated 10.10.2026 asking for Mietvertrag and Kontoauszüge." }],
  response_format: { type: "json_schema", json_schema: { name: "out", strict: true, schema } },
});
await call("json_object", {
  reasoning_effort: "none",
  messages: [{ role: "system", content: `Reply with JSON matching this schema: ${JSON.stringify(schema)}` }, { role: "user", content: "Letter from Jobcenter Berlin dated 10.10.2026 asking for Mietvertrag and Kontoauszüge." }],
  response_format: { type: "json_object" },
});

const tools = [{
  type: "function",
  function: {
    name: "add_task",
    description: "Add a task to the person's to-do list.",
    parameters: { type: "object", additionalProperties: false, required: ["title", "due_date"], properties: { title: { type: "string" }, due_date: { type: ["string", "null"] } } },
  },
}];
await call("tools", {
  reasoning_effort: "none",
  tools,
  messages: [{ role: "user", content: "Please add a task: send the Mietvertrag to the Jobcenter by 2026-11-01." }],
});
await call("tools streaming", {
  reasoning_effort: "none",
  stream: true,
  stream_options: { include_usage: true },
  tools,
  messages: [{ role: "user", content: "Please add a task: send the Mietvertrag to the Jobcenter by 2026-11-01." }],
});
await call("tool_choice none", {
  reasoning_effort: "none",
  tools,
  tool_choice: "none",
  messages: [{ role: "user", content: "Please add a task: send the Mietvertrag to the Jobcenter by 2026-11-01." }],
});
await call("tool result round trip", {
  reasoning_effort: "none",
  tools,
  messages: [
    { role: "user", content: "Please add a task: send the Mietvertrag to the Jobcenter by 2026-11-01." },
    { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "add_task", arguments: '{"title":"Send Mietvertrag","due_date":"2026-11-01"}' } }] },
    { role: "tool", tool_call_id: "call_1", content: "Added as T3." },
  ],
});
await call("stream text", {
  reasoning_effort: "none",
  stream: true,
  stream_options: { include_usage: true },
  messages: [{ role: "user", content: "Say hello in German in five words." }],
});
