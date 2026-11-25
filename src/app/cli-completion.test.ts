import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { completeViaCli, isCliCompletionId, type CliRunner } from "./cli-completion.js";

const signal = new AbortController().signal;

describe("isCliCompletionId", () => {
  it("accepts claude-code and codex, rejects others", () => {
    expect(isCliCompletionId("claude-code")).toBe(true);
    expect(isCliCompletionId("codex")).toBe(true);
    expect(isCliCompletionId("gemini")).toBe(false);
    expect(isCliCompletionId("ollama")).toBe(false);
  });
});

describe("completeViaCli — claude-code", () => {
  it("runs `claude -p … --output-format json` and maps result + usage", async () => {
    let seen: string[] = [];
    const run: CliRunner = async (bin, args) => {
      seen = [bin, ...args];
      return JSON.stringify({
        type: "result", subtype: "success", is_error: false, result: '{"kind":"provider"}',
        usage: { input_tokens: 120, output_tokens: 8, cache_read_input_tokens: 40 },
      });
    };
    const out = await completeViaCli("claude-code", "connect X", signal, "SYS", run);
    expect(out.text).toBe('{"kind":"provider"}');
    expect(out.usage).toMatchObject({ tokensIn: 120, tokensOut: 8, cacheRead: 40, model: "claude-code", cumulative: true });
    expect(seen).toEqual(["claude", "-p", "connect X", "--output-format", "json",
      "--strict-mcp-config", "--disallowedTools", "Bash,WebFetch,WebSearch,Read,Edit,Write,Glob,Grep,Task,NotebookEdit,TodoWrite",
      "--append-system-prompt", "SYS"]);
  });

  it("runs text-only: no MCP and the world-touching built-in tools are disallowed", async () => {
    let seen: string[] = [];
    const run: CliRunner = async (_bin, args) => { seen = args; return JSON.stringify({ subtype: "success", result: "ok" }); };
    await completeViaCli("claude-code", "hi", signal, undefined, run);
    expect(seen).toContain("--strict-mcp-config");
    const denied = seen[seen.indexOf("--disallowedTools") + 1]!;
    for (const tool of ["Bash", "WebFetch", "WebSearch", "Read", "Edit", "Write"]) expect(denied).toContain(tool);
  });

  it("omits --append-system-prompt when no system prompt is given", async () => {
    let seen: string[] = [];
    const run: CliRunner = async (bin, args) => { seen = args; return JSON.stringify({ subtype: "success", result: "ok" }); };
    const out = await completeViaCli("claude-code", "hi", signal, undefined, run);
    expect(out.text).toBe("ok");
    expect(seen).not.toContain("--append-system-prompt");
  });

  it("surfaces the model's error message on is_error", async () => {
    const run: CliRunner = async () => JSON.stringify({ subtype: "error_during_execution", is_error: true, result: "limite atingido" });
    await expect(completeViaCli("claude-code", "x", signal, undefined, run)).rejects.toThrow("limite atingido");
  });

  it("rejects when stdout is not valid JSON", async () => {
    const run: CliRunner = async () => "not json";
    await expect(completeViaCli("claude-code", "x", signal, undefined, run)).rejects.toThrow("JSON válido");
  });
});

describe("completeViaCli — codex", () => {
  it("runs read-only exec, folds the system prompt in, and reads -o output", async () => {
    let seen: string[] = [];
    const run: CliRunner = async (_bin, args) => {
      seen = args;
      const outFile = args[args.indexOf("-o") + 1]!;
      writeFileSync(outFile, '{"kind":"mcp"}\n');
      return "";
    };
    const out = await completeViaCli("codex", "connect X", signal, "SYS", run);
    expect(out.text).toBe('{"kind":"mcp"}');
    expect(seen.slice(0, 4)).toEqual(["exec", "--sandbox", "read-only", "--skip-git-repo-check"]);
    expect(seen.at(-1)).toBe("SYS\n\nconnect X"); // system prompt folded into the instruction
  });

  it("rejects when the output file is empty", async () => {
    const run: CliRunner = async (_bin, args) => { writeFileSync(args[args.indexOf("-o") + 1]!, "  \n"); return ""; };
    await expect(completeViaCli("codex", "x", signal, undefined, run)).rejects.toThrow("Codex não retornou");
  });
});
