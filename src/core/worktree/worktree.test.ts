import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { WorktreeRegistry } from "./registry.js";
import { WorktreeError } from "./types.js";
import { shouldUseWorktree } from "./decision.js";
import { createWorktree, removeWorktree } from "./lifecycle.js";

describe("WorktreeRegistry", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-wt-reg-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const reg = () => new WorktreeRegistry(store, join(dir, "worktrees.json"));

  it("round-trips records and removes them", () => {
    const r = reg();
    r.register({ runSlug: "run-1", path: "/tmp/wt1", branch: "gw/run-1" });
    expect(r.get("run-1")?.branch).toBe("gw/run-1");
    r.remove("run-1");
    expect(r.get("run-1")).toBeUndefined();
    r.remove("run-1"); // no-op
  });

  it("rejects unsafe slugs", () => {
    expect(() => reg().register({ runSlug: "../evil", path: "/tmp/x", branch: "b" })).toThrow(WorktreeError);
  });
});

describe("shouldUseWorktree", () => {
  it("only isolates a native bound run under an enabled policy", () => {
    expect(shouldUseWorktree({ nativeBound: true, policyEnabled: true })).toBe(true);
    expect(shouldUseWorktree({ nativeBound: true, policyEnabled: false })).toBe(false);
    expect(shouldUseWorktree({ nativeBound: false, policyEnabled: true })).toBe(false);
  });
});

describe("worktree lifecycle (real git)", () => {
  let repo: string;
  const store = new FileArtifactStore();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "gw-wt-repo-"));
    const g = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    g(["init", "-q"]);
    g(["config", "user.email", "t@t.dev"]);
    g(["config", "user.name", "t"]);
    g(["commit", "--allow-empty", "-m", "root", "-q"]);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));
  const reg = () => new WorktreeRegistry(store, join(repo, ".gw", "worktrees.json"));

  it("creates then removes a worktree, keeping the registry in sync", () => {
    const registry = reg();
    const wtPath = join(repo, "..", `wt-${Date.now()}`);
    const rec = createWorktree(registry, { runSlug: "run-1", repoRoot: repo, path: wtPath, branch: "gw/run-1" });
    expect(existsSync(rec.path)).toBe(true);
    expect(registry.get("run-1")?.path).toBe(wtPath);

    // idempotent create
    expect(createWorktree(registry, { runSlug: "run-1", repoRoot: repo, path: wtPath, branch: "gw/run-1" }).path).toBe(wtPath);

    removeWorktree(registry, repo, "run-1");
    expect(existsSync(wtPath)).toBe(false);
    expect(registry.get("run-1")).toBeUndefined();
  });

  it("raises NOT_A_REPO outside a git work tree", () => {
    const nonRepo = mkdtempSync(join(tmpdir(), "gw-wt-norepo-"));
    try {
      expect(() =>
        createWorktree(reg(), { runSlug: "run-x", repoRoot: nonRepo, path: join(nonRepo, "wt"), branch: "b" }),
      ).toThrow(WorktreeError);
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
