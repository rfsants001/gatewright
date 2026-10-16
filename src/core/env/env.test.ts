import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect, type DetectOptions } from "./detect.js";
import { summarize, type Check, type CheckStatus, type EnvironmentReport } from "./types.js";

function find(report: EnvironmentReport, label: string): Check {
  for (const g of report.groups) {
    const c = g.checks.find((x) => x.label === label);
    if (c) return c;
  }
  throw new Error(`check '${label}' not found`);
}

const okFetch = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
const downFetch: typeof fetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

describe("summarize", () => {
  it("counts checks by status", () => {
    const report: EnvironmentReport = {
      groups: [
        { title: "A", checks: [c("ok"), c("ok"), c("warn")] },
        { title: "B", checks: [c("missing")] },
      ],
    };
    expect(summarize(report)).toEqual({ ok: 2, warn: 1, missing: 1 });
  });
  const c = (status: CheckStatus): Check => ({ label: "x", status });
});

describe("detect", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-env-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const base = (over: Partial<DetectOptions> = {}): DetectOptions => ({
    home: join(dir, "home"),
    cwd: join(dir, "cwd"),
    fetchImpl: downFetch,
    commandProbe: () => null, // no git/codex
    skillsDir: join(dir, "skills"),
    jevConfigPath: join(dir, "jev.config.json"),
    ...over,
  });

  it("reports missing host/ai/jev/skills on a bare environment", async () => {
    const report = await detect(base());
    expect(find(report, "Claude Code").status).toBe("missing");
    expect(find(report, "hooks wired").status).toBe("missing");
    expect(find(report, "MCP server").status).toBe("missing");
    expect(find(report, "Ollama").status).toBe("missing");
    expect(find(report, "Jev").status).toBe("missing");
    expect(find(report, "Skills").status).toBe("missing");
    expect(find(report, "Codex CLI").status).toBe("warn"); // optional
  });

  it("detects wired Claude Code hooks and registered MCP", async () => {
    const claudeDir = join(dir, "home", ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const hook = { hooks: [{ command: "gate hook" }] };
    writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [hook], PostToolUse: [hook], Stop: [hook], SubagentStop: [hook] } }));
    mkdirSync(join(dir, "cwd"), { recursive: true });
    writeFileSync(join(dir, "cwd", ".mcp.json"), JSON.stringify({ mcpServers: { gatewright: { command: "gate", args: ["serve"] } } }));

    const report = await detect(base());
    expect(find(report, "Claude Code").status).toBe("ok");
    expect(find(report, "hooks wired").status).toBe("ok");
    expect(find(report, "MCP server").status).toBe("ok");
  });

  it("warns on partially-wired hooks", async () => {
    const claudeDir = join(dir, "home", ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: "gate hook" }] }] } }));
    expect(find(await detect(base()), "hooks wired").status).toBe("warn");
  });

  it("detects Ollama models over a mocked fetch", async () => {
    const report = await detect(base({ fetchImpl: okFetch({ models: [{ name: "qwen2.5" }, { name: "llama3.2" }] }) }));
    const ollama = find(report, "Ollama");
    expect(ollama.status).toBe("ok");
    expect(ollama.detail).toContain("qwen2.5");
  });

  it("reflects Jev enabled vs disabled", async () => {
    writeFileSync(join(dir, "jev.config.json"), JSON.stringify({ enabled: true, model: "qwen2.5", endpoint: "http://localhost:11434" }));
    expect(find(await detect(base()), "Jev").status).toBe("ok");
    writeFileSync(join(dir, "jev.config.json"), JSON.stringify({ enabled: false }));
    expect(find(await detect(base()), "Jev").status).toBe("warn");
  });

  it("counts skills in the catalog dir", async () => {
    const skills = join(dir, "skills", "deploy");
    mkdirSync(skills, { recursive: true });
    writeFileSync(join(skills, "SKILL.md"), "---\nname: deploy\ndescription: x\n---\n");
    const skillsCheck = find(await detect(base()), "Skills");
    expect(skillsCheck.status).toBe("ok");
    expect(skillsCheck.detail).toContain("(1)");
  });

  it("a throwing fetch never breaks detection", async () => {
    await expect(detect(base({ fetchImpl: downFetch }))).resolves.toBeDefined();
  });
});
