import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { provision } from "./provisioner.js";
import { ollamaTool, litellmTool, graphifyTool, customTool, CATALOG } from "./catalog.js";
import type { Executor } from "./types.js";

const ok: Executor = async (step) => ({ ok: true, output: `ran ${step.label}` });
const failOn = (label: string): Executor => async (step) => ({ ok: step.label !== label, output: step.label });

describe("provision catalog", () => {
  it("ships Ollama/LiteLLM/graphify; ollama pulls the chosen model", () => {
    expect(CATALOG.map((t) => t.id)).toEqual(["ollama", "litellm", "graphify"]);
    const steps = ollamaTool.buildSteps!({ model: "qwen2.5:7b" });
    expect(steps.at(-1)!.args.join(" ")).toContain("ollama pull qwen2.5:7b");
  });

  it("litellm installs via pip; graphify has no built-in installer", () => {
    expect(litellmTool.buildSteps!({})[0]!.args.join(" ")).toContain("pip install");
    expect(graphifyTool.buildSteps).toBeUndefined();
  });

  it("customTool wraps a pasted command", () => {
    const t = customTool("ripgrep", "cargo install ripgrep", "project");
    expect(t.buildSteps!({})[0]!.args).toEqual(["-c", "cargo install ripgrep"]);
  });
});

describe("provision()", () => {
  let dir: string;
  let gateHome: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-prov-"));
    gateHome = mkdtempSync(join(tmpdir(), "gw-prov-home-"));
    process.env.GATEWRIGHT_HOME = gateHome; // isolate the gate config from the real ~/.gatewright
  });
  afterEach(() => {
    delete process.env.GATEWRIGHT_HOME;
    rmSync(dir, { recursive: true, force: true });
    rmSync(gateHome, { recursive: true, force: true });
  });
  const store = () => new ConfigStore(new FileArtifactStore());

  it("runs steps and records the package at the tool's scope on success", async () => {
    const s = store();
    const res = await provision(ollamaTool, { model: "llama3.2" }, { executor: ok, configStore: s, cwd: dir, now: () => "t1" });
    expect(res.ok).toBe(true);
    expect(res.outcomes).toHaveLength(2);
    expect(s.read("gate", dir).packages).toEqual([{ id: "ollama", installedAt: "t1", via: "gate-provisioner" }]);
  });

  it("records a custom project package at project scope", async () => {
    const s = store();
    await provision(customTool("graphify", "npm i -g graphify", "project"), {}, { executor: ok, configStore: s, cwd: dir, now: () => "t2" });
    expect(s.read("project", dir).packages?.[0]?.id).toBe("graphify");
    expect(s.read("gate", dir).packages).toBeUndefined();
  });

  it("stops on the first failing step and records nothing", async () => {
    const s = store();
    const onStep = vi.fn();
    const res = await provision(ollamaTool, {}, { executor: failOn("Pull llama3.2"), configStore: s, cwd: dir, onStep });
    expect(res.ok).toBe(false);
    expect(onStep).toHaveBeenCalledTimes(2); // install ok, pull fails → stop
    expect(s.read("gate", dir).packages).toBeUndefined();
  });

  it("refuses a tool with no installer", async () => {
    const res = await provision(graphifyTool, {}, { executor: ok, configStore: store(), cwd: dir });
    expect(res.ok).toBe(false);
    expect(res.outcomes[0]!.output).toContain("needs an install command");
  });
});
