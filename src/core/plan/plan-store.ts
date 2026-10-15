// Plan store — event-sourced plan proposal and approval over the journal.
// Only an APPROVED revision becomes the active plan (approval is the human gate).

import type { Journal } from "../journal/journal.js";
import type { Plan } from "./plan.js";

export const PLAN_PROPOSED = "PLAN_PROPOSED";
export const PLAN_APPROVED = "PLAN_APPROVED";

export function proposePlan(journal: Journal, plan: Plan): void {
  journal.append({ type: PLAN_PROPOSED, payload: { plan }, at: new Date().toISOString() });
}

export function approvePlan(journal: Journal, revision: string, approver?: string): void {
  journal.append({
    type: PLAN_APPROVED,
    payload: approver === undefined ? { revision } : { revision, approver },
    at: new Date().toISOString(),
  });
}

interface PlanProjection {
  proposed: Map<string, Plan>;
  approved: string | null;
}

/** The latest approved plan, reconstructed from the journal. A proposed-but-unapproved plan does not count. */
export function activePlan(journal: Journal): Plan | null {
  const state = journal.project<PlanProjection>(
    (acc, event) => {
      if (event.type === PLAN_PROPOSED) {
        const plan = (event.payload as { plan: Plan }).plan;
        acc.proposed.set(plan.revision, plan);
      } else if (event.type === PLAN_APPROVED) {
        acc.approved = (event.payload as { revision: string }).revision;
      }
      return acc;
    },
    { proposed: new Map<string, Plan>(), approved: null },
  );
  return state.approved ? state.proposed.get(state.approved) ?? null : null;
}
