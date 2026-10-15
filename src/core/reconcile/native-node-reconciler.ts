// NativeNodeReconciler — the native path of quality/completion gates.
// Clean-room (HubStack gate 10): with an active controller (bound + claude_code +
// live lease) and recorded invocations, fold them into the graph; active but no
// invocation yet → pending (ignored:false); no active controller → block.

import type { Journal } from "../journal/journal.js";
import type { ExecutionGraph } from "../graph/execution-graph.js";
import { classify } from "./active-session-policy.js";
import { NodeExecutionService } from "./node-execution-service.js";
import type { NativeInvocationStore } from "./native-invocation-store.js";
import { NODE_NATIVE_CONTROLLER_INACTIVE, type NativeObservation } from "./types.js";

export type ReconcileResult =
  | { status: "reconciled"; applied: number; ignored: string[] }
  | { status: "pending"; ignored: false }
  | { status: "controller_inactive"; code: typeof NODE_NATIVE_CONTROLLER_INACTIVE };

export class NativeNodeReconciler {
  readonly #store: NativeInvocationStore;
  readonly #journal: Journal;

  constructor(store: NativeInvocationStore, journal: Journal) {
    this.#store = store;
    this.#journal = journal;
  }

  reconcile(obs: NativeObservation, graph: ExecutionGraph): ReconcileResult {
    const result = this.#decide(obs, graph);
    this.#journal.append({
      type: "reconcile.decision",
      at: new Date(obs.now).toISOString(),
      payload: { runSlug: obs.runSlug, status: result.status },
    });
    return result;
  }

  #decide(obs: NativeObservation, graph: ExecutionGraph): ReconcileResult {
    if (classify(obs) !== "active") {
      return { status: "controller_inactive", code: NODE_NATIVE_CONTROLLER_INACTIVE };
    }
    const invocations = this.#store.forRun(obs.runSlug);
    if (invocations.length === 0) return { status: "pending", ignored: false };
    const { applied, ignored } = new NodeExecutionService(graph).applyAll(invocations);
    return { status: "reconciled", applied, ignored };
  }
}
