import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeOverview } from "./claude-code.js";

describe("claudeCodeOverview", () => {
  let dir: string;
  let home: string;
  let cwd: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-cc-"));
    home = join(dir, "home");
    cwd = join(dir, "proj");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const skill = (base: string, name: string) => {
    mkdirSync(join(base, name), { recursive: true });
    writeFileSync(join(base, name, "SKILL.md"), "---\nname: x\ndescription: y\n---\n");
  };

  it("reports not-installed on a bare machine", () => {
    const o = claudeCodeOverview({ home, cwd });
    expect(o.installed).toBe(false);
    expect(o.mcps).toEqual([]);
    expect(o.skills).toEqual([]);
    expect(o.plugins).toEqual([]);
  });

  it("detects installed + MCPs + user/project/plugin skills + plugins", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { gatewright: { command: "gate", args: ["serve"] } } }));
    skill(join(home, ".claude", "skills"), "summarize");
    skill(join(cwd, ".claude", "skills"), "deploy");
    skill(join(home, ".claude", "plugins", "pack", "skills"), "fromplugin");

    const o = claudeCodeOverview({ home, cwd });
    expect(o.installed).toBe(true);
    expect(o.configDir).toBe(join(home, ".claude"));
    expect(o.mcps.map((m) => m.name)).toEqual(["gatewright"]);
    expect(o.skills).toContainEqual({ name: "summarize", source: "user" });
    expect(o.skills).toContainEqual({ name: "deploy", source: "project" });
    expect(o.skills).toContainEqual({ name: "fromplugin", source: "plugin" });
    expect(o.plugins.map((p) => p.name)).toContain("pack");
  });

  it("treats a present `claude` binary as installed even without ~/.claude", () => {
    const o = claudeCodeOverview({ home, cwd, commandProbe: (bin) => (bin === "claude" ? "1.0.0" : null) });
    expect(o.installed).toBe(true);
    expect(o.configDir).toBeNull();
  });
});
