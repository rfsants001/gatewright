// Top fixed status bar: [model] ↑48.3k ↓12.1k cache72% ~R$0.47 [phase] 4m12s STATE
// State color: cyan=running, green=passed, red=failed, yellow=paused.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { estimateCost, formatBRL } from "../../core/run/pricing.js";

export type RunState = "running" | "passed" | "failed" | "paused" | "idle";

export interface StatusBarProps {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheHit?: number;
  elapsedMs: number;
  phase?: string;
  state: RunState;
}

function stateColor(s: RunState): string {
  switch (s) {
    case "running": return "cyan";
    case "passed": return "green";
    case "failed": return "red";
    case "paused": return "yellow";
    default: return "white";
  }
}

function kFmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec.toString().padStart(2, "0")}s` : `${s}s`;
}

/** Pure helper for testing. */
export function formatStatusBar(props: StatusBarProps): string {
  const { model, tokensIn, tokensOut, cacheHit, elapsedMs, phase, state } = props;
  const short = model.split("/").pop() ?? model;
  const parts: string[] = [short];
  parts.push(`↑${kFmt(tokensIn)}`);
  parts.push(`↓${kFmt(tokensOut)}`);
  if (cacheHit !== undefined && cacheHit > 0) parts.push(`cache${Math.round(cacheHit * 100)}%`);
  const cost = estimateCost(model, tokensIn, tokensOut, cacheHit ?? 0);
  if (cost !== undefined) parts.push(`~${formatBRL(cost)}`);
  if (phase) parts.push(`[${phase}]`);
  parts.push(elapsed(elapsedMs));
  parts.push(state.toUpperCase());
  return parts.join("  ");
}

export function StatusBar(props: StatusBarProps): ReactElement {
  const line = formatStatusBar(props);
  const color = stateColor(props.state);
  return (
    <Box>
      <Text color={color} bold>
        {line}
      </Text>
    </Box>
  );
}
