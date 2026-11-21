import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { changeRevision } from "../../app/customize.js";
import { applyIntegration } from "./configure.js";
import { inspectOperation, recoverOperation } from "./recovery.js";
import { operationSnapshot, startOperation } from "./operations.js";
import type { ProvisionStep } from "../provision/types.js";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "install-recovery-"));
  roots.push(cwd);
  return cwd;
}

describe("owned integration recovery", () => {
  it("records command progress, resource ownership and registration, then reconciles without reinstalling", async () => {
    const cwd = fixture(),
      target = join(cwd, ".gatewright", "integrations", "docs");
    const npm = join(cwd, "npm-cli.js");
    writeFileSync(npm, "");
    vi.stubEnv("npm_execpath", npm);
    const change = {
      kind: "npm-mcp",
      name: "docs",
      package: "example-server@1.2.3",
      bin: "example-server",
    } as const;
    const executor = vi.fn(async (_step: ProvisionStep) => {
      const packagePath = join(target, "node_modules", "example-server");
      mkdirSync(packagePath, { recursive: true });
      writeFileSync(
        join(packagePath, "package.json"),
        JSON.stringify({ name: "example-server", version: "1.2.3", bin: "index.mjs" }),
      );
      writeFileSync(join(packagePath, "index.mjs"), "");
      return { ok: true, output: "" };
    });
    const progress = vi.fn();
    const result = await applyIntegration({
      cwd,
      change,
      revision: changeRevision(cwd, change),
      executor,
      progress,
    });
    expect(result.operationId).toBeTruthy();
    expect(progress.mock.calls.some(([event]) => event.step.status === "running")).toBe(true);
    expect(
      operationSnapshot(cwd, result.operationId!)?.steps.find((step) => step.id === "resource")?.evidence,
    ).toMatchObject({ path: target, owner: result.operationId });
    const inspection = await inspectOperation(cwd, result.operationId!);
    expect(inspection.resource).toMatchObject({ owned: true, registered: true, verified: true });
    await recoverOperation(cwd, result.operationId!, "reconcile", inspection.revision);
    expect(executor).toHaveBeenCalledTimes(1);
    const after = await inspectOperation(cwd, result.operationId!);
    await recoverOperation(cwd, result.operationId!, "cleanup", after.revision);
    expect(existsSync(target)).toBe(false);
    expect(new ConfigStore(new FileArtifactStore()).read("project", cwd).modules).toEqual([]);
  });
  it("reconstructs an interrupted directory, rejects stale decisions and removes only its owned resource", async () => {
    const cwd = fixture(),
      operationId = "interrupted",
      target = join(cwd, ".gatewright", "integrations", "repo");
    const recipe = {
      kind: "git-project",
      name: "repo",
      url: "https://example.com/repo.git",
      commit: "a".repeat(40),
    };
    startOperation(cwd, {
      id: operationId,
      revision: "revision",
      recipeKind: "git-project",
      recipe,
      steps: [],
    });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, ".gatewright-owner.json"), JSON.stringify({ cwd, name: "repo", operationId }));
    const executor = vi.fn(async () => ({ ok: false, output: "Not checked out" }));
    const inspection = await inspectOperation(cwd, operationId, executor);
    expect(inspection.canCleanup).toBe(true);
    expect(inspection.resource.verified).toBe(false);
    new ConfigStore(new FileArtifactStore()).write("project", { linkedProjects: ["somewhere-new"] }, cwd);
    await expect(
      recoverOperation(cwd, operationId, "cleanup", inspection.revision, executor),
    ).rejects.toThrow(/mudou/);
    expect(existsSync(target)).toBe(true);
    const fresh = await inspectOperation(cwd, operationId, executor);
    await recoverOperation(cwd, operationId, "cleanup", fresh.revision, executor);
    expect(existsSync(target)).toBe(false);
  });
  it("refuses foreign ownership and active installers", async () => {
    const cwd = fixture(),
      operationId = "foreign",
      target = join(cwd, ".gatewright", "integrations", "repo");
    startOperation(cwd, {
      id: operationId,
      revision: "revision",
      recipeKind: "git-project",
      recipe: {
        kind: "git-project",
        name: "repo",
        url: "https://example.com/repo.git",
        commit: "b".repeat(40),
      },
      steps: [],
    });
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, ".gatewright-owner.json"),
      JSON.stringify({ cwd, name: "repo", operationId: "someone-else" }),
    );
    const inspection = await inspectOperation(cwd, operationId);
    expect(inspection.canCleanup).toBe(false);
    await expect(recoverOperation(cwd, operationId, "cleanup", inspection.revision)).rejects.toThrow(
      /pertence/,
    );
    const lock = join(cwd, ".gatewright", "integration-apply.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, operationId }));
    await expect(recoverOperation(cwd, operationId, "reconcile", inspection.revision)).rejects.toThrow(
      /ainda está ativo/,
    );
    expect(existsSync(target)).toBe(true);
  });
});
