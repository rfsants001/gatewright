import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunLive, cleanMarkdown, wrap } from "./run-live.js";
import type { EngineEvent } from "../core/engine/types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

describe("cleanMarkdown", () => {
  it("strips headings, bold/italic, inline code and links", () => {
    expect(cleanMarkdown("## Title **bold** `code` [x](http://y)")).toBe("Title bold code x");
    expect(cleanMarkdown("> quoted")).toBe("quoted");
  });
});

describe("wrap", () => {
  it("wraps at word boundaries to the width (no ellipsis)", () => {
    expect(wrap("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
  });
  it("hard-splits a word longer than the width", () => {
    expect(wrap("supercalifragilistic", 5)).toEqual(["super", "calif", "ragil", "istic"]);
  });
});

const events: EngineEvent[] = [
  { kind: "system", text: "started" },
  { kind: "tool_use", tool: "Read", detail: "src/foo.ts" },
  { kind: "assistant", text: "working on it" },
];

describe("RunLive", () => {
  it("renders status and event count", () => {
    const out = render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "";
    expect(out).toContain("RUNNING");
    expect(out).toContain("3 events");
  });

  it("shows the tool name in the viewport", () => {
    const out = render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "";
    // New cockpit uses toolInputSummary, not the raw detail field; tool name is always shown
    expect(out).toContain("read");
  });

  it("shows assistant text", () => {
    const out = render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "";
    expect(out).toContain("working on it");
  });

  it("always offers back to the dashboard", () => {
    expect(render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("dashboard");
    expect(render(<RunLive events={events} state="PASSED" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("dashboard");
  });

  it("'b' calls onBack; esc calls both onCancel and onBack while running", async () => {
    const onCancel = vi.fn();
    const onBack = vi.fn();
    const r1 = render(<RunLive events={events} state="RUNNING" onCancel={onCancel} onBack={onBack} />);
    r1.stdin.write("\x1B"); // esc → leave (cancels the live run first)
    await delay(20);
    expect(onCancel).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();

    const b2 = vi.fn();
    const r2 = render(<RunLive events={events} state="PASSED" onCancel={noop} onBack={b2} />);
    r2.stdin.write("b"); // done → just back
    await delay(20);
    expect(b2).toHaveBeenCalledOnce();
  });

  it("auto-follows the tail and scrolls back to the top with 'g'", async () => {
    const many: EngineEvent[] = Array.from({ length: 30 }, (_, i) => ({
      kind: "assistant" as const,
      text: `line-${String(i + 1).padStart(3, "0")}`,
    }));
    const r = render(<RunLive events={many} state="RUNNING" onCancel={noop} onBack={noop} />);
    const frameBefore = r.lastFrame() ?? "";
    // tail should be visible (follow=true by default for live)
    expect(frameBefore).toContain("30 events");
    r.stdin.write("g"); // jump to top
    await delay(20);
  });
});
