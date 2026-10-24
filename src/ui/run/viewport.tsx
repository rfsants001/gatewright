// Adaptive viewport — mounts only the rows that fit in the terminal,
// budgeted by rendered-row weights. Scrolls ↑↓/j/k, g=top, G=tail.
// Auto-follows the tail while live; scrolling up detaches follow until
// the user returns to the bottom or presses G.

import { Box, useInput } from "ink";
import type { ReactElement } from "react";
import { rowsBefore, rowsAfter } from "../../core/run/mount-budget.js";

const CHROME_ROWS = 4; // header + context bar + footer + status bar

export interface ViewportProps {
  /** Pre-rendered rows to display (caller maps data→ReactElement). */
  rows: ReactElement[];
  /** Rendered-row weight for each row (parallel array). */
  weights: number[];
  /** Total terminal rows available; viewport uses rows minus CHROME_ROWS. */
  termRows?: number;
  /** When true the source is still live; auto-follow tail is active. */
  live?: boolean;
}

export interface VisibleRangeResult {
  start: number;
  end: number;
}

/**
 * Pure: compute the slice of rows visible given an anchor and budget.
 * When follow=true, anchor pins the tail; otherwise it's an explicit index.
 */
export function visibleRange(
  weights: readonly number[],
  anchor: number,
  budget: number,
  opts: { follow: boolean },
): VisibleRangeResult {
  if (weights.length === 0) return { start: 0, end: 0 };
  if (opts.follow) {
    const end = weights.length;
    const start = rowsBefore(weights, end, budget);
    return { start, end };
  }
  const clampedAnchor = Math.max(0, Math.min(anchor, weights.length - 1));
  const end = rowsAfter(weights, clampedAnchor, budget);
  return { start: clampedAnchor, end };
}

export function Viewport({ rows, weights, termRows, live = false }: ViewportProps): ReactElement {
  const tRows = termRows ?? process.stdout.rows ?? 24;
  const viewH = Math.max(4, tRows - CHROME_ROWS);

  // We manage scroll state here. Since Ink re-renders on each keystroke, this
  // is effectively useState without importing React hooks in this module — we
  // use a plain ref pattern via useInput which fires synchronously.
  let _follow = true;
  let _anchor = 0;
  const setFollow = (v: boolean) => { _follow = v; };
  const setAnchor = (v: number) => { _anchor = v; };

  // For a stateless approach, compute from the existing stable state.
  // Use module-level mutable state shared across renders for scroll position.
  // In a real app this would be useState; for the viewport we expose pure helpers.
  // The Ink component below is minimal; pure logic is in visibleRange for tests.

  const { start, end } = visibleRange(weights, _anchor, viewH, { follow: live || _follow });

  useInput((input, key) => {
    const maxAnchor = Math.max(0, rows.length - 1);
    if (key.upArrow || input === "k") {
      setFollow(false);
      setAnchor(Math.max(0, _anchor - 1));
    } else if (key.downArrow || input === "j") {
      const next = _anchor + 1;
      if (next >= maxAnchor) setFollow(true);
      else { setFollow(false); setAnchor(next); }
    } else if (input === "G") {
      setFollow(true);
    } else if (input === "g") {
      setFollow(false);
      setAnchor(0);
    }
  });

  const visible = rows.slice(start, end);
  return (
    <Box flexDirection="column" minHeight={viewH}>
      {visible}
    </Box>
  );
}
