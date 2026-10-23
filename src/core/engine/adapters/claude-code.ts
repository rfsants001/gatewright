// Claude Code adapter. Auth is inherited-cli: we shell out to the user's
// logged-in `claude`, so runs ride their subscription (confirmed by `claude
// --help`: under -p, "Auth, model … still apply"). We force the gate's MCP via
// --strict-mcp-config so every tool call flows through the gates + Jev.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandProbe } from "../../env/probes.js";
import { defaultCommandProbe } from "../../env/probes.js";
import type { EngineAdapter, EngineAvailability, EngineCommand, EngineEvent, EngineRunOptions, EngineUsage } from "../types.js";

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

/** A concise "what" for a tool call, from its input (e.g. Read → the file path). */
function toolUseDetail(name: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const rec = input as Record<string, unknown>;
  const str = (k: string): string => (typeof rec[k] === "string" ? (rec[k] as string) : "");
  const byTool: Record<string, string> = {
    Read: str("file_path"),
    Write: str("file_path"),
    Edit: str("file_path"),
    MultiEdit: str("file_path"),
    Bash: str("command"),
    Grep: str("pattern"),
    Glob: str("pattern"),
    Task: str("description"),
    WebFetch: str("url"),
    WebSearch: str("query"),
  };
  const picked = byTool[name];
  if (picked) return picked.replace(/\s+/g, " ").slice(0, 100);
  // Fallback: first string field.
  const first = Object.values(rec).find((v) => typeof v === "string") as string | undefined;
  return first ? first.replace(/\s+/g, " ").slice(0, 100) : "";
}

/** A short one-line preview of a tool result's content. */
function toolResultPreview(content: unknown): string {
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) text = content.map((b) => (typeof b === "object" && b && "text" in b ? String((b as { text: unknown }).text ?? "") : "")).join(" ");
  const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return firstLine.trim().slice(0, 100);
}

/** Map Claude's `usage` shape to a normalized EngineUsage (0 for absent fields). */
function extractUsage(usage: unknown, costUsd?: unknown): EngineUsage | null {
  if (typeof usage !== "object" || usage === null) return null;
  const u = usage as Record<string, unknown>;
  const num = (k: string): number => (typeof u[k] === "number" ? (u[k] as number) : 0);
  const tokensIn = num("input_tokens");
  const tokensOut = num("output_tokens");
  const cacheRead = num("cache_read_input_tokens");
  if (!tokensIn && !tokensOut && !cacheRead && costUsd === undefined) return null;
  return {
    tokensIn,
    tokensOut,
    cacheRead,
    ...(typeof costUsd === "number" ? { costUsd } : {}),
  };
}

/** Collapse one event list to the single element when there's exactly one. */
function one(events: EngineEvent[]): EngineEvent | EngineEvent[] | null {
  if (events.length === 0) return null;
  if (events.length === 1) return events[0]!;
  return events;
}

function parseLine(line: string): EngineEvent | EngineEvent[] | null {
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
      const message = (rec["message"] as { content?: unknown; usage?: unknown }) ?? {};
      const blocks = Array.isArray(message.content) ? (message.content as Record<string, unknown>[]) : [];
      const events: EngineEvent[] = [];

      // Reasoning (thinking) first — a first-class citizen, not discarded.
      const thinking = blocks
        .filter((b) => b["type"] === "thinking" || b["type"] === "reasoning")
        .map((b) => String(b["thinking"] ?? b["text"] ?? ""))
        .join("");
      if (thinking) events.push({ kind: "reasoning", text: thinking, raw: obj });

      // Assistant prose: join the message's text blocks into one event.
      const text = blocks
        .filter((b) => b["type"] === "text")
        .map((b) => String(b["text"] ?? ""))
        .join("");
      if (text) events.push({ kind: "assistant", text, raw: obj });

      // Each tool_use is its own part, in order.
      for (const b of blocks.filter((b) => b["type"] === "tool_use")) {
        const detail = toolUseDetail(String(b["name"] ?? ""), b["input"]);
        events.push({ kind: "tool_use", tool: String(b["name"] ?? "tool"), ...(detail ? { detail } : {}), raw: obj });
      }

      const usage = extractUsage(message.usage);
      if (usage) events.push({ kind: "usage", usage, raw: obj });

      // An assistant turn with no renderable block still surfaces as raw.
      return events.length ? one(events) : { kind: "assistant", text: "", raw: obj };
    }
    case "user": {
      const content = (rec["message"] as { content?: unknown })?.content;
      const blocks = Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
      const result = blocks.find((b) => b["type"] === "tool_result");
      if (result) {
        const preview = toolResultPreview(result["content"]);
        return { kind: "tool_result", ...(preview ? { detail: preview } : {}), raw: obj };
      }
      return { kind: "raw", raw: obj };
    }
    case "result": {
      const resultEv: EngineEvent = { kind: "result", text: String(rec["result"] ?? rec["subtype"] ?? ""), raw: obj };
      const usage = extractUsage(rec["usage"], rec["total_cost_usd"]);
      return usage ? [resultEv, { kind: "usage", usage, raw: obj }] : resultEv;
    }
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
