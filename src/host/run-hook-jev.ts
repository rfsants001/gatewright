// Live hook runner with Jev. Runs the deterministic gates first (fast, always), then
// — on Stop, only when a judgment gate already flagged something and Jev is enabled —
// consults the local model and appends its advisory Action Card to the message. The
// deterministic decision (allow/advise/deny) is never changed by Jev.

import { runGates } from "../core/gate/engine.js";
import type { GateDecision } from "../core/gate/types.js";
import { defaultRegistry } from "./run-hook.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { jevAdvise } from "../core/jev/hook-advisory.js";
import type { HostAdapter, HostOutput } from "./types.js";

export async function runHookWithJev(raw: string, adapter: HostAdapter = claudeCodeAdapter): Promise<HostOutput> {
  try {
    const ctx = adapter.parse(raw);
    if (!ctx) return { stdout: "", exitCode: 0 };

    const result = runGates(defaultRegistry().list(), ctx);
    let decision = result.decision;

    if (ctx.event === "stop" && (decision.kind === "advise" || decision.kind === "deny")) {
      const base = decision.kind === "advise" ? decision.message : decision.reason;
      const card = await jevAdvise("proportion-gate", `A turn's diff looks disproportionate. ${base} Is this over-reach or justified?`);
      if (card) {
        const note = ` [jev:${card.verdict} ${Math.round(card.confidence * 100)}% — ${card.rationale}]`;
        decision = decision.kind === "advise" ? { kind: "advise", message: decision.message + note } : { kind: "deny", reason: decision.reason + note };
      }
    }

    return adapter.render({ ...result, decision } satisfies { decision: GateDecision } & typeof result, ctx);
  } catch {
    return { stdout: "", exitCode: 0 };
  }
}
