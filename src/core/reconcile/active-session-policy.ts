// ActiveSessionPolicy — classify the controlling session for native reconciliation.
// Derived from the HubStack clean-room behavioral spec (quality-gate, gate 10):
// the native path runs only when the session is bound to a run under the
// claude_code host with a live lease. Anything else is not an active controller.

import { isLive } from "../lease/types.js";
import type { NativeObservation, SessionActivity } from "./types.js";

/** Host identity required for the native controller path. */
export const NATIVE_HOST = "claude_code";

/**
 * `active`   — bound + claude_code host + live lease: the native reconciler runs.
 * `pending`  — indeterminate observation (binding unknown): no decision yet.
 * `inactive` — clearly no controller (unbound, wrong host, or dead/released lease).
 */
export function classify(obs: NativeObservation): SessionActivity {
  if (obs.binding === "bound" && obs.host === NATIVE_HOST && isLive(obs.lease, obs.now)) {
    return "active";
  }
  if (obs.binding === "unknown") return "pending";
  return "inactive";
}
