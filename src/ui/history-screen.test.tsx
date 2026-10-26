import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { HistoryScreen } from "./history-screen.js";

describe("HistoryScreen", () => {
  it("wraps its content in the shared AppFrame chrome", () => {
    const { lastFrame } = render(<HistoryScreen onBack={() => {}} onQuit={() => {}} />);
    const frame = lastFrame()!;
    expect(frame).toContain("gatewright"); // compact header
    expect(frame).toContain("history"); // breadcrumb
    expect(frame).toContain("q quit"); // KeyHints footer
  });
});
