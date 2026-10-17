// ConfigHistory — append-only log of configuration revisions at
// ~/.gatewright/history.json, plus an orchestrator that applies write plans while
// capturing before/after so each change can be reverted later.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { applyPlan, type WritePlan } from "../init/config-writers.js";
import type { FileChange, Revision, RevisionKind } from "./types.js";

interface HistoryFile {
  version: number;
  revisions: Revision[];
}

/** Default path of the global history. Overridable via GATEWRIGHT_HISTORY. */
export function historyPath(): string {
  return process.env.GATEWRIGHT_HISTORY ?? join(homedir(), ".gatewright", "history.json");
}

export class ConfigHistory {
  readonly #path: string;

  constructor(path: string = historyPath()) {
    this.#path = path;
  }

  #read(): HistoryFile {
    if (!existsSync(this.#path)) return { version: 1, revisions: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.#path, "utf8")) as Partial<HistoryFile>;
      return { version: 1, revisions: parsed.revisions ?? [] };
    } catch {
      return { version: 1, revisions: [] };
    }
  }

  record(revision: Revision): Revision {
    const file = this.#read();
    file.revisions.push(revision);
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(this.#path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    return revision;
  }

  /** All revisions, newest first. */
  list(): Revision[] {
    return [...this.#read().revisions].reverse();
  }

  get(id: string): Revision | undefined {
    return this.#read().revisions.find((r) => r.id === id);
  }

  /** Most recent revision matching an optional predicate (newest first). */
  latest(predicate: (r: Revision) => boolean = () => true): Revision | undefined {
    return this.list().find(predicate);
  }
}

export interface ApplyHistoryOptions {
  history: ConfigHistory;
  project?: string;
  kind?: RevisionKind;
  backup?: boolean;
  now?: () => string;
  makeId?: () => string;
}

/** A fresh short revision id. */
export function newRevisionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const defaultId = newRevisionId;

/**
 * Apply non-noop plans, capturing before/after into one recorded revision.
 * Returns the revision, or null when nothing changed.
 */
export function applyWithHistory(plans: WritePlan[], opts: ApplyHistoryOptions): Revision | null {
  const now = opts.now ?? (() => new Date().toISOString());
  const files: FileChange[] = [];
  const summaries: string[] = [];

  for (const plan of plans) {
    if (plan.action === "noop") continue;
    const before = existsSync(plan.path) ? readFileSync(plan.path, "utf8") : null;
    applyPlan(plan, { backup: opts.backup ?? true });
    files.push({ path: plan.path, action: plan.action, before, after: plan.nextContent });
    summaries.push(plan.summary);
  }

  if (files.length === 0) return null;

  const revision: Revision = {
    id: (opts.makeId ?? defaultId)(),
    at: now(),
    kind: opts.kind ?? "configure",
    summary: summaries.join("; "),
    ...(opts.project !== undefined ? { project: opts.project } : {}),
    files,
  };
  return opts.history.record(revision);
}
