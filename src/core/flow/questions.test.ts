import { describe, expect, it } from "vitest";
import { parseQuestions, hasQuestions, stripQuestions } from "./questions.js";

const block = (json: string) => `blah blah\n<gate-ask>\n${json}\n</gate-ask>\ntrailing`;

describe("parseQuestions", () => {
  it("parses a questions array with ids defaulted", () => {
    const qs = parseQuestions(
      block(JSON.stringify({ questions: [{ type: "text", prompt: "Goal?" }, { id: "scope", type: "select", prompt: "Scope?", options: ["MVP", "Full"] }] })),
    );
    expect(qs).toEqual([
      { id: "q1", type: "text", prompt: "Goal?" },
      { id: "scope", type: "select", prompt: "Scope?", options: ["MVP", "Full"] },
    ]);
  });

  it("accepts a bare array too", () => {
    expect(parseQuestions(block(JSON.stringify([{ type: "confirm", prompt: "Ship it?" }]))).map((q) => q.type)).toEqual(["confirm"]);
  });

  it("drops select/multiselect without options and unknown types", () => {
    const qs = parseQuestions(block(JSON.stringify([{ type: "select", prompt: "no opts" }, { type: "weird", prompt: "x" }, { type: "multiselect", prompt: "areas", options: ["a", "b"] }])));
    expect(qs.map((q) => q.type)).toEqual(["multiselect"]);
  });

  it("returns [] for no block or invalid JSON", () => {
    expect(parseQuestions("nothing here")).toEqual([]);
    expect(parseQuestions("<gate-ask>{ not json </gate-ask>")).toEqual([]);
    expect(hasQuestions("plain text")).toBe(false);
    expect(hasQuestions(block(JSON.stringify([{ type: "text", prompt: "hi" }])))).toBe(true);
  });
});

describe("stripQuestions", () => {
  it("removes the gate-ask block and trims surrounding prose", () => {
    expect(stripQuestions(block(JSON.stringify([{ type: "text", prompt: "hi" }])))).toBe("blah blah\n\ntrailing");
  });

  it("leaves text without a block untouched", () => {
    expect(stripQuestions("just prose")).toBe("just prose");
  });

  it("is empty when the text is only a block", () => {
    expect(stripQuestions("<gate-ask>[]</gate-ask>")).toBe("");
  });
});
