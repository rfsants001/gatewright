import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dimStyle, reasoningStyle, toolStyle } from "./colors.js";

describe("toolStyle", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
  });

  it("maps each category to its color", () => {
    expect(toolStyle("read")).toEqual({ color: "blue" });
    expect(toolStyle("grep")).toEqual({ color: "blue" });
    expect(toolStyle("edit")).toEqual({ color: "yellow" });
    expect(toolStyle("patch")).toEqual({ color: "yellow" });
    expect(toolStyle("shell")).toEqual({ color: "green" });
    expect(toolStyle("subagent")).toEqual({ color: "magenta" });
    expect(toolStyle("skill")).toEqual({ color: "cyan" });
    expect(toolStyle("todowrite")).toEqual({ color: "cyan" });
  });

  it("question is white + bold for max emphasis", () => {
    expect(toolStyle("question")).toEqual({ color: "white", bold: true });
  });

  it("unknown tools get no color", () => {
    expect(toolStyle("mysterytool")).toEqual({});
  });

  it("reasoning is dim amber", () => {
    expect(reasoningStyle()).toEqual({ color: "yellow", dimColor: true });
  });

  it("NO_COLOR drops color and dim but keeps bold", () => {
    process.env.NO_COLOR = "1";
    expect(toolStyle("read")).toEqual({});
    expect(toolStyle("question")).toEqual({ bold: true });
    expect(reasoningStyle()).toEqual({});
    expect(dimStyle()).toEqual({});
  });
});
