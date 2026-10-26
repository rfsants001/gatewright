// ScrollableList — generic paginated list with a cursor, replacing the ad-hoc
// PER_PAGE paging each screen reimplemented. ↑↓ move, n/p page, enter selects;
// an automatic `[1-8/34]  n/p page` footer. Also exports pure paging helpers.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ReactElement, ReactNode } from "react";
import { DIM } from "../theme.js";

export function defaultPageSize(): number {
  return Math.max(3, (process.stdout.rows ?? 24) - 8);
}

/** Pure: the slice bounds (inclusive start, exclusive end) for the cursor's page. */
export function pageBounds(cursor: number, total: number, pageSize: number): { start: number; end: number } {
  if (total === 0 || pageSize <= 0) return { start: 0, end: 0 };
  const page = Math.floor(cursor / pageSize);
  const start = page * pageSize;
  return { start, end: Math.min(start + pageSize, total) };
}

export interface ScrollableListProps<T> {
  items: readonly T[];
  renderItem: (item: T, active: boolean) => ReactNode;
  pageSize?: number;
  onSelect?: (item: T) => void;
  isActive?: boolean;
}

export function ScrollableList<T>({
  items,
  renderItem,
  pageSize,
  onSelect,
  isActive = true,
}: ScrollableListProps<T>): ReactElement {
  const size = pageSize ?? defaultPageSize();
  const [cursor, setCursor] = useState(0);
  const total = items.length;

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(total - 1, c + 1));
    else if (input === "n") setCursor((c) => Math.min(total - 1, c + size));
    else if (input === "p") setCursor((c) => Math.max(0, c - size));
    else if (key.return && onSelect && items[cursor] !== undefined) onSelect(items[cursor]!);
  }, { isActive });

  const { start, end } = pageBounds(cursor, total, size);
  const visible = items.slice(start, end);

  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const idx = start + i;
        return <Box key={idx}>{renderItem(item, idx === cursor)}</Box>;
      })}
      <Text color={DIM}>{total === 0 ? "  (empty)" : `  [${start + 1}-${end}/${total}]  n/p page`}</Text>
    </Box>
  );
}
