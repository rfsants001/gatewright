import { describe, it, expect } from "vitest";
import {
  tailFirst,
  loadOlderChunk,
  anchorTop,
  clampAnchor,
  navToMessage,
} from "./transcript-mount.js";

describe("tailFirst", () => {
  it("returns 0 for fewer rows than tail", () => {
    expect(tailFirst(10)).toBe(0);
  });
  it("returns start of last 40 rows", () => {
    expect(tailFirst(100)).toBe(60);
  });
  it("respects custom tail", () => {
    expect(tailFirst(50, 20)).toBe(30);
  });
});

describe("loadOlderChunk", () => {
  it("subtracts chunk size", () => {
    expect(loadOlderChunk(60)).toBe(0);
  });
  it("clamps to 0", () => {
    expect(loadOlderChunk(10)).toBe(0);
  });
  it("custom size", () => {
    expect(loadOlderChunk(80, 20)).toBe(60);
  });
});

describe("anchorTop", () => {
  it("adds delta", () => {
    expect(anchorTop(5, 3)).toBe(8);
  });
  it("clamps to 0", () => {
    expect(anchorTop(2, -10)).toBe(0);
  });
});

describe("clampAnchor", () => {
  it("stays in range", () => {
    expect(clampAnchor(50, 100)).toBe(50);
    expect(clampAnchor(200, 100)).toBe(99);
    expect(clampAnchor(-1, 100)).toBe(0);
  });
  it("returns 0 for empty", () => {
    expect(clampAnchor(5, 0)).toBe(0);
  });
});

describe("navToMessage", () => {
  const starts = [0, 10, 20, 30];
  it("finds next turn start", () => {
    expect(navToMessage(starts, 5, "next")).toBe(10);
  });
  it("finds prev turn start", () => {
    expect(navToMessage(starts, 15, "prev")).toBe(10);
  });
  it("returns null at end", () => {
    expect(navToMessage(starts, 30, "next")).toBeNull();
  });
  it("returns null at start", () => {
    expect(navToMessage(starts, 0, "prev")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(navToMessage([], 0, "next")).toBeNull();
  });
});
