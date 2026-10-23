import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../engine/types.js";
import { projectTurns } from "./project-turns.js";
import { isReasoningPart, isTextPart, isToolPart } from "./parts.js";

const assistant = (text: string): EngineEvent => ({ kind: "assistant", text });

describe("projectTurns", () => {
  it("aggregates consecutive assistant chunks into one text part", () => {
    const [turn] = projectTurns([assistant("Hello "), assistant("world"), assistant("!")]);
    expect(turn!.parts).toHaveLength(1);
    expect(isTextPart(turn!.parts[0]!)).toBe(true);
    expect((turn!.parts[0] as { text: string }).text).toBe("Hello world!");
  });

  it("pairs a tool_use with the following tool_result and marks it completed", () => {
    const raw = { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] } };
    const [turn] = projectTurns([
      { kind: "tool_use", tool: "Bash", detail: "ls", raw },
      { kind: "tool_result", detail: "file1\nfile2", raw: { type: "user", message: { content: [{ type: "tool_result", content: "file1" }] } } },
    ]);
    const tool = turn!.parts.find(isToolPart)!;
    expect(tool.canonicalName).toBe("shell");
    expect(tool.input).toEqual({ command: "ls" });
    expect(tool.status).toBe("completed");
    expect(tool.result).toBe("file1\nfile2");
  });

  it("marks a tool part errored when the result is an error", () => {
    const useRaw = { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "x" } }] } };
    const errRaw = { type: "user", message: { content: [{ type: "tool_result", is_error: true, content: "boom" }] } };
    const [turn] = projectTurns([
      { kind: "tool_use", tool: "Read", raw: useRaw },
      { kind: "tool_result", detail: "boom", raw: errRaw },
    ]);
    expect(turn!.parts.find(isToolPart)!.status).toBe("error");
  });

  it("matches multiple tool calls from one message to their inputs in order", () => {
    const raw = {
      type: "assistant",
      message: { content: [
        { type: "tool_use", name: "Read", input: { file_path: "a.ts" } },
        { type: "tool_use", name: "Read", input: { file_path: "b.ts" } },
      ] },
    };
    const turns = projectTurns([
      { kind: "tool_use", tool: "Read", raw },
      { kind: "tool_use", tool: "Read", raw },
    ]);
    const tools = turns[0]!.parts.filter(isToolPart);
    expect(tools.map((t) => t.input)).toEqual([{ file_path: "a.ts" }, { file_path: "b.ts" }]);
  });

  it("projects reasoning events into reasoning parts", () => {
    const [turn] = projectTurns([{ kind: "reasoning", text: "let me think" }, assistant("ok")]);
    expect(isReasoningPart(turn!.parts[0]!)).toBe(true);
    expect(isTextPart(turn!.parts[1]!)).toBe(true);
  });

  it("accumulates usage into the turn and computes the cache-hit ratio", () => {
    const [turn] = projectTurns([
      assistant("hi"),
      { kind: "usage", usage: { tokensIn: 100, tokensOut: 50, cacheRead: 300 } },
    ]);
    expect(turn!.tokensIn).toBe(100);
    expect(turn!.tokensOut).toBe(50);
    // cacheRead / (tokensIn + cacheRead) = 300 / 400 = 0.75
    expect(turn!.cacheHit).toBeCloseTo(0.75, 5);
  });

  it("splits turns on result events and assigns the prompt to the first turn", () => {
    const turns = projectTurns(
      [assistant("first"), { kind: "result", text: "done" }, assistant("second")],
      { userMessage: "go" },
    );
    expect(turns).toHaveLength(2);
    expect(turns[0]!.userMessage).toBe("go");
    expect(turns[1]!.userMessage).toBe("");
    expect((turns[1]!.parts[0] as { text: string }).text).toBe("second");
  });

  it("returns a single empty turn for an empty stream", () => {
    const turns = projectTurns([], { userMessage: "hi" });
    expect(turns).toHaveLength(1);
    expect(turns[0]!.parts).toHaveLength(0);
    expect(turns[0]!.userMessage).toBe("hi");
  });
});
