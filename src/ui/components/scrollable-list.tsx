import type { ReactNode } from "react";
import { useState } from "react";
import { Box, Text, useInput } from "ink";

export function ScrollableList<T>({
  items,
  renderItem,
  pageSize,
  onSelect,
  isFocused = true,
}: {
  items: T[];
  renderItem: (item: T, active: boolean) => ReactNode;
  pageSize?: number;
  onSelect?: (item: T) => void;
  isFocused?: boolean;
}) {
  const size = pageSize ?? Math.max(4, (process.stdout.rows ?? 24) - 8);
  const pages = Math.max(1, Math.ceil(items.length / size));

  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);

  const curPage = Math.min(page, pages - 1);
  const slice = items.slice(curPage * size, curPage * size + size);
  const globalIdx = curPage * size + cursor;

  useInput(
    (input, key) => {
      if (key.upArrow) {
        if (cursor > 0) {
          setCursor((c) => c - 1);
        } else if (curPage > 0) {
          setPage((p) => p - 1);
          setCursor(size - 1);
        }
      } else if (key.downArrow) {
        if (cursor < slice.length - 1) {
          setCursor((c) => c + 1);
        } else if (curPage < pages - 1) {
          setPage((p) => p + 1);
          setCursor(0);
        }
      } else if (input === "n") {
        if (curPage < pages - 1) {
          setPage((p) => p + 1);
          setCursor(0);
        }
      } else if (input === "p") {
        if (curPage > 0) {
          setPage((p) => p - 1);
          setCursor(0);
        }
      } else if (key.return && onSelect) {
        const item = items[globalIdx];
        if (item !== undefined) onSelect(item);
      }
    },
    { isActive: isFocused },
  );

  if (items.length === 0) {
    return <Text dimColor>  (empty)</Text>;
  }

  return (
    <Box flexDirection="column">
      {slice.map((item, i) => (
        <Box key={curPage * size + i}>{renderItem(item, i === cursor)}</Box>
      ))}
      {pages > 1 ? (
        <Text dimColor>{`  [${curPage * size + 1}–${Math.min(curPage * size + size, items.length)}/${items.length}]  n/p page`}</Text>
      ) : null}
    </Box>
  );
}
