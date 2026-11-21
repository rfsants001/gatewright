// Usage aggregation — enumerate all run-journals under <cwd>/.gatewright/runs/,
// collect `kind:"usage"` engine events, group by model and by run slug, and
// compute R$ cost via pricing.ts. Scope is per-cwd (no cross-project aggregation).

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import type { ArtifactStore } from "../artifact-store/types.js";
import { Journal } from "../journal/journal.js";
import { ENGINE_EVENT_TYPE } from "../engine/run-journal.js";
import type { EngineEvent, EngineUsage } from "../engine/types.js";
import { estimateCost, formatBRL, PRICING } from "./pricing.js";
import type { RunContext } from "../engine/types.js";

/** Per-model aggregated usage. */
export interface ModelUsage {
  model: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheRead: number;
  /** Estimated cost in R$, undefined when model not in pricing table. */
  totalCostBrl: number | undefined;
  /** Number of individual usage events. */
  count: number;
}

/** Per-run aggregated usage (across all models in that run). */
export interface RunUsage {
  runSlug: string;
  /** Timestamp of the latest usage event with a valid date in this run. */
  recordedAt?: string;
  /** Number of events whose cost could be determined. */
  pricedCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheRead: number;
  totalCostBrl: number | undefined;
  count: number;
  attribution?: RunContext;
  model?: string;
  source?: "reported" | "estimated" | "unknown" | "mixed";
}

export interface AttributionUsage {
  id: string; label: string; knownSumBrl: number | undefined; pricedCount: number; unpricedCount: number;
  totalTokensIn: number; totalTokensOut: number; runIds: string[];
}

/** Cost of the usage events recorded on a calendar day in the local time zone. */
export interface DailyUsage {
  day: string;
  totalCostBrl: number | undefined;
  pricedCount: number;
  count: number;
}

/** Full aggregated snapshot for a cwd. */
export interface UsageSnapshot {
  cwd: string;
  /** Aggregate per model id. */
  byModel: ModelUsage[];
  /** Aggregate per run slug. */
  byRun: RunUsage[];
  byDay: DailyUsage[];
  /** Grand totals. */
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheRead: number;
  totalCostBrl: number | undefined;
  byAttribution: Record<"agent" | "provider" | "task" | "integration", AttributionUsage[]>;
}

/** Path to the runs directory for a given cwd. */
function runsDir(cwd: string): string {
  return join(cwd, ".gatewright", "runs");
}

