import { describe, expect, it } from "vitest";
import { appendPart, coerceVerbosity, groupParts, partPath, type GroupedRow } from "./grouping.js";
import type { Part, ReasoningPart, TextPart, ToolPart } from "./parts.js";

const text = (t = "hi"): TextPart => ({ type: "text", text: t, status: "completed" });
const reasoning = (): ReasoningPart => ({ type: "reasoning", text: "think", status: "completed", startedAt: 0 });
const tool = (canonicalName: string): ToolPart => ({
  type: "tool",
  name: canonicalName,
  canonicalName,
  input: {},
  status: "completed",
  startedAt: 0,
});

describe("partPath (medium default)", () => {
  it("groups reasoning and exploration tools, leaves mutations/text standalone", () => {
    expect(partPath(reasoning())).toBe("reasoning");
    expect(partPath(tool("read"))).toBe("exploration");
    expect(partPath(tool("grep"))).toBe("exploration");
    expect(partPath(tool("shell"))).toBeNull();
    expect(partPath(tool("edit"))).toBeNull();
    expect(partPath(text())).toBeNull();
  });

  it("never groups the question tool", () => {
    expect(partPath(tool("question"), "low")).toBeNull();
    expect(partPath(tool("question"), "medium")).toBeNull();
  });
});

describe("groupParts", () => {
  it("merges consecutive exploration tools into one group", () => {
    const rows = groupParts([tool("read"), tool("grep"), tool("read")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "group", group: { kind: "exploration" } });
    expect((rows[0] as Extract<GroupedRow, { type: "group" }>).group.parts).toHaveLength(3);
  });

  it("merges consecutive reasoning parts into one reasoning group", () => {
    const rows = groupParts([reasoning(), reasoning()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "group", group: { kind: "reasoning" } });
  });

  it("breaks a group when a standalone part interleaves", () => {
    const rows = groupParts([tool("read"), tool("read"), text(), tool("grep")]);
    expect(rows.map((r) => r.type)).toEqual(["group", "part", "group"]);
  });

  it("low verbosity folds every non-text part into one activity group", () => {
    const rows = groupParts([tool("read"), reasoning(), tool("shell"), tool("edit")], "low");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "group", group: { kind: "activity" } });
    expect((rows[0] as Extract<GroupedRow, { type: "group" }>).group.parts).toHaveLength(4);
  });

  it("high verbosity keeps everything standalone", () => {
    const parts: Part[] = [tool("read"), reasoning(), tool("read")];
    const rows = groupParts(parts, "high");
    expect(rows.every((r) => r.type === "part")).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it("text and question stay standalone even in low", () => {
    const rows = groupParts([text(), tool("question"), tool("read")], "low");
    expect(rows.map((r) => r.type)).toEqual(["part", "part", "group"]);
  });
});

describe("coerceVerbosity", () => {
  it("passes valid modes through and defaults everything else to medium", () => {
    expect(coerceVerbosity("low")).toBe("low");
    expect(coerceVerbosity("high")).toBe("high");
    expect(coerceVerbosity("medium")).toBe("medium");
    expect(coerceVerbosity(undefined)).toBe("medium");
    expect(coerceVerbosity("nonsense")).toBe("medium");
    expect(coerceVerbosity(42)).toBe("medium");
  });
});

describe("appendPart", () => {
  it("merges into the trailing group object without recreating it", () => {
    const rows: GroupedRow[] = [];
    appendPart(rows, tool("read"));
    const groupRef = rows[0];
    appendPart(rows, tool("grep"));
    // Same row object kept, parts array extended.
    expect(rows[0]).toBe(groupRef);
    expect(rows).toHaveLength(1);
    expect((rows[0] as Extract<GroupedRow, { type: "group" }>).group.parts).toHaveLength(2);
  });
});
