// Gate footer — live gate status bar at the bottom of the cockpit.
// 'secret ✓  proportion ✓  plan ⏳  completion —  quality —'
// State→glyph: passed ✓ green, pending/running ⏳ yellow, failed ✗ red, not-fired — dim.

import { Box, Text } from "ink";
import type { ReactElement } from "react";

export type GateState = "passed" | "pending" | "running" | "failed" | "not-fired";

export interface GateStatus {
  name: string;
  state: GateState;
}

interface GlyphResult {
  glyph: string;
  color: "green" | "yellow" | "red" | undefined;
  dim: boolean;
}

function glyphFor(state: GateState): GlyphResult {
  switch (state) {
    case "passed":
      return { glyph: "✓", color: "green", dim: false };
    case "pending":
    case "running":
      return { glyph: "⏳", color: "yellow", dim: false };
    case "failed":
      return { glyph: "✗", color: "red", dim: false };
    case "not-fired":
      return { glyph: "—", color: undefined, dim: true };
  }
}

/** Pure: build the footer string for testing. */
export function formatGateLine(gates: readonly GateStatus[]): string {
  return gates
    .map(({ name, state }) => {
      const { glyph } = glyphFor(state);
      return `${name} ${glyph}`;
    })
    .join("  ");
}

export function GateFooter({ gates }: { gates: readonly GateStatus[] }): ReactElement {
  return (
    <Box>
      {gates.map(({ name, state }, i) => {
        const { glyph, color, dim } = glyphFor(state);
        const colorProps: { color?: string } = color ? { color } : {};
        return (
          <Text key={i}>
            {i > 0 ? "  " : ""}
            <Text dimColor={dim}>{name} </Text>
            <Text dimColor={dim} {...colorProps}>
              {glyph}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}
