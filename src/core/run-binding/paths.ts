// Run-binding paths and identity helpers.

import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const SAFE_SLUG = /^[A-Za-z0-9._-]+$/;

/** A run slug must be a single safe path segment (no separators, no traversal, non-empty). */
export function isSafeSlug(slug: string): boolean {
  return slug !== "." && slug !== ".." && SAFE_SLUG.test(slug);
}

/**
 * Stable, filesystem-safe id for a workspace, derived from its PHYSICAL path
 * (realpath), so a symlink and its target resolve to the same identity across processes.
 */
export function workspaceHash(workspace: string): string {
  let physical: string;
  try {
    physical = realpathSync(workspace);
  } catch {
    physical = resolve(workspace); // path may not exist yet — fall back to resolved absolute
  }
  return createHash("sha1").update(physical).digest("hex").slice(0, 16);
}

/** Root dir for session state. Overridable via GATEWRIGHT_SESSIONS_DIR (keeps tests isolated). */
export function sessionsDir(): string {
  return process.env.GATEWRIGHT_SESSIONS_DIR ?? join(homedir(), ".gatewright", "sessions");
}

/** Path of the run-bindings registry file. */
export function runBindingsPath(): string {
  return join(sessionsDir(), "run-bindings.json");
}
