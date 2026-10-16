// JevDecisionEngine — orchestrates one advisory judgment: check budget, ask the
// adapter, wrap the result in an Action Card, and log it to the journal. Never
// blocks: when disabled or out of budget it abstains without calling the model.

import type { Journal } from "../journal/journal.js";
import type { BudgetLedger } from "./budget.js";
import { ABSTAIN, type ActionCard, type JevAdapter, type JevContext, type JevJudgment } from "./types.js";
import type { Calibration } from "./feedback/types.js";

/** Returns the learned calibration for a feature (confidence scaling from corrections). */
export type Calibrator = (feature: string) => Calibration;

export interface JevEngineOptions {
  enabled?: boolean;
  /** Optional feedback-driven calibration; scales confidence, never the verdict. */
  calibrator?: Calibrator;
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
  readonly #calibrator: Calibrator | undefined;

  constructor(adapter: JevAdapter, budget: BudgetLedger, journal: Journal, opts: JevEngineOptions = {}) {
    this.#adapter = adapter;
    this.#budget = budget;
    this.#journal = journal;
    this.#enabled = opts.enabled ?? false;
    this.#calibrator = opts.calibrator;
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
    const card = this.#calibrate(feature, toCard(ctx, judgment, []));
    this.#log(card, ctx);
    return card;
  }

  /** Scale the card's confidence by the feature's learned calibration. Verdict untouched. */
  #calibrate(feature: string, card: ActionCard): ActionCard {
    if (!this.#calibrator) return card;
    const { confidenceScale, agreementRate, samples } = this.#calibrator(feature);
    if (confidenceScale >= 1 || samples === 0) return card;
    return {
      ...card,
      confidence: Math.min(1, Math.max(0, card.confidence * confidenceScale)),
      evidence: [...card.evidence, `calibrated ×${confidenceScale.toFixed(2)} (agreement ${(agreementRate * 100).toFixed(0)}% over ${samples})`],
    };
  }

  #log(card: ActionCard, ctx: JevContext): void {
    this.#journal.append({
      type: "jev.decision",
      at: new Date().toISOString(),
      payload: { feature: ctx.feature, verdict: card.verdict, confidence: card.confidence, model: this.#adapter.model, summary: ctx.summary },
    });
  }
}
