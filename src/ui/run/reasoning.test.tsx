import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { Reasoning, reasoningSteps, reasoningSummary } from "./reasoning.js";
import type { ReasoningPart } from "../../core/run/parts.js";

const part = (over: Partial<ReasoningPart> = {}): ReasoningPart => ({
  type: "reasoning",
  text: "Planning the approach. Then I will do it.",
  status: "completed",
  startedAt: 1000,
  endedAt: 3100,
  ...over,
});

describe("reasoningSummary", () => {
  it("extracts the first sentence, stripped of markdown", () => {
    expect(reasoningSummary("**Planning the approach**\nmore detail")).toBe("Planning the approach");
    expect(reasoningSummary("## Deciding the schema. Next step.")).toBe("Deciding the schema.");
  });

  it("truncates long titles and handles empty text", () => {
    expect(reasoningSummary("x".repeat(80)).endsWith("…")).toBe(true);
    expect(reasoningSummary("   \n  ")).toBe("");
  });
});

describe("reasoningSteps", () => {
  it("counts non-empty paragraphs, at least one", () => {
    expect(reasoningSteps("a\n\nb\n\nc")).toBe(3);
    expect(reasoningSteps("single")).toBe(1);
    expect(reasoningSteps("")).toBe(1);
  });
});

describe("<Reasoning>", () => {
  it("shows a thinking spinner line while streaming", () => {
    const { lastFrame } = render(<Reasoning part={part({ status: "streaming", text: "Planning the approach" })} />);
    expect(lastFrame()).toContain("⟳ Thinking: Planning the approach…");
  });

  it("collapses to a thought summary with steps and duration when done", () => {
    const { lastFrame } = render(<Reasoning part={part({ text: "A.\n\nB." })} />);
    const frame = lastFrame()!;
    expect(frame).toContain("+ Thought: A.");
    expect(frame).toContain("2 steps");
    expect(frame).toContain("2.1s");
  });

  it("expands to the full text with a left rule", () => {
    const { lastFrame } = render(<Reasoning part={part({ text: "line one\nline two" })} expanded />);
    const frame = lastFrame()!;
    expect(frame).toContain("│ line one");
    expect(frame).toContain("│ line two");
  });

  it("omits duration when the part has no end time", () => {
    const noEnd: ReasoningPart = { type: "reasoning", text: "one thought", status: "completed", startedAt: 0 };
    const { lastFrame } = render(<Reasoning part={noEnd} />);
    expect(lastFrame()).not.toMatch(/\d\.\ds/); // no "2.1s"-style duration
    expect(lastFrame()).toContain("1 step");
  });
});
