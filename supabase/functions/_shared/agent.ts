// A small tool-use loop: the agent may call tools (for example to change tasks)
// before it answers. To give the chat a new ability, write an AgentTool and add it
// to the list the function passes to runAgent.
import type Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { z } from "npm:zod@4.6.7";
import {
  anthropic,
  BASE_SYSTEM,
  checkStop,
  type Effort,
  FALLBACK_BETA,
  MODEL,
  outputSchema,
  textOf,
  type Usage,
  usageOf,
} from "./anthropic.ts";

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

export function toolDefinitions(tools: AgentTool[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: outputSchema(t.input) as Anthropic.Beta.BetaTool.InputSchema,
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

function addUsage(total: Usage | null, next: Usage): Usage {
  if (!total) return next;
  return {
    model: next.model,
    input_tokens: total.input_tokens + next.input_tokens,
    output_tokens: total.output_tokens + next.output_tokens,
    cache_read_tokens: total.cache_read_tokens + next.cache_read_tokens,
  };
}

export async function runAgent(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: AgentTool[];
  toolContext: ToolContext;
  effort?: Effort;
  maxSteps?: number;
  /** Gets each piece of the answer as it is written. */
  onText?: (text: string) => void;
}): Promise<{ text: string; usage: Usage; actions: ChatAction[] }> {
  const maxSteps = opts.maxSteps ?? 6;
  const messages = [...opts.messages];
  const definitions = toolDefinitions(opts.tools);
  const texts: string[] = [];
  const actions: ChatAction[] = [];
  let usage: Usage | null = null;

  for (let step = 1; ; step++) {
    const stream = anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: [
        { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.system },
      ],
      output_config: { effort: opts.effort ?? "medium" },
      tools: definitions,
      // On the last step the agent must answer instead of calling more tools.
      tool_choice: step >= maxSteps ? { type: "none" } : { type: "auto" },
      messages,
    });
    // Text from an earlier step stays; a blank line separates it from the next.
    let started = false;
    for await (const event of stream) {
      if (event.type !== "content_block_delta" || event.delta.type !== "text_delta" || !opts.onText) continue;
      if (!started && texts.length) opts.onText("\n\n");
      started = true;
      opts.onText(event.delta.text);
    }
    const response = await stream.finalMessage();
    usage = addUsage(usage, usageOf(response));
    checkStop(response);
    const text = textOf(response).trim();
    if (text) texts.push(text);

    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || calls.length === 0) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const out = await callTool(opts.tools, opts.toolContext, call.name, call.input);
      if (out.action) actions.push(out.action);
      results.push({ type: "tool_result", tool_use_id: call.id, content: out.result, is_error: out.isError || undefined });
    }
    messages.push({ role: "assistant", content: response.content }, { role: "user", content: results });
  }

  return { text: texts.join("\n\n"), usage: usage!, actions };
}
