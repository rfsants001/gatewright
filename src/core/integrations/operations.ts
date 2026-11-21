// IntegrationOperation domain — append-only operation journal.
//
// Each operation is journaled at <cwd>/.gatewright/operations/<id>.json via
// Journal + FileArtifactStore. Three event types:
//   OP_START  — declares the operation and its planned steps (all initially pending).
//   OP_STEP   — records a step status transition with monotonically increasing seq.
//   OP_DONE   — seals the operation's terminal status.
//
// EVIDENCE CONTRACT: callers must persist evidence for a step BEFORE retrying it.
// This domain only records; it does not enforce idempotency or retry logic.
// A step left in "running" (e.g. after a crash) is surfaced by reconcileNeeded()
// so the caller can verify external resources before deciding to retry or mark unknown.

import { join } from "node:path";
import { readdirSync } from "node:fs";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import type { ArtifactStore } from "../artifact-store/types.js";
import { Journal } from "../journal/journal.js";
import type { JournalEvent } from "../journal/event.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped" | "unknown";

export interface OperationStep {
  id: string;
  label: string;
  status: StepStatus;
  errorCode?: string;
  evidence?: Record<string, string>;
}

export interface IntegrationOperation {
  id: string;
  cwd: string;
  revision: string;
  recipeKind: string;
  status: "pending" | "running" | "succeeded" | "failed" | "partial";
  steps: OperationStep[];
  startedAt: string;
  updatedAt: string;
}

// ── Event type constants ──────────────────────────────────────────────────────

export const OP_START_TYPE = "OP_START" as const;
export const OP_STEP_TYPE = "OP_STEP" as const;
export const OP_DONE_TYPE = "OP_DONE" as const;

// ── Payload shapes ────────────────────────────────────────────────────────────

export interface OpStartPayload {
  id: string;
  cwd: string;
  revision: string;
  recipeKind: string;
  steps: { id: string; label: string }[];
}

export interface OpStepPayload {
  seq: number;
  stepId: string;
  status: StepStatus;
  errorCode?: string;
  evidence?: Record<string, string>;
}

export interface OpDonePayload {
  status: "succeeded" | "failed" | "partial";
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function operationPath(cwd: string, id: string): string {
  return join(cwd, ".gatewright", "operations", `${id}.json`);
}

function operationsDir(cwd: string): string {
  return join(cwd, ".gatewright", "operations");
}

// ── Open ──────────────────────────────────────────────────────────────────────

export function openOperationJournal(
  cwd: string,
  id: string,
  store: ArtifactStore = new FileArtifactStore(),
): Journal {
  return new Journal(store, operationPath(cwd, id));
}

// ── Append helpers ────────────────────────────────────────────────────────────

/** Declare a new operation with its planned steps (all initially pending). */
export function startOperation(
  cwd: string,
  params: { id: string; revision: string; recipeKind: string; steps: { id: string; label: string }[] },
  at: string = new Date().toISOString(),
): void {
  const journal = openOperationJournal(cwd, params.id);
  const payload: OpStartPayload = {
    id: params.id,
    cwd,
    revision: params.revision,
    recipeKind: params.recipeKind,
    steps: params.steps,
  };
  journal.append({ type: OP_START_TYPE, payload, at });
}

/**
 * Record a step status transition. Returns the seq assigned to this event.
 * seq is computed from existing OP_STEP entries — monotonically increasing.
 */
export function recordStep(
  cwd: string,
  id: string,
  params: { stepId: string; status: StepStatus; errorCode?: string; evidence?: Record<string, string> },
  at: string = new Date().toISOString(),
): number {
  const journal = openOperationJournal(cwd, id);
  const events = journal.read();
  const maxSeq = events
    .filter((e): e is JournalEvent & { payload: OpStepPayload } => e.type === OP_STEP_TYPE)
    .reduce((max, e) => Math.max(max, (e.payload as OpStepPayload).seq), -1);
  const seq = maxSeq + 1;
  const payload: OpStepPayload = {
    seq,
    stepId: params.stepId,
    status: params.status,
    ...(params.errorCode !== undefined ? { errorCode: params.errorCode } : {}),
    ...(params.evidence !== undefined ? { evidence: params.evidence } : {}),
  };
  journal.append({ type: OP_STEP_TYPE, payload, at });
  return seq;
}

/** Seal the operation with a terminal status. */
export function finishOperation(
  cwd: string,
  id: string,
  status: "succeeded" | "failed" | "partial",
  at: string = new Date().toISOString(),
): void {
  const journal = openOperationJournal(cwd, id);
  const payload: OpDonePayload = { status };
  journal.append({ type: OP_DONE_TYPE, payload, at });
}

// ── Projection ────────────────────────────────────────────────────────────────

interface ProjectionState {
  op: IntegrationOperation | null;
  updatedAt: string;
}

function reducer(state: ProjectionState, event: JournalEvent): ProjectionState {
  if (event.type === OP_START_TYPE) {
    const p = event.payload as OpStartPayload;
    const steps: OperationStep[] = p.steps.map((s) => ({ id: s.id, label: s.label, status: "pending" as StepStatus }));
    return {
      op: {
        id: p.id,
        cwd: p.cwd,
        revision: p.revision,
        recipeKind: p.recipeKind,
        status: "pending",
        steps,
        startedAt: event.at,
        updatedAt: event.at,
      },
      updatedAt: event.at,
    };
  }

  if (event.type === OP_STEP_TYPE && state.op !== null) {
    const p = event.payload as OpStepPayload;
    const steps = state.op.steps.map((s): OperationStep => {
      if (s.id !== p.stepId) return s;
      const updated: OperationStep = { id: s.id, label: s.label, status: p.status };
      if (p.errorCode !== undefined) updated.errorCode = p.errorCode;
      if (p.evidence !== undefined) updated.evidence = p.evidence;
      return updated;
    });

    // Derive live status from steps (OP_DONE may override later).
    const hasRunning = steps.some((s) => s.status === "running");
    const liveStatus: IntegrationOperation["status"] = hasRunning ? "running" : state.op.status === "pending" ? "pending" : state.op.status;

    return {
      op: { ...state.op, steps, status: liveStatus, updatedAt: event.at },
      updatedAt: event.at,
    };
  }

  if (event.type === OP_DONE_TYPE && state.op !== null) {
    const p = event.payload as OpDonePayload;
    return {
      op: { ...state.op, status: p.status, updatedAt: event.at },
      updatedAt: event.at,
    };
  }

  return state;
}

/** Rebuild an IntegrationOperation from its journal. Returns null when absent or malformed. */
export function operationSnapshot(cwd: string, id: string): IntegrationOperation | null {
  try {
    const journal = openOperationJournal(cwd, id);
    const initial: ProjectionState = { op: null, updatedAt: "" };
    const result = journal.project(reducer, initial);
    return result.op;
  } catch {
    return null;
  }
}

/** Snapshot every operation under <cwd>/.gatewright/operations/, sorted by startedAt desc. */
export function listOperations(cwd: string): IntegrationOperation[] {
  let entries: string[];
  try {
    entries = readdirSync(operationsDir(cwd));
  } catch {
    return [];
  }
  const ops: IntegrationOperation[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const op = operationSnapshot(cwd, id);
    if (op !== null) ops.push(op);
  }
  ops.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return ops;
}

/**
 * Return step ids left in "running" status.
 * These may have produced external effects before a crash and need reconciliation
 * (verify the resource, then mark succeeded/failed/unknown) before any retry.
 */
export function reconcileNeeded(op: IntegrationOperation): string[] {
  return op.steps.filter((s) => s.status === "running").map((s) => s.id);
}
