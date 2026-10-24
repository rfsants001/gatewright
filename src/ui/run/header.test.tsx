import { describe, it, expect } from "vitest";
import { formatHeader } from "./header.js";

describe("formatHeader", () => {
  it("includes model name", () => {
    const line = formatHeader({ model: "claude-sonnet", tokensIn: 0, tokensOut: 0, elapsedMs: 0 });
    expect(line).toContain("claude-sonnet");
  });

  it("strips namespace prefix from model", () => {
    const line = formatHeader({ model: "anthropic/claude-opus", tokensIn: 0, tokensOut: 0, elapsedMs: 0 });
    expect(line).toContain("claude-opus");
    expect(line).not.toContain("anthropic/");
  });

  it("formats token counts", () => {
    const line = formatHeader({ model: "m", tokensIn: 1247, tokensOut: 834, elapsedMs: 0 });
    expect(line).toContain("↑1,247");
    expect(line).toContain("↓834");
  });

  it("includes cost for known model", () => {
    const line = formatHeader({ model: "sonnet", tokensIn: 1000, tokensOut: 500, elapsedMs: 0 });
    expect(line).toMatch(/~R\$/);
  });

  it("omits cost for unknown model", () => {
    const line = formatHeader({ model: "unknown-model-xyz", tokensIn: 1000, tokensOut: 500, elapsedMs: 0 });
    expect(line).not.toMatch(/~R\$/);
  });

  it("formats elapsed seconds only", () => {
    const line = formatHeader({ model: "m", tokensIn: 0, tokensOut: 0, elapsedMs: 42000 });
    expect(line).toContain("42s");
  });

  it("formats elapsed with minutes", () => {
    const line = formatHeader({ model: "m", tokensIn: 0, tokensOut: 0, elapsedMs: 83000 });
    expect(line).toContain("1m23s");
  });

  it("shows phase when provided", () => {
    const line = formatHeader({ model: "m", tokensIn: 0, tokensOut: 0, elapsedMs: 0, phase: "plan" });
    expect(line).toContain("plan");
  });

  it("shows pause glyph when paused", () => {
    const line = formatHeader({ model: "m", tokensIn: 0, tokensOut: 0, elapsedMs: 0, paused: true });
    expect(line).toContain("⏸");
  });

  it("omits pause glyph when not paused", () => {
    const line = formatHeader({ model: "m", tokensIn: 0, tokensOut: 0, elapsedMs: 0, paused: false });
    expect(line).not.toContain("⏸");
  });
});
