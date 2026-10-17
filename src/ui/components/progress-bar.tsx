// ProgressBar — a colored filled/empty bar with a percentage.

import { Text } from "ink";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

export function ProgressBar({ value, width = 24, color = "green", label }: { value: number; width?: number; color?: string; label?: string }) {
  const filled = Math.round(clamp01(value) * width);
  const pct = Math.round(clamp01(value) * 100);
  return (
    <Text>
      {label ? `${label} ` : ""}
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(width - filled)}</Text>
      {` ${pct}%`}
    </Text>
  );
}
