import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../../artifact-store/artifact-store.js";
import { Journal } from "../../journal/journal.js";
import { StubAdapter } from "../adapters/stub-adapter.js";
import { BudgetLedger } from "../budget.js";
import { JevDecisionEngine } from "../jev-engine.js";
import { CorrectionLedger } from "./correction-ledger.js";
import { calibrate } from "./calibrate.js";
import type { Correction } from "./types.js";

const correction = (over: Partial<Correction>): Correction => ({
  feature: "proportion-gate",
  jevVerdict: "discard",
  humanDecision: "accepted",
  at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("CorrectionLedger", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-jf-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const journal = () => new Journal(store, join(dir, "log.json"));

  it("records corrections and filters by feature", () => {
    const ledger = new CorrectionLedger(journal());
    ledger.record(correction({ feature: "a" }));
    ledger.record(correction({ feature: "b" }));
    ledger.record(correction({ feature: "a", humanDecision: "rejected" }));
    expect(ledger.all()).toHaveLength(3);
    expect(ledger.byFeature("a")).toHaveLength(2);
  });
});

describe("calibrate", () => {
  it("no samples → no penalty (scale 1)", () => {
    expect(calibrate([], "x")).toEqual({ samples: 0, agreementRate: 1, confidenceScale: 1 });
  });

  it("a few samples barely move the scale (smoothing)", () => {
    const two = [correction({ humanDecision: "rejected" }), correction({ humanDecision: "rejected" })];
    const c = calibrate(two, "proportion-gate");
    expect(c.agreementRate).toBe(0);
    expect(c.confidenceScale).toBeGreaterThan(0.6); // 1 - (2/7)*1 ≈ 0.71
  });

  it("sustained disagreement pulls the scale down toward agreement", () => {
    const many = Array.from({ length: 50 }, () => correction({ humanDecision: "rejected" }));
    const c = calibrate(many, "proportion-gate");
    expect(c.agreementRate).toBe(0);
    expect(c.confidenceScale).toBeLessThan(0.15);
  });

  it("high agreement keeps confidence intact", () => {
    const many = Array.from({ length: 50 }, () => correction({ humanDecision: "accepted" }));
    expect(calibrate(many, "proportion-gate").confidenceScale).toBe(1);
  });
});

describe("JevDecisionEngine with calibration (advisory invariant)", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-jfe-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const journal = () => new Journal(store, join(dir, "log.json"));

  const engineWith = (j: Journal, scale: number) =>
    new JevDecisionEngine(new StubAdapter({ verdict: "discard", rationale: "big", confidence: 0.9 }), new BudgetLedger({}, j), j, {
      enabled: true,
      calibrator: () => ({ samples: 50, agreementRate: scale, confidenceScale: scale }),
    });

  it("scales confidence down but never changes the verdict or blocks", async () => {
    const j = journal();
    const card = await engineWith(j, 0.5).consult("proportion-gate", "p", { feature: "proportion-gate", summary: "s" });
    expect(card.verdict).toBe("discard"); // unchanged
    expect(card.confidence).toBeCloseTo(0.45); // 0.9 × 0.5
    expect(["approve", "discard", "abstain"]).toContain(card.verdict); // never a block
  });

  it("no calibrator → confidence untouched (no regression)", async () => {
    const j = journal();
    const engine = new JevDecisionEngine(new StubAdapter({ verdict: "discard", rationale: "big", confidence: 0.9 }), new BudgetLedger({}, j), j, { enabled: true });
    const card = await engine.consult("proportion-gate", "p", { feature: "proportion-gate", summary: "s" });
    expect(card.confidence).toBe(0.9);
  });
});
