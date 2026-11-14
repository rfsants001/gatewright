import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyTerminal, planRevision, planTerminal, terminalHosts } from "./terminal.js";
import { geminiHookAdapter } from "../host/gemini.js";
import { runHook } from "../host/run-hook.js";

describe("terminal onboarding", () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), "gw-terminal-")); });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it.each(terminalHosts)("configures %s for the explicit project and is idempotent", (host) => {
    const plan = planTerminal(cwd, host);
    applyTerminal(cwd, host, planRevision(plan));
    expect(plan.some((file) => readFileSync(file.path, "utf8").includes(cwd))).toBe(true);
    expect(planTerminal(cwd, host).every((file) => file.action === "noop")).toBe(true);
  });

  it("rejects changes to a configuration since preview", () => {
    const plan = planTerminal(cwd, "gemini");
    const revision = planRevision(plan);
    mkdirSync(join(cwd, ".gemini"));
    writeFileSync(join(cwd, ".gemini", "settings.json"), '{"security":{}}');
    expect(() => applyTerminal(cwd, "gemini", revision)).toThrow();
  });

  it("ships the OpenCode plugin alongside the MCP block", () => {
    const plans = planTerminal(cwd, "opencode");
    const plugin = plans.find((p) => p.path.endsWith(join(".opencode", "plugin", "gatewright.js")));
    const mcp = plans.find((p) => p.path.endsWith("opencode.json"));
    expect(mcp).toBeDefined();
    expect(plugin).toBeDefined();
    expect(plugin!.nextContent).toContain("tool.execute.before");
    expect(plugin!.nextContent).toContain("hook");
    expect(plugin!.nextContent).toContain("opencode");
    applyTerminal(cwd, "opencode", planRevision(plans));
    expect(readFileSync(plugin!.path, "utf8")).toContain("tool.execute.before");
    // idempotent: both files re-plan as noop
    expect(planTerminal(cwd, "opencode").every((p) => p.action === "noop")).toBe(true);
  });

  it("translates a Gemini native read to the existing secret guard", () => {
    const out = runHook(JSON.stringify({
      hook_event_name: "BeforeTool", tool_name: "read_file", cwd, tool_input: { file_path: ".env" },
    }), geminiHookAdapter);
    expect(JSON.parse(out.stdout).decision).toBe("deny");
  });
});
