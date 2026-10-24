// Transcript — virtual-scroll view of grouped rows. Tail-first mount, auto-follows
// live tail, detaches on scroll, re-attaches on G or at bottom. Message nav n/N.

import { useState } from "react";
import { Box, useInput } from "ink";
import type { ReactElement } from "react";
import type { GroupedRow, GroupKind, PartGroup } from "../../core/run/grouping.js";
import { rowWeights } from "../../core/run/mount-budget.js";
import { visibleRange } from "./viewport.js";
import { clampAnchor, tailFirst, navToMessage } from "../../core/run/transcript-mount.js";

const CHROME_ROWS = 4;

export interface TranscriptProps {
  rows: ReactElement[];
  groupedRows: GroupedRow[];
  /** Row index where each Turn begins (for n/N navigation). */
  turnStarts: readonly number[];
  termRows?: number;
  live?: boolean;
  expanded?: boolean;
}

export function Transcript({
  rows,
  groupedRows,
  turnStarts,
  termRows,
  live = false,
  expanded = false,
}: TranscriptProps): ReactElement {
  const tRows = termRows ?? process.stdout.rows ?? 24;
  const viewH = Math.max(4, tRows - CHROME_ROWS);

  const controls = {
    expanded: (_g: PartGroup) => expanded,
    grouped: (_k: GroupKind) => true,
  };
  const weights = rowWeights(groupedRows, controls);
  const total = rows.length;

  const [follow, setFollow] = useState(true);
  const [anchor, setAnchor] = useState(() => tailFirst(total));

  const { start, end } = visibleRange(weights, anchor, viewH, { follow: follow || live });

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setFollow(false);
      setAnchor((a) => clampAnchor(a - 1, total));
    } else if (key.downArrow || input === "j") {
      const next = anchor + 1;
      if (next >= total - 1) setFollow(true);
      else { setFollow(false); setAnchor(next); }
    } else if (input === "G") {
      setFollow(true);
    } else if (input === "g") {
      setFollow(false);
      setAnchor(0);
    } else if (input === "n") {
      const idx = navToMessage(turnStarts, anchor, "next");
      if (idx !== null) { setFollow(false); setAnchor(idx); }
    } else if (input === "N") {
      const idx = navToMessage(turnStarts, anchor, "prev");
      if (idx !== null) { setFollow(false); setAnchor(idx); }
    }
  });

  const visible = rows.slice(start, end);
  return <Box flexDirection="column">{visible}</Box>;
}
