// ControlStateMachine — the run lifecycle, event-sourced over the journal.
// The current state is a projection of CONTROL_STATE_CHANGED events, so it can
// never diverge from the canonical log (replay/time-travel come for free).

import type { Journal } from "../journal/journal.js";
import type { ControlState } from "./control-state.js";
import { INITIAL_CONTROL_STATE } from "./control-state.js";

export const CONTROL_EVENT_TYPE = "CONTROL_STATE_CHANGED";

export interface ControlTransitionPayload {
  from: ControlState;
  to: ControlState;
  meta?: unknown;
}

export class ControlStateMachine {
  readonly #journal: Journal;

  constructor(journal: Journal) {
    this.#journal = journal;
  }

  /** Current state = fold of control events to the last `to`; no events → IDLE. */
  current(): ControlState {
    return this.#journal.project<ControlState>((state, event) => {
      if (event.type !== CONTROL_EVENT_TYPE) return state;
      return (event.payload as ControlTransitionPayload).to;
    }, INITIAL_CONTROL_STATE);
  }
}
