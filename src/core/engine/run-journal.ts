// Per-run journal. Every run gets its own append-only, hash-chained log under
// .gatewright/runs/<slug>/journal.json — so each engine event (the logs) and
// each control transition are auditable and replayable (reuses F0/F6).

import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import type { ArtifactStore } from "../artifact-store/types.js";
import { Journal } from "../journal/journal.js";
import type { EngineEvent } from "./types.js";

/** Journal event type carrying one normalized engine stream event (a log line). */
export const ENGINE_EVENT_TYPE = "ENGINE_EVENT";

/** Make a slug a single safe path segment (no separators/traversal, bounded length). */
export function sanitizeSlug(slug: string): string {
  const safe = slug.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "");
  return (safe.length ? safe : "run").slice(0, 64);
}

export function runDir(cwd: string, slug: string): string {
  return join(cwd, ".gatewright", "runs", sanitizeSlug(slug));
}

export function runJournalPath(cwd: string, slug: string): string {
  return join(runDir(cwd, slug), "journal.json");
}

export interface RunJournal {
  journal: Journal;
  dir: string;
  path: string;
}

/** Open (or lazily create on first append) the journal for one run. */
export function openRunJournal(cwd: string, slug: string, store: ArtifactStore = new FileArtifactStore()): RunJournal {
  const path = runJournalPath(cwd, slug);
  return { journal: new Journal(store, path), dir: runDir(cwd, slug), path };
}

/** Append one engine stream event (a log line) to a run journal. */
export function appendEngineEvent(journal: Journal, event: EngineEvent, at: string = new Date().toISOString()): void {
  journal.append({ type: ENGINE_EVENT_TYPE, payload: event, at });
}
