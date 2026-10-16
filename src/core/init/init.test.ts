import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan, planHooks, planJev, planMcp } from "./config-writers.js";
import { scaffoldProject } from "./scaffold.js";

describe("config writers — plan", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-init-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("planHooks creates settings and wires all four events", () => {
    const plan = planHooks(join(dir, ".claude", "settings.json"));
    expect(plan.action).toBe("create");
    const next = JSON.parse(plan.nextContent) as { hooks: Record<string, unknown> };
    expect(Object.keys(next.hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "Stop", "SubagentStop"]);
  });

  it("planHooks merges without clobbering unrelated keys and is noop when wired", () => {
    const path = join(dir, "settings.json");
    const hook = { hooks: [{ type: "command", command: "gate hook" }] };
    writeFileSync(path, JSON.stringify({ theme: "dark", hooks: { PreToolUse: [hook], PostToolUse: [hook], Stop: [hook], SubagentStop: [hook] } }));
    expect(planHooks(path).action).toBe("noop");

    // partial → merge, keeps 'theme'
    writeFileSync(path, JSON.stringify({ theme: "dark", hooks: { PreToolUse: [hook] } }));
    const plan = planHooks(path);
    expect(plan.action).toBe("merge");
    expect((JSON.parse(plan.nextContent) as { theme: string }).theme).toBe("dark");
  });

  it("refuses to clobber an unparseable file (noop)", () => {
    const path = join(dir, "broken.json");
    writeFileSync(path, "{ not json");
    expect(planHooks(path).action).toBe("noop");
  });

  it("planMcp registers the gatewright server; noop when present", () => {
    const path = join(dir, ".mcp.json");
    const plan = planMcp(path);
    expect(plan.action).toBe("create");
    writeFileSync(path, plan.nextContent);
    expect(planMcp(path).action).toBe("noop");
  });

  it("planJev merges settings and budget", () => {
    const path = join(dir, "jev.config.json");
    writeFileSync(path, JSON.stringify({ budget: { "completion-gate": 5 } }));
    const plan = planJev(path, { enabled: true, endpoint: "http://localhost:11434", model: "qwen2.5", budget: { "proportion-gate": 10 } });
    const next = JSON.parse(plan.nextContent) as { enabled: boolean; budget: Record<string, number> };
    expect(next.enabled).toBe(true);
    expect(next.budget).toEqual({ "completion-gate": 5, "proportion-gate": 10 });
  });
});

describe("applyPlan", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-apply-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes new content and backs up an existing file", () => {
    const path = join(dir, ".mcp.json");
    writeFileSync(path, JSON.stringify({ mcpServers: {} }));
    const plan = planMcp(path);
    const res = applyPlan(plan, { backup: true });
    expect(res.written).toBe(true);
    expect(res.backupPath).toBe(`${path}.bak`);
    expect(existsSync(`${path}.bak`)).toBe(true);
    expect((JSON.parse(readFileSync(path, "utf8")) as { mcpServers: Record<string, unknown> }).mcpServers["gatewright"]).toBeDefined();
  });

  it("noop plans write nothing", () => {
    const path = join(dir, "x.json");
    expect(applyPlan({ path, action: "noop", summary: "", preview: [], nextContent: "" })).toEqual({ written: false });
    expect(existsSync(path)).toBe(false);
  });
});

describe("scaffoldProject", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-scaf-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates missing dirs once and is idempotent", () => {
    const first = scaffoldProject(dir);
    expect(first.created.sort()).toEqual([".gatewright", ".specs"]);
    expect(existsSync(join(dir, ".specs"))).toBe(true);
    const second = scaffoldProject(dir);
    expect(second.created).toEqual([]);
    expect(second.existing.sort()).toEqual([".gatewright", ".specs"]);
  });
});
