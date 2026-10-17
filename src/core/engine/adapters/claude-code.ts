// Claude Code adapter. Auth is inherited-cli: we shell out to the user's
// logged-in `claude`, so runs ride their subscription (confirmed by `claude
// --help`: under -p, "Auth, model … still apply"). We force the gate's MCP via
// --strict-mcp-config so every tool call flows through the gates + Jev.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandProbe } from "../../env/probes.js";
import { defaultCommandProbe } from "../../env/probes.js";
import type { EngineAdapter, EngineAvailability, EngineCommand, EngineEvent, EngineRunOptions } from "../types.js";

export interface ClaudeAdapterDeps {
  commandProbe: CommandProbe;
  home: string;
  fileExists: (path: string) => boolean;
}

const defaultDeps: ClaudeAdapterDeps = {
  commandProbe: defaultCommandProbe,
  home: homedir(),
  fileExists: existsSync,
};

/** Known places Claude Code may keep its login; best-effort, never definitive. */
function credentialExists(deps: ClaudeAdapterDeps): boolean {
  return [join(deps.home, ".claude", ".credentials.json"), join(deps.home, ".claude.json")].some(deps.fileExists);
}

function parseLine(line: string): EngineEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { kind: "raw", text: trimmed };
  }
  if (typeof obj !== "object" || obj === null) return { kind: "raw", text: trimmed, raw: obj };
  const rec = obj as Record<string, unknown>;

  switch (rec["type"]) {
    case "assistant": {
      const content = (rec["message"] as { content?: unknown })?.content;
      const blocks = Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
      const toolUse = blocks.find((b) => b["type"] === "tool_use");
      if (toolUse) return { kind: "tool_use", tool: String(toolUse["name"] ?? "tool"), raw: obj };
      const text = blocks
        .filter((b) => b["type"] === "text")
        .map((b) => String(b["text"] ?? ""))
        .join("");
      return { kind: "assistant", text, raw: obj };
    }
    case "user": {
      const content = (rec["message"] as { content?: unknown })?.content;
      const blocks = Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
      const result = blocks.find((b) => b["type"] === "tool_result");
      if (result) return { kind: "tool_result", raw: obj };
      return { kind: "raw", raw: obj };
    }
    case "result":
      return { kind: "result", text: String(rec["result"] ?? rec["subtype"] ?? ""), raw: obj };
    case "system":
      return { kind: "system", text: String(rec["subtype"] ?? "system"), raw: obj };
    default:
      return { kind: "raw", raw: obj };
  }
}

export function createClaudeCodeAdapter(overrides: Partial<ClaudeAdapterDeps> = {}): EngineAdapter {
  const deps: ClaudeAdapterDeps = { ...defaultDeps, ...overrides };
  return {
    id: "claude-code",
    name: "Claude Code",
    authModel: "inherited-cli",

    async detect(): Promise<EngineAvailability> {
      const version = deps.commandProbe("claude", ["--version"]);
      if (version === null) return { installed: false, detail: "`claude` not found on PATH" };
      return {
        installed: true,
        version,
        loggedIn: credentialExists(deps),
        ...(credentialExists(deps) ? {} : { detail: "no login found — run `claude` once to authenticate" }),
      };
    },

    buildHeadlessCommand(opts: EngineRunOptions): EngineCommand {
      const args = ["-p", opts.prompt, "--output-format", "stream-json", "--verbose", "--mcp-config", opts.mcpConfigPath, "--strict-mcp-config"];
      if (opts.systemPrompt) args.push("--append-system-prompt", opts.systemPrompt);
      if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
      if (opts.allowedTools?.length) args.push("--allowedTools", ...opts.allowedTools);
      if (opts.model) args.push("--model", opts.model);
      for (const dir of opts.contextDirs ?? []) args.push("--add-dir", dir);
      return { bin: "claude", args };
    },

    parseStreamLine: parseLine,
  };
}

/** Default adapter with real deps. */
export const claudeCodeAdapter: EngineAdapter = createClaudeCodeAdapter();
