import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { TurnUsage, formatUsage, hasUsage } from "./turn-usage.js";
import type { Turn } from "../../core/run/parts.js";

const turn = (over: Partial<Turn> = {}): Turn => ({
  userMessage: "go",
  parts: [],
  tokensIn: 1247,
  tokensOut: 834,
  cacheHit: 0.78,
  ...over,
});

describe("hasUsage", () => {
  it("is true only when some tokens were reported", () => {
    expect(hasUsage(turn())).toBe(true);
    expect(hasUsage(turn({ tokensIn: 0, tokensOut: 0 }))).toBe(false);
  });
});

describe("formatUsage", () => {
  it("formats tokens, cache, cost and duration", () => {
    const line = formatUsage(turn(), "claude-sonnet-4-6", 2300);
    expect(line).toContain("↑ 1,247");
    expect(line).toContain("↓ 834");
    expect(line).toContain("cache 78%");
    expect(line).toContain("~R$");
    expect(line).toContain("2.3s");
  });

  it("omits cost for an unknown model and duration when absent", () => {
    const line = formatUsage(turn(), "mystery-llm");
    expect(line).not.toContain("R$");
    expect(line).not.toMatch(/\d\.\ds/);
    expect(line).toContain("cache 78%");
  });

  it("omits the cache segment when the ratio is unknown", () => {
    const noCache: Turn = { userMessage: "go", parts: [], tokensIn: 100, tokensOut: 50 };
    const line = formatUsage(noCache, "claude-sonnet-4-6");
    expect(line).not.toContain("cache");
  });

  it("returns empty for a turn with no usage", () => {
    expect(formatUsage(turn({ tokensIn: 0, tokensOut: 0 }), "claude-sonnet-4-6")).toBe("");
  });
});

describe("<TurnUsage>", () => {
  it("renders the usage line", () => {
    const { lastFrame } = render(<TurnUsage turn={turn()} model="claude-sonnet-4-6" durationMs={2300} />);
    expect(lastFrame()).toContain("↑ 1,247");
  });

  it("renders nothing when there is no usage", () => {
    const { lastFrame } = render(<TurnUsage turn={turn({ tokensIn: 0, tokensOut: 0 })} model="claude-sonnet-4-6" />);
    expect(lastFrame()).toBe("");
  });
});
