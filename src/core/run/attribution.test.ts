import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEngineEvent, openRunJournal } from "../engine/run-journal.js";
import { aggregateUsage } from "./usage.js";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
it("keeps cumulative usage once, excludes older events and splits integration allocation without duplicating costs", () => {
  const root = mkdtempSync(join(tmpdir(), "usage-attribution-"));
  roots.push(root);
  const journal = openRunJournal(root, "task-a").journal;
  journal.append({
    type: "RUN_CONTEXT",
    at: "2026-11-20T12:00:00Z",
    payload: {
      agentId: "reviewer",
      providerId: "proxy",
      integrationIds: ["jev", "graphify", "jev"],
      attributionSource: "run-start",
    },
  });
  appendEngineEvent(
    journal,
    { kind: "usage", usage: { tokensIn: 10, tokensOut: 2, cacheRead: 0, costUsd: 0.1 } },
    "2026-11-20T12:01:00Z",
  );
  appendEngineEvent(
    journal,
    { kind: "usage", usage: { tokensIn: 20, tokensOut: 4, cacheRead: 0, costUsd: 0.2, cumulative: true } },
    "2026-11-20T12:02:00Z",
  );
  appendEngineEvent(
    openRunJournal(root, "legacy").journal,
    { kind: "usage", usage: { tokensIn: 2, tokensOut: 1, cacheRead: 0 } },
    "2026-11-20T12:00:00Z",
  );
  appendEngineEvent(
    openRunJournal(root, "old").journal,
    { kind: "usage", usage: { tokensIn: 100, tokensOut: 50, cacheRead: 0, costUsd: 100 } },
    "2026-10-01T12:00:00Z",
  );
  const result = aggregateUsage(root, new FileArtifactStore(), { since: Date.parse("2026-11-01T00:00:00Z") });
  expect(result.totalCostBrl).toBe(1);
  expect(result.totalTokensIn).toBe(22);
  for (const dimension of Object.values(result.byAttribution))
    expect(dimension.reduce((sum, group) => sum + (group.knownSumBrl ?? 0), 0)).toBe(1);
  expect(result.byAttribution.integration.find((group) => group.id === "jev")?.knownSumBrl).toBe(0.5);
  expect(result.byAttribution.agent.find((group) => group.id === "unattributed")).toMatchObject({
    knownSumBrl: undefined,
    unpricedCount: 1,
    pricedCount: 0,
  });
  expect(result.byRun.find((run) => run.runSlug === "task-a")).toMatchObject({
    source: "reported",
    attribution: { agentId: "reviewer" },
    model: "unknown",
  });
});
