import { defaultCommandProbe, type CommandProbe } from "../../env/probes.js";
import type { EngineAdapter, EngineEvent, EngineRunOptions } from "../types.js";

type Host = "codex" | "gemini" | "opencode";

const names = { codex: "Codex", gemini: "Gemini CLI", opencode: "OpenCode" };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function usage(stats: Record<string, unknown>, fields: [string, string, string], cumulative: boolean, model?: string): EngineEvent {
  const number = (key: string) => typeof stats[key] === "number" ? stats[key] : 0;
  return { kind: "usage", usage: {
    tokensIn: number(fields[0]), tokensOut: number(fields[1]), cacheRead: number(fields[2]),
    cumulative, ...(model ? { model } : {}),
  } };
}

function parse(host: Host, line: string): EngineEvent | null {
  let event: Record<string, unknown>;
  try { event = record(JSON.parse(line)); } catch { return line.trim() ? { kind: "raw", text: line } : null; }
  const item = record(event.item);
  const part = record(event.part);
  switch (host) {
    case "codex":
      if (event.type === "gatewright.ready") return { kind: "system", text: String(event.message) };
      if (event.type === "turn.completed") {
        const stats = record(event.usage), cached = typeof stats.cached_input_tokens === "number" ? Math.max(0, stats.cached_input_tokens) : 0;
        const input = typeof stats.input_tokens === "number" ? Math.max(0, stats.input_tokens - cached) : 0;
        return usage({ ...stats, input_tokens: input }, ["input_tokens", "output_tokens", "cached_input_tokens"], true, typeof event.model === "string" ? event.model : undefined);
      }
      if (event.type === "item.completed" && item.type === "agent_message" && typeof item.text === "string") return { kind: "assistant", text: item.text };
      if (event.type === "item.started" && item.type === "command_execution") return { kind: "tool_use", tool: "Shell", ...(typeof item.command === "string" ? { detail: item.command } : {}) };
      if (event.type === "item.completed" && item.type === "command_execution") return { kind: "tool_result", tool: "Shell", ...(typeof item.aggregated_output === "string" ? { text: item.aggregated_output } : {}) };
      if (event.type === "item.completed" && item.type === "file_change") return { kind: "tool_result", tool: "apply_patch", detail: JSON.stringify(item.changes ?? []).slice(0, 4000) };
      if ((event.type === "item.started" || event.type === "item.completed") && item.type === "mcp_tool_call") return { kind: event.type === "item.started" ? "tool_use" : "tool_result", tool: String(item.tool ?? "MCP"), detail: String(item.server ?? "") };
      break;
    case "gemini":
      if (event.type === "message" && event.role === "assistant" && typeof event.content === "string") return { kind: "assistant", text: event.content };
      if (event.type === "tool_use") return { kind: "tool_use", tool: String(event.tool_name ?? "tool") };
      if (event.type === "result" && event.stats) return usage(record(event.stats), ["input_tokens", "output_tokens", "cached"], true);
      break;
    case "opencode":
      if (event.type === "text" && typeof part.text === "string") return { kind: "assistant", text: part.text };
      if (event.type === "tool_use") return { kind: "tool_use", tool: String(part.tool ?? "tool") };
      if (event.type === "step_finish" && part.tokens) {
        const tokens = record(part.tokens);
        return usage({ ...tokens, cacheRead: record(tokens.cache).read }, ["input", "output", "cacheRead"], false);
      }
      break;
  }
  if (event.type === "error" || event.type === "turn.failed") return { kind: "error", text: typeof event.message === "string" ? event.message : typeof record(event.error).message === "string" ? String(record(event.error).message) : "The host reported an execution error." };
  return null;
}

function argsFor(host: Host, opts: EngineRunOptions): string[] {
  const prompt = opts.systemPrompt ? `${opts.systemPrompt}\n\n${opts.prompt}` : opts.prompt;
  const model = opts.model ? ["--model", opts.model] : [];
  switch (host) {
    case "codex": return ["exec", "--json", "--sandbox", "workspace-write", ...model, "--", prompt];
    case "gemini": return ["--output-format", "stream-json", ...model, `--prompt=${prompt}`];
    case "opencode": return ["run", "--format", "json", ...model, "--", prompt];
  }
}

export function createStreamHost(host: Host, probe: CommandProbe = defaultCommandProbe): EngineAdapter {
  return {
    id: host,
    name: names[host],
    authModel: "inherited-cli",
    async detect() {
      const version = probe(host, ["--version"]);
      return version ? { installed: true, version } : { installed: false };
    },
    buildHeadlessCommand(opts) { return { bin: host, args: argsFor(host, opts) }; },
    parseStreamLine: (line) => parse(host, line),
  };
}
