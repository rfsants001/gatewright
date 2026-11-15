// Live hook runner with advisor port. Runs the deterministic gates first (fast, always),
// then — on Stop, only when a judgment gate already flagged something — resolves the
// active Advisor and appends its verdict to the message. The deterministic decision
// (allow/advise/deny) is never changed by the advisor.
//
// The active advisor is determined by resolveAdvisor(ctx.cwd):
//   - null → no advisor configured or jev explicitly disabled; skip consulting entirely.
//   - JevAdvisor (default) → delegates to jevAdvise(), which reads JevConfigStore and
//     returns null when jev.config.enabled is false (behavior identical to before this refactor).
//   - ExternalAdvisor → stub until R2-005 wires the transport (returns null/abstain).

import { runGates } from "../core/gate/engine.js";
import type { GateDecision } from "../core/gate/types.js";
import { defaultRegistry } from "./run-hook.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { resolveAdvisor } from "../core/jev/advisor.js";
import type { HostAdapter, HostOutput } from "./types.js";

export async function runHookWithJev(raw: string, adapter: HostAdapter = claudeCodeAdapter): Promise<HostOutput> {
  try {
    const ctx = adapter.parse(raw);
    if (!ctx) return { stdout: "", exitCode: 0 };

    const result = runGates(defaultRegistry().list(), ctx);
    let decision = result.decision;

    if (ctx.event === "stop" && (decision.kind === "advise" || decision.kind === "deny")) {
      const base = decision.kind === "advise" ? decision.message : decision.reason;
      const advisor = resolveAdvisor(ctx.cwd);
      if (advisor) {
        const verdict = await advisor.advise("proportion-gate", `A turn's diff looks disproportionate. ${base} Is this over-reach or justified?`);
        if (verdict && verdict.verdict !== "abstain") {
          const confidence = verdict.confidence !== undefined ? Math.round(verdict.confidence * 100) : 0;
          const note = ` [jev:${verdict.verdict} ${confidence}% — ${verdict.rationale ?? ""}]`;
          decision = decision.kind === "advise" ? { kind: "advise", message: decision.message + note } : { kind: "deny", reason: decision.reason + note };
        }
      }
    }

    return adapter.render({ ...result, decision } satisfies { decision: GateDecision } & typeof result, ctx);
  } catch {
    return { stdout: "", exitCode: 0 };
  }
}
