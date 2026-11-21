// Unit tests for listPending() — isolated, temp-cwd, deterministic.
// No live engine / network. All journals are seeded directly on disk.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { listPending } from "./projection.js";

import { openFlowJournal, appendStart, appendRun, appendAnswers, appendTerminal } from "../flow/flow-journal.js";
import { buildSddFlow } from "../flow/sdd-flow.js";
import { openRunJournal } from "../engine/run-journal.js";
import { ControlStateMachine } from "../control/control-state-machine.js";
import { startOperation, finishOperation } from "../integrations/operations.js";
import { randomUUID } from "node:crypto";

// ── Shared constants ──────────────────────────────────────────────────────────

// Filtered steps mirroring what bridge.ts uses.
const FILTERED_STEPS = buildSddFlow().filter(
  (s) => s.id !== "confirm-ship" && s.id !== "ship",
);
const FIRST_RUN_STEP = FILTERED_STEPS.find((s) => s.kind === "run")!; // "plan"

// A simple run output with no <gate-ask> block (so engine advances to next step without injecting ask).
const PLAIN_OUTPUT = "Step output — no gate-ask here.";

// A run output with a <gate-ask> block so the engine injects an ask step.
const GATE_ASK_OUTPUT =
  `Analysis complete.\n\n` +
  `<gate-ask>\n` +
  `[{"id":"clarify","type":"text","prompt":"What is the target environment?"}]\n` +
  `</gate-ask>`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seed a run journal with one ENGINE_EVENT then transition to `state`. */
function seedRun(cwd: string, slug: string, state: "PASSED" | "FAILED" | "CANCELLED"): void {
  const { journal } = openRunJournal(cwd, slug);
  // Seed one ENGINE_EVENT so the journal is non-empty.
  journal.append({
    type: "ENGINE_EVENT",
    at: new Date().toISOString(),
    payload: { kind: "assistant", text: "hello", model: "test" },
  });
  const ctrl = new ControlStateMachine(journal);
  ctrl.transition("RUNNING");
  ctrl.transition(state);
}

