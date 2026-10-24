import { describe, it, expect } from "vitest";
import { visibleRange } from "./viewport.js";

describe("visibleRange", () => {
  const weights = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // 10 rows, each weight 1

  it("returns empty range for empty weights", () => {
    const r = visibleRange([], 0, 5, { follow: true });
    expect(r).toEqual({ start: 0, end: 0 });
  });

  it("follow=true pins to tail", () => {
    const r = visibleRange(weights, 0, 5, { follow: true });
    expect(r.end).toBe(10);
    expect(r.end - r.start).toBeLessThanOrEqual(5);
  });

  it("follow=false starts from anchor", () => {
    const r = visibleRange(weights, 2, 5, { follow: false });
    expect(r.start).toBe(2);
    expect(r.end).toBeLessThanOrEqual(10);
  });

  it("budget limits visible rows when follow=true", () => {
    const r = visibleRange(weights, 0, 3, { follow: true });
    expect(r.end - r.start).toBeLessThanOrEqual(3);
  });

  it("budget limits visible rows when follow=false", () => {
    const r = visibleRange(weights, 0, 4, { follow: false });
    expect(r.end - r.start).toBeLessThanOrEqual(4);
  });

  it("anchor is clamped to valid range", () => {
    const r = visibleRange(weights, 999, 5, { follow: false });
    expect(r.start).toBeLessThan(weights.length);
  });

  it("handles heavy rows (weight > 1)", () => {
    const heavyWeights = [3, 3, 3, 3]; // 4 rows, each 3 rendered lines
    const r = visibleRange(heavyWeights, 0, 5, { follow: true });
    // budget of 5 can fit at most 1 group of weight 3 before exceeding
    expect(r.end - r.start).toBeGreaterThanOrEqual(1);
  });
});
