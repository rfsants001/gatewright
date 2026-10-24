import { describe, it, expect } from "vitest";
import { contextBar } from "./context-bar.js";

describe("contextBar", () => {
  it("returns 0% when used is 0", () => {
    const r = contextBar(0, 200_000);
    expect(r.pct).toBe(0);
    expect(r.color).toBe("green");
  });

  it("formats 67% correctly", () => {
    const r = contextBar(134_000, 200_000);
    expect(r.pct).toBe(67);
    expect(r.label).toContain("67%");
    expect(r.label).toContain("134k/200k");
    expect(r.color).toBe("yellow");
  });

  it("colors red above 80%", () => {
    const r = contextBar(170_000, 200_000);
    expect(r.pct).toBe(85);
    expect(r.color).toBe("red");
  });

  it("colors yellow between 60% and 80%", () => {
    const r = contextBar(130_000, 200_000);
    expect(r.color).toBe("yellow");
  });

  it("colors green below 60%", () => {
    const r = contextBar(100_000, 200_000);
    expect(r.color).toBe("green");
  });

  it("bar contains filled and empty glyphs", () => {
    const r = contextBar(100_000, 200_000);
    expect(r.label).toContain("█");
    expect(r.label).toContain("░");
  });

  it("handles zero total gracefully", () => {
    const r = contextBar(0, 0);
    expect(r.pct).toBe(0);
    expect(r.color).toBe("green");
  });
});
