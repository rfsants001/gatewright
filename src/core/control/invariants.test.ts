import { describe, expect, it } from "vitest";
import { canTransition, INITIAL_CONTROL_STATE, isTerminal, TRANSITIONS, type ControlState } from "./control-state.js";
import { canReachTerminal, randomWalk, reachableFrom, verifyTransitionTable } from "./invariants.js";

const STATES = Object.keys(TRANSITIONS) as ControlState[];

describe("control transition invariants", () => {
  it("the transition table is well-formed (known targets, no self-loops)", () => {
    expect(verifyTransitionTable()).toEqual({ ok: true, problems: [] });
  });

  it("every state is reachable from IDLE", () => {
    const reached = reachableFrom(INITIAL_CONTROL_STATE);
    expect([...reached].sort()).toEqual([...STATES].sort());
  });

  it("every non-terminal state can reach a terminal (no traps)", () => {
    for (const s of STATES) {
      if (!isTerminal(s)) expect(canReachTerminal(s)).toBe(true);
    }
  });

  it("exhaustive (from,to) legality matches canTransition", () => {
    for (const from of STATES) {
      for (const to of STATES) {
        expect(canTransition(from, to)).toBe(TRANSITIONS[from].includes(to));
      }
    }
  });

  it("verifyTransitionTable flags unknown targets and self-loops", () => {
    const broken = { ...TRANSITIONS, IDLE: ["RUNNING", "GHOST" as ControlState], RUNNING: ["RUNNING" as ControlState] };
    const report = verifyTransitionTable(broken as Record<ControlState, readonly ControlState[]>);
    expect(report.ok).toBe(false);
    expect(report.problems.some((p) => p.includes("unknown state 'GHOST'"))).toBe(true);
    expect(report.problems.some((p) => p.includes("self-loop"))).toBe(true);
  });

  it("1000 seeded walks only make legal moves and always terminate", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const path = randomWalk(seed, 200);
      for (let i = 1; i < path.length; i++) {
        expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
        expect(STATES).toContain(path[i]!);
      }
      expect(isTerminal(path[path.length - 1]!)).toBe(true); // deterministic: reached a terminal
    }
  });

  it("randomWalk is reproducible for a given seed", () => {
    expect(randomWalk(42, 50)).toEqual(randomWalk(42, 50));
  });
});
