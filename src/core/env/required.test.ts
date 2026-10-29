// R0-006 — doctor distinguishes required vs optional. Node/git/Claude Code are required;
// Jev/Ollama/Codex/LM Studio are optional (a warn/missing there is not an error).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect, type DetectOptions } from "./detect.js";
import { requiredProblems, type Check, type EnvironmentReport } from "./types.js";

function find(report: EnvironmentReport, label: string): Check {
  for (const g of report.groups) {
    const c = g.checks.find((x) => x.label === label);
    if (c) return c;
  }
  throw new Error(`check '${label}' not found`);
}

const downFetch: typeof fetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

describe("required vs optional classification", () => {
  let dir: string;
  let opts: DetectOptions;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-req-"));
    // No binaries, no network, no .claude settings, no jev config → everything degrades.
    opts = {
      home: dir,
      cwd: dir,
      commandProbe: () => null,
      fetchImpl: downFetch,
      skillsDir: join(dir, "skills"),
      jevConfigPath: join(dir, "jev.config.json"),
    };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("marks Node, git and Claude Code as required", async () => {
    const report = await detect(opts);
    expect(find(report, "Node").required).toBe(true);
    expect(find(report, "git").required).toBe(true);
    expect(find(report, "Claude Code").required).toBe(true);
  });

  it("leaves Jev, Ollama, Codex and LM Studio optional", async () => {
    const report = await detect(opts);
    expect(find(report, "Jev").required).toBeFalsy();
    expect(find(report, "Ollama").required).toBeFalsy();
    expect(find(report, "Codex CLI").required).toBeFalsy();
    expect(find(report, "LM Studio").required).toBeFalsy();
  });

  it("requiredProblems reports only required non-ok checks, never optional ones", async () => {
    const report = await detect(opts);
    const labels = requiredProblems(report).map((c) => c.label);
    // git (no binary) and Claude Code (no settings) are required and not ok → blockers.
    expect(labels).toContain("git");
    expect(labels).toContain("Claude Code");
    // Offline Ollama / unconfigured Jev are optional → never blockers.
    expect(labels).not.toContain("Ollama");
    expect(labels).not.toContain("Jev");
  });
});
