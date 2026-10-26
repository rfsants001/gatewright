// Builds the Transcript's parallel row arrays from projected Turns: the rendered
// ReactElement rows and the GroupedRow[] they map to 1:1 (Transcript zips them by
// index via rowWeights). Each turn contributes a user-prompt line, its grouped
// part rows, and a usage line — the glue between the Phase 29 engine and the view.

import type { ReactElement } from "react";
import { Text } from "ink";
import type { Part, TextPart, Turn } from "../../core/run/parts.js";
import { groupParts, type GroupedRow, type Verbosity } from "../../core/run/grouping.js";
import { summarizeGroup } from "../../core/run/summary.js";
import { Markdown } from "./markdown.js";
import { Reasoning } from "./reasoning.js";
import { ToolPart } from "./tool-part.js";
import { TurnUsage, hasUsage } from "./turn-usage.js";

export interface BuildTranscriptOptions {
  model: string;
  cwd?: string;
  verbosity?: Verbosity;
  /** When true, part groups render expanded (each part on its own row). */
  expanded?: boolean;
}

export interface TranscriptRows {
  rows: ReactElement[];
  groupedRows: GroupedRow[];
  /** Index into rows/groupedRows where each turn begins (for n/N nav). */
  turnStarts: number[];
}

/** A weight-1 synthetic row entry for non-part lines (prompt, usage). */
function syntheticRow(text: string): GroupedRow {
  const part: TextPart = { type: "text", text, status: "completed" };
  return { type: "part", part };
}

function renderPart(part: Part, cwd: string | undefined, key: number): ReactElement {
  if (part.type === "text") return <Markdown key={key} text={part.text} />;
  if (part.type === "reasoning") return <Reasoning key={key} part={part} />;
  return <ToolPart key={key} part={part} {...(cwd ? { cwd } : {})} />;
}

export function buildTranscriptRows(turns: readonly Turn[], opts: BuildTranscriptOptions): TranscriptRows {
  const rows: ReactElement[] = [];
  const groupedRows: GroupedRow[] = [];
  const turnStarts: number[] = [];
  let key = 0;

  for (const turn of turns) {
    turnStarts.push(rows.length);

    // User prompt line.
    if (turn.userMessage.trim()) {
      groupedRows.push(syntheticRow(turn.userMessage));
      rows.push(
        <Text key={key++} bold color="cyan">{`› ${turn.userMessage}`}</Text>,
      );
    }

    // Grouped part rows — collapsed groups summarize to one line.
    for (const row of groupParts([...turn.parts], opts.verbosity)) {
      groupedRows.push(row);
      if (row.type === "part") {
        rows.push(renderPart(row.part, opts.cwd, key++));
      } else {
        const summary = summarizeGroup(row.group.parts);
        rows.push(<Text key={key++} dimColor>{`⋯ ${summary.label}`}</Text>);
      }
    }

    // Per-turn usage line.
    if (hasUsage(turn)) {
      groupedRows.push(syntheticRow("usage"));
      rows.push(<TurnUsage key={key++} turn={turn} model={opts.model} />);
    }
  }

  return { rows, groupedRows, turnStarts };
}
