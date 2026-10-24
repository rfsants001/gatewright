import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { ToolPart, displayName, statusTag } from "./tool-part.js";
import type { ToolPart as ToolPartModel, PartStatus } from "../../core/run/parts.js";

const tool = (canonicalName: string, input: unknown, over: Partial<ToolPartModel> = {}): ToolPartModel => ({
  type: "tool",
  name: canonicalName,
  canonicalName,
  input,
  status: "completed",
  startedAt: 1000,
  endedAt: 4200,
  ...over,
});

describe("displayName", () => {
  it("renames a few tools for readability", () => {
    expect(displayName("subagent")).toBe("agent");
    expect(displayName("webfetch")).toBe("fetch");
    expect(displayName("todowrite")).toBe("todo");
    expect(displayName("shell")).toBe("shell");
  });
});

describe("statusTag", () => {
  it("shows running, error, and completed duration", () => {
    expect(statusTag(tool("shell", {}, { status: "running" }))).toBe("[running…]");
    expect(statusTag(tool("shell", {}, { status: "error" }))).toBe("[error]");
    expect(statusTag(tool("shell", {}))).toBe("[3.2s]");
  });
});

describe("<ToolPart>", () => {
  it("renders shell with command and duration", () => {
    const { lastFrame } = render(<ToolPart part={tool("shell", { command: "npm test" })} />);
    const frame = lastFrame()!;
    expect(frame).toContain("→ shell");
    expect(frame).toContain("npm test");
    expect(frame).toContain("[3.2s]");
  });

  it("renders read with a relative path", () => {
    const { lastFrame } = render(<ToolPart part={tool("read", { file_path: "/r/src/foo.ts" })} cwd="/r" />);
    const frame = lastFrame()!;
    expect(frame).toContain("→ read");
    expect(frame).toContain("src/foo.ts");
  });

  it("renders edit with a line delta", () => {
    const { lastFrame } = render(
      <ToolPart part={tool("edit", { file_path: "/r/a.ts", old_string: "x", new_string: "y\nz" })} cwd="/r" />,
    );
    expect(lastFrame()).toContain("→ edit");
    expect(lastFrame()).toContain("a.ts +2 -1");
  });

  it("renders subagent as agent with the task", () => {
    const { lastFrame } = render(<ToolPart part={tool("subagent", { description: "Implement auth" })} />);
    expect(lastFrame()).toContain("→ agent");
    expect(lastFrame()).toContain("Implement auth");
  });

  it("renders a running tool with the running tag", () => {
    const { lastFrame } = render(<ToolPart part={tool("grep", { pattern: "useState", path: "/r/src" }, { status: "running" })} cwd="/r" />);
    expect(lastFrame()).toContain("[running…]");
  });

  it("shows the result below when expanded", () => {
    const { lastFrame } = render(
      <ToolPart part={tool("shell", { command: "ls" }, { result: "file1\nfile2" })} expanded />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("file1");
    expect(frame).toContain("file2");
  });
});
