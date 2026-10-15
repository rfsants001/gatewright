// Engine — run the applicable gates for a context and aggregate their decisions.

import type { Gate, GateContext, GateDecision } from "./types.js";

export interface GateError {
  gate: string;
  error: string;
}

export interface EngineResult {
  decision: GateDecision;
  /** Name of the gate that produced a deny, when the aggregate is a deny. */
  deniedBy?: string;
  /** Gates that threw (isolated, treated as allow — fail-open). */
  errors: GateError[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Evaluate gates in registration order. The first `deny` wins and short-circuits;
 * otherwise all `advise` messages are concatenated; otherwise `allow`.
 * A throwing gate is isolated (fail-open) and recorded in `errors`.
 */
export function runGates(gates: readonly Gate[], ctx: GateContext): EngineResult {
  const advices: string[] = [];
  const errors: GateError[] = [];

  for (const gate of gates) {
    let decision: GateDecision;
    try {
      if (!gate.appliesTo(ctx)) continue;
      decision = gate.check(ctx);
    } catch (error) {
      errors.push({ gate: gate.name, error: message(error) });
      continue;
    }
    if (decision.kind === "deny") return { decision, deniedBy: gate.name, errors };
    if (decision.kind === "advise") advices.push(decision.message);
  }

  if (advices.length > 0) return { decision: { kind: "advise", message: advices.join("\n\n") }, errors };
  return { decision: { kind: "allow" }, errors };
}
