// Formal checks over the control transition table: well-formedness, reachability,
// no traps, and a deterministic seeded walk used for property-style testing.

import { INITIAL_CONTROL_STATE, type ControlState } from "./control-state.js";
import { TRANSITIONS } from "./control-state.js";

type Table = Record<ControlState, readonly ControlState[]>;

export interface TableReport {
  ok: boolean;
  problems: string[];
}

function isTerminalIn(table: Table, state: ControlState): boolean {
  return table[state].length === 0;
}

/** Every target is a known state, and the table covers exactly the ControlState set. */
export function verifyTransitionTable(table: Table = TRANSITIONS): TableReport {
  const known = new Set(Object.keys(table) as ControlState[]);
  const problems: string[] = [];
  for (const from of known) {
    for (const to of table[from]) {
      if (!known.has(to)) problems.push(`${from} → unknown state '${to}'`);
      if (to === from) problems.push(`${from} has a self-loop (would risk a trap)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** States reachable from `start` (inclusive), via a DFS over the table. */
export function reachableFrom(start: ControlState, table: Table = TRANSITIONS): Set<ControlState> {
  const seen = new Set<ControlState>([start]);
  const stack: ControlState[] = [start];
  while (stack.length > 0) {
    const s = stack.pop() as ControlState;
    for (const to of table[s]) {
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return seen;
}

/** Whether some terminal state is reachable from `state` (no trap). */
export function canReachTerminal(state: ControlState, table: Table = TRANSITIONS): boolean {
  for (const s of reachableFrom(state, table)) if (isTerminalIn(table, s)) return true;
  return false;
}

/** Deterministic PRNG (mulberry32) — reproducible walks, no real randomness. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A legal-moves-only walk from `start`, stopping at a terminal or after `steps`. */
export function randomWalk(
  seed: number,
  steps: number,
  table: Table = TRANSITIONS,
  start: ControlState = INITIAL_CONTROL_STATE,
): ControlState[] {
  const rand = mulberry32(seed);
  const path: ControlState[] = [start];
  let cur = start;
  for (let i = 0; i < steps; i++) {
    const opts = table[cur];
    if (opts.length === 0) break;
    const next = opts[Math.floor(rand() * opts.length)] as ControlState;
    path.push(next);
    cur = next;
  }
  return path;
}
