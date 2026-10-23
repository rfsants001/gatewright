import { Text } from "ink";

export interface KeyHint {
  key: string;
  label: string;
}

export const HINTS_BACK: KeyHint[] = [{ key: "b/esc", label: "back" }];
export const HINTS_QUIT: KeyHint[] = [{ key: "q", label: "quit" }];
export const HINTS_SCROLL: KeyHint[] = [
  { key: "↑↓", label: "scroll" },
  { key: "g/G", label: "top/bottom" },
];
export const HINTS_NAV: KeyHint[] = [
  { key: "↑↓", label: "move" },
  { key: "enter", label: "select" },
];
export const HINTS_PAGE: KeyHint[] = [{ key: "n/p", label: "page" }];

export function KeyHints({ hints }: { hints: KeyHint[] }) {
  return (
    <Text dimColor>
      {"  " + hints.map((h) => `${h.key} ${h.label}`).join(" · ")}
    </Text>
  );
}
