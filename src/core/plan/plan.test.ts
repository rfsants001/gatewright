import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import type { Plan } from "./plan.js";
import { evaluatePlanScope, isPathInScope, matchGlob } from "./plan.js";
import { activePlan, approvePlan, proposePlan } from "./plan-store.js";
import { planGate } from "./plan-gate.js";

const plan: Plan = { revision: "r1", nodes: { n1: { allowedPaths: ["src/**"] } } };

describe("glob + scope", () => {
  it("matches globs and dir prefixes", () => {
    expect(matchGlob("src/**", "src/a/b.ts")).toBe(true);
    expect(matchGlob("src/**", "lib/x.ts")).toBe(false);
    expect(matchGlob("src", "src/a.ts")).toBe(true);
    expect(matchGlob("*.md", "README.md")).toBe(true);
  });

  it("isPathInScope respects the node's allowed paths", () => {
    expect(isPathInScope(plan, "n1", "src/x.ts")).toBe(true);
    expect(isPathInScope(plan, "n1", "lib/x.ts")).toBe(false);
    expect(isPathInScope(plan, "ghost", "src/x.ts")).toBe(false);
  });
});

describe("evaluatePlanScope (in-workspace rule)", () => {
  const scope = (filePath: string) => evaluatePlanScope({ cwd: "/work", filePath, plan, activeNodeId: "n1" }).decision;
  it("allows outside the workspace, denies in-workspace out-of-scope", () => {
    expect(scope("/etc/passwd")).toBe("allow");
    expect(scope("/work/src/x.ts")).toBe("allow");
    expect(scope("/work/lib/x.ts")).toBe("deny");
    expect(scope("README.md")).toBe("deny");
  });
});

describe("plan-store (event-sourced approval)", () => {
  let dir: string;
  const store = new FileArtifactStore();
  const journal = () => new Journal(store, join(dir, "log.json"));
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-plan-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("activates only an approved plan", () => {
    const j = journal();
    proposePlan(j, plan);
    expect(activePlan(j)).toBeNull();
    approvePlan(j, "r1", "rafael");
    expect(activePlan(j)?.revision).toBe("r1");
    expect(j.verify().ok).toBe(true);
  });
});

describe("plan-gate (Gate)", () => {
  const gate = planGate({ getPlan: () => plan, getActiveNodeId: () => "n1" });
  const kind = (event: "pre-edit" | "pre-bash", toolInput: Record<string, unknown>) =>
    gate.check({ event, cwd: "/work", toolInput }).kind;

  it("denies an in-workspace edit outside scope and allows in-scope / outside-workspace", () => {
    expect(kind("pre-edit", { file_path: "/work/lib/x.ts" })).toBe("deny");
    expect(kind("pre-edit", { file_path: "/work/src/x.ts" })).toBe("allow");
    expect(kind("pre-edit", { file_path: "/etc/passwd" })).toBe("allow");
  });

  it("checks bash write targets (redirect / cp)", () => {
    expect(kind("pre-bash", { command: "echo x > lib/out.txt" })).toBe("deny");
    expect(kind("pre-bash", { command: "cp a src/b.ts" })).toBe("allow");
  });

  it("fail-closed only under enforce when no plan is active", () => {
    const noPlan = { getPlan: () => null, getActiveNodeId: () => null };
    expect(planGate(noPlan).check({ event: "pre-edit", cwd: "/work", toolInput: { file_path: "/work/lib/x.ts" } }).kind).toBe("allow");
    expect(planGate({ ...noPlan, enforce: true }).check({ event: "pre-edit", cwd: "/work", toolInput: { file_path: "/work/lib/x.ts" } }).kind).toBe("deny");
  });
});
