// Built-in replay projections: the control-state at a point, and a journal summary
// (event counts by type + the head hash at that point).

import type { JournalEvent } from "../journal/event.js";
import type { ControlState } from "../control/control-state.js";
import { INITIAL_CONTROL_STATE } from "../control/control-state.js";
import { CONTROL_EVENT_TYPE, type ControlTransitionPayload } from "../control/control-state-machine.js";
import type { Projection } from "./time-travel.js";

/** Reconstruct the control state as of the last CONTROL_STATE_CHANGED applied. */
export const controlStateProjection: Projection<ControlState> = {
  initial: INITIAL_CONTROL_STATE,
  apply(state, event) {
    if (event.type !== CONTROL_EVENT_TYPE) return state;
    return (event.payload as ControlTransitionPayload).to;
  },
};

export interface JournalSummary {
  total: number;
  byType: Record<string, number>;
  /** Head hash at this point (last applied event's hash), or "" when empty. */
  headHash: string;
}

/** Count events by type and track the head hash as of the point replayed. */
export const journalSummaryProjection: Projection<JournalSummary> = {
  initial: { total: 0, byType: {}, headHash: "" },
  apply(state, event: JournalEvent) {
    return {
      total: state.total + 1,
      byType: { ...state.byType, [event.type]: (state.byType[event.type] ?? 0) + 1 },
      headHash: event.hash,
    };
  },
};
