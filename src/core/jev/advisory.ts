// Advisory seam — how Jev attaches to a gate without changing its decision.
// Gates are synchronous; Jev is async. The host resolves a Jev Action Card ahead of
// time and injects it through this sync `Advisor` closure. `withAdvisory` only
// annotates an existing advise/deny message — it never flips allow↔deny, so a gate's
// deterministic decision is preserved (Jev stays advisory to the human gate).

import type { GateContext, GateDecision } from "../gate/types.js";
import type { ActionCard } from "./types.js";

export type Advisor = (ctx: GateContext) => ActionCard | null;

function note(card: ActionCard): string {
  return ` [jev:${card.verdict} ${Math.round(card.confidence * 100)}% — ${card.rationale}]`;
}

/** Attach a Jev advisory to an already-messaging decision. No-op on allow/abstain/absent. */
export function withAdvisory(decision: GateDecision, advisor: Advisor | undefined, ctx: GateContext): GateDecision {
  if (!advisor || decision.kind === "allow") return decision;
  const card = advisor(ctx);
  if (!card || card.verdict === "abstain") return decision;
  if (decision.kind === "advise") return { kind: "advise", message: decision.message + note(card) };
  return { kind: "deny", reason: decision.reason + note(card) };
}
