// Cockpit keymap — pure state machine. handleKey(key, state) → {state, action?}.
// Keys: v=cycle verbosity, e=expand/collapse, t=open timeline, p=pause,
// r=resume, c=toggle context bar, q/b/esc=back.

import type { Verbosity } from "../../core/run/grouping.js";

export type CockpitAction =
  | "back"
  | "cancel"
  | "pause"
  | "resume"
  | "open-timeline"
  | "close-timeline";

export interface CockpitState {
  verbosity: Verbosity;
  expanded: boolean;
  showContextBar: boolean;
  showTimeline: boolean;
  paused: boolean;
}

export interface KeyResult {
  state: CockpitState;
  action?: CockpitAction;
}

const VERBOSITY_CYCLE: Verbosity[] = ["low", "medium", "high"];

function nextVerbosity(v: Verbosity): Verbosity {
  const i = VERBOSITY_CYCLE.indexOf(v);
  return VERBOSITY_CYCLE[(i + 1) % VERBOSITY_CYCLE.length]!;
}

export function handleKey(
  input: string,
  keyEscape: boolean,
  state: CockpitState,
): KeyResult {
  // If timeline is open, only esc/t/q close it
  if (state.showTimeline) {
    if (keyEscape || input === "t" || input === "q" || input === "b") {
      return { state: { ...state, showTimeline: false }, action: "close-timeline" };
    }
    return { state };
  }

  switch (input) {
    case "v":
      return { state: { ...state, verbosity: nextVerbosity(state.verbosity) } };
    case "e":
      return { state: { ...state, expanded: !state.expanded } };
    case "t":
      return { state: { ...state, showTimeline: true }, action: "open-timeline" };
    case "p":
      return { state: { ...state, paused: true }, action: "pause" };
    case "r":
      return { state: { ...state, paused: false }, action: "resume" };
    case "c":
      return { state: { ...state, showContextBar: !state.showContextBar } };
    case "q":
    case "b":
      return { state, action: "back" };
    default:
      if (keyEscape) return { state, action: "back" };
      return { state };
  }
}

export function defaultCockpitState(verbosity: Verbosity = "medium"): CockpitState {
  return {
    verbosity,
    expanded: false,
    showContextBar: false,
    showTimeline: false,
    paused: false,
  };
}
