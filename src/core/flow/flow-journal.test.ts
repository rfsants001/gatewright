import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAnswers,
  appendRun,
  appendStart,
  appendTerminal,
  FLOW_ANSWERS_TYPE,
  FLOW_RUN_TYPE,
  FLOW_START_TYPE,
  FLOW_TERMINAL_TYPE,
  flowStatePath,
  openFlowJournal,
  readEntries,
  readLastEntry,
} from "./flow-journal.js";

describe("flow-journal", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-flow-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("places the journal at .gatewright/flow-state.json", () => {
    expect(flowStatePath(dir)).toBe(join(dir, ".gatewright", "flow-state.json"));
  });

  it("readEntries on a fresh cwd returns []", () => {
    const journal = openFlowJournal(dir);
    expect(readEntries(journal)).toEqual([]);
  });

  it("readLastEntry on a fresh cwd returns null", () => {
    const journal = openFlowJournal(dir);
    expect(readLastEntry(journal)).toBeNull();
  });

  it("round-trips a FLOW_START entry", () => {
    const journal = openFlowJournal(dir);
    appendStart(journal, { goal: "build it", flowKind: "sdd", engineId: "claude-code" }, "2026-01-01T00:00:00Z");
    const entries = readEntries(journal);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.type).toBe(FLOW_START_TYPE);
    expect(e.payload).toEqual({ goal: "build it", flowKind: "sdd", engineId: "claude-code" });
    expect(e.at).toBe("2026-01-01T00:00:00Z");
  });

  it("round-trips a FLOW_RUN entry without optional fields", () => {
    const journal = openFlowJournal(dir);
    appendRun(journal, { stepId: "step-1", output: "some output" }, "2026-01-01T00:00:01Z");
    const entries = readEntries(journal);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.type).toBe(FLOW_RUN_TYPE);
    expect(e.payload).toEqual({ stepId: "step-1", output: "some output" });
    // optional fields must not be present (exactOptionalPropertyTypes)
    expect("runId" in e.payload).toBe(false);
    expect("revision" in e.payload).toBe(false);
  });

  it("round-trips a FLOW_RUN entry with optional runId and revision", () => {
    const journal = openFlowJournal(dir);
    appendRun(
      journal,
      { stepId: "step-ask", output: "<gate-ask>…</gate-ask>", runId: "run-42", revision: "rev-abc" },
      "2026-01-01T00:00:02Z",
    );
    const entries = readEntries(journal);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.type).toBe(FLOW_RUN_TYPE);
    expect(e.payload).toEqual({
      stepId: "step-ask",
      output: "<gate-ask>…</gate-ask>",
      runId: "run-42",
      revision: "rev-abc",
    });
  });

  it("round-trips a FLOW_ANSWERS entry", () => {
    const journal = openFlowJournal(dir);
    appendAnswers(
      journal,
      { stepId: "step-ask", answers: { q1: "yes", q2: ["a", "b"], q3: true } },
      "2026-01-01T00:00:03Z",
    );
    const entries = readEntries(journal);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(e.type).toBe(FLOW_ANSWERS_TYPE);
    expect(e.payload).toEqual({ stepId: "step-ask", answers: { q1: "yes", q2: ["a", "b"], q3: true } });
  });

  it("round-trips all FLOW_TERMINAL reasons", () => {
    const reasons = ["done", "aborted", "stopped", "version-mismatch"] as const;
    for (const reason of reasons) {
      const local = mkdtempSync(join(tmpdir(), "gw-flow-term-"));
      try {
        const journal = openFlowJournal(local);
        appendTerminal(journal, reason, "2026-01-01T00:00:04Z");
        const entries = readEntries(journal);
        expect(entries).toHaveLength(1);
        const e = entries[0]!;
        expect(e.type).toBe(FLOW_TERMINAL_TYPE);
        expect(e.payload).toEqual({ reason });
      } finally {
        rmSync(local, { recursive: true, force: true });
      }
    }
  });

  it("preserves insertion order across multiple appends", () => {
    const journal = openFlowJournal(dir);
    appendStart(journal, { goal: "g", flowKind: "sdd", engineId: "claude-code" }, "2026-01-01T00:00:00Z");
    appendRun(journal, { stepId: "s1", output: "out1" }, "2026-01-01T00:00:01Z");
    appendAnswers(journal, { stepId: "s1", answers: { q1: "a" } }, "2026-01-01T00:00:02Z");
    appendRun(journal, { stepId: "s2", output: "out2" }, "2026-01-01T00:00:03Z");
    appendTerminal(journal, "done", "2026-01-01T00:00:04Z");

    const entries = readEntries(journal);
    expect(entries.map((e) => e.type)).toEqual([
      FLOW_START_TYPE,
      FLOW_RUN_TYPE,
      FLOW_ANSWERS_TYPE,
      FLOW_RUN_TYPE,
      FLOW_TERMINAL_TYPE,
    ]);
  });

  it("readLastEntry returns the last appended entry", () => {
    const journal = openFlowJournal(dir);
    appendStart(journal, { goal: "g", flowKind: "sdd", engineId: "claude-code" }, "2026-01-01T00:00:00Z");
    appendTerminal(journal, "aborted", "2026-01-01T00:00:01Z");

    const last = readLastEntry(journal);
    expect(last).not.toBeNull();
    expect(last!.type).toBe(FLOW_TERMINAL_TYPE);
    expect((last!.payload as { reason: string }).reason).toBe("aborted");
  });

  it("journal hash-chain remains valid after multiple appends", () => {
    const journal = openFlowJournal(dir);
    appendStart(journal, { goal: "g", flowKind: "sdd", engineId: "claude-code" });
    appendRun(journal, { stepId: "s1", output: "o" });
    appendTerminal(journal, "done");
    expect(journal.verify().ok).toBe(true);
  });

  it("two Journal instances on the same path share the same state", () => {
    const j1 = openFlowJournal(dir);
    appendStart(j1, { goal: "shared", flowKind: "sdd", engineId: "claude-code" }, "2026-01-01T00:00:00Z");

    const j2 = openFlowJournal(dir);
    const entries = readEntries(j2);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe(FLOW_START_TYPE);
  });
});
