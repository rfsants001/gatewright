// The consumption line shown after a turn's response:
//   ↑ 1,247  ↓ 834  cache 78%  ~R$0.12  2.3s
// Dim, right-aligned. Reads usage straight off the Turn (feat run-parts-model) and
// derives cost from the shared pricing estimator — one source of cost (feat PH-29-013).

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { Turn } from "../../core/run/parts.js";
import { estimateCost, formatBRL } from "../../core/run/pricing.js";

/** True when the engine reported any usage for this turn. */
export function hasUsage(turn: Turn): boolean {
  return turn.tokensIn > 0 || turn.tokensOut > 0;
}

/** Thousands-separated token count: 1247 → "1,247". */
function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** Build the usage line text, or "" when the turn has no usage. */
export function formatUsage(turn: Turn, model: string, durationMs?: number): string {
  if (!hasUsage(turn)) return "";
  const parts = [`↑ ${count(turn.tokensIn)}`, `↓ ${count(turn.tokensOut)}`];
  if (turn.cacheHit !== undefined) parts.push(`cache ${Math.round(turn.cacheHit * 100)}%`);
  const cost = estimateCost(model, turn.tokensIn, turn.tokensOut, turn.cacheHit ?? 0);
  if (cost !== undefined) parts.push(`~${formatBRL(cost)}`);
  if (durationMs !== undefined && durationMs > 0) parts.push(`${(durationMs / 1000).toFixed(1)}s`);
  return parts.join("  ");
}

export function TurnUsage({
  turn,
  model,
  durationMs,
}: {
  turn: Turn;
  model: string;
  durationMs?: number;
}): ReactElement | null {
  const line = formatUsage(turn, model, durationMs);
  if (!line) return null;
  return (
    <Box justifyContent="flex-end">
      <Text dimColor>{line}</Text>
    </Box>
  );
}
