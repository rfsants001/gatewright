import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { CompactionRow, compactionLabel, formatTokens } from "./compaction-row.js";

describe("formatTokens", () => {
  it("compacts thousands and millions", () => {
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(42_000)).toBe("42k");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("compactionLabel", () => {
  it("states saved tokens and, optionally, the new context size", () => {
    expect(compactionLabel(42_000)).toBe("Context compacted · saved 42k tokens");
    expect(compactionLabel(42_000, 38_000)).toBe("Context compacted · saved 42k tokens · now 38k");
  });
});

describe("<CompactionRow>", () => {
  it("renders the separator with saved tokens", () => {
    const { lastFrame } = render(<CompactionRow savedTokens={42_000} newContextTokens={38_000} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Context compacted");
    expect(frame).toContain("saved 42k tokens");
    expect(frame).toContain("now 38k");
    expect(frame).toContain("─");
  });
});
