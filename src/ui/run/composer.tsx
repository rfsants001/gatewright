// Collapsible bottom composer panel. ctrl+k/esc collapse; ctrl+enter send.
// Multi-line text input with internal scroll when >4 lines.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";

export interface ComposerProps {
  /** Called when the user submits the prompt. */
  onSubmit: (text: string) => void;
  /** Called when the composer requests to quit. */
  onQuit?: () => void;
  /** Whether the run is live (affects placeholder text). */
  live?: boolean;
}

const PLACEHOLDER = "> type a prompt, / for commands";
const MAX_VISIBLE_LINES = 4;

function splitLines(text: string): string[] {
  return text.split("\n");
}

export function Composer({ onSubmit, onQuit, live = false }: ComposerProps): ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState("");
  const [lineOffset, setLineOffset] = useState(0);

  const lines = splitLines(text);
  const totalLines = lines.length;
  const visibleLines = lines.slice(lineOffset, lineOffset + MAX_VISIBLE_LINES);

  useInput((input, key) => {
    if (collapsed) {
      // Any printable key or ctrl+k re-opens
      if (!key.escape && !key.ctrl) { setCollapsed(false); }
      if (key.ctrl && input === "k") { setCollapsed(false); }
      return;
    }

    if (key.escape || (key.ctrl && input === "k")) {
      setCollapsed(true);
      return;
    }

    if (key.ctrl && input === "j") {
      // ctrl+enter = send
      const trimmed = text.trim();
      if (trimmed) {
        setText("");
        setLineOffset(0);
        onSubmit(trimmed);
      }
      return;
    }

    if (key.ctrl && input === "q") {
      onQuit?.();
      return;
    }

    if (key.return) {
      // enter = newline
      setText((t) => t + "\n");
      const newTotal = totalLines + 1;
      if (newTotal > MAX_VISIBLE_LINES) {
        setLineOffset(newTotal - MAX_VISIBLE_LINES);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setText((t) => t.slice(0, -1));
      const newLines = splitLines(text.slice(0, -1));
      setLineOffset(Math.max(0, newLines.length - MAX_VISIBLE_LINES));
      return;
    }

    if (key.upArrow) {
      setLineOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow) {
      setLineOffset((o) => Math.min(Math.max(0, totalLines - MAX_VISIBLE_LINES), o + 1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setText((t) => t + input);
      const newLines = splitLines(text + input);
      if (newLines.length > MAX_VISIBLE_LINES) {
        setLineOffset(newLines.length - MAX_VISIBLE_LINES);
      }
    }
  });

  if (collapsed) {
    return (
      <Box borderStyle="single" borderLeft borderTop={false} borderRight={false} borderBottom={false} paddingLeft={1}>
        <Text dimColor>[composer collapsed — ctrl+k to open]</Text>
      </Box>
    );
  }

  const placeholder = text.length === 0;
  return (
    <Box flexDirection="column" borderStyle="single" borderLeft borderTop={false} borderRight={false} borderBottom={false} paddingLeft={1}>
      <Box>
        <Text dimColor>{live ? "ctrl+enter send · esc collapse" : "ctrl+enter run · esc collapse"}</Text>
      </Box>
      {placeholder ? (
        <Text dimColor>{PLACEHOLDER}</Text>
      ) : (
        visibleLines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))
      )}
      {totalLines > MAX_VISIBLE_LINES && (
        <Text dimColor>{`…${totalLines} lines (↑↓ scroll)`}</Text>
      )}
    </Box>
  );
}
