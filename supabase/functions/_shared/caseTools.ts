// Tools the case chat uses to change the person's tasks. They run with the person's
// own Supabase client, so row-level security limits them to the person's data.
import { z } from "npm:zod@4.6.7";
import { type AgentTool, type ChatAction, defineTool, type ToolContext, ToolError } from "./agent.ts";

const TaskRef = z.string().describe('The task\'s short name from the case, for example "T2".');
// A plain pattern keeps the tool schema short; the check rejects dates like 2026-02-30.
const DueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const time = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().startsWith(v);
  }, "Not a real date")
  .describe("Due date as YYYY-MM-DD.");

function taskId(ctx: ToolContext, ref: string): string {
  const id = ctx.taskRefs.get(ref.trim().toUpperCase());
  if (!id) throw new ToolError(`There is no open task ${ref}. Use the short names from the case, like T1.`);
  return id;
}

async function taskTitle(ctx: ToolContext, id: string): Promise<string> {
  const { data, error } = await ctx.supabase.from("tasks").select("title").eq("id", id).eq("case_id", ctx.caseId).single();
  if (error || !data) throw new ToolError("That task no longer exists.");
  return data.title;
}

export const addTask = defineTool({
  name: "add_task",
  description: "Add a new task to the person's to-do list for this case. Use it when the person asks for one, " +
    "or when something they tell you clearly creates a new step (for example a document they still have to get).",
  input: z.object({
    title: z.string().trim().min(3).max(200).describe("Short action in the person's language, starting with a verb."),
    due_date: DueDate.nullable().describe("Due date as YYYY-MM-DD, or null when there is none."),
  }),
  async run(ctx, input) {
    const { data, error } = await ctx.supabase.from("tasks")
      .insert({ case_id: ctx.caseId, user_id: ctx.userId, title: input.title, due_date: input.due_date, source: "agent" })
      .select("id").single();
    if (error) throw new Error(error.message);
    const ref = `T${Math.max(0, ...[...ctx.taskRefs.keys()].map((k) => Number(k.slice(1)) || 0)) + 1}`;
    ctx.taskRefs.set(ref, data.id);
    return { result: `Added as ${ref}.`, action: { kind: "task_added", title: input.title } };
  },
});

export const updateTask = defineTool({
  name: "update_task",
  description: "Change the wording or due date of an open task, for example when the person corrects a detail.",
  input: z.object({
    task: TaskRef,
    title: z.string().trim().min(3).max(200).optional().describe("New title. Leave out to keep it."),
    due_date: DueDate.nullable().optional().describe("New due date, null to remove it. Leave out to keep it."),
  }),
  async run(ctx, input) {
    const id = taskId(ctx, input.task);
    const changes: { title?: string; due_date?: string | null } = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.due_date !== undefined) changes.due_date = input.due_date;
    if (!Object.keys(changes).length) throw new ToolError("Nothing to change: give a new title or due date.");
    const { data, error } = await ctx.supabase.from("tasks").update(changes)
      .eq("id", id).eq("case_id", ctx.caseId).select("title").single();
    if (error || !data) throw new ToolError("That task no longer exists.");
    return { result: "Updated.", action: { kind: "task_updated", title: data.title } };
  },
});

export const completeTask = defineTool({
  name: "complete_task",
  description: "Mark an open task as done, when the person says they already did it.",
  input: z.object({ task: TaskRef }),
  async run(ctx, input) {
    const id = taskId(ctx, input.task);
    const { data, error } = await ctx.supabase.from("tasks").update({ done: true })
      .eq("id", id).eq("case_id", ctx.caseId).select("title").single();
    if (error || !data) throw new ToolError("That task no longer exists.");
    return { result: "Marked as done.", action: { kind: "task_done", title: data.title } };
  },
});

export const removeTask = defineTool({
  name: "remove_task",
  description: "Delete a task that is wrong or no longer needed, for example because the letter was misread " +
    "or does not apply to the person. Only when the person says so or clearly agrees.",
  input: z.object({
    task: TaskRef,
    reason: z.string().max(300).describe("Why the task goes, in a few words."),
  }),
  async run(ctx, input) {
    const id = taskId(ctx, input.task);
    const title = await taskTitle(ctx, id);
    const { error } = await ctx.supabase.from("tasks").delete().eq("id", id).eq("case_id", ctx.caseId);
    if (error) throw new Error(error.message);
    for (const [ref, value] of ctx.taskRefs) if (value === id) ctx.taskRefs.delete(ref);
    return { result: "Removed.", action: { kind: "task_removed", title } };
  },
});

export const taskTools: AgentTool[] = [addTask, updateTask, completeTask, removeTask];

/** Short names T1, T2, ... in the order the open tasks appear in the rendered case. */
export function taskRefsFor(tasks: { id: string }[]): Map<string, string> {
  return new Map(tasks.map((t, i) => [`T${i + 1}`, t.id]));
}

const ACTION_VERBS: Record<string, string> = {
  task_added: "Added task",
  task_updated: "Changed task",
  task_done: "Marked as done",
  task_removed: "Removed task",
};

/** Earlier answers, with the changes they made, so the agent remembers what it did. */
export function historyContent(content: string, actions: ChatAction[] | null): string {
  if (!actions?.length) return content;
  const done = actions.map((a) => `${ACTION_VERBS[a.kind] ?? a.kind}: "${a.title}"`).join("; ");
  return `${content}\n\n(Changes I made: ${done})`;
}
