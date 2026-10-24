// Command palette (ctrl+p). Lists commands from active keymap layers; text search;
// enter executes. Rendered as a floating overlay over the transcript.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";
import type { KeyBinding, KeymapStack } from "../keymap.js";
import { activeBindings } from "../keymap.js";

export interface CommandPaletteProps {
  stack: KeymapStack;
  onExecute: (action: string) => void;
  onClose: () => void;
}

export function CommandPalette({ stack, onExecute, onClose }: CommandPaletteProps): ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const all: KeyBinding[] = activeBindings(stack);
  const filtered = query
    ? all.filter(
        (b) =>
          b.label.toLowerCase().includes(query.toLowerCase()) ||
          b.action.toLowerCase().includes(query.toLowerCase()),
      )
    : all;

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.return) {
      const selected = filtered[selectedIdx];
      if (selected) { onExecute(selected.action); onClose(); }
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setSelectedIdx(0);
      return;
    }
    if (input && !key.ctrl) {
      setQuery((q) => q + input);
      setSelectedIdx(0);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={50}>
      <Text bold color="cyan">Command Palette</Text>
      <Text>{`> ${query}_`}</Text>
      {filtered.slice(0, 10).map((b, i) => {
        const sel = i === selectedIdx;
        const p = sel ? { color: "cyan" as const, bold: true } : {};
        return (
          <Text key={b.action} {...p}>
            {`${sel ? "▸" : " "} ${b.label.padEnd(24)} ${b.key}`}
          </Text>
        );
      })}
      {filtered.length === 0 && <Text dimColor>no matches</Text>}
      <Text dimColor>↑↓ navigate · enter select · esc close</Text>
    </Box>
  );
}
