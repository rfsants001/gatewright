// Dialog host — renders the top dialog from the stack as a modal overlay.
// Dialogs: diff (colored patch), timeline (turns), fork (fork from message).

import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";
import type { DialogSpec, DialogStack } from "../dialog.js";
import { topDialog, hasDialog } from "../dialog.js";
import type { Turn } from "../../core/run/parts.js";

export interface DialogHostProps {
  stack: DialogStack;
  onClose: () => void;
  /** Turns for timeline dialog. */
  turns?: Turn[];
  /** Called when timeline jumps to a message. */
  onJumpToTurn?: (index: number) => void;
  /** Called when fork dialog forks from message index. */
  onFork?: (turnIndex: number) => void;
}

// ── Diff dialog ─────────────────────────────────────────────────────────────

function DiffDialog({ spec, onClose }: { spec: DialogSpec; onClose: () => void }): ReactElement {
  const path = typeof spec.path === "string" ? spec.path : "(unknown)";
  const patch = typeof spec.patch === "string" ? spec.patch : "";

  useInput((_input, key) => {
    if (key.escape) onClose();
  });

  const lines = patch.split("\n");
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={60}>
      <Text bold color="cyan">{`diff: ${path}`}</Text>
      {lines.slice(0, 20).map((line, i) => {
        const color = line.startsWith("+") ? "green" : line.startsWith("-") ? "red" : undefined;
        const p = color ? { color } : {};
        return <Text key={i} {...p}>{line}</Text>;
      })}
      {lines.length > 20 && <Text dimColor>{`…${lines.length - 20} more lines`}</Text>}
      <Text dimColor>esc to close</Text>
    </Box>
  );
}

// ── Timeline dialog ──────────────────────────────────────────────────────────

function TimelineDialog({
  spec,
  turns = [],
  onJump,
  onClose,
}: {
  spec: DialogSpec;
  turns: Turn[];
  onJump?: (i: number) => void;
  onClose: () => void;
}): ReactElement {
  void spec;

  useInput((input, key) => {
    if (key.escape || input === "t") { onClose(); return; }
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1 && n <= turns.length) {
      onJump?.(n - 1);
      onClose();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={50}>
      <Text bold color="cyan">Timeline</Text>
      {turns.slice(0, 20).map((turn, i) => (
        <Text key={i} dimColor={false}>
          {`${i + 1}. ${turn.userMessage.slice(0, 40) || "(auto)"}`}
        </Text>
      ))}
      {turns.length === 0 && <Text dimColor>no turns yet</Text>}
      <Text dimColor>1-9 jump · esc / t close</Text>
    </Box>
  );
}

// ── Fork dialog ──────────────────────────────────────────────────────────────

function ForkDialog({
  spec,
  onFork,
  onClose,
}: {
  spec: DialogSpec;
  onFork?: (i: number) => void;
  onClose: () => void;
}): ReactElement {
  const turnIndex = typeof spec.turnIndex === "number" ? spec.turnIndex : 0;

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (input === "y" || key.return) { onFork?.(turnIndex); onClose(); return; }
    if (input === "n") { onClose(); }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={50}>
      <Text bold color="yellow">Fork session</Text>
      <Text>{`Fork from turn ${turnIndex + 1}?`}</Text>
      <Text dimColor>y/enter confirm · n/esc cancel</Text>
    </Box>
  );
}

// ── Host ─────────────────────────────────────────────────────────────────────

export function DialogHost({
  stack,
  onClose,
  turns = [],
  onJumpToTurn,
  onFork,
}: DialogHostProps): ReactElement | null {
  if (!hasDialog(stack)) return null;
  const top = topDialog(stack);
  if (!top) return null;

  switch (top.kind) {
    case "diff":
      return <DiffDialog spec={top} onClose={onClose} />;
    case "timeline": {
      const timelineProps = onJumpToTurn ? { onJump: onJumpToTurn } : {};
      return <TimelineDialog spec={top} turns={turns} onClose={onClose} {...timelineProps} />;
    }
    case "fork": {
      const forkProps = onFork ? { onFork } : {};
      return <ForkDialog spec={top} onClose={onClose} {...forkProps} />;
    }
    default:
      return (
        <Box borderStyle="round" paddingX={1}>
          <Text dimColor>{`unknown dialog: ${top.kind}`}</Text>
        </Box>
      );
  }
}
