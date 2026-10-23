import { describe, expect, it } from "vitest";
import { rowsAfter, rowsBefore, rowWeight, rowWeights, type MountControls } from "./mount-budget.js";
import type { GroupedRow } from "./grouping.js";
import type { Part } from "./parts.js";

const part = (): Part => ({ type: "text", text: "x", status: "completed" });
const partRow = (): GroupedRow => ({ type: "part", part: part() });
const groupRow = (n: number): GroupedRow => ({
  type: "group",
  group: { kind: "exploration", parts: Array.from({ length: n }, part) },
});

const controls = (over: Partial<MountControls> = {}): MountControls => ({
  expanded: () => false,
  grouped: () => true,
  ...over,
});

describe("rowWeight", () => {
  it("a standalone part costs 1", () => {
    expect(rowWeight(partRow(), controls())).toBe(1);
  });

  it("a collapsed group costs 1 regardless of size", () => {
    expect(rowWeight(groupRow(5), controls({ expanded: () => false }))).toBe(1);
  });

  it("an expanded group costs header + one per part", () => {
    expect(rowWeight(groupRow(3), controls({ expanded: () => true }))).toBe(4);
  });

  it("an ungrouped kind costs one per part, no header", () => {
    expect(rowWeight(groupRow(3), controls({ grouped: () => false }))).toBe(3);
  });
});

describe("rowsBefore / rowsAfter", () => {
  const weights = [1, 1, 5, 1, 1, 1]; // index 2 is an expanded group worth 5

  it("rowsBefore walks back until the budget is spent", () => {
    // from end=6, budget 3 → indices 5,4,3 spend 3 → start at 3
    expect(rowsBefore(weights, 6, 3)).toBe(3);
    // budget crosses the heavy row: 5,4,3 (3) then 2 (5) → start at 2
    expect(rowsBefore(weights, 6, 4)).toBe(2);
  });

  it("rowsAfter walks forward until the budget is spent", () => {
    expect(rowsAfter(weights, 0, 2)).toBe(2);
    // crossing the heavy row at index 2
    expect(rowsAfter(weights, 0, 3)).toBe(3);
  });

  it("clamps at the array bounds", () => {
    expect(rowsBefore(weights, 6, 999)).toBe(0);
    expect(rowsAfter(weights, 0, 999)).toBe(weights.length);
  });
});

describe("rowWeights", () => {
  it("maps weights across a mixed transcript", () => {
    const rows = [partRow(), groupRow(4), partRow()];
    expect(rowWeights(rows, controls({ expanded: () => false }))).toEqual([1, 1, 1]);
    expect(rowWeights(rows, controls({ expanded: () => true }))).toEqual([1, 5, 1]);
  });
});
