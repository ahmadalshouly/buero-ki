import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { callTool, type ToolContext, toolDefinitions } from "../_shared/agent.ts";
import { historyContent, taskRefsFor, taskTools } from "../_shared/caseTools.ts";

/** A stand-in for the Supabase client: every query resolves to `row` and is recorded. */
function fakeSupabase(row: Record<string, unknown>) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["insert", "update", "delete", "select", "eq"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push(`${m}:${JSON.stringify(args)}`);
      return chain;
    };
  }
  chain.single = () => Promise.resolve({ data: row, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  const supabase = { from: (table: string) => (calls.push(`from:${table}`), chain) } as unknown as SupabaseClient;
  return { supabase, calls };
}

function ctxWith(row: Record<string, unknown>, refs = taskRefsFor([{ id: "a" }, { id: "b" }])) {
  const { supabase, calls } = fakeSupabase(row);
  const ctx: ToolContext = { supabase, userId: "u", caseId: "c", taskRefs: refs };
  return { ctx, calls };
}

Deno.test("task tools have object input schemas", () => {
  for (const def of toolDefinitions(taskTools)) {
    assertEquals(def.function.parameters.type, "object");
    assert(def.function.description.length > 20);
  }
});

Deno.test("unknown tools and bad input come back as errors the agent can fix", async () => {
  const { ctx } = ctxWith({ id: "x" });
  assert((await callTool(taskTools, ctx, "nope", {})).isError);
  const bad = await callTool(taskTools, ctx, "add_task", { title: "Go", due_date: "next week" });
  assert(bad.isError);
  assertMatch(bad.result, /due_date/);
  assert((await callTool(taskTools, ctx, "add_task", { title: "Go there", due_date: "2026-02-30" })).isError);
  const missing = await callTool(taskTools, ctx, "complete_task", { task: "T9" });
  assert(missing.isError);
  assertMatch(missing.result, /no open task T9/);
});

Deno.test("add_task inserts an agent task and gives it the next short name", async () => {
  const { ctx, calls } = ctxWith({ id: "new" }, taskRefsFor([{ id: "a" }, { id: "b" }, { id: "c" }]));
  ctx.taskRefs.delete("T2");
  const out = await callTool(taskTools, ctx, "add_task", { title: "Ask the landlord for a Wohnungsgeberbestätigung", due_date: null });
  assertEquals(out.result, "Added as T4.");
  assertEquals(out.action, { kind: "task_added", title: "Ask the landlord for a Wohnungsgeberbestätigung" });
  assertEquals(ctx.taskRefs.get("T4"), "new");
  assert(calls.some((c) => c.startsWith("insert:") && c.includes('"source":"agent"') && c.includes('"case_id":"c"')));
});

Deno.test("remove_task deletes within the case and forgets the short name", async () => {
  const { ctx, calls } = ctxWith({ title: "Send payslips" });
  const out = await callTool(taskTools, ctx, "remove_task", { task: "t1", reason: "Letter was misread" });
  assertEquals(out.action, { kind: "task_removed", title: "Send payslips" });
  assert(!ctx.taskRefs.has("T1"));
  assert(calls.includes('delete:[]'));
  assert(calls.includes('eq:["case_id","c"]'));
});

Deno.test("update_task needs a change and can clear the due date", async () => {
  const { ctx, calls } = ctxWith({ title: "Send payslips" });
  assert((await callTool(taskTools, ctx, "update_task", { task: "T1" })).isError);
  const out = await callTool(taskTools, ctx, "update_task", { task: "T1", due_date: null });
  assertEquals(out.action?.kind, "task_updated");
  assert(calls.includes('update:[{"due_date":null}]'));
});

Deno.test("history shows the agent what it changed earlier", () => {
  assertEquals(historyContent("Hi", []), "Hi");
  assertEquals(
    historyContent("Done.", [{ kind: "task_removed", title: "Send payslips" }]),
    'Done.\n\n(Changes I made: Removed task: "Send payslips")',
  );
});
