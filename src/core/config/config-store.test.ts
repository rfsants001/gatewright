import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore, configPath, mergeConfig } from "./config-store.js";

describe("configPath", () => {
  it("puts the gate config under GATEWRIGHT_HOME and the project config under cwd/.gatewright", () => {
    const prev = process.env.GATEWRIGHT_HOME;
    process.env.GATEWRIGHT_HOME = "/opt/gw";
    try {
      expect(configPath("gate", "/proj")).toBe(join("/opt/gw", "config.json"));
      expect(configPath("project", "/proj")).toBe(join("/proj", ".gatewright", "config.json"));
    } finally {
      if (prev === undefined) delete process.env.GATEWRIGHT_HOME;
      else process.env.GATEWRIGHT_HOME = prev;
    }
  });
});

describe("mergeConfig", () => {
  it("project overrides gate, merges jev key-wise and packages by id", () => {
    const merged = mergeConfig(
      { defaultEngine: "claude-code", jev: { enabled: true, model: "a" }, packages: [{ id: "litellm", installedAt: "t1" }] },
      { jev: { model: "b" }, packages: [{ id: "litellm", installedAt: "t2" }, { id: "graphify", installedAt: "t3" }] },
    );
    expect(merged.defaultEngine).toBe("claude-code");
    expect(merged.jev).toEqual({ enabled: true, model: "b" });
    expect(merged.packages).toEqual([{ id: "litellm", installedAt: "t2" }, { id: "graphify", installedAt: "t3" }]);
  });
});

describe("ConfigStore", () => {
  let gate: string;
  let proj: string;
  beforeEach(() => {
    gate = mkdtempSync(join(tmpdir(), "gw-gate-"));
    proj = mkdtempSync(join(tmpdir(), "gw-proj-"));
    process.env.GATEWRIGHT_HOME = gate;
  });
  afterEach(() => {
    delete process.env.GATEWRIGHT_HOME;
    rmSync(gate, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });
  const store = () => new ConfigStore(new FileArtifactStore());

  it("reads empty when absent and round-trips a write per scope", () => {
    const s = store();
    expect(s.read("gate", proj)).toEqual({});
    s.write("gate", { defaultEngine: "claude-code" }, proj);
    s.write("project", { defaultEngine: "codex" }, proj);
    expect(s.read("gate", proj).defaultEngine).toBe("claude-code");
    expect(s.read("project", proj).defaultEngine).toBe("codex");
  });

  it("resolve() lets the project override the gate", () => {
    const s = store();
    s.write("gate", { defaultEngine: "claude-code", jev: { enabled: true } }, proj);
    s.write("project", { defaultEngine: "codex" }, proj);
    expect(s.resolve(proj)).toEqual({ defaultEngine: "codex", jev: { enabled: true } });
  });

  it("persists verbosity per scope and lets the project override the gate", () => {
    const s = store();
    s.write("gate", { verbosity: "low" }, proj);
    expect(s.read("gate", proj).verbosity).toBe("low");
    expect(s.resolve(proj).verbosity).toBe("low");
    s.write("project", { verbosity: "high" }, proj);
    expect(s.resolve(proj).verbosity).toBe("high");
  });
});
