// EvidenceProgress — tracks which of a goal's done-when criteria have evidence.
// Evidence is journal-backed (replayable); progress is derived from the log.

import type { Journal } from "../journal/journal.js";
import type { Goal } from "./types.js";

const EVENT_TYPE = "goal.evidence";

export interface Progress {
  covered: string[];
  missing: string[];
  total: number;
}

export class EvidenceProgress {
  readonly #journal: Journal;
  readonly #runSlug: string;
  readonly #goal: Goal;

  constructor(journal: Journal, runSlug: string, goal: Goal) {
    this.#journal = journal;
    this.#runSlug = runSlug;
    this.#goal = goal;
  }

  /** Attach evidence to a criterion. Criteria outside the goal are still recorded but ignored by progress. */
  record(criterion: string, evidence: string, at: string = new Date().toISOString()): void {
    this.#journal.append({ type: EVENT_TYPE, at, payload: { runSlug: this.#runSlug, criterion, evidence } });
  }

  /** Criteria from the goal that have at least one piece of evidence. */
  coveredCriteria(): Set<string> {
    const covered = new Set<string>();
    const criteria = new Set(this.#goal.criteria);
    for (const event of this.#journal.read()) {
      if (event.type !== EVENT_TYPE) continue;
      const p = event.payload as { runSlug: string; criterion: string };
      if (p.runSlug === this.#runSlug && criteria.has(p.criterion)) covered.add(p.criterion);
    }
    return covered;
  }

  progress(): Progress {
    const covered = this.coveredCriteria();
    const missing = this.#goal.criteria.filter((c) => !covered.has(c));
    return { covered: [...covered].sort(), missing, total: this.#goal.criteria.length };
  }
}
