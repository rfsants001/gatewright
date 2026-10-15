// Native reconciliation contracts — the observation of the controlling session and
// the native start/stop invocations that drive graph-node transitions.

import type { Lease } from "../lease/types.js";

/** Whether the session is bound to a run, and to which kind of host controller. */
export type BindingStatus = "bound" | "unbound" | "unknown";

/**
 * A snapshot of the controlling session: is it bound to a run, under which host,
 * and is its lease live. The reconciler decides the native path from this alone —
 * injectable so it is unit-testable without forging on-disk run state.
 */
export interface NativeObservation {
  runSlug: string;
  binding: BindingStatus;
  /** Host identity of the lease holder, e.g. "claude_code". */
  host: string;
  lease: Lease | null;
  /** Wall clock (ms) used to judge lease liveness. */
  now: number;
}

export type InvocationKind = "start" | "stop";
export type InvocationOutcome = "passed" | "failed";

/** A recorded native subagent invocation, keyed to a run and a node selector. */
export interface Invocation {
  runSlug: string;
  /** Matches a graph node id. */
  selector: string;
  kind: InvocationKind;
  /** Present on `stop`; drives markPassed/markFailed. */
  outcome?: InvocationOutcome;
  /** ISO-8601 timestamp. */
  at: string;
}

/** Classification of the controlling session for native reconciliation. */
export type SessionActivity = "active" | "pending" | "inactive";

export const NODE_NATIVE_CONTROLLER_INACTIVE = "NODE_NATIVE_CONTROLLER_INACTIVE";
