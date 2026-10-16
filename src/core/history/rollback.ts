// Rollback — restore the files of a past revision to their `before` state. The
// rollback is itself recorded as a revision (kind "rollback"), so it is auditable
// and can be rolled back in turn.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ConfigHistory } from "./config-history.js";
import type { FileChange, Revision } from "./types.js";

export interface RollbackResult {
  ok: boolean;
  /** The revision that was reverted. */
  reverted?: Revision;
  /** The new revision recording the rollback. */
  recorded?: Revision;
  reason?: string;
}

export interface RollbackOptions {
  /** Revision id to revert; omitted → the latest non-rollback revision. */
  id?: string;
  now?: () => string;
  makeId?: () => string;
}

const defaultId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Build the current → before inverse for one file change and apply it to disk. */
function restore(change: FileChange): FileChange {
  const current = existsSync(change.path) ? readFileSync(change.path, "utf8") : null;
  if (change.before === null) {
    if (existsSync(change.path)) rmSync(change.path);
    return { path: change.path, action: "delete", before: current, after: null };
  }
  mkdirSync(dirname(change.path), { recursive: true });
  writeFileSync(change.path, change.before, "utf8");
  return { path: change.path, action: "overwrite", before: current, after: change.before };
}

export function rollbackRevision(history: ConfigHistory, opts: RollbackOptions = {}): RollbackResult {
  const target = opts.id ? history.get(opts.id) : history.latest((r) => r.kind !== "rollback");
  if (!target) return { ok: false, reason: opts.id ? `revision '${opts.id}' not found` : "no revision to roll back" };

  const now = opts.now ?? (() => new Date().toISOString());
  const files = target.files.map(restore);

  const recorded = history.record({
    id: (opts.makeId ?? defaultId)(),
    at: now(),
    kind: "rollback",
    summary: `rollback of ${target.id} (${target.summary})`,
    ...(target.project !== undefined ? { project: target.project } : {}),
    reverts: target.id,
    files,
  });
  return { ok: true, reverted: target, recorded };
}
