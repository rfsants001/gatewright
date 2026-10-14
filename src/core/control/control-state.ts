// Control lifecycle states and the legal-transition policy.

export type ControlState = "IDLE" | "RUNNING" | "PAUSED" | "PASSED" | "FAILED" | "CANCELLED";

/** Initial state of a run before any transition. */
export const INITIAL_CONTROL_STATE: ControlState = "IDLE";

/** Allowed target states per source state. Terminal states have no outgoing edges. */
export const TRANSITIONS: Record<ControlState, readonly ControlState[]> = {
  IDLE: ["RUNNING"],
  RUNNING: ["PAUSED", "PASSED", "FAILED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  PASSED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: ControlState, to: ControlState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: ControlState): boolean {
  return TRANSITIONS[state].length === 0;
}

export type ControlStateErrorCode = "ILLEGAL_TRANSITION";

export class ControlStateError extends Error {
  readonly code: ControlStateErrorCode;
  constructor(code: ControlStateErrorCode, message: string) {
    super(message);
    this.name = "ControlStateError";
    this.code = code;
  }
}
