import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunLive, cleanMarkdown, toLines } from "./run-live.js";
import type { EngineEvent } from "../core/engine/types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

describe("cleanMarkdown", () => {
  it("strips headings, bold/italic, inline code and links", () => {
    expect(cleanMarkdown("## Title **bold** `code` [x](http://y)")).toBe("Title bold code x");
    expect(cleanMarkdown("> quoted")).toBe("quoted");
  });
});

describe("toLines", () => {
  it("prefixes assistant text with a dot and strips markdown", () => {
    const [l] = toLines([{ kind: "assistant", text: "## Hello **world**" }]);
    expect(l?.text).toBe("● Hello world");
  });
  it("shows the tool and what it touched", () => {
    const [l] = toLines([{ kind: "tool_use", tool: "Read", detail: "src/foo.ts" }]);
    expect(l?.text).toContain("Read");
    expect(l?.text).toContain("src/foo.ts");
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

  it("shows cancel hint while running and back hint when terminal", () => {
    expect(render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("cancel");
    expect(render(<RunLive events={events} state="PASSED" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("b back");
  });

  it("cancels on 'c' only while running and goes back on 'b' when done", async () => {
    const onCancel = vi.fn();
    const r1 = render(<RunLive events={events} state="RUNNING" onCancel={onCancel} onBack={noop} />);
    r1.stdin.write("c");
    await delay(20);
    expect(onCancel).toHaveBeenCalledOnce();

    const onBack = vi.fn();
    const r2 = render(<RunLive events={events} state="FAILED" onCancel={noop} onBack={onBack} />);
    r2.stdin.write("b");
    await delay(20);
    expect(onBack).toHaveBeenCalledOnce();
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
