// KeyHints — the one footer-hint renderer every screen shares, replacing the
// ad-hoc `<Text dimColor>  b back · q quit</Text>` each file used to inline.

import { Text } from "ink";
import type { ReactElement } from "react";

export interface KeyHint {
  key: string;
  label: string;
}

export const HINTS_BACK: KeyHint[] = [{ key: "b", label: "back" }, { key: "esc", label: "back" }];
export const HINTS_QUIT: KeyHint[] = [{ key: "q", label: "quit" }];
export const HINTS_SCROLL: KeyHint[] = [{ key: "↑↓", label: "scroll" }, { key: "g/G", label: "top/bottom" }];
export const HINTS_NAV: KeyHint[] = [{ key: "↑↓", label: "move" }, { key: "enter", label: "select" }];
export const HINTS_PAGE: KeyHint[] = [{ key: "n/p", label: "page" }];

/** Render hints as `  <key> <label> · <key> <label>…` in dim. */
export function KeyHints({ hints }: { hints: readonly KeyHint[] }): ReactElement {
  return <Text dimColor>{"  " + hints.map((h) => `${h.key} ${h.label}`).join(" · ")}</Text>;
}
