// BudgetLedger — per-feature quota for Jev calls. Budget-aware like Laya: once a
// feature's quota is spent, Jev must abstain rather than keep consuming. Consumption
// is journal-backed so it survives restarts (replayed on construction).

import type { Journal } from "../journal/journal.js";

const EVENT_TYPE = "jev.budget";

export type ConsumeResult = { ok: true; remaining: number } | { ok: false; reason: "exhausted" };

export class BudgetLedger {
  readonly #journal: Journal;
  /** feature → max units (calls or tokens). Absent feature → unlimited. */
  readonly #quota: Map<string, number>;
  readonly #consumed = new Map<string, number>();

  constructor(quota: Record<string, number>, journal: Journal) {
    this.#journal = journal;
    this.#quota = new Map(Object.entries(quota));
    this.#replay();
  }

  /** Try to spend `cost` units for `feature`. Over quota → exhausted (spends nothing). */
  tryConsume(feature: string, cost = 1): ConsumeResult {
    const limit = this.#quota.get(feature);
    const used = this.#consumed.get(feature) ?? 0;
    if (limit !== undefined && used + cost > limit) return { ok: false, reason: "exhausted" };
    this.#consumed.set(feature, used + cost);
    this.#journal.append({ type: EVENT_TYPE, at: new Date().toISOString(), payload: { feature, cost } });
    return { ok: true, remaining: limit === undefined ? Infinity : limit - used - cost };
  }

  consumed(feature: string): number {
    return this.#consumed.get(feature) ?? 0;
  }

  #replay(): void {
    for (const event of this.#journal.read()) {
      if (event.type !== EVENT_TYPE) continue;
      const { feature, cost } = event.payload as { feature: string; cost: number };
      this.#consumed.set(feature, (this.#consumed.get(feature) ?? 0) + cost);
    }
  }
}
