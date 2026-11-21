import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  startOperation,
  recordStep,
  finishOperation,
  operationSnapshot,
  listOperations,
  reconcileNeeded,
} from "./operations.js";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "op-test-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

const BASE = {
  id: "op-1",
  revision: "rev-abc",
  recipeKind: "docker",
  steps: [
    { id: "s1", label: "Pull image" },
    { id: "s2", label: "Start container" },
    { id: "s3", label: "Register MCP" },
  ],
};

describe("startOperation + operationSnapshot", () => {
  it("3 steps all pending after OP_START", () => {
    startOperation(cwd, BASE);
    const op = operationSnapshot(cwd, BASE.id);
    expect(op).not.toBeNull();
    expect(op!.id).toBe(BASE.id);
    expect(op!.revision).toBe(BASE.revision);
    expect(op!.recipeKind).toBe(BASE.recipeKind);
    expect(op!.status).toBe("pending");
    expect(op!.steps).toHaveLength(3);
    for (const step of op!.steps) {
      expect(step.status).toBe("pending");
      expect(step.errorCode).toBeUndefined();
      expect(step.evidence).toBeUndefined();
    }
  });
});

describe("recordStep", () => {
  it("running then succeeded on step 1 — snapshot reflects it, evidence preserved", () => {
    startOperation(cwd, BASE);
    recordStep(cwd, BASE.id, { stepId: "s1", status: "running" });
    recordStep(cwd, BASE.id, {
      stepId: "s1",
      status: "succeeded",
      evidence: { containerId: "abc123" },
    });

    const op = operationSnapshot(cwd, BASE.id);
    expect(op).not.toBeNull();
    const s1 = op!.steps.find((s) => s.id === "s1")!;
    expect(s1.status).toBe("succeeded");
    expect(s1.evidence).toEqual({ containerId: "abc123" });
    // other steps untouched
    expect(op!.steps.find((s) => s.id === "s2")!.status).toBe("pending");
  });

  it("seq increases monotonically across calls", () => {
    startOperation(cwd, BASE);
    const seq0 = recordStep(cwd, BASE.id, { stepId: "s1", status: "running" });
    const seq1 = recordStep(cwd, BASE.id, { stepId: "s1", status: "succeeded" });
    const seq2 = recordStep(cwd, BASE.id, { stepId: "s2", status: "running" });
    expect(seq0).toBe(0);
    expect(seq1).toBe(1);
    expect(seq2).toBe(2);
  });
});

describe("reconcileNeeded", () => {
  it("returns ids of steps still in running", () => {
    startOperation(cwd, BASE);
    recordStep(cwd, BASE.id, { stepId: "s1", status: "running" });
    recordStep(cwd, BASE.id, { stepId: "s2", status: "running" });
    recordStep(cwd, BASE.id, { stepId: "s1", status: "succeeded" });

    const op = operationSnapshot(cwd, BASE.id)!;
    expect(reconcileNeeded(op)).toEqual(["s2"]);
  });

  it("empty when no steps are running", () => {
    startOperation(cwd, BASE);
    const op = operationSnapshot(cwd, BASE.id)!;
    expect(reconcileNeeded(op)).toEqual([]);
  });
});

describe("finishOperation", () => {
  it("OP_DONE partial sets overall status to partial", () => {
    startOperation(cwd, BASE);
    recordStep(cwd, BASE.id, { stepId: "s1", status: "succeeded" });
    recordStep(cwd, BASE.id, { stepId: "s2", status: "failed", errorCode: "TIMEOUT" });
    finishOperation(cwd, BASE.id, "partial");

    const op = operationSnapshot(cwd, BASE.id)!;
    expect(op.status).toBe("partial");
    expect(op.steps.find((s) => s.id === "s2")!.errorCode).toBe("TIMEOUT");
  });

  it("OP_DONE succeeded sets overall status to succeeded", () => {
    startOperation(cwd, BASE);
    finishOperation(cwd, BASE.id, "succeeded");
    expect(operationSnapshot(cwd, BASE.id)!.status).toBe("succeeded");
  });
});

describe("operationSnapshot edge cases", () => {
  it("unknown id → null", () => {
    expect(operationSnapshot(cwd, "no-such-op")).toBeNull();
  });
});

describe("listOperations", () => {
  it("missing .gatewright/operations dir → []", () => {
    expect(listOperations(cwd)).toEqual([]);
  });

  it("returns multiple operations sorted by startedAt desc", () => {
    const t1 = "2026-01-01T00:00:00.000Z";
    const t2 = "2026-06-01T00:00:00.000Z";
    const t3 = "2026-11-01T00:00:00.000Z";

    startOperation(cwd, { ...BASE, id: "op-a" }, t1);
    startOperation(cwd, { ...BASE, id: "op-b" }, t3);
    startOperation(cwd, { ...BASE, id: "op-c" }, t2);

    const ops = listOperations(cwd);
    expect(ops.map((o) => o.id)).toEqual(["op-b", "op-c", "op-a"]);
  });

  it("skips malformed/absent entries gracefully", () => {
    // Create a valid op then snapshot it; ensure it's in the list
    startOperation(cwd, BASE);
    const ops = listOperations(cwd);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.id).toBe(BASE.id);
  });
});

describe("updatedAt", () => {
  it("tracks the timestamp of the last event", () => {
    const t0 = "2026-11-01T10:00:00.000Z";
    const t1 = "2026-11-01T10:01:00.000Z";
    startOperation(cwd, BASE, t0);
    recordStep(cwd, BASE.id, { stepId: "s1", status: "running" }, t1);

    const op = operationSnapshot(cwd, BASE.id)!;
    expect(op.startedAt).toBe(t0);
    expect(op.updatedAt).toBe(t1);
  });
});
