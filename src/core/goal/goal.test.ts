import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { FindingLedger } from "./finding-ledger.js";
import { EvidenceProgress } from "./evidence-progress.js";
import { GoalVerifier } from "./goal-verifier.js";
import type { Finding, Goal } from "./types.js";

const goal: Goal = { id: "g1", criteria: ["typecheck", "tests", "build"] };
const finding = (over: Partial<Finding>): Finding => ({
  id: "f1",
  severity: "blocking",
  area: "core",
  message: "boom",
  at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("goal verification", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-goal-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const journal = () => new Journal(store, join(dir, "log.json"));

  it("FindingLedger records, de-dups by id, and filters blocking", () => {
    const j = journal();
    const ledger = new FindingLedger(j, "run-1");
    expect(ledger.record(finding({ id: "a" }))).toBe(true);
    expect(ledger.record(finding({ id: "a", message: "again" }))).toBe(false); // de-dup
    ledger.record(finding({ id: "b", severity: "warning" }));
    expect(ledger.all()).toHaveLength(2);
    expect(ledger.blocking().map((f) => f.id)).toEqual(["a"]);
  });

  it("FindingLedger isolates by run", () => {
    const j = journal();
    new FindingLedger(j, "run-1").record(finding({ id: "a" }));
    expect(new FindingLedger(j, "run-2").all()).toHaveLength(0);
  });

  it("EvidenceProgress tracks coverage and ignores out-of-goal criteria", () => {
    const ev = new EvidenceProgress(journal(), "run-1", goal);
    ev.record("typecheck", "tsc clean");
    ev.record("not-a-criterion", "irrelevant");
    const p = ev.progress();
    expect(p).toMatchObject({ covered: ["typecheck"], total: 3 });
    expect(p.missing).toEqual(["tests", "build"]);
  });

  it("GoalVerifier: satisfied only with full coverage and no blocking finding", () => {
    const j = journal();
    const ev = new EvidenceProgress(j, "run-1", goal);
    const ledger = new FindingLedger(j, "run-1");
    const verifier = new GoalVerifier();

    for (const c of goal.criteria) ev.record(c, "ok");
    expect(verifier.verify(goal, ev, ledger).satisfied).toBe(true);

    ledger.record(finding({ id: "x", severity: "blocking" }));
    const blocked = verifier.verify(goal, ev, ledger);
    expect(blocked.satisfied).toBe(false);
    expect(blocked.blockingFindings.map((f) => f.id)).toEqual(["x"]);
    expect(blocked.missing).toEqual([]);
  });

  it("GoalVerifier reports missing criteria when evidence is partial", () => {
    const j = journal();
    const ev = new EvidenceProgress(j, "run-1", goal);
    ev.record("typecheck", "ok");
    const res = new GoalVerifier().verify(goal, ev, new FindingLedger(j, "run-1"));
    expect(res.satisfied).toBe(false);
    expect(res.missing).toEqual(["tests", "build"]);
  });

  it("evidence survives a fresh instance (journal replay)", () => {
    const j = journal();
    new EvidenceProgress(j, "run-1", goal).record("typecheck", "ok");
    expect(new EvidenceProgress(j, "run-1", goal).progress().covered).toEqual(["typecheck"]);
  });
});
