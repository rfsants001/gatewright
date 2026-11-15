// Flow-journal — append-only input log per cwd.
// Persisted at .gatewright/flow-state.json (not inside a run slug) so a single
// flow can span multiple runs. Entry types mirror the design's "Flow-journal"
// table; the envelope shape (type/payload/at) matches the run-journal / Journal
// conventions exactly.

import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import type { ArtifactStore } from "../artifact-store/types.js";
import { Journal } from "../journal/journal.js";
import type { JournalEvent } from "../journal/event.js";
import type { Answers } from "./questions.js";

// ── Entry type constants ──────────────────────────────────────────────────────

export const FLOW_START_TYPE = "FLOW_START" as const;
export const FLOW_RUN_TYPE = "FLOW_RUN" as const;
export const FLOW_ANSWERS_TYPE = "FLOW_ANSWERS" as const;
export const FLOW_TERMINAL_TYPE = "FLOW_TERMINAL" as const;

// ── Payload shapes ────────────────────────────────────────────────────────────

export interface FlowStartPayload {
  goal: string;
  flowKind: string;
  engineId: string;
  model?: string;
}

export interface FlowRunPayload {
  stepId: string;
  output: string;
  /** Present when the run opened a revision (gate-ask). */
  runId?: string;
  revision?: string;
}

export interface FlowAnswersPayload {
  stepId: string;
  answers: Answers;
}

export interface FlowTerminalPayload {
  reason: "done" | "aborted" | "stopped" | "version-mismatch";
}

// ── Discriminated union of typed flow entries ─────────────────────────────────

export type FlowStartEntry = JournalEvent & { type: typeof FLOW_START_TYPE; payload: FlowStartPayload };
export type FlowRunEntry = JournalEvent & { type: typeof FLOW_RUN_TYPE; payload: FlowRunPayload };
export type FlowAnswersEntry = JournalEvent & { type: typeof FLOW_ANSWERS_TYPE; payload: FlowAnswersPayload };
export type FlowTerminalEntry = JournalEvent & { type: typeof FLOW_TERMINAL_TYPE; payload: FlowTerminalPayload };

export type FlowEntry = FlowStartEntry | FlowRunEntry | FlowAnswersEntry | FlowTerminalEntry;

// ── Path helpers ──────────────────────────────────────────────────────────────

export function flowStatePath(cwd: string): string {
  return join(cwd, ".gatewright", "flow-state.json");
}

// ── Open ──────────────────────────────────────────────────────────────────────

/** Open (or lazily create on first append) the flow journal for a cwd. */
export function openFlowJournal(cwd: string, store: ArtifactStore = new FileArtifactStore()): Journal {
  return new Journal(store, flowStatePath(cwd));
}

// ── Append helpers ────────────────────────────────────────────────────────────

export function appendStart(
  journal: Journal,
  payload: FlowStartPayload,
  at: string = new Date().toISOString(),
): void {
  journal.append({ type: FLOW_START_TYPE, payload, at });
}

export function appendRun(
  journal: Journal,
  payload: FlowRunPayload,
  at: string = new Date().toISOString(),
): void {
  // exactOptionalPropertyTypes: build payload without undefined optional fields
  const p: FlowRunPayload = {
    stepId: payload.stepId,
    output: payload.output,
    ...(payload.runId !== undefined ? { runId: payload.runId } : {}),
    ...(payload.revision !== undefined ? { revision: payload.revision } : {}),
  };
  journal.append({ type: FLOW_RUN_TYPE, payload: p, at });
}

export function appendAnswers(
  journal: Journal,
  payload: FlowAnswersPayload,
  at: string = new Date().toISOString(),
): void {
  journal.append({ type: FLOW_ANSWERS_TYPE, payload, at });
}

export function appendTerminal(
  journal: Journal,
  reason: FlowTerminalPayload["reason"],
  at: string = new Date().toISOString(),
): void {
  journal.append({ type: FLOW_TERMINAL_TYPE, payload: { reason }, at });
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/** All flow entries in insertion order. Returns [] when the journal is absent or empty. */
export function readEntries(journal: Journal): FlowEntry[] {
  return journal.read() as FlowEntry[];
}

/** Last flow entry, or null when the journal is absent or empty. */
export function readLastEntry(journal: Journal): FlowEntry | null {
  return (journal.read().at(-1) as FlowEntry | undefined) ?? null;
}
