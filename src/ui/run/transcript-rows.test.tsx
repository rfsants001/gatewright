import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { Box } from "ink";
import { buildTranscriptRows } from "./transcript-rows.js";
import type { Turn } from "../../core/run/parts.js";

const turn = (over: Partial<Turn> = {}): Turn => ({
  userMessage: "do the thing",
  parts: [
    { type: "text", text: "working on it", status: "completed" },
    { type: "tool", name: "Bash", canonicalName: "shell", input: { command: "ls" }, status: "completed", startedAt: 0 },
  ],
  tokensIn: 100,
  tokensOut: 50,
  cacheHit: 0.5,
  ...over,
});

describe("buildTranscriptRows", () => {
  it("keeps rows and groupedRows aligned 1:1", () => {
    const { rows, groupedRows } = buildTranscriptRows([turn()], { model: "claude-sonnet-4-6" });
    expect(rows.length).toBe(groupedRows.length);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("emits a prompt line, part rows and a usage line per turn", () => {
    // prompt + 2 parts (text, shell tool) + usage = 4 rows (medium verbosity: shell stands alone)
    const { rows, turnStarts } = buildTranscriptRows([turn()], { model: "claude-sonnet-4-6" });
    expect(turnStarts).toEqual([0]);
    expect(rows).toHaveLength(4);
  });

  it("records a turn start index per turn", () => {
    const { turnStarts } = buildTranscriptRows([turn(), turn({ userMessage: "second" })], {
      model: "claude-sonnet-4-6",
    });
    expect(turnStarts).toHaveLength(2);
    expect(turnStarts[0]).toBe(0);
    expect(turnStarts[1]).toBe(4);
  });

  it("omits the usage line when the turn has no usage", () => {
    const noUsage = turn({ tokensIn: 0, tokensOut: 0, parts: [{ type: "text", text: "hi", status: "completed" }] });
    const { rows } = buildTranscriptRows([noUsage], { model: "claude-sonnet-4-6" });
    // prompt + 1 text part, no usage row
    expect(rows).toHaveLength(2);
  });

  it("collapses an exploration run into one summary row (medium)", () => {
    const explore = turn({
      userMessage: "",
      tokensIn: 0,
      tokensOut: 0,
      parts: [
        { type: "tool", name: "Read", canonicalName: "read", input: { file_path: "a.ts" }, status: "completed", startedAt: 0 },
        { type: "tool", name: "Read", canonicalName: "read", input: { file_path: "b.ts" }, status: "completed", startedAt: 0 },
      ],
    });
    const { rows, groupedRows } = buildTranscriptRows([explore], { model: "claude-sonnet-4-6" });
    expect(rows).toHaveLength(1);
    expect(groupedRows[0]!.type).toBe("group");
  });

  it("renders into an Ink frame without crashing", () => {
    const { rows } = buildTranscriptRows([turn()], { model: "claude-sonnet-4-6" });
    const { lastFrame } = render(<Box flexDirection="column">{rows}</Box>);
    const frame = lastFrame()!;
    expect(frame).toContain("do the thing");
    expect(frame).toContain("working on it");
  });
});
