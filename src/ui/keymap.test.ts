import { describe, it, expect } from "vitest";
import {
  emptyStack,
  pushLayer,
  popLayer,
  resolveKey,
  activeBindings,
  encodeKey,
  COMPOSER_LAYER,
  GATE_DECISION_LAYER,
  NORMAL_LAYER,
} from "./keymap.js";

describe("resolveKey", () => {
  it("resolves global key", () => {
    const stack = emptyStack();
    expect(resolveKey(stack, "ctrl+s")).toBe("sidebar-toggle");
  });
  it("resolves normal layer key", () => {
    const stack = emptyStack();
    expect(resolveKey(stack, "j")).toBe("scroll-down");
  });
  it("top layer shadows lower layer", () => {
    const stack = pushLayer(emptyStack(), COMPOSER_LAYER);
    // esc is in composer layer → composer-toggle, not normal layer back
    expect(resolveKey(stack, "esc")).toBe("composer-toggle");
  });
  it("returns null for unknown key", () => {
    const stack = emptyStack();
    expect(resolveKey(stack, "z")).toBeNull();
  });
  it("resolves gate-decision keys when pushed", () => {
    const stack = pushLayer(emptyStack(), GATE_DECISION_LAYER);
    expect(resolveKey(stack, "a")).toBe("gate-approve");
    expect(resolveKey(stack, "d")).toBe("gate-deny");
  });
});

describe("popLayer", () => {
  it("removes top layer", () => {
    const stack = pushLayer(emptyStack(), COMPOSER_LAYER);
    const popped = popLayer(stack);
    expect(resolveKey(popped, "esc")).toBeNull();
    expect(resolveKey(popped, "j")).toBe("scroll-down");
  });
  it("does not pop below 1 layer", () => {
    const s = { layers: [NORMAL_LAYER] };
    expect(popLayer(s).layers).toHaveLength(1);
  });
});

describe("activeBindings", () => {
  it("deduplicates by action", () => {
    const stack = emptyStack();
    const bindings = activeBindings(stack);
    const actions = bindings.map((b) => b.action);
    const unique = new Set(actions);
    expect(actions.length).toBe(unique.size);
  });
});

describe("encodeKey", () => {
  it("encodes ctrl", () => {
    expect(encodeKey("s", { ctrl: true })).toBe("ctrl+s");
  });
  it("encodes escape", () => {
    expect(encodeKey("", { escape: true })).toBe("esc");
  });
  it("encodes plain key", () => {
    expect(encodeKey("j", {})).toBe("j");
  });
});
