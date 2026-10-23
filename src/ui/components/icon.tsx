// Icon — named symbols via `figures`, which falls back to ASCII on terminals that
// can't render unicode. Use these names everywhere instead of raw glyphs.

import { Text } from "ink";
import figures from "figures";

export const ICONS = {
  // status / outcomes
  ok: figures.tick,
  warn: figures.warning,
  bad: figures.cross,
  pass: "✓",
  fail: "✗",
  stop: "◼",
  // navigation / ui
  info: figures.info,
  bullet: figures.bullet,
  pointer: figures.pointer,
  arrow: figures.arrowRight,
  radioOn: figures.radioOn,
  radioOff: figures.radioOff,
  checkOn: figures.checkboxOn,
  checkOff: figures.checkboxOff,
  ellipsis: figures.ellipsis,
  sep: "·",
  // domain
  gate: "◆",
  run: "▶",
  skill: "✦",
  locked: "⊘",
  unlocked: "◎",
  diff: "±",
  fork: "⎇",
  eye: "⊙",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, color }: { name: IconName; color?: string }) {
  return <Text {...(color ? { color } : {})}>{ICONS[name]}</Text>;
}
