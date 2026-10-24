// The visual separator the transcript shows when the FlowEngine compacts context
// (window >80%): ──── Context compacted · saved 42k tokens ────. Marks the boundary
// between pre- and post-compression conversation. Pure label + dim component.

import { Box, Text } from "ink";
import type { ReactElement } from "react";

/** Compact a token count for display: 42000 → "42k", 1500000 → "1.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** The compaction label, e.g. "Context compacted · saved 42k tokens · now 38k". */
export function compactionLabel(savedTokens: number, newContextTokens?: number): string {
  const parts = [`Context compacted · saved ${formatTokens(savedTokens)} tokens`];
  if (newContextTokens !== undefined) parts.push(`now ${formatTokens(newContextTokens)}`);
  return parts.join(" · ");
}

export function CompactionRow({
  savedTokens,
  newContextTokens,
}: {
  savedTokens: number;
  newContextTokens?: number;
}): ReactElement {
  const rule = "─".repeat(8);
  return (
    <Box>
      <Text dimColor>{`${rule} ${compactionLabel(savedTokens, newContextTokens)} ${rule}`}</Text>
    </Box>
  );
}
