import { describe, expect, it } from "vitest";
import { statusColor, categoryColor, PRIMARY, SUCCESS, ERROR, WARNING, DIM } from "./theme.js";

describe("statusColor", () => {
  it("maps run states to the cockpit palette", () => {
    expect(statusColor("RUNNING")).toBe(PRIMARY);
    expect(statusColor("PASSED")).toBe(SUCCESS);
    expect(statusColor("FAILED")).toBe(ERROR);
    expect(statusColor("PAUSED")).toBe(WARNING);
    expect(statusColor("CANCELLED")).toBe(WARNING);
    expect(statusColor("IDLE")).toBe(DIM);
  });

  it("maps generic health words too", () => {
    expect(statusColor("ok")).toBe(SUCCESS);
    expect(statusColor("warn")).toBe(WARNING);
    expect(statusColor("bad")).toBe(ERROR);
    expect(statusColor("idle")).toBe(DIM);
  });
});

describe("categoryColor", () => {
  it("colors known skill categories and falls back to white", () => {
    expect(categoryColor("architecture")).toBe(MUTEDish());
    expect(categoryColor("development")).toBe(SUCCESS);
    expect(categoryColor("sdd")).toBe(WARNING);
    expect(categoryColor("unknown")).toBe("white");
  });
});

// architecture maps to MUTED ("blue"); keep the assertion readable.
function MUTEDish(): string {
  return "blue";
}
