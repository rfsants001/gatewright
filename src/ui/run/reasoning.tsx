// Reasoning as a first-class, collapsible citizen of the transcript.
// While streaming: "⟳ Thinking: <title>…". Collapsed when done:
// "+ Thought: <title> · 3 steps · 2.1s". Expanded: the full text with a left rule.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { partDurationMs, type ReasoningPart } from "../../core/run/parts.js";
import { reasoningStyle } from "./colors.js";

/** The first meaningful sentence/line, stripped of markdown, for the collapsed label. */
export function reasoningSummary(text: string): string {
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";
  const cleaned = firstLine
    .replace(/^[#>\-*\s]+/, "")
    .replace(/\*\*|__|[*_`]/g, "")
    .trim();
  const sentence = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;
  return sentence.length > 60 ? `${sentence.slice(0, 59)}…` : sentence;
}

/** Distinct thinking steps ≈ non-empty paragraphs (at least one). */
export function reasoningSteps(text: string): number {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return Math.max(1, paragraphs.length);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function Reasoning({ part, expanded }: { part: ReasoningPart; expanded?: boolean }): ReactElement {
  const style = reasoningStyle();
  const title = reasoningSummary(part.text);
  const streaming = part.status === "streaming" || part.status === "running";

  if (streaming) {
    return <Text {...style}>{`⟳ Thinking: ${title}…`}</Text>;
  }

  const steps = reasoningSteps(part.text);
  const dur = partDurationMs(part);
  const meta = [`${steps} step${steps === 1 ? "" : "s"}`, dur !== undefined ? seconds(dur) : undefined]
    .filter(Boolean)
    .join(" · ");
  const header = `+ Thought: ${title} · ${meta}`;

  if (!expanded) return <Text {...style}>{header}</Text>;

  return (
    <Box flexDirection="column">
      <Text {...style}>{header}</Text>
      {part.text.split("\n").map((line, i) => (
        <Text key={i} dimColor>{`│ ${line}`}</Text>
      ))}
    </Box>
  );
}
