// Sidebar — 40-col right panel: run info, file changes, gate status, context, shortcuts.
// Toggled with ctrl+s. Scrollable sections. Title shimmer while running.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";
import type { GateStatus } from "./gate-footer.js";
import type { FileChange } from "../../core/run/file-changes.js";
import type { ContextBarResult } from "./context-bar.js";
import { contextBar } from "./context-bar.js";

export interface SidebarProps {
  width?: number;
  runState: "running" | "passed" | "failed" | "paused" | "idle";
  model: string;
  phase?: string;
  skills?: string[];
  engine?: string;
  fileChanges: readonly FileChange[];
  gates: readonly GateStatus[];
  contextUsed: number;
  contextTotal: number;
  turnCount: number;
  compactionCount?: number;
  keyBindings?: ReadonlyArray<{ key: string; label: string }>;
  onOpenDiff?: (path: string) => void;
  onGateClick?: (name: string) => void;
}

const SECTION_CHAR = "─";

function sectionHeader(label: string, width: number): string {
  const side = Math.max(0, Math.floor((width - label.length - 2) / 2));
  return SECTION_CHAR.repeat(side) + " " + label + " " + SECTION_CHAR.repeat(side);
}

function shimmer(text: string, running: boolean): string {
  return running ? `✦ ${text}` : text;
}

function gateGlyph(state: GateStatus["state"]): string {
  switch (state) {
    case "passed": return "✓";
    case "running": return "⏳";
    case "pending": return "⏳";
    case "failed": return "✗";
    default: return "—";
  }
}

function gateColor(state: GateStatus["state"]): string | undefined {
  switch (state) {
    case "passed": return "green";
    case "running": return "yellow";
    case "pending": return "yellow";
    case "failed": return "red";
    default: return undefined;
  }
}

export function Sidebar({
  width = 40,
  runState,
  model,
  phase,
  skills = [],
  engine,
  fileChanges,
  gates,
  contextUsed,
  contextTotal,
  turnCount,
  compactionCount = 0,
  keyBindings = [],
  onOpenDiff,
  onGateClick,
}: SidebarProps): ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);
  const running = runState === "running";

  useInput((_input, key) => {
    if (key.upArrow) setScrollOffset((o) => Math.max(0, o - 1));
    if (key.downArrow) setScrollOffset((o) => o + 1);
  });

  const ctx: ContextBarResult = contextBar(contextUsed, contextTotal);

  return (
    <Box flexDirection="column" width={width}>
      {/* Title */}
      <Box>
        <Text bold color="cyan">{shimmer("Gatewright", running).padEnd(width - 2)}</Text>
      </Box>

      {/* Run info */}
      <Text dimColor>{sectionHeader("RUN", width - 2)}</Text>
      {phase && <Text>{`phase: ${phase}`}</Text>}
      <Text>{`model: ${model.split("/").pop() ?? model}`}</Text>
      {engine && <Text dimColor>{`engine: ${engine}`}</Text>}
      {skills.length > 0 && <Text dimColor>{`skills: ${skills.join(", ")}`}</Text>}

      {/* File changes */}
      <Text dimColor>{sectionHeader("FILES", width - 2)}</Text>
      {fileChanges.length === 0
        ? <Text dimColor>no changes yet</Text>
        : fileChanges.map((fc) => {
          const label = `${fc.op === "write" ? "+" : "~"} ${fc.path.split("/").pop() ?? fc.path}${fc.delta ? ` ${fc.delta}` : ""}`;
          return (
            <Text key={fc.path} color={fc.op === "write" ? "green" : "yellow"}
              {...(onOpenDiff ? { onClick: () => onOpenDiff(fc.path) } : {})}
            >
              {label}
            </Text>
          );
        })
      }

      {/* Gates */}
      <Text dimColor>{sectionHeader("GATES", width - 2)}</Text>
      {gates.length === 0
        ? <Text dimColor>no gates</Text>
        : gates.map((g) => {
          const gc = gateColor(g.state);
          const colorProp = gc ? { color: gc as string } : {};
          return (
            <Text key={g.name} {...colorProp}
              {...(onGateClick ? { onClick: () => onGateClick(g.name) } : {})}
            >
              {`${gateGlyph(g.state)} ${g.name}`}
            </Text>
          );
        })
      }

      {/* Context */}
      <Text dimColor>{sectionHeader("CTX", width - 2)}</Text>
      <Text color={ctx.color}>{ctx.label}</Text>
      <Text dimColor>{`turns: ${turnCount}${compactionCount > 0 ? `  compactions: ${compactionCount}` : ""}`}</Text>

      {/* Shortcuts */}
      {keyBindings.length > 0 && (
        <>
          <Text dimColor>{sectionHeader("KEYS", width - 2)}</Text>
          {keyBindings.slice(scrollOffset, scrollOffset + 6).map((kb) => (
            <Text key={kb.key} dimColor>{`${kb.key.padEnd(10)} ${kb.label}`}</Text>
          ))}
        </>
      )}
    </Box>
  );
}
