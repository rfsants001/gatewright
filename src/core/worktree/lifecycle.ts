// Worktree lifecycle — create/remove a git worktree via `git worktree`, keeping the
// registry in sync. Idempotent: creating an existing worktree is a safe no-op;
// removing an absent one does not throw. Outside a git repo → typed NOT_A_REPO.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { WorktreeRegistry } from "./registry.js";
import { WorktreeError, type WorktreeRecord } from "./types.js";

function git(repoRoot: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (cause) {
    throw new WorktreeError("GIT_FAILED", `git ${args.join(" ")} failed`, { cause });
  }
}

function assertRepo(repoRoot: string): void {
  try {
    execFileSync("git", ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  } catch (cause) {
    throw new WorktreeError("NOT_A_REPO", `${repoRoot} is not inside a git work tree`, { cause });
  }
}

export interface CreateWorktreeInput {
  runSlug: string;
  repoRoot: string;
  path: string;
  branch: string;
}

/** Create a git worktree for a run and record it. No-op if already registered. */
export function createWorktree(registry: WorktreeRegistry, input: CreateWorktreeInput): WorktreeRecord {
  const existing = registry.get(input.runSlug);
  if (existing && existsSync(existing.path)) return existing;

  assertRepo(input.repoRoot);
  git(input.repoRoot, ["worktree", "add", "-b", input.branch, input.path]);
  const record: WorktreeRecord = { runSlug: input.runSlug, path: input.path, branch: input.branch };
  registry.register(record);
  return record;
}

/** Remove a run's git worktree and its registry entry. Absent run → no-op. */
export function removeWorktree(registry: WorktreeRegistry, repoRoot: string, runSlug: string): void {
  const record = registry.get(runSlug);
  if (!record) return;
  if (existsSync(record.path)) {
    assertRepo(repoRoot);
    git(repoRoot, ["worktree", "remove", "--force", record.path]);
  }
  registry.remove(runSlug);
}
