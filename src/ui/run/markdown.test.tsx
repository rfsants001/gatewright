import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { Markdown, parseInline, parseMarkdown } from "./markdown.js";

describe("parseInline", () => {
  it("splits bold, italic, inline code and collapses links to text", () => {
    expect(parseInline("a **b** c")).toEqual([{ text: "a " }, { text: "b", bold: true }, { text: " c" }]);
    expect(parseInline("`code`")).toEqual([{ text: "code", code: true }]);
    expect(parseInline("see [docs](http://x)")).toEqual([{ text: "see " }, { text: "docs" }]);
    expect(parseInline("_em_")).toEqual([{ text: "em", italic: true }]);
  });

  it("returns the whole string when there is no markup", () => {
    expect(parseInline("plain")).toEqual([{ text: "plain" }]);
  });
});

describe("parseMarkdown", () => {
  it("parses headings with their level", () => {
    expect(parseMarkdown("### Title")).toEqual([{ type: "heading", level: 3, text: "Title" }]);
  });

  it("parses a fenced code block with its language", () => {
    const blocks = parseMarkdown("```ts\nconst x = 1\nconst y = 2\n```");
    expect(blocks).toEqual([{ type: "code", lang: "ts", lines: ["const x = 1", "const y = 2"] }]);
  });

  it("accumulates list items into one list block", () => {
    const [block] = parseMarkdown("- one\n- two\n- three");
    expect(block).toMatchObject({ type: "list" });
    expect((block as { items: unknown[] }).items).toHaveLength(3);
  });

  it("parses a table's headers and rows", () => {
    const [block] = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
    expect(block).toEqual({ type: "table", headers: ["a", "b"], rows: [["1", "2"], ["3", "4"]] });
  });

  it("joins wrapped paragraph lines and splits on blank lines", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      { type: "paragraph", text: "one two" },
      { type: "paragraph", text: "three" },
    ]);
  });
});

describe("<Markdown>", () => {
  it("renders headings, code and paragraph text in the frame", () => {
    const { lastFrame } = render(<Markdown text={"## Hello\n\nsome **bold** text\n\n```js\ncode()\n```"} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Hello");
    expect(frame).toContain("bold");
    expect(frame).toContain("code()");
  });

  it("renders a code block's language label and left border", () => {
    const { lastFrame } = render(<Markdown text={"```python\nprint(1)\n```"} />);
    const frame = lastFrame()!;
    expect(frame).toContain("python");
    expect(frame).toContain("│ print(1)");
  });

  it("renders a table as an aligned grid", () => {
    const { lastFrame } = render(<Markdown text={"| name | n |\n|---|---|\n| foo | 1 |"} />);
    const frame = lastFrame()!;
    expect(frame).toContain("name");
    expect(frame).toContain("foo");
  });
});
