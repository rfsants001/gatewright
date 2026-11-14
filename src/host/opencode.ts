// OpenCode host adapter — normalizes the payload our shipped OpenCode plugin sends
// (see planTerminal: .opencode/plugin/gatewright.js) into a GateContext, delegating to
// claudeCodeAdapter after remapping OpenCode's native event/tool names. Mirrors the
// gemini adapter: OpenCode has no shell-command hook block, so a JS plugin shells out to
// `gate hook opencode` and throws on a deny. See .specs/features/opencode-hooks/design.md.

import type { HostAdapter } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";

// OpenCode's native tool names → the names claudeCodeAdapter.mapEvent recognizes.
const tools: Record<string, string> = {
  read: "Read",
  bash: "Bash",
  edit: "Edit",
  write: "Write",
};

export const opencodeHookAdapter: HostAdapter = {
  parse(raw) {
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (!input || typeof input !== "object") return null;
    const event = { "execute.before": "PreToolUse", "execute.after": "PostToolUse" }[String(input.hook_event_name)];
    if (!event) return null;
    return claudeCodeAdapter.parse(JSON.stringify({
      ...input,
      hook_event_name: event,
      tool_name: tools[String(input.tool_name)] ?? input.tool_name,
    }));
  },
  render(result) {
    const decision = result.decision;
    if (decision.kind === "deny") return { stdout: JSON.stringify({ decision: "deny", reason: decision.reason }), exitCode: 0 };
    if (decision.kind === "advise") return { stdout: JSON.stringify({ systemMessage: decision.message }), exitCode: 0 };
    return { stdout: "", exitCode: 0 };
  },
};
