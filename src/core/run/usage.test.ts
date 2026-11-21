import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { aggregateUsage } from "./usage.js";
import { createClaudeCodeAdapter } from "../engine/adapters/claude-code.js";
import { appendEngineEvent, openRunJournal, ENGINE_EVENT_TYPE } from "../engine/run-journal.js";
import type { EngineEvent } from "../engine/types.js";

/** Build a minimal journal JSON array with usage engine events. */
function makeJournalEntries(
  events: Array<{ kind: EngineEvent["kind"]; tokensIn?: number; tokensOut?: number; cacheRead?: number; model?: string }>,
): string {
  const entries = events.map((e, i) => {
    const prev = i === 0 ? "0000000000000000000000000000000000000000000000000000000000000000" : `hash${i - 1}`;
    const payload: EngineEvent = {
      kind: e.kind,
      ...(e.kind === "usage"
        ? {
            usage: {
              tokensIn: e.tokensIn ?? 0,
              tokensOut: e.tokensOut ?? 0,
              cacheRead: e.cacheRead ?? 0,
            },
            raw: e.model ? { model: e.model } : undefined,
          }
        : {}),
    };
    return {
      type: ENGINE_EVENT_TYPE,
      payload,
      at: new Date().toISOString(),
      prevHash: prev,
      hash: `hash${i}`,
    };
  });
  return JSON.stringify(entries);
}

/** Set up a temporary cwd with run journals. */
function makeCwd(runs: Array<{ slug: string; events: Array<{ kind: EngineEvent["kind"]; tokensIn?: number; tokensOut?: number; cacheRead?: number; model?: string }> }>): string {
  const cwd = mkdtempSync(join(tmpdir(), "usage-test-"));
  for (const run of runs) {
    const dir = join(cwd, ".gatewright", "runs", run.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "journal.json"), makeJournalEntries(run.events));
  }
  return cwd;
}

