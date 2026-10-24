import { describe, it, expect } from "vitest";
import { formatStatusBar } from "./status-bar.js";

describe("formatStatusBar", () => {
  it("includes model name, tokens, state", () => {
    const result = formatStatusBar({
      model: "claude-sonnet",
      tokensIn: 10000,
      tokensOut: 5000,
      elapsedMs: 90000,
      state: "running",
    });
    expect(result).toContain("claude-sonnet");
    expect(result).toContain("↑10.0k");
    expect(result).toContain("↓5.0k");
    expect(result).toContain("1m30s");
    expect(result).toContain("RUNNING");
  });

  it("shows cache pct when cacheHit provided", () => {
    const result = formatStatusBar({
      model: "claude-haiku",
      tokensIn: 100,
      tokensOut: 50,
      cacheHit: 0.72,
      elapsedMs: 5000,
      state: "passed",
    });
    expect(result).toContain("cache72%");
    expect(result).toContain("PASSED");
  });

  it("shows phase in brackets", () => {
    const result = formatStatusBar({
      model: "m",
      tokensIn: 0,
      tokensOut: 0,
      elapsedMs: 0,
      phase: "planning",
      state: "idle",
    });
    expect(result).toContain("[planning]");
  });

  it("short model from path", () => {
    const result = formatStatusBar({
      model: "anthropic/claude-sonnet-4",
      tokensIn: 0,
      tokensOut: 0,
      elapsedMs: 0,
      state: "idle",
    });
    expect(result).toContain("claude-sonnet-4");
    expect(result).not.toContain("anthropic/");
  });
});
