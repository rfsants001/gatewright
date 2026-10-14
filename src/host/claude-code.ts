// Claude Code host adapter — maps its hook payload to GateContext and decisions back to hook output.

import type { GateContext, GateEvent } from "../core/gate/types.js";

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