/** Enumerate all run slugs (directory names) under the runs dir. */
function listRunSlugs(cwd: string): string[] {
  const dir = runsDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((entry) => {
    try {
      return statSync(join(dir, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Extract all usage events from a run journal file. */
function readUsageEvents(journalPath: string, store: ArtifactStore): Array<{ usage: EngineUsage; model: string | undefined; at: string }> {
  const journal = new Journal(store, journalPath);
  const events = journal.read();
  const out: Array<{ usage: EngineUsage; model: string | undefined; at: string }> = [];
  for (const e of events) {
    if (e.type !== ENGINE_EVENT_TYPE) continue;
    const payload = e.payload as EngineEvent;
    if (payload.kind !== "usage" || !payload.usage) continue;
    const raw = payload.raw as { type?: string; message?: { model?: unknown }; modelUsage?: Record<string, unknown> } | undefined;
    const models = Object.keys(raw?.modelUsage ?? {});
    const model = payload.usage.model ?? (models.length === 1 ? models[0] : undefined)
      ?? extractModel(raw) ?? extractModel(raw?.message);
    if (payload.usage.cumulative || raw?.type === "result") {
      const partialModels = new Set(out.map((entry) => entry.model).filter(Boolean));
      const inferred = partialModels.size === 1 ? [...partialModels][0] : undefined;
      out.splice(0, out.length, { usage: payload.usage, model: model ?? inferred, at: e.at });
    } else {
      out.push({ usage: payload.usage, model, at: e.at });
    }
  }
  return out;
}

/** Best-effort: extract the model field from a raw event payload. */
function extractModel(raw: unknown): string | undefined {
  if (raw && typeof raw === "object" && "model" in raw) {
    const m = (raw as Record<string, unknown>)["model"];
    if (typeof m === "string") return m;
  }
  return undefined;
}

/**
 * Aggregate all usage events across run journals under `cwd/.gatewright/runs/`.
 * Pure snapshot — reads current state of all journals; no caching.
 */
export function aggregateUsage(cwd: string, store: ArtifactStore = new FileArtifactStore(), period: { since?: number; until?: number } = {}): UsageSnapshot {
  const slugs = listRunSlugs(cwd);

  const modelMap = new Map<string, ModelUsage>();
  const runList: RunUsage[] = [];
  const dayMap = new Map<string, DailyUsage>();

  let grandIn = 0;
  let grandOut = 0;
  let grandCache = 0;
  let grandCost: number | undefined;

  for (const slug of slugs) {
    const journalPath = join(runsDir(cwd), slug, "journal.json");
    let events: Array<{ usage: EngineUsage; model: string | undefined; at: string }>;
    try {
      events = readUsageEvents(journalPath, store);
    } catch {
      events = [];
    }
    events = events.filter(({ at }) => {
      const time = Date.parse(at);
      return (period.since === undefined || time >= period.since) && (period.until === undefined || time <= period.until);
    });
    let attribution: RunContext | undefined;
    try {
      const context = new Journal(store, journalPath).read().find((entry) => entry.type === "RUN_CONTEXT")?.payload as RunContext & { engineId?: string } | undefined;
      if (context) attribution = { ...(context.agentId ? { agentId: context.agentId } : {}),
        providerId: context.providerId ?? context.engineId ?? "unattributed", integrationIds: context.integrationIds ?? [],
        attributionSource: context.attributionSource ?? "inferred", integrationMeaning: "enabled-context" };
    } catch { /* Legacy or corrupt attribution does not invent a source. */ }
    const sources = new Set<"reported" | "estimated" | "unknown">();

    let runIn = 0;
    let runOut = 0;
    let runCache = 0;
    let runCost: number | undefined;
    let runCount = 0;
    let pricedCount = 0;
    let latest = -Infinity;

    for (const { usage, model, at } of events) {
      const time = Date.parse(at);
      const tokensIn = usage.tokensIn ?? 0;
      const tokensOut = usage.tokensOut ?? 0;
      const cacheRead = usage.cacheRead ?? 0;

      runIn += tokensIn;
      runOut += tokensOut;
      runCache += cacheRead;

      const modelKey = model ?? "unknown";
      const existing = modelMap.get(modelKey);
      const costBrl = usage.costUsd !== undefined
        ? usage.costUsd * PRICING.usdToBrl
        : model
          ? estimateCost(model, tokensIn + cacheRead, tokensOut, cacheRead / (tokensIn + cacheRead || 1))
          : undefined;
      sources.add(usage.costUsd !== undefined ? "reported" : costBrl !== undefined ? "estimated" : "unknown");

      if (Number.isFinite(time)) {
        latest = Math.max(latest, time);
        const date = new Date(time);
        const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
        const daily = dayMap.get(day) ?? { day, totalCostBrl: undefined, pricedCount: 0, count: 0 };
        daily.count++;
        if (costBrl !== undefined) {
          daily.totalCostBrl = (daily.totalCostBrl ?? 0) + costBrl;
          daily.pricedCount++;
        }
        dayMap.set(day, daily);
      }

      if (existing) {
        existing.totalTokensIn += tokensIn;
        existing.totalTokensOut += tokensOut;
        existing.totalCacheRead += cacheRead;
        if (costBrl !== undefined) {
          existing.totalCostBrl = (existing.totalCostBrl ?? 0) + costBrl;
        }
        existing.count++;
      } else {
        modelMap.set(modelKey, {
          model: modelKey,
          totalTokensIn: tokensIn,
          totalTokensOut: tokensOut,
          totalCacheRead: cacheRead,
          totalCostBrl: costBrl,
          count: 1,
        });
      }

      if (costBrl !== undefined) {
        runCost = (runCost ?? 0) + costBrl;
        pricedCount++;
      }

      grandIn += tokensIn;
      grandOut += tokensOut;
      grandCache += cacheRead;
      if (costBrl !== undefined) {
        grandCost = (grandCost ?? 0) + costBrl;
      }

      runCount++;
    }

    if (runCount > 0) {
      runList.push({
        runSlug: slug,
        ...(Number.isFinite(latest) ? { recordedAt: new Date(latest).toISOString() } : {}),
        pricedCount,
        totalTokensIn: runIn,
        totalTokensOut: runOut,
        totalCacheRead: runCache,
        totalCostBrl: runCost,
        count: runCount,
        ...(attribution ? { attribution } : {}),
        model: [...new Set(events.map((event) => event.model ?? "unknown"))].join(", "),
        source: sources.size > 1 ? "mixed" : [...sources][0] ?? "unknown",
      });
    }
  }

  const dimensions = { agent: new Map<string, AttributionUsage>(), provider: new Map<string, AttributionUsage>(), task: new Map<string, AttributionUsage>(), integration: new Map<string, AttributionUsage>() };
  for (const run of runList) {
    const context = run.attribution;
    const ids = {
      agent: [context?.agentId ?? "unattributed"], provider: [context?.providerId ?? "unattributed"], task: [run.runSlug],
      integration: context?.integrationIds?.length ? [...new Set(context.integrationIds)] : ["unattributed"],
    };
    for (const dimension of Object.keys(dimensions) as (keyof typeof dimensions)[]) {
      const weight = 1 / ids[dimension].length;
      for (const id of ids[dimension]) {
        const group = dimensions[dimension].get(id) ?? { id, label: id === "unattributed" ? "Sem atribuição" : id, knownSumBrl: undefined, pricedCount: 0, unpricedCount: 0, totalTokensIn: 0, totalTokensOut: 0, runIds: [] };
        if (run.totalCostBrl !== undefined) group.knownSumBrl = (group.knownSumBrl ?? 0) + run.totalCostBrl * weight;
        group.pricedCount += run.pricedCount; group.unpricedCount += run.count - run.pricedCount;
        group.totalTokensIn += run.totalTokensIn * weight; group.totalTokensOut += run.totalTokensOut * weight;
        group.runIds.push(run.runSlug); dimensions[dimension].set(id, group);
      }
    }
  }

  return {
    cwd,
    byModel: [...modelMap.values()],
    byRun: runList,
    byDay: [...dayMap.values()],
    totalTokensIn: grandIn,
    totalTokensOut: grandOut,
    totalCacheRead: grandCache,
    totalCostBrl: runList.length ? grandCost : 0,
    byAttribution: Object.fromEntries(Object.entries(dimensions).map(([dimension, groups]) => [dimension, [...groups.values()]])) as UsageSnapshot["byAttribution"],
  };
}

/** Unknown costs stay distinct from a measured zero. */
export function formatSnapshotCost(snapshot: UsageSnapshot): string {
  return snapshot.totalCostBrl === undefined ? "—" : formatBRL(snapshot.totalCostBrl);
}
