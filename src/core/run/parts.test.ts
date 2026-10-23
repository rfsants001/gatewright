import { describe, expect, it } from "vitest";
import {
  isPartActive,
  isReasoningPart,
  isTextPart,
  isToolPart,
  partDurationMs,
  type Part,
  type ReasoningPart,
  type TextPart,
  type ToolPart,
  type Turn,
} from "./parts.js";

const text: TextPart = { type: "text", text: "hi", status: "completed" };
const tool: ToolPart = {
  type: "tool",
  name: "Bash",
  canonicalName: "shell",
  input: { command: "npm test" },
  status: "running",
  startedAt: 1000,
};
const reasoning: ReasoningPart = { type: "reasoning", text: "thinking…", status: "streaming", startedAt: 0 };

describe("part type guards", () => {
  it("discriminate on the type field", () => {
    expect(isTextPart(text)).toBe(true);
    expect(isToolPart(text)).toBe(false);
    expect(isToolPart(tool)).toBe(true);
    expect(isReasoningPart(reasoning)).toBe(true);
    expect(isReasoningPart(tool)).toBe(false);
  });

  it("narrow the union for safe field access", () => {
    const parts: Part[] = [text, tool, reasoning];
    const names = parts.filter(isToolPart).map((p) => p.canonicalName);
    expect(names).toEqual(["shell"]);
  });
});

describe("isPartActive", () => {
  it("is true for streaming/running, false otherwise", () => {
    expect(isPartActive(reasoning)).toBe(true);
    expect(isPartActive(tool)).toBe(true);
    expect(isPartActive(text)).toBe(false);
    expect(isPartActive({ ...tool, status: "error" })).toBe(false);
  });
});

describe("partDurationMs", () => {
  it("returns elapsed ms once ended, undefined while running", () => {
    expect(partDurationMs(tool)).toBeUndefined();
    expect(partDurationMs({ ...tool, endedAt: 4200 })).toBe(3200);
  });
});

describe("Turn", () => {
  it("carries tokens and cache ratio but no cost field", () => {
    const turn: Turn = { userMessage: "go", parts: [text], tokensIn: 10, tokensOut: 5, cacheHit: 0.78 };
    expect(turn.parts).toHaveLength(1);
    expect("cost" in turn).toBe(false);
    expect("costR$" in turn).toBe(false);
  });
});
