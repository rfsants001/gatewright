import { describe, it, expect } from "vitest";
import {
  slashFilter,
  enqueuePrompt,
  drainQueue,
  attachFile,
  removeFile,
  cycleTab,
  selectModel,
  defaultComposerState,
} from "./composer-state.js";

const CMDS = [
  { name: "help", description: "show help" },
  { name: "history", description: "show history" },
  { name: "quit", description: "quit" },
];

describe("slashFilter", () => {
  it("returns all when empty query", () => {
    expect(slashFilter("", CMDS)).toHaveLength(3);
  });
  it("filters by prefix", () => {
    expect(slashFilter("h", CMDS).map((c) => c.name)).toEqual(["help", "history"]);
  });
  it("case insensitive", () => {
    expect(slashFilter("H", CMDS).map((c) => c.name)).toEqual(["help", "history"]);
  });
});

describe("enqueue / drain", () => {
  it("queues and drains in order", () => {
    let s = defaultComposerState();
    s = enqueuePrompt(s, "a");
    s = enqueuePrompt(s, "b");
    const r1 = drainQueue(s);
    expect(r1).not.toBeNull();
    expect(r1![0]).toBe("a");
    const r2 = drainQueue(r1![1]);
    expect(r2![0]).toBe("b");
    expect(drainQueue(r2![1])).toBeNull();
  });
});

describe("attachFile / removeFile", () => {
  it("adds and removes files", () => {
    let s = defaultComposerState();
    s = attachFile(s, "a.ts");
    s = attachFile(s, "b.ts");
    expect(s.attachedFiles).toEqual(["a.ts", "b.ts"]);
    s = removeFile(s, 0);
    expect(s.attachedFiles).toEqual(["b.ts"]);
  });
  it("no duplicate", () => {
    let s = defaultComposerState();
    s = attachFile(s, "a.ts");
    s = attachFile(s, "a.ts");
    expect(s.attachedFiles).toHaveLength(1);
  });
});

describe("cycleTab", () => {
  it("cycles forward", () => {
    const s = defaultComposerState();
    expect(cycleTab(s, 1).activeTab).toBe("Context");
    expect(cycleTab(cycleTab(s, 1), 1).activeTab).toBe("Gates");
    expect(cycleTab(cycleTab(cycleTab(s, 1), 1), 1).activeTab).toBe("Prompt");
  });
  it("cycles backward", () => {
    const s = defaultComposerState();
    expect(cycleTab(s, -1).activeTab).toBe("Gates");
  });
});

describe("selectModel", () => {
  it("sets and clears model", () => {
    const s = defaultComposerState();
    expect(selectModel(s, "claude-haiku").selectedModel).toBe("claude-haiku");
    expect(selectModel(selectModel(s, "x"), null).selectedModel).toBeNull();
  });
});
