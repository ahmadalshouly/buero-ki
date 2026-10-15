// A small tool-use loop: the agent may call tools (for example to change tasks)
// before it answers. To give the chat a new ability, write an AgentTool and add it
// to the list the function passes to runAgent.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { z } from "npm:zod@4.6.7";
import { addUsage, type ChatMessage, checkFinish, complete, outputSchema, type Send, systemMessage, type ToolDefinition, type Usage } from "./ai.ts";

/** A change the agent made, stored with its answer and shown under it in the chat. */
export interface ChatAction {
  kind: string;
  title: string;
}

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  caseId: string;
  /** Short names like "T1" the agent uses for open tasks, mapped to task ids. */
  taskRefs: Map<string, string>;
}

export interface ToolResult {
  /** What the agent reads back. */
  result: string;
  action?: ChatAction;
}

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<ToolResult>;
}

/** A mistake the agent can fix, such as an unknown task; sent back as a tool error. */
export class ToolError extends Error {}

export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool {
  return tool as unknown as AgentTool;
}

export function toolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: outputSchema(t.input) },
  }));
}

/** Runs one tool call and never throws for the agent's own mistakes. */
export async function callTool(
  tools: AgentTool[],
  ctx: ToolContext,
  name: string,
  rawInput: unknown,
): Promise<ToolResult & { isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { result: `Unknown tool ${name}.`, isError: true };
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { result: `Invalid input: ${issues}`, isError: true };
  }
  try {
    return { ...(await tool.run(ctx, parsed.data)), isError: false };
  } catch (error) {
    if (error instanceof ToolError) return { result: error.message, isError: true };
    throw error;
  }
}

export async function runAgent(opts: {
  system: string;
  messages: ChatMessage[];
  tools: AgentTool[];
  toolContext: ToolContext;
  maxSteps?: number;
  /** Gets each piece of the answer as it is written. */
  onText?: (text: string) => void;
  send?: Send;
}): Promise<{ text: string; usage: Usage; actions: ChatAction[] }> {
  const maxSteps = opts.maxSteps ?? 6;
  const messages: ChatMessage[] = [systemMessage(opts.system), ...opts.messages];
  const definitions = toolDefinitions(opts.tools);
  const texts: string[] = [];
  const actions: ChatAction[] = [];
  let usage: Usage | null = null;

  for (let step = 1; ; step++) {
    // Text from an earlier step stays; a blank line separates it from the next.
    let started = false;
    const completion = await complete({
      messages,
      maxTokens: 16000,
      tools: definitions,
      // On the last step the agent must answer instead of calling more tools.
      toolChoice: step >= maxSteps ? "none" : "auto",
      onText: opts.onText && ((piece) => {
        if (!started && texts.length) opts.onText!("\n\n");
        started = true;
        opts.onText!(piece);
      }),
      send: opts.send,
    });
    usage = addUsage(usage, completion.usage);
    checkFinish(completion);
    const text = completion.content.trim();
    if (text) texts.push(text);

    const calls = completion.toolCalls;
    if (calls.length === 0 || step >= maxSteps) break;

    messages.push({ role: "assistant", content: completion.content || null, tool_calls: calls });
    for (const call of calls) {
      let input: unknown;
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: "Error: the arguments were not valid JSON." });
        continue;
      }
      const out = await callTool(opts.tools, opts.toolContext, call.function.name, input);
      if (out.action) actions.push(out.action);
      messages.push({ role: "tool", tool_call_id: call.id, content: out.isError ? `Error: ${out.result}` : out.result });
    }
  }

  return { text: texts.join("\n\n"), usage: usage!, actions };
}
