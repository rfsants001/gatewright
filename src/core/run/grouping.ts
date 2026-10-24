// Groups adjacent Parts into collapsible PartGroups — the core of the cockpit's
// readability. Pure and incremental: appendPart folds one part into the existing
// adjacent group of the same kind without rebuilding it. Mirrors OpenCode's
// grouping (clean-room, MIT); impl is ours.

import { EXPLORATION_TOOLS } from "./tool-display.js";
import type { Part } from "./parts.js";

/** How much of the transcript collapses. Persisted in config (feat PH-29-006). */
export type Verbosity = "low" | "medium" | "high";
export const defaultVerbosity: Verbosity = "medium";

/** Coerce a config value (possibly absent/garbage) to a valid Verbosity. */
export function coerceVerbosity(value: unknown): Verbosity {
  return value === "low" || value === "medium" || value === "high" ? value : defaultVerbosity;
}

export type GroupKind = "exploration" | "reasoning" | "activity";

export interface PartGroup {
  kind: GroupKind;
  parts: Part[];
}

/** A transcript row: either a standalone part or a collapsed group. */
export type GroupedRow = { type: "part"; part: Part } | { type: "group"; group: PartGroup };

/** The `question` tool (the gate-ask) always stands alone — never grouped. */
function isQuestion(part: Part): boolean {
  return part.type === "tool" && part.canonicalName === "question";
}

/**
 * The group a part belongs to, or null when it stands alone.
 * - `high`: nothing groups.
 * - `medium`: reasoning runs and exploration-tool runs collapse; mutations/commands stay inline.
 * - `low`: every non-text, non-question part folds into one `activity` summary.
 */
export function partPath(part: Part, verbosity: Verbosity = defaultVerbosity): GroupKind | null {
  if (isQuestion(part)) return null;
  if (verbosity === "low") return part.type === "text" ? null : "activity";
  if (verbosity === "high") return null;
  // medium
  if (part.type === "reasoning") return "reasoning";
  if (part.type === "tool" && EXPLORATION_TOOLS.has(part.canonicalName)) return "exploration";
  return null;
}

/**
 * Fold one part into `rows`, merging into the trailing group of the same kind
 * (stable — the existing group object is kept, its parts array extended) or
 * appending a standalone row / new group.
 */
export function appendPart(rows: GroupedRow[], part: Part, verbosity: Verbosity = defaultVerbosity): void {
  const kind = partPath(part, verbosity);
  if (kind === null) {
    rows.push({ type: "part", part });
    return;
  }
  const last = rows[rows.length - 1];
  if (last && last.type === "group" && last.group.kind === kind) {
    last.group.parts.push(part);
    return;
  }
  rows.push({ type: "group", group: { kind, parts: [part] } });
}

/** Group a whole part list in one pass. */
export function groupParts(parts: Part[], verbosity: Verbosity = defaultVerbosity): GroupedRow[] {
  const rows: GroupedRow[] = [];
  for (const part of parts) appendPart(rows, part, verbosity);
  return rows;
}
