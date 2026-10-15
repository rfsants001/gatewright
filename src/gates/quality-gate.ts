// quality-gate (SubagentStop) — two paths, chosen by the controlling-session binding.
// Clean-room (HubStack gate 10): when the session is bound under the native host it
// delegates 100% to native reconciliation (text heuristic never runs); controller
// inactive → block. For non-native hosts it falls back to a handoff-quality text
// heuristic. No run-state resolver wired → legacy path.

import type { Gate, GateContext, GateDecision } from "../core/gate/types.js";
import { NODE_NATIVE_CONTROLLER_INACTIVE } from "../core/reconcile/types.js";
import type { BindingStatus } from "../core/reconcile/types.js";
import type { ReconcileResult } from "../core/reconcile/native-node-reconciler.js";

/** What the gate needs to know about the run behind a SubagentStop. */
export interface QualityResolution {
  binding: BindingStatus;
  /** Run native reconciliation; only consulted when `binding === "bound"`. */
  reconcile(): ReconcileResult;
}

export type QualityResolver = (ctx: GateContext) => QualityResolution | null;

const ENVELOPE_SIGNALS = /\b(status|produced|produzi|next|próximos?|gaps?|lacunas?|risks?|riscos?|handoff)\b/i;
const GENERIC = /^\s*(ok|done|feito|pronto)\.?\s*$|^\s*no (results|output|changes)\b|^\s*nenhum/i;

function legacyHeuristic(message: string | undefined): GateDecision {
  const text = (message ?? "").trim();
  if (text.length < 50) {
    return { kind: "deny", reason: "[quality-gate] handoff too short (<50 chars) — summarize what was done." };
  }
  if (GENERIC.test(text)) {
    return { kind: "deny", reason: "[quality-gate] generic handoff — describe the actual outcome, not just 'done'." };
  }
  if (text.length >= 240 && !ENVELOPE_SIGNALS.test(text)) {
    return { kind: "deny", reason: "[quality-gate] missing Handoff Envelope — add status · produced · next · gaps · risks." };
  }
  return { kind: "allow" };
}

export function qualityGate(deps: { resolve?: QualityResolver } = {}): Gate {
  return {
    name: "quality-gate",
    description: "Gates subagent handoffs: native reconciliation when bound, else a handoff-quality heuristic.",
    events: ["subagent-stop"],
    appliesTo: (ctx) => ctx.event === "subagent-stop",
    check: (ctx: GateContext): GateDecision => {
      const resolution = deps.resolve?.(ctx) ?? null;
      if (resolution && resolution.binding === "bound") {
        // Native path — the text heuristic never runs.
        const r = resolution.reconcile();
        if (r.status === "controller_inactive") {
          return { kind: "deny", reason: `[quality-gate] ${NODE_NATIVE_CONTROLLER_INACTIVE}: native controller is not active.` };
        }
        return { kind: "allow" }; // reconciled | pending → accept
      }
      // Legacy path (non-native host or no run-state wired).
      return legacyHeuristic(ctx.lastMessage);
    },
  };
}
