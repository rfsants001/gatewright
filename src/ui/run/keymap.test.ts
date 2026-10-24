import { describe, it, expect } from "vitest";
import { handleKey, defaultCockpitState, type CockpitState } from "./keymap.js";

function state(overrides?: Partial<CockpitState>): CockpitState {
  return { ...defaultCockpitState(), ...overrides };
}

describe("handleKey", () => {
  it("v cycles verbosity low→medium→high→low", () => {
    let s = state({ verbosity: "low" });
    s = handleKey("v", false, s).state;
    expect(s.verbosity).toBe("medium");
    s = handleKey("v", false, s).state;
    expect(s.verbosity).toBe("high");
    s = handleKey("v", false, s).state;
    expect(s.verbosity).toBe("low");
  });

  it("e toggles expanded", () => {
    const s0 = state({ expanded: false });
    const r1 = handleKey("e", false, s0);
    expect(r1.state.expanded).toBe(true);
    const r2 = handleKey("e", false, r1.state);
    expect(r2.state.expanded).toBe(false);
  });

  it("t opens timeline", () => {
    const r = handleKey("t", false, state());
    expect(r.state.showTimeline).toBe(true);
    expect(r.action).toBe("open-timeline");
  });

  it("t closes timeline when open", () => {
    const r = handleKey("t", false, state({ showTimeline: true }));
    expect(r.state.showTimeline).toBe(false);
    expect(r.action).toBe("close-timeline");
  });

  it("p sets paused and emits pause action", () => {
    const r = handleKey("p", false, state());
    expect(r.state.paused).toBe(true);
    expect(r.action).toBe("pause");
  });

  it("r clears paused and emits resume action", () => {
    const r = handleKey("r", false, state({ paused: true }));
    expect(r.state.paused).toBe(false);
    expect(r.action).toBe("resume");
  });

  it("c toggles context bar", () => {
    const r = handleKey("c", false, state({ showContextBar: false }));
    expect(r.state.showContextBar).toBe(true);
  });

  it("q emits back action", () => {
    const r = handleKey("q", false, state());
    expect(r.action).toBe("back");
  });

  it("b emits back action", () => {
    const r = handleKey("b", false, state());
    expect(r.action).toBe("back");
  });

  it("esc emits back action", () => {
    const r = handleKey("", true, state());
    expect(r.action).toBe("back");
  });

  it("unknown key is a no-op", () => {
    const s = state();
    const r = handleKey("x", false, s);
    expect(r.state).toEqual(s);
    expect(r.action).toBeUndefined();
  });

  it("esc closes timeline when open", () => {
    const r = handleKey("", true, state({ showTimeline: true }));
    expect(r.state.showTimeline).toBe(false);
    expect(r.action).toBe("close-timeline");
  });
});
