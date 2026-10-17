import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunLive } from "./run-live.js";
import type { EngineEvent } from "../core/engine/types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const events: EngineEvent[] = [
  { kind: "system", text: "init" },
  { kind: "tool_use", tool: "Bash" },
  { kind: "assistant", text: "working on it" },
];

describe("RunLive", () => {
  const noop = () => {};

  it("renders the status, event count and log lines", () => {
    const out = render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "";
    expect(out).toContain("RUNNING");
    expect(out).toContain("3 events");
    expect(out).toContain("Bash");
    expect(out).toContain("working on it");
  });

  it("shows a cancel hint while running and a back hint when terminal", () => {
    expect(render(<RunLive events={events} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("cancel run");
    expect(render(<RunLive events={events} state="PASSED" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("back to dashboard");
  });

  it("cancels on 'c' only while running", async () => {
    const onCancel = vi.fn();
    const r = render(<RunLive events={events} state="RUNNING" onCancel={onCancel} onBack={noop} />);
    r.stdin.write("c");
    await delay(20);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("goes back on 'b' only when terminal", async () => {
    const onBack = vi.fn();
    const r = render(<RunLive events={events} state="FAILED" onCancel={noop} onBack={onBack} />);
    r.stdin.write("b");
    await delay(20);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("summarizes earlier events when the log overflows", () => {
    const many: EngineEvent[] = Array.from({ length: 20 }, (_, i) => ({ kind: "assistant", text: `line ${i}` }));
    expect(render(<RunLive events={many} state="RUNNING" onCancel={noop} onBack={noop} />).lastFrame() ?? "").toContain("earlier events");
  });
});
