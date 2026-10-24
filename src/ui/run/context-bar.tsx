// Context usage bar — shows how full the model's context window is.
// '[███░░] 67% (134k/200k)'  Yellow >60%, Red >80%.
// `visible` defaults true; parent toggles it with the `c` key.

import { Box, Text } from "ink";
import type { ReactElement } from "react";

export interface ContextBarResult {
  pct: number;
  label: string;
  color: "green" | "yellow" | "red";
}

const BAR_W = 5;

function kFormat(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Pure helper for testing. */
export function contextBar(used: number, total: number): ContextBarResult {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const filled = Math.round((pct / 100) * BAR_W);
  const bar = "█".repeat(filled) + "░".repeat(BAR_W - filled);
  const label = `[${bar}] ${pct}% (${kFormat(used)}/${kFormat(total)})`;
  const color: "green" | "yellow" | "red" = pct > 80 ? "red" : pct > 60 ? "yellow" : "green";
  return { pct, label, color };
}

export function ContextBar({
  used,
  total,
  visible = true,
}: {
  used: number;
  total: number;
  visible?: boolean;
}): ReactElement | null {
  if (!visible) return null;
  const { label, color } = contextBar(used, total);
  return (
    <Box>
      <Text color={color}>{label}</Text>
    </Box>
  );
}
