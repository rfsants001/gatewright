import type { HostAdapter } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";

/** Accept both canonical Codex hook names and native function-tool payloads. */
export const codexHookAdapter: HostAdapter = {
  parse(raw) {
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const name = String(value["tool_name"] ?? "").replace(/^functions\./, "");
    let input = value["tool_input"];
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        input = { patch: input };
      }
    }
    const details = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const shell = ["exec_command", "shell", "shell_command"].includes(name);
    const patch = name === "apply_patch" ? (details["patch"] ?? details["input"]) : undefined;
    const files =
      typeof patch === "string"
        ? [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(
            (match) => ({ path: match[1]!.trim() }),
          )
        : [];
    const command = details["command"] ?? details["cmd"];
    return claudeCodeAdapter.parse(
      JSON.stringify({
        ...value,
        tool_name: shell ? "Bash" : name === "read_file" ? "Read" : name,
        tool_input: {
          ...details,
          ...(shell ? { command: Array.isArray(command) ? command.map(String).join(" ") : command } : {}),
          ...(files.length ? { files, file_path: files[0]!.path } : {}),
        },
      }),
    );
  },
  render: claudeCodeAdapter.render,
};
