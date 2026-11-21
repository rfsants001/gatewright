// Pending items projection — read-only, recomputed on each call.
//
// Three sources:
//   (a) Flow journal: open segment (FLOW_START … no FLOW_TERMINAL) → replay →
//       peek() "ask"|"run" → resumable-ask|resumable-run.
//   (b) Run journals: completed runs (PASSED) with no DESKTOP_REVIEW entry →
//       review.
//   (c) Integration operations: status "failed"|"partial" → integration-failure.
//
// All errors in a single source are caught and skipped — the caller always gets
// a list (possibly empty), never a throw.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { CONTROL_EVENT_TYPE, type ControlTransitionPayload } from "../control/control-state-machine.js";
import { INITIAL_CONTROL_STATE } from "../control/control-state.js";
import { openFlowJournal, readEntries, FLOW_START_TYPE, FLOW_TERMINAL_TYPE, FLOW_RUN_TYPE, FLOW_ANSWERS_TYPE, type FlowStartEntry } from "../flow/flow-journal.js";
import { replayFlow, type FlowInput } from "../flow/flow.js";
import { buildSddFlow } from "../flow/sdd-flow.js";
import { openRunJournal } from "../engine/run-journal.js";
import { listOperations } from "../integrations/operations.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type PendingKind = "review" | "resumable-run" | "resumable-ask" | "integration-failure";

export interface PendingItem {
  kind: PendingKind;
  entity: string;
  revision: string;
  title: string;
  action: string;
  link: { view: string; id: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function runsDir(cwd: string): string {
  return join(cwd, ".gatewright", "runs");
}

function listRunSlugs(cwd: string): string[] {
  const dir = runsDir(cwd);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((entry) => {
      try { return statSync(join(dir, entry)).isDirectory(); } catch { return false; }
    });
  } catch {
    return [];
  }
}

/** Project a run journal to its terminal control state. Returns undefined when absent/incomplete. */
function runTerminalState(cwd: string, slug: string): "PASSED" | "FAILED" | "CANCELLED" | undefined {
  try {
    const store = new FileArtifactStore();
    const { journal } = openRunJournal(cwd, slug, store);
    const events = journal.read();
    let state = INITIAL_CONTROL_STATE;
    for (const e of events) {
      if (e.type === CONTROL_EVENT_TYPE) {
        state = (e.payload as ControlTransitionPayload).to as typeof state;
      }
    }
    if (state === "PASSED" || state === "FAILED" || state === "CANCELLED") return state;
    return undefined;
  } catch {
    return undefined;
  }
}

/** True when the run journal contains at least one DESKTOP_REVIEW entry. */
function hasReviewDecision(cwd: string, slug: string): boolean {
  try {
    const store = new FileArtifactStore();
    const { journal } = openRunJournal(cwd, slug, store);
    return journal.read().some((e) => e.type === "DESKTOP_REVIEW");
  } catch {
    return false;
  }
}

// ── (a) Resumable flow ────────────────────────────────────────────────────────

function pendingFlow(cwd: string): PendingItem | undefined {
  try {
    const journal = openFlowJournal(cwd);
    const entries = readEntries(journal);

    // Find last FLOW_START segment.
    let startIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]!.type === FLOW_START_TYPE) { startIdx = i; break; }
    }
    if (startIdx === -1) return undefined;

    const segment = entries.slice(startIdx);
    if (segment.some((e) => e.type === FLOW_TERMINAL_TYPE)) return undefined;

    const startEntry = segment[0] as FlowStartEntry;
    const { goal, engineId } = startEntry.payload;

    // Identity belongs to the flow; revision follows its current journal state.
    const entity = (startEntry as { hash?: string }).hash ?? sha256(JSON.stringify(startEntry.payload));
    const revision = journal.head();

    // Build FlowInputs from the segment.
    const inputs: FlowInput[] = [];
    for (const e of segment.slice(1)) {
      if (e.type === FLOW_RUN_TYPE) {
        inputs.push({ kind: "run", stepId: e.payload.stepId, output: e.payload.output });
      } else if (e.type === FLOW_ANSWERS_TYPE) {
        inputs.push({ kind: "answers", stepId: e.payload.stepId, answers: e.payload.answers });
      }
    }

    const steps = buildSddFlow().filter((s) => s.id !== "confirm-ship" && s.id !== "ship");
    const res = replayFlow(steps, goal, inputs);
    if ("drift" in res) return undefined;

    const directive = res.engine.peek();
    if (directive.type === "done") return undefined;

    if (directive.type === "ask") {
      return {
        kind: "resumable-ask",
        entity,
        revision,
        title: directive.step.title,
        action: "Abrir revisão",
        link: { view: "project", id: engineId },
      };
    }

    // directive.type === "run"
    return {
      kind: "resumable-run",
      entity,
      revision,
      title: directive.step.title,
      action: "Retomar",
      link: { view: "project", id: engineId },
    };
  } catch {
    return undefined;
  }
}

// ── (b) Runs awaiting review ──────────────────────────────────────────────────

function pendingReviews(cwd: string): PendingItem[] {
  const slugs = listRunSlugs(cwd);
  const flowRunIds = new Set<string>();
  try {
    for (const entry of readEntries(openFlowJournal(cwd))) {
      if (entry.type === FLOW_RUN_TYPE && entry.payload.runId) flowRunIds.add(entry.payload.runId);
    }
  } catch {
    // A damaged Flow journal must not hide independently recorded run reviews.
  }
  const items: PendingItem[] = [];
  for (const slug of slugs) {
    try {
      if (flowRunIds.has(slug)) continue;
      if (runTerminalState(cwd, slug) !== "PASSED") continue;
      if (hasReviewDecision(cwd, slug)) continue;

      // revision = head hash of the run journal
      const store = new FileArtifactStore();
      const { journal } = openRunJournal(cwd, slug, store);
      const revision = journal.head();

      items.push({
        kind: "review",
        entity: slug,
        revision,
        title: slug,
        action: "Abrir revisão",
        link: { view: "project", id: slug },
      });
    } catch {
      // skip
    }
  }
  return items;
}

// ── (c) Integration failures ──────────────────────────────────────────────────

function pendingIntegrationFailures(cwd: string): PendingItem[] {
  try {
    const ops = listOperations(cwd);
    return ops
      .filter((op) => op.status === "failed" || op.status === "partial" || op.status === "running" || op.status === "pending")
      .map((op) => ({
        kind: "integration-failure" as const,
        entity: op.id,
        revision: sha256(JSON.stringify(op)),
        title: op.recipeKind,
        action: "Ver diagnóstico",
        link: { view: "install", id: op.id },
      }));
  } catch {
    return [];
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function listPending(cwd: string): PendingItem[] {
  const items: PendingItem[] = [];

  const flow = pendingFlow(cwd);
  if (flow !== undefined) items.push(flow);

  items.push(...pendingReviews(cwd));
  items.push(...pendingIntegrationFailures(cwd));

  return items;
}
