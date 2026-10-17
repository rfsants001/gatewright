import { describe, expect, it } from "vitest";
import { createClaudeCodeAdapter } from "./claude-code.js";

const adapter = (over = {}) => createClaudeCodeAdapter(over);

describe("claude-code adapter — buildHeadlessCommand", () => {
  const base = { prompt: "do the thing", cwd: "/tmp/p", mcpConfigPath: "/tmp/p/.gatewright/gate.mcp.json" };

  it("forces stream-json + the gate-only MCP", () => {
    const { bin, args } = adapter().buildHeadlessCommand(base);
    expect(bin).toBe("claude");
    expect(args).toEqual([
      "-p", "do the thing",
      "--output-format", "stream-json", "--verbose",
      "--mcp-config", "/tmp/p/.gatewright/gate.mcp.json", "--strict-mcp-config",
    ]);
  });

  it("appends optional flags when provided", () => {
    const { args } = adapter().buildHeadlessCommand({
      ...base,
      systemPrompt: "gate skills",
      permissionMode: "acceptEdits",
      allowedTools: ["Read", "Edit"],
      model: "sonnet",
      contextDirs: ["/tmp/ctx"],
    });
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("gate skills");
    expect(args.slice(args.indexOf("--allowedTools"))).toEqual(["--allowedTools", "Read", "Edit", "--model", "sonnet", "--add-dir", "/tmp/ctx"]);
  });
});

describe("claude-code adapter — parseStreamLine", () => {
  const a = adapter();
  it("maps assistant text", () => {
    const ev = a.parseStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));
    expect(ev).toMatchObject({ kind: "assistant", text: "hi" });
  });
  it("maps tool_use with the tool name", () => {
    const ev = a.parseStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }));
    expect(ev).toMatchObject({ kind: "tool_use", tool: "Bash" });
  });
  it("maps result and system", () => {
    expect(a.parseStreamLine(JSON.stringify({ type: "result", result: "done" }))).toMatchObject({ kind: "result", text: "done" });
    expect(a.parseStreamLine(JSON.stringify({ type: "system", subtype: "init" }))).toMatchObject({ kind: "system", text: "init" });
  });
  it("falls back to raw for non-JSON and empty for blank", () => {
    expect(a.parseStreamLine("not json")).toMatchObject({ kind: "raw", text: "not json" });
    expect(a.parseStreamLine("   ")).toBeNull();
  });
});

describe("claude-code adapter — detect", () => {
  it("reports not installed when the probe finds no binary", async () => {
    const av = await adapter({ commandProbe: () => null }).detect();
    expect(av.installed).toBe(false);
  });
  it("reports installed + loggedIn when a credential file exists", async () => {
    const av = await adapter({ commandProbe: () => "1.2.3", home: "/home/x", fileExists: (p: string) => p.endsWith(".credentials.json") }).detect();
    expect(av).toMatchObject({ installed: true, version: "1.2.3", loggedIn: true });
  });
  it("reports logged-out with guidance when installed but no credential", async () => {
    const av = await adapter({ commandProbe: () => "1.2.3", home: "/home/x", fileExists: () => false }).detect();
    expect(av.installed).toBe(true);
    expect(av.loggedIn).toBe(false);
    expect(av.detail).toMatch(/run `claude` once/);
  });
});
