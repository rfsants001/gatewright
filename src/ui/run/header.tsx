// Persistent run header — always visible at the top of the cockpit.
// Shows: model, cumulative token counts, estimated cost, elapsed time,
// optional flow phase, and a pause glyph when the run is paused.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { estimateCost, formatBRL } from "../../core/run/pricing.js";

export interface RunHeaderProps {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheHit?: number;
  elapsedMs: number;
  phase?: string;
  paused?: boolean;
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

/** Pure helper for testing: build the header string from props. */
export function formatHeader(props: RunHeaderProps): string {
  const { model, tokensIn, tokensOut, cacheHit, elapsedMs, phase, paused } = props;
  const parts: string[] = [];

  const shortModel = model.split("/").pop() ?? model;
  parts.push(shortModel);

  parts.push(`↑${tokensIn.toLocaleString("en-US")}  ↓${tokensOut.toLocaleString("en-US")}`);

  const cost = estimateCost(model, tokensIn, tokensOut, cacheHit ?? 0);
  if (cost !== undefined) parts.push(`~${formatBRL(cost)}`);

  parts.push(formatElapsed(elapsedMs));

  if (phase) parts.push(phase);
  if (paused) parts.push("⏸");

  return parts.join("  ");
}

export function RunHeader(props: RunHeaderProps): ReactElement {
  const line = formatHeader(props);
  return (
    <Box>
      <Text bold dimColor>
        {line}
      </Text>
    </Box>
  );
}
