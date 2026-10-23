// Transcript mounting is budgeted by rendered rows, not parts. A collapsed group
// renders one header however many parts it holds; expanded or ungrouped, it renders
// its parts. rowsBefore/rowsAfter turn a budget into viewport bounds for virtual
// scrolling of long transcripts. Pure. Mirrors OpenCode's mount-budget (MIT).

import type { GroupedRow, GroupKind, PartGroup } from "./grouping.js";

export interface MountControls {
  /** Is this group currently expanded (showing every part)? */
  expanded(group: PartGroup): boolean;
  /** Is this kind of group collapsed at all, or always flattened to its parts? */
  grouped(kind: GroupKind): boolean;
}

/**
 * Rendered-row cost of one transcript row:
 * - a standalone part costs 1;
 * - an ungrouped group costs one per part (no header);
 * - a collapsed group costs 1 (its header);
 * - an expanded group costs its header plus one per part.
 */
export function rowWeight(row: GroupedRow, controls: MountControls): number {
  if (row.type === "part") return 1;
  const { group } = row;
  if (!controls.grouped(group.kind)) return group.parts.length;
  if (!controls.expanded(group)) return 1;
  return 1 + group.parts.length;
}

/** First row index such that rows [index, end) spend at least `budget`. */
export function rowsBefore(weights: readonly number[], end: number, budget: number): number {
  let index = end;
  let spent = 0;
  while (index > 0 && spent < budget) spent += weights[--index]!;
  return index;
}

/** End row index such that rows [start, index) spend at least `budget`. */
export function rowsAfter(weights: readonly number[], start: number, budget: number): number {
  let index = start;
  let spent = 0;
  while (index < weights.length && spent < budget) spent += weights[index++]!;
  return index;
}

/** Convenience: the weight of every row under one set of controls. */
export function rowWeights(rows: readonly GroupedRow[], controls: MountControls): number[] {
  return rows.map((row) => rowWeight(row, controls));
}
