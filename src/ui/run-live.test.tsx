import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunLive, cleanMarkdown, toLines, wrap } from "./run-live.js";
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

describe("toLines", () => {
  it("prefixes assistant text with a dot and strips markdown", () => {
    const [l] = toLines([{ kind: "assistant", text: "## Hello **world**" }]);
    expect(l?.text).toBe("● Hello world");
  });

  it("wraps long assistant text across rows with a hanging indent, no ellipsis", () => {
    const lines = toLines([{ kind: "assistant", text: "alpha beta gamma delta" }], 12);
    expect(lines[0]?.text.startsWith("● ")).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => !l.text.includes("…"))).toBe(true);
    expect(lines[1]?.text.startsWith("  ")).toBe(true);
  });
  it("shows the tool and what it touched", () => {
    const [l] = toLines([{ kind: "tool_use", tool: "Read", detail: "src/foo.ts" }]);
    expect(l?.text).toContain("Read");
    expect(l?.text).toContain("src/foo.ts");
  });

  it("tints only the glyph/tool keyword, not the body", () => {
    const [l] = toLines([{ kind: "tool_use", tool: "Read", detail: "src/foo.ts" }]);
    expect(l?.leadColor).toBe("cyan");
    expect(l?.leadLen).toBe("→ Read ".length);
  });

  it("renders the final result in FULL with line breaks, tinting only the ✓ (not all green)", () => {
    const lines = toLines([{ kind: "result", text: "Done.\nSecond line." }], 80);
    expect(lines.map((l) => l.text)).toEqual(["✓ Done.", "  Second line."]);
    expect(lines[0]?.leadColor).toBe("green");
    expect(lines[0]?.leadLen).toBe(2);
    expect(lines[1]?.leadColor).toBeUndefined(); // continuation not colored
    expect(lines[1]?.color).toBeUndefined(); // body is not whole-green
  });
  it("shows a terse ✓ done when the result just repeats the streamed assistant text", () => {
    const lines = toLines([{ kind: "assistant", text: "Here is the answer." }, { kind: "result", text: "Here is the answer." }], 80);
    const texts = lines.map((l) => l.text);
    expect(texts).toContain("● Here is the answer.");
    expect(texts).toContain("✓ done");
    expect(texts.filter((t) => t.includes("Here is the answer")).length).toBe(1); // not duplicated
  });

  it("skips the init system line and empty assistant text", () => {
    expect(toLines([{ kind: "system", text: "init" }, { kind: "assistant", text: "" }])).toEqual([]);
  });
});

const events: EngineEvent[] = [
  { kind: "system", text: "started" },
  { kind: "tool_use", tool: "Read", detail: "src/foo.ts" },
  { kind: "assistant", text: "working on **it**" },
];

describe("RunLive", () => {
  it("renders status, count, the dot, and the tool target", () => {
    const out = render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "";
    expect(out).toContain("RUNNING");
    expect(out).toContain("3 events");
    expect(out).toContain("Read");
    expect(out).toContain("src/foo.ts");
    expect(out).toContain("● working on it");
    expect(out).not.toContain("**");
  });

  it("always offers back to the dashboard; cancel only while running", () => {
    expect(render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("cancel");
    expect(render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("dashboard");
    expect(render(<RunLive events={events} state="PASSED" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("dashboard");
  });

  it("'c' cancels but stays; 'b'/esc leave to the dashboard (cancelling a live run)", async () => {
    const onCancel = vi.fn();
    const onBack = vi.fn();
    const r1 = render(<RunLive events={events} state="RUNNING" onCancel={onCancel} onBack={onBack} />);
    r1.stdin.write("c"); // cancel, stay
    await delay(20);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();

    const c2 = vi.fn();
    const b2 = vi.fn();
    const r2 = render(<RunLive events={events} state="RUNNING" onCancel={c2} onBack={b2} />);
    r2.stdin.write("\x1B"); // esc → leave (cancels the live run first)
    await delay(20);
    expect(c2).toHaveBeenCalledOnce();
    expect(b2).toHaveBeenCalledOnce();

    const b3 = vi.fn();
    const r3 = render(<RunLive events={events} state="PASSED" onCancel={noop} onBack={b3} />);
    r3.stdin.write("b"); // done → just back
    await delay(20);
    expect(b3).toHaveBeenCalledOnce();
  });

  it("auto-follows the tail and scrolls back to the top with 'g'", async () => {
    const many: EngineEvent[] = Array.from({ length: 30 }, (_, i) => ({ kind: "assistant", text: `evt-${String(i + 1).padStart(3, "0")}` }));
    const r = render(<RunLive events={many} state="RUNNING" onCancel={noop} onBack={noop} />);
    let out = r.lastFrame() ?? "";
    expect(out).toContain("evt-030"); // tail visible
    expect(out).not.toContain("evt-001");
    expect(out).toContain("/30");
    r.stdin.write("g"); // jump to top
    await delay(20);
    out = r.lastFrame() ?? "";
    expect(out).toContain("evt-001");
  });
});
