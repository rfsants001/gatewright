// completion-gate (Stop) — coupled to native reconciliation like quality-gate.
// Clean-room (HubStack gate 13): the real typecheck/completion flow only fires
// inside the native controller path (bound + claude_code + live lease + recorded
// invocations). Outside that flow it fails open (accept). Output: block | advise |
// accept.

import type { Gate, GateContext, GateDecision } from "../core/gate/types.js";
import { NODE_NATIVE_CONTROLLER_INACTIVE } from "../core/reconcile/types.js";
import type { BindingStatus } from "../core/reconcile/types.js";
import type { ReconcileResult } from "../core/reconcile/native-node-reconciler.js";

export interface CompletionResolution {
  binding: BindingStatus;
  reconcile(): ReconcileResult;
}

export type CompletionResolver = (ctx: GateContext) => CompletionResolution | null;

export function completionGate(deps: { resolve?: CompletionResolver } = {}): Gate {
  return {
    name: "completion-gate",
    description: "On Stop, enforces run completion via native reconciliation; fails open off the native flow.",
    events: ["stop"],
    appliesTo: (ctx) => ctx.event === "stop",
    check: (ctx: GateContext): GateDecision => {
      const resolution = deps.resolve?.(ctx) ?? null;
      if (!resolution || resolution.binding !== "bound") return { kind: "allow" }; // fail-open
      const r = resolution.reconcile();
      if (r.status === "controller_inactive") {
        return { kind: "deny", reason: `[completion-gate] ${NODE_NATIVE_CONTROLLER_INACTIVE}: run has no active native controller.` };
      }
      return { kind: "allow" }; // reconciled | pending → accept
    },
  };
}