/** Append a DESKTOP_REVIEW entry to a run journal (simulates a review decision). */
function appendReviewDecision(cwd: string, slug: string): void {
  const { journal } = openRunJournal(cwd, slug);
  journal.append({
    type: "DESKTOP_REVIEW",
    at: new Date().toISOString(),
    payload: { revision: "any", approved: true },
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "gw-pending-"));
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("listPending", () => {
  it("empty project → []", () => {
    expect(listPending(tmpDir)).toEqual([]);
  });

  // ── Flow: resumable-run ──────────────────────────────────────────────────────

  it("flow open at run step → resumable-run item", () => {
    // Seed FLOW_START only. Engine replays to first run step ("plan").
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "build widget", flowKind: "sdd", engineId: "claude-code" });

    const items = listPending(tmpDir);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.kind).toBe("resumable-run");
    expect(item.title).toBe(FIRST_RUN_STEP.title);
    expect(item.action).toBe("Retomar");
    expect(item.link.view).toBe("project");
    expect(typeof item.entity).toBe("string");
    expect(item.entity.length).toBeGreaterThan(0);
    expect(typeof item.revision).toBe("string");
    expect(item.revision.length).toBeGreaterThan(0);
  });

  // ── Flow: resumable-ask ──────────────────────────────────────────────────────

  it("flow open at ask step → resumable-ask item", () => {
    // FLOW_START + FLOW_RUN with gate-ask output.
    // Engine replays and injects an ask step after "plan".
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "build widget", flowKind: "sdd", engineId: "claude-code" });
    appendRun(journal, { stepId: FIRST_RUN_STEP.id, output: GATE_ASK_OUTPUT });

    const items = listPending(tmpDir);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.kind).toBe("resumable-ask");
    expect(item.action).toBe("Abrir revisão");
    expect(item.link.view).toBe("project");
  });

  // ── Flow: terminal → no flow item ────────────────────────────────────────────

  it("flow with FLOW_TERMINAL → no flow item", () => {
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "build widget", flowKind: "sdd", engineId: "claude-code" });
    appendTerminal(journal, "done");

    expect(listPending(tmpDir)).toEqual([]);
  });

  it("flow with done replay (all steps consumed) → no flow item", () => {
    // Seed all run+answers entries so engine reaches done without terminal.
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "build widget", flowKind: "sdd", engineId: "claude-code" });

    // Replay all steps to reach done: alternate run/answers for each step in filtered set.
    for (const step of FILTERED_STEPS) {
      if (step.kind === "run") {
        appendRun(journal, { stepId: step.id, output: PLAIN_OUTPUT });
      } else {
        // gate or ask — provide answers
        appendAnswers(journal, { stepId: step.id, answers: { approve: true } });
      }
    }

    // Engine should be at "done" after replaying all steps.
    // But if the flow appended terminal we also want no item.
    const items = listPending(tmpDir);
    // No resumable-run or resumable-ask items.
    const flowItems = items.filter((i) => i.kind === "resumable-run" || i.kind === "resumable-ask");
    expect(flowItems).toHaveLength(0);
  });

  // ── Runs awaiting review ──────────────────────────────────────────────────────

  it("PASSED run without decision → review item", () => {
    const slug = "run-" + randomUUID();
    seedRun(tmpDir, slug, "PASSED");

    const items = listPending(tmpDir);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.kind).toBe("review");
    expect(item.entity).toBe(slug);
    expect(item.action).toBe("Abrir revisão");
    expect(item.link.view).toBe("project");
    expect(item.link.id).toBe(slug);
    expect(typeof item.revision).toBe("string");
    expect(item.revision.length).toBeGreaterThan(0);
  });

  it("PASSED run with DESKTOP_REVIEW decision → no review item", () => {
    const slug = "run-" + randomUUID();
    seedRun(tmpDir, slug, "PASSED");
    appendReviewDecision(tmpDir, slug);

    expect(listPending(tmpDir)).toEqual([]);
  });

  it("FAILED run → no review item", () => {
    const slug = "run-" + randomUUID();
    seedRun(tmpDir, slug, "FAILED");

    expect(listPending(tmpDir)).toEqual([]);
  });

  it("CANCELLED run → no review item", () => {
    const slug = "run-" + randomUUID();
    seedRun(tmpDir, slug, "CANCELLED");

    expect(listPending(tmpDir)).toEqual([]);
  });

  // ── Integration failures ─────────────────────────────────────────────────────

  it("failed operation → integration-failure item", () => {
    const id = randomUUID();
    const revision = "rev-" + id;
    startOperation(tmpDir, { id, revision, recipeKind: "npm-mcp", steps: [{ id: "0", label: "install" }] });
    finishOperation(tmpDir, id, "failed");

    const items = listPending(tmpDir);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.kind).toBe("integration-failure");
    expect(item.entity).toBe(id);
    expect(item.revision).not.toBe(revision);
    expect(item.action).toBe("Ver diagnóstico");
    expect(item.link.view).toBe("install");
    expect(item.link.id).toBe(id);
  });

  it("partial operation → integration-failure item", () => {
    const id = randomUUID();
    const revision = "rev-" + id;
    startOperation(tmpDir, { id, revision, recipeKind: "container", steps: [{ id: "0", label: "pull" }] });
    finishOperation(tmpDir, id, "partial");

    const items = listPending(tmpDir).filter((i) => i.kind === "integration-failure");
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("integration-failure");
  });

  it("succeeded operation → no integration-failure item", () => {
    const id = randomUUID();
    startOperation(tmpDir, { id, revision: "rev", recipeKind: "npm-mcp", steps: [{ id: "0", label: "install" }] });
    finishOperation(tmpDir, id, "succeeded");

    const items = listPending(tmpDir).filter((i) => i.kind === "integration-failure");
    expect(items).toHaveLength(0);
  });

  // ── Mixed sources ─────────────────────────────────────────────────────────────

  it("all three sources together → all items present", () => {
    // Flow: resumable-run
    const fj = openFlowJournal(tmpDir);
    appendStart(fj, { goal: "build widget", flowKind: "sdd", engineId: "claude-code" });

    // Run: awaiting review
    const slug = "run-" + randomUUID();
    seedRun(tmpDir, slug, "PASSED");

    // Operation: failed
    const opId = randomUUID();
    startOperation(tmpDir, { id: opId, revision: "rev-op", recipeKind: "npm-mcp", steps: [{ id: "0", label: "install" }] });
    finishOperation(tmpDir, opId, "failed");

    const items = listPending(tmpDir);
    expect(items.some((i) => i.kind === "resumable-run")).toBe(true);
    expect(items.some((i) => i.kind === "review")).toBe(true);
    expect(items.some((i) => i.kind === "integration-failure")).toBe(true);
    expect(items).toHaveLength(3);
  });

  // ── Identity stability ────────────────────────────────────────────────────────

  it("revision is stable across two calls for the same open flow", () => {
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "build widget", flowKind: "sdd", engineId: "claude-code" });

    const a = listPending(tmpDir);
    const b = listPending(tmpDir);
    expect(a[0]!.revision).toBe(b[0]!.revision);
    expect(a[0]!.entity).toBe(b[0]!.entity);
  });

  it("resolved items vanish on the next call", () => {
    const slug = "run-" + randomUUID();
    seedRun(tmpDir, slug, "PASSED");

    expect(listPending(tmpDir).some((i) => i.kind === "review")).toBe(true);

    appendReviewDecision(tmpDir, slug);

    expect(listPending(tmpDir).some((i) => i.kind === "review")).toBe(false);
  });

  it("changes the flow revision after progress while retaining its identity", () => {
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "review scope", flowKind: "sdd", engineId: "claude-code" });
    const before = listPending(tmpDir)[0]!;
    appendRun(journal, { stepId: FIRST_RUN_STEP.id, output: GATE_ASK_OUTPUT });
    const after = listPending(tmpDir)[0]!;
    expect(after.entity).toBe(before.entity);
    expect(after.revision).not.toBe(before.revision);
    expect(after.kind).toBe("resumable-ask");
  });

  it("keeps a Flow run inside its own review instead of presenting two approvals", () => {
    const runId = "run-" + randomUUID();
    seedRun(tmpDir, runId, "PASSED");
    const journal = openFlowJournal(tmpDir);
    appendStart(journal, { goal: "review scope", flowKind: "sdd", engineId: "claude-code" });
    appendRun(journal, { stepId: FIRST_RUN_STEP.id, output: GATE_ASK_OUTPUT, runId });
    expect(listPending(tmpDir).map((item) => item.kind)).toEqual(["resumable-ask"]);
  });

  it("preserves standalone reviews when the Flow journal cannot be read", () => {
    const runId = "run-" + randomUUID();
    seedRun(tmpDir, runId, "PASSED");
    writeFileSync(join(tmpDir, ".gatewright", "flow-state.json"), "{invalid");
    expect(listPending(tmpDir).map((item) => item.entity)).toEqual([runId]);
  });
});
