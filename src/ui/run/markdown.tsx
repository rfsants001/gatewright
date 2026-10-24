// A small terminal markdown renderer for TextParts — rendered, not stripped.
// Handles headings, fenced code, lists, tables and inline bold/italic/code/links.
// The parser is pure (testable without Ink); <Markdown> renders its blocks.
// Replaces cleanMarkdown on the cockpit path.

import { Box, Text } from "ink";
import type { ReactElement } from "react";

// ── Inline ────────────────────────────────────────────────────────────────

export interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

const INLINE =
  /(\*\*(?<b>.+?)\*\*)|(`(?<c>[^`]+)`)|(\[(?<lt>[^\]]+)\]\((?<lu>[^)]+)\))|(\*(?<i>.+?)\*)|(_(?<u>.+?)_)/g;

/** Split a line into styled segments; links collapse to their visible text. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) segments.push({ text: text.slice(last, at) });
    const g = m.groups ?? {};
    if (g.b !== undefined) segments.push({ text: g.b, bold: true });
    else if (g.c !== undefined) segments.push({ text: g.c, code: true });
    else if (g.lt !== undefined) segments.push({ text: g.lt });
    else if (g.i !== undefined) segments.push({ text: g.i, italic: true });
    else if (g.u !== undefined) segments.push({ text: g.u, italic: true });
    last = at + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments.length ? segments : [{ text }];
}

// ── Blocks ────────────────────────────────────────────────────────────────

export type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "list"; items: { ordered: boolean; indent: number; text: string }[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; text: string };

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const TABLE_ROW = /^\|(.+)\|$/;
const TABLE_SEP = /^\|[\s:|-]+\|$/;

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

/** Parse markdown text into a flat list of blocks. */
export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Fenced code block.
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      flushParagraph();
      const lang = fence[1]!.trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      blocks.push({ type: "code", lang, lines: body });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }

    // Table: a row followed by a separator row.
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      flushParagraph();
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(splitRow(lines[i++]!));
      i--;
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      flushParagraph();
      const ordered = /\d+\./.test(item[2]!);
      const entry = { ordered, indent: item[1]!.length, text: item[3]!.trim() };
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "list") prev.items.push(entry);
      else blocks.push({ type: "list", items: [entry] });
      continue;
    }

    if (line.trim() === "") flushParagraph();
    else paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

// ── Rendering ─────────────────────────────────────────────────────────────

function Inline({ text }: { text: string }): ReactElement {
  return (
    <Text>
      {parseInline(text).map((seg, i) => {
        const props: { bold?: boolean; italic?: boolean; color?: string } = {};
        if (seg.bold) props.bold = true;
        if (seg.italic) props.italic = true;
        if (seg.code) props.color = "cyan";
        return (
          <Text key={i} {...props}>
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}

/** Pad cells to each column's max width for a simple aligned grid. */
function columnWidths(headers: string[], rows: string[][]): number[] {
  return headers.map((h, col) => Math.max(h.length, ...rows.map((r) => (r[col] ?? "").length)));
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }): ReactElement {
  const blocks = parseMarkdown(text);
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <Text key={i} bold dimColor={block.level >= 3}>
                {block.text}
              </Text>
            );
          case "code":
            return (
              <Box key={i} flexDirection="column">
                {block.lang ? <Text dimColor>{`│ ${block.lang}`}</Text> : null}
                {block.lines.map((l, j) => (
                  <Text key={j} color="gray">{`│ ${l}`}</Text>
                ))}
              </Box>
            );
          case "list":
            return (
              <Box key={i} flexDirection="column">
                {block.items.map((it, j) => (
                  <Box key={j}>
                    <Text>{`${" ".repeat(it.indent)}${it.ordered ? `${j + 1}.` : "•"} `}</Text>
                    <Inline text={it.text} />
                  </Box>
                ))}
              </Box>
            );
          case "table": {
            const widths = columnWidths(block.headers, block.rows);
            const cell = (c: string, col: number): string => (c ?? "").padEnd(widths[col]!);
            return (
              <Box key={i} flexDirection="column">
                <Text bold>{block.headers.map(cell).join("  ")}</Text>
                <Text dimColor>{widths.map((w) => "─".repeat(w)).join("  ")}</Text>
                {block.rows.map((r, j) => (
                  <Text key={j}>{r.map(cell).join("  ")}</Text>
                ))}
              </Box>
            );
          }
          default:
            return (
              <Box key={i}>
                <Inline text={block.text} />
                {streaming && i === blocks.length - 1 ? <Text dimColor>▋</Text> : null}
              </Box>
            );
        }
      })}
    </Box>
  );
}
