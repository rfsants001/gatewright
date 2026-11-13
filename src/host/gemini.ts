import type { HostAdapter } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";

const tools: Record<string, string> = {
  read_file: "Read",
  run_shell_command: "Bash",
  replace: "Edit",
  write_file: "Write",
};

export const geminiHookAdapter: HostAdapter = {
  parse(raw) {
    const input = JSON.parse(raw) as Record<string, unknown>;
    const event = { BeforeTool: "PreToolUse", AfterTool: "PostToolUse", AfterAgent: "Stop" }[String(input.hook_event_name)];
    if (!event) return null;
    return claudeCodeAdapter.parse(JSON.stringify({
      ...input,
      hook_event_name: event,
      tool_name: tools[String(input.tool_name)] ?? input.tool_name,
      last_assistant_message: input.prompt_response,
    }));
  },
  render(result) {
    const decision = result.decision;
    if (decision.kind === "deny") return { stdout: JSON.stringify({ decision: "deny", reason: decision.reason }), exitCode: 0 };
    if (decision.kind === "advise") return { stdout: JSON.stringify({ systemMessage: decision.message }), exitCode: 0 };
    return { stdout: "", exitCode: 0 };
  },
};
