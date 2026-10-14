import { assert, assertEquals, assertMatch, assertThrows } from "jsr:@std/assert@1";
import { outputSchema } from "../_shared/anthropic.ts";
import { renderCase } from "../_shared/case.ts";
import { HttpError, toErrorResponse } from "../_shared/http.ts";
import { DAILY_LIMITS, limitFor } from "../_shared/limits.ts";
import { Analysis, Draft, pageBlock } from "../_shared/schemas.ts";

Deno.test("output schemas are strict JSON Schema with every field required", () => {
  for (const schema of [Analysis, Draft]) {
    const js = outputSchema(schema) as { type: string; required: string[]; properties: object; additionalProperties: boolean };
    assertEquals(js.type, "object");
    assertEquals(js.additionalProperties, false);
    assertEquals(js.required.sort(), Object.keys(js.properties).sort());
    assert(!("$schema" in js));
  }
});

Deno.test("analysis schema accepts a realistic answer and rejects extra keys", () => {
  const ok = {
    readable: true, title_de: "Aufforderung zur Mitwirkung", sender: "Jobcenter Berlin Mitte", document_date: "2026-10-01",
    document_type: "Request for documents", summary: "They need your bank statements.", explanation: "## What is this letter\n...",
    actions: [{ title: "Send bank statements", due_date: "2026-10-20", how_due_date_was_found: "bis zum 20.10.2026" }],
    key_terms: [{ term_de: "Mitwirkungspflicht", meaning: "Duty to cooperate" }], amounts: [],
    urgency: "high", needs_advice: false, advice_reason: null, reference_number: "123A456789",
    case_summary: "Bürgergeld application in progress.", new_facts: [{ key: "bg_number", value: "123A456789" }],
  };
  assert(Analysis.safeParse(ok).success);
  assert(!Analysis.safeParse({ ...ok, extra: 1 }).success);
  assert(!Analysis.safeParse({ ...ok, urgency: "urgent" }).success);
});

Deno.test("pageBlock maps PDFs and images and rejects other files", () => {
  assertEquals(pageBlock("application/pdf", "x").type, "document");
  assertEquals(pageBlock("image/jpeg", "x").type, "image");
  const err = assertThrows(() => pageBlock("image/heic", "x"), HttpError);
  assertEquals(err.status, 415);
});

Deno.test("renderCase fences the case and marks missing data", () => {
  const text = renderCase({
    caseRow: { id: "1", title: "Bürgergeld", category: "jobcenter", authority: null, reference_number: null, summary: null, facts: {} },
    documents: [], openTasks: [{ id: "t", title: "Send payslips", due_date: "2026-10-20" }], sentDrafts: [],
  }, null);
  assertMatch(text, /^<case>\n/);
  assertMatch(text, /<\/case>$/);
  assertMatch(text, /Authority: unknown/);
  assertMatch(text, /\[T1\] Send payslips \(due 2026-10-20\)/);
});

Deno.test("limits grow with the plan and fall back to free", () => {
  assert(DAILY_LIMITS.plus["case-chat"] > DAILY_LIMITS.free["case-chat"]);
  assertEquals(limitFor("nonsense" as "free", "draft-reply"), DAILY_LIMITS.free["draft-reply"]);
});

Deno.test("errors map to safe client messages", () => {
  assertEquals(toErrorResponse(new HttpError(429, "x", "limit")).code, "limit");
  const internal = toErrorResponse(new Error("password=hunter2"));
  assertEquals(internal.status, 500);
  assert(!internal.message.includes("hunter2"));
});
