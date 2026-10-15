// Claude Code host adapter — maps its hook payload to GateContext and decisions back to hook output.

import type { GateContext, GateEvent } from "../core/gate/types.js";
import type { EngineResult } from "../core/gate/engine.js";
import type { HostAdapter, HostOutput } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function mapEvent(hookEvent: unknown, toolName: unknown): GateEvent | null {
  const tool = typeof toolName === "string" ? toolName : "";
  if (hookEvent === "PreToolUse") {
    if (/^(Read|read_file)$/.test(tool)) return "pre-read";
    if (/^(Edit|Write|MultiEdit|create_file|apply_patch|insert_edit_into_file|replace_string_in_file)$/.test(tool)) return "pre-edit";
    if (/^(Bash|run_in_terminal)$/.test(tool)) return "pre-bash";
    return null;
  }
  if (hookEvent === "PostToolUse") {
    if (/^(Bash|run_in_terminal)$/.test(tool)) return "post-bash";
    if (/^(Edit|Write|MultiEdit|create_file|apply_patch|insert_edit_into_file|replace_string_in_file)$/.test(tool)) return "post-edit";
    return null;
  }
  if (hookEvent === "Stop") return "stop";
  if (hookEvent === "SubagentStop") return "subagent-stop";
  return null;
}

export function parseClaudeCodeEvent(raw: string): GateContext | null {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(input)) return null;
  const event = mapEvent(input["hook_event_name"], input["tool_name"]);
  if (!event) return null;

  return {
    event,
    cwd: typeof input["cwd"] === "string" ? input["cwd"] : process.cwd(),
    ...(typeof input["tool_name"] === "string" ? { toolName: input["tool_name"] } : {}),
    ...(isRecord(input["tool_input"]) ? { toolInput: input["tool_input"] } : {}),
    ...(input["tool_response"] !== undefined ? { toolResponse: input["tool_response"] } : {}),
    ...(typeof input["session_id"] === "string" ? { sessionKey: input["session_id"] } : {}),
    ...(typeof input["last_assistant_message"] === "string" ? { lastMessage: input["last_assistant_message"] } : {}),
  };
}

export function renderClaudeCodeDecision(result: EngineResult, ctx: GateContext): HostOutput {
  const d = result.decision;
  if (d.kind === "allow") return { stdout: "", exitCode: 0 };
  if (d.kind === "advise") return { stdout: JSON.stringify({ systemMessage: d.message }), exitCode: 0 };
  // deny: Stop/SubagentStop use the block-decision form; PreToolUse uses permissionDecision.
  if (ctx.event === "stop" || ctx.event === "subagent-stop") {
    return { stdout: JSON.stringify({ decision: "block", reason: d.reason }), exitCode: 0 };
  }
  return {
    stdout: JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: d.reason },
    }),
    exitCode: 0,
  };
}

export const claudeCodeAdapter: HostAdapter = {
  parse: parseClaudeCodeEvent,
  render: renderClaudeCodeDecision,
};
