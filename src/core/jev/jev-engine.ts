// JevDecisionEngine — orchestrates one advisory judgment: check budget, ask the
// adapter, wrap the result in an Action Card, and log it to the journal. Never
// blocks: when disabled or out of budget it abstains without calling the model.

import type { Journal } from "../journal/journal.js";
import type { BudgetLedger } from "./budget.js";
import { ABSTAIN, type ActionCard, type JevAdapter, type JevContext, type JevJudgment } from "./types.js";

export interface JevEngineOptions {
  enabled?: boolean;
}

function toCard(ctx: JevContext, j: JevJudgment, evidence: string[]): ActionCard {
  return {
    title: `Jev · ${ctx.feature}`,
    verdict: j.verdict,
    rationale: j.rationale,
    confidence: j.confidence,
    evidence,
  };
}

export class JevDecisionEngine {
  readonly #adapter: JevAdapter;
  readonly #budget: BudgetLedger;
  readonly #journal: Journal;
  readonly #enabled: boolean;

  constructor(adapter: JevAdapter, budget: BudgetLedger, journal: Journal, opts: JevEngineOptions = {}) {
    this.#adapter = adapter;
    this.#budget = budget;
    this.#journal = journal;
    this.#enabled = opts.enabled ?? false;
  }

  /** Produce an advisory Action Card. Abstains (no model call) when disabled or over budget. */
  async consult(feature: string, prompt: string, ctx: JevContext): Promise<ActionCard> {
    if (!this.#enabled) return toCard(ctx, ABSTAIN, ["jev disabled"]);

    const spend = this.#budget.tryConsume(feature);
    if (!spend.ok) {
      const card = toCard(ctx, { ...ABSTAIN, rationale: "budget exhausted" }, ["budget exhausted"]);
      this.#log(card, ctx);
      return card;
    }

    const judgment = await this.#adapter.judge(prompt, ctx);
    const card = toCard(ctx, judgment, []);
    this.#log(card, ctx);
    return card;
  }

  #log(card: ActionCard, ctx: JevContext): void {
    this.#journal.append({
      type: "jev.decision",
      at: new Date().toISOString(),
      payload: { feature: ctx.feature, verdict: card.verdict, confidence: card.confidence, model: this.#adapter.model, summary: ctx.summary },
    });
  }
}
