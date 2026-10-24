// PURE transcript mount helpers: tail-first initial slice, chunk loading, anchor
// preservation, and message navigation. No I/O, no React.

const TAIL = 40;
const CHUNK = 60;

/** Initial tail slice: start index to show the last TAIL rows. */
export function tailFirst(totalRows: number, tail = TAIL): number {
  return Math.max(0, totalRows - tail);
}

/** Load an older chunk: new start is CHUNK rows before current start. */
export function loadOlderChunk(currentStart: number, size = CHUNK): number {
  return Math.max(0, currentStart - size);
}

/**
 * Anchor-preserving scroll: when the viewport expands (e.g. a group collapses),
 * keep the group header at the same visual row by returning an adjusted start.
 * The delta is the change in rendered rows above the anchor (positive = added rows).
 */
export function anchorTop(anchor: number, rowsDelta: number): number {
  return Math.max(0, anchor + rowsDelta);
}

/** Clamp a scroll anchor to valid range. */
export function clampAnchor(anchor: number, total: number): number {
  if (total === 0) return 0;
  return Math.max(0, Math.min(anchor, total - 1));
}

/**
 * Message navigation: find the start row index of the n-th Turn boundary.
 * A turn boundary is any row whose preceding row belongs to a different turn
 * (or the first row). Returns null when out of bounds.
 * `turnStarts` is the list of row indices where each turn begins.
 */
export function navToMessage(
  turnStarts: readonly number[],
  currentAnchor: number,
  direction: "next" | "prev",
): number | null {
  if (turnStarts.length === 0) return null;
  if (direction === "next") {
    const next = turnStarts.find((i) => i > currentAnchor);
    return next ?? null;
  }
  const prev = [...turnStarts].reverse().find((i) => i < currentAnchor);
  return prev ?? null;
}

/** Navigation "slack" — never leave fewer than these rows above the anchor. */
export const NAV_SLACK = 2;
