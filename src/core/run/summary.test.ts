import { describe, expect, it } from "vitest";
import { busyLabel, summarizeGroup } from "./summary.js";
import type { Part, PartStatus, ReasoningPart, ToolPart } from "./parts.js";

const tool = (canonicalName: string, status: PartStatus = "completed"): ToolPart => ({
  type: "tool",
  name: canonicalName,
  canonicalName,
  input: {},
  status,
  startedAt: 0,
});
const reasoning = (status: PartStatus = "completed", text = "thought"): ReasoningPart => ({
  type: "reasoning",
  text,
  status,
  startedAt: 0,
});

describe("summarizeGroup", () => {
  it("counts finished work by type with correct pluralization and stable order", () => {
    const parts: Part[] = [
      tool("shell"),
      tool("shell"),
      tool("shell"),
      tool("edit"),
      reasoning(),
      reasoning(),
      tool("read"),
      tool("read"),
      tool("read"),
      tool("read"),
    ];
    expect(summarizeGroup(parts).label).toBe("3 commands, 1 edit, 2 thoughts, 4 reads");
  });

  it("maps write/patch to edit and non-read exploration to tool", () => {
    expect(summarizeGroup([tool("write"), tool("patch")]).label).toBe("2 edits");
    expect(summarizeGroup([tool("grep"), tool("webfetch")]).label).toBe("2 tools");
  });

  it("excludes running parts from counts and reports active", () => {
    const s = summarizeGroup([tool("shell"), tool("read", "running")]);
    expect(s.active).toBe(true);
    expect(s.label).toBe("1 command");
  });

  it("falls back to the first active busy label when nothing has finished", () => {
    const s = summarizeGroup([tool("shell", "running")]);
    expect(s.active).toBe(true);
    expect(s.label).toBe("Running command…");
  });

  it("ignores redacted (empty) reasoning as a thought", () => {
    expect(summarizeGroup([reasoning("completed", "   ")]).label).toBe("");
  });
});

describe("busyLabel", () => {
  it("labels reasoning, running and streaming tools", () => {
    expect(busyLabel(reasoning("streaming"))).toBe("Thinking…");
    expect(busyLabel(tool("shell", "running"))).toBe("Running command…");
    expect(busyLabel(tool("edit", "streaming"))).toBe("Preparing edit…");
    expect(busyLabel(tool("read", "running"))).toBe("Running read…");
  });
});
