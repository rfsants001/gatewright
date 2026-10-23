import { describe, expect, it } from "vitest";
import { canonicalToolName, EXPLORATION_TOOLS, pathLabel, toolInputSummary } from "./tool-display.js";

describe("canonicalToolName", () => {
  it("remaps engine-specific names to canonical lowercase forms", () => {
    expect(canonicalToolName("Bash")).toBe("shell");
    expect(canonicalToolName("run_in_terminal")).toBe("shell");
    expect(canonicalToolName("Task")).toBe("subagent");
    expect(canonicalToolName("Agent")).toBe("subagent");
    expect(canonicalToolName("apply_patch")).toBe("patch");
    expect(canonicalToolName("MultiEdit")).toBe("edit");
  });

  it("lowercases unknown/unmapped names unchanged", () => {
    expect(canonicalToolName("Read")).toBe("read");
    expect(canonicalToolName("WebFetch")).toBe("webfetch");
    expect(canonicalToolName("WebSearch")).toBe("websearch");
    expect(canonicalToolName("TodoWrite")).toBe("todowrite");
    expect(canonicalToolName("SomeCustomTool")).toBe("somecustomtool");
  });

  it("exposes exploration tools as canonical names", () => {
    for (const name of ["read", "glob", "grep", "webfetch", "websearch"]) {
      expect(EXPLORATION_TOOLS.has(name)).toBe(true);
    }
    expect(EXPLORATION_TOOLS.has("shell")).toBe(false);
  });
});

describe("toolInputSummary", () => {
  it("shell: collapses and truncates the command to 60 chars", () => {
    expect(toolInputSummary("shell", { command: "npm   test" })).toBe("npm test");
    const long = "echo " + "x".repeat(80);
    expect(toolInputSummary("shell", { command: long })).toHaveLength(60);
    expect(toolInputSummary("shell", { command: long }).endsWith("…")).toBe(true);
  });

  it("read: relativizes the file path to cwd when given", () => {
    expect(toolInputSummary("read", { file_path: "/repo/src/foo.ts" }, "/repo")).toBe("src/foo.ts");
    expect(toolInputSummary("read", { file_path: "/repo/src/foo.ts" })).toBe("/repo/src/foo.ts");
    // Outside cwd stays absolute, not ../.. noise.
    expect(toolInputSummary("read", { file_path: "/other/x.ts" }, "/repo")).toBe("/other/x.ts");
  });

  it("write: path plus added line count from content", () => {
    expect(toolInputSummary("write", { file_path: "/r/a.ts", content: "l1\nl2\nl3" }, "/r")).toBe("a.ts +3");
    expect(toolInputSummary("write", { file_path: "/r/a.ts" }, "/r")).toBe("a.ts");
  });

  it("edit: path plus +new -old line delta", () => {
    expect(
      toolInputSummary("edit", { file_path: "/r/a.ts", old_string: "x", new_string: "y\nz" }, "/r"),
    ).toBe("a.ts +2 -1");
  });

  it("patch: added/removed delta from the diff body", () => {
    const patch = "--- a\n+++ b\n+added one\n+added two\n-removed one";
    expect(toolInputSummary("patch", { patch })).toBe("+2 -1");
  });

  it("glob/grep: pattern plus base path", () => {
    expect(toolInputSummary("grep", { pattern: "useState", path: "/r/src" }, "/r")).toBe("useState  src");
    expect(toolInputSummary("glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("subagent: first 60 chars of the task description", () => {
    expect(toolInputSummary("subagent", { description: "Implement auth" })).toBe("Implement auth");
  });

  it("webfetch: domain of the url", () => {
    expect(toolInputSummary("webfetch", { url: "https://docs.example.com/path?q=1" })).toBe("docs.example.com");
  });

  it("websearch: the query", () => {
    expect(toolInputSummary("websearch", { query: "ink testing" })).toBe("ink testing");
  });

  it("fallback: [k=v] dump of primitive fields", () => {
    expect(toolInputSummary("unknowntool", { a: 1, b: "x", c: { nested: true } })).toBe("[a=1, b=x]");
    expect(toolInputSummary("unknowntool", {})).toBe("");
  });
});

describe("pathLabel", () => {
  it("returns the basename of a path", () => {
    expect(pathLabel("/a/b/c.ts")).toBe("c.ts");
    expect(pathLabel("")).toBe("");
  });
});
