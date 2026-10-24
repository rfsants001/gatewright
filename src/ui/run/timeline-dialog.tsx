// Timeline dialog — shows a list of turns with one-line summaries.
// Opened by pressing `t` in the cockpit.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { Turn } from "../../core/run/parts.js";
import { groupParts } from "../../core/run/grouping.js";
import { summarizeGroup } from "../../core/run/summary.js";

function turnSummary(turn: Turn, index: number): string {
  const prefix = `[${index + 1}]`;
  if (turn.userMessage) {
    const msg = turn.userMessage.slice(0, 60).replace(/\n/g, " ");
    return `${prefix} ${msg}`;
  }
  const rows = groupParts(turn.parts, "medium");
  if (rows.length === 0) return `${prefix} (empty)`;
  const first = rows[0]!;
  if (first.type === "part" && first.part.type === "text") {
    return `${prefix} ${first.part.text.slice(0, 60).replace(/\n/g, " ")}`;
  }
  if (first.type === "group") {
    const { label } = summarizeGroup(first.group.parts);
    return `${prefix} ${label}`;
  }
  return `${prefix} (turn)`;
}

export function TimelineDialog({ turns }: { turns: Turn[] }): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Timeline  (t to close)</Text>
      {turns.length === 0 ? (
        <Text dimColor>No turns yet.</Text>
      ) : (
        turns.map((turn, i) => (
          <Text key={i} dimColor={i < turns.length - 1}>
            {turnSummary(turn, i)}
          </Text>
        ))
      )}
    </Box>
  );
}