describe("aggregateUsage", () => {
  it("uses the run's selected model when the CLI usage event omits it", () => {
    const cwd = mkdtempSync(join(tmpdir(), "usage-codex-model-"));
    const journal = openRunJournal(cwd, "codex-run").journal;
    journal.append({ type: "RUN_CONTEXT", at: new Date().toISOString(), payload: { model: "codex-selected-model" } });
    appendEngineEvent(journal, { kind: "usage", usage: { tokensIn: 60, tokensOut: 20, cacheRead: 40, cumulative: true } });
    expect(aggregateUsage(cwd)).toMatchObject({ totalTokensIn: 60, totalCacheRead: 40, byModel: [{ model: "codex-selected-model" }], byRun: [{ model: "codex-selected-model", totalCostBrl: undefined }] });
  });
  it("uses Claude's cumulative result once and retains the model and reported cost", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gw-usage-cumulative-"));
    const journal = openRunJournal(cwd, "example").journal;
    const adapter = createClaudeCodeAdapter();
    const usage = { input_tokens: 100, output_tokens: 20 };
    for (const item of [
      { type: "assistant", message: { model: "claude-sonnet", usage } },
      { type: "result", usage, total_cost_usd: 0.012 },
    ]) {
      const result = adapter.parseStreamLine(JSON.stringify(item));
      for (const event of Array.isArray(result) ? result : result ? [result] : []) appendEngineEvent(journal, event);
    }
    expect(aggregateUsage(cwd)).toMatchObject({
      totalTokensIn: 100, totalTokensOut: 20, totalCostBrl: 0.06, byModel: [{ model: "claude-sonnet" }],
    });
  });

  it("dates measured runs and keeps costs on the day they were recorded", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gw-usage-timeline-"));
    function record(run: string, at: string, costUsd?: number) {
      appendEngineEvent(openRunJournal(cwd, run).journal, {
        kind: "usage", usage: { tokensIn: 3, tokensOut: 2, cacheRead: 0, ...(costUsd === undefined ? {} : { costUsd }) },
      }, at);
    }
    const onDay = (day: number) => new Date(2026, 9, day, 10).toISOString();
    record("run-z", onDay(14), 0);
    record("run-a", onDay(15), 0.02);
    record("run-a", onDay(16));
    const snapshot = aggregateUsage(cwd);
    expect(snapshot.byRun).toEqual(expect.arrayContaining([
      expect.objectContaining({ runSlug: "run-a", recordedAt: onDay(16), totalCostBrl: 0.1, pricedCount: 1, count: 2 }),
      expect.objectContaining({ runSlug: "run-z", recordedAt: onDay(14), totalCostBrl: 0, pricedCount: 1, count: 1 }),
    ]));
    expect(snapshot.byDay).toEqual(expect.arrayContaining([
      { day: "2026-10-14", totalCostBrl: 0, pricedCount: 1, count: 1 },
      { day: "2026-10-15", totalCostBrl: 0.1, pricedCount: 1, count: 1 },
      { day: "2026-10-16", totalCostBrl: undefined, pricedCount: 0, count: 1 },
    ]));
  });

  it("returns empty snapshot when no runs exist", () => {
    const cwd = mkdtempSync(join(tmpdir(), "usage-empty-"));
    const snap = aggregateUsage(cwd);
    expect(snap.totalTokensIn).toBe(0);
    expect(snap.totalTokensOut).toBe(0);
    expect(snap.totalCacheRead).toBe(0);
    expect(snap.byModel).toHaveLength(0);
    expect(snap.byRun).toHaveLength(0);
  });

  it("sums tokens across usage events in a single run", () => {
    const cwd = makeCwd([
      {
        slug: "run-001",
        events: [
          { kind: "usage", tokensIn: 100, tokensOut: 50, cacheRead: 20 },
          { kind: "usage", tokensIn: 200, tokensOut: 100, cacheRead: 10 },
        ],
      },
    ]);
    const snap = aggregateUsage(cwd);
    expect(snap.totalTokensIn).toBe(300);
    expect(snap.totalTokensOut).toBe(150);
    expect(snap.totalCacheRead).toBe(30);
    expect(snap.byRun).toHaveLength(1);
    expect(snap.byRun[0]!.runSlug).toBe("run-001");
    expect(snap.byRun[0]!.totalTokensIn).toBe(300);
  });

  it("aggregates across multiple runs", () => {
    const cwd = makeCwd([
      {
        slug: "run-a",
        events: [{ kind: "usage", tokensIn: 100, tokensOut: 50, cacheRead: 0 }],
      },
      {
        slug: "run-b",
        events: [{ kind: "usage", tokensIn: 200, tokensOut: 80, cacheRead: 0 }],
      },
    ]);
    const snap = aggregateUsage(cwd);
    expect(snap.totalTokensIn).toBe(300);
    expect(snap.totalTokensOut).toBe(130);
    expect(snap.byRun).toHaveLength(2);
  });

  it("groups by model when model is present in raw", () => {
    const cwd = makeCwd([
      {
        slug: "run-model",
        events: [
          { kind: "usage", tokensIn: 100, tokensOut: 50, cacheRead: 0, model: "claude-sonnet-4-6" },
          { kind: "usage", tokensIn: 200, tokensOut: 80, cacheRead: 0, model: "claude-haiku-4-5" },
          { kind: "usage", tokensIn: 50, tokensOut: 20, cacheRead: 0, model: "claude-sonnet-4-6" },
        ],
      },
    ]);
    const snap = aggregateUsage(cwd);
    const sonnet = snap.byModel.find((m) => m.model === "claude-sonnet-4-6");
    const haiku = snap.byModel.find((m) => m.model === "claude-haiku-4-5");
    expect(sonnet).toBeDefined();
    expect(sonnet!.totalTokensIn).toBe(150);
    expect(sonnet!.count).toBe(2);
    expect(haiku).toBeDefined();
    expect(haiku!.totalTokensIn).toBe(200);
    expect(haiku!.count).toBe(1);
  });

  it("calculates cost via pricing.ts (sonnet: 3/15 USD per 1M)", () => {
    const cwd = makeCwd([
      {
        slug: "run-cost",
        events: [
          { kind: "usage", tokensIn: 1_000_000, tokensOut: 0, cacheRead: 0, model: "claude-sonnet-4-6" },
        ],
      },
    ]);
    const snap = aggregateUsage(cwd);
    // sonnet inputPerM=3, rate=5 → 3*5 = R$15
    expect(snap.totalCostBrl).toBeCloseTo(15, 3);
    const sonnet = snap.byModel.find((m) => m.model === "claude-sonnet-4-6");
    expect(sonnet!.totalCostBrl).toBeCloseTo(15, 3);
  });

  it("ignores non-usage events", () => {
    const cwd = makeCwd([
      {
        slug: "run-mixed",
        events: [
          { kind: "assistant" },
          { kind: "usage", tokensIn: 100, tokensOut: 50, cacheRead: 0 },
          { kind: "tool_use" },
        ],
      },
    ]);
    const snap = aggregateUsage(cwd);
    expect(snap.byRun[0]!.count).toBe(1);
    expect(snap.totalTokensIn).toBe(100);
  });

  it("groups unknown model under 'unknown'", () => {
    const cwd = makeCwd([
      {
        slug: "run-nomodel",
        events: [{ kind: "usage", tokensIn: 50, tokensOut: 20, cacheRead: 0 }],
      },
    ]);
    const snap = aggregateUsage(cwd);
    const unknown = snap.byModel.find((m) => m.model === "unknown");
    expect(unknown).toBeDefined();
    expect(unknown!.totalTokensIn).toBe(50);
  });

  it("excludes runs with no usage events from byRun", () => {
    const cwd = makeCwd([
      {
        slug: "run-empty",
        events: [{ kind: "assistant" }, { kind: "system" }],
      },
    ]);
    const snap = aggregateUsage(cwd);
    expect(snap.byRun).toHaveLength(0);
    expect(snap.totalTokensIn).toBe(0);
  });
});
