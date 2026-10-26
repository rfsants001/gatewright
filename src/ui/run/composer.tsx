// Collapsible bottom composer panel. ctrl+k/esc collapse; ctrl+enter send.
// Multi-line text input with internal scroll when >4 lines.
// Tabs (←/→), slash picker, file-attach pills (ctrl+f, x removes), model selector (ctrl+m).

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";
import type { ComposerTab, SlashCommand } from "../../core/run/composer-state.js";
import { slashFilter, cycleTab, defaultComposerState, attachFile, removeFile } from "../../core/run/composer-state.js";

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "show help" },
  { name: "clear", description: "clear transcript" },
  { name: "quit", description: "quit gatewright" },
];

export interface ComposerProps {
  /** Called when the user submits the prompt. */
  onSubmit: (text: string) => void;
  /** Called when the composer requests to quit. */
  onQuit?: () => void;
  /** Whether the run is live (affects placeholder text). */
  live?: boolean;
  /** Available model ids for ctrl+m selector. */
  models?: string[];
  /** Number of queued prompts (shown as badge). */
  queuedCount?: number;
  /** Only capture keys when the composer has focus. */
  isActive?: boolean;
}

const PLACEHOLDER = "> type a prompt, / for commands";
const MAX_VISIBLE_LINES = 4;
const TABS: ComposerTab[] = ["Prompt", "Context", "Gates"];

function splitLines(text: string): string[] {
  return text.split("\n");
}

export function Composer({ onSubmit, onQuit, live = false, models, queuedCount = 0, isActive = true }: ComposerProps): ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState("");
  const [lineOffset, setLineOffset] = useState(0);
  const [composerState, setComposerState] = useState(() => defaultComposerState());
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelIdx, setModelIdx] = useState(0);

  const { activeTab, attachedFiles } = composerState;

  const slashActive = text.startsWith("/");
  const slashQuery = slashActive ? text.slice(1) : "";
  const slashMatches = slashActive ? slashFilter(slashQuery, SLASH_COMMANDS) : [];

  const lines = splitLines(text);
  const totalLines = lines.length;
  const visibleLines = lines.slice(lineOffset, lineOffset + MAX_VISIBLE_LINES);

  useInput((input, key) => {
    if (collapsed) {
      if (!key.escape && !key.ctrl) { setCollapsed(false); }
      if (key.ctrl && input === "k") { setCollapsed(false); }
      return;
    }

    if (showModelPicker) {
      const avail = models ?? [];
      if (key.upArrow) { setModelIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setModelIdx((i) => Math.min(avail.length - 1, i + 1)); return; }
      if (key.return) {
        const m = avail[modelIdx] ?? null;
        setComposerState((s) => ({ ...s, selectedModel: m }));
        setShowModelPicker(false);
        return;
      }
      if (key.escape) { setShowModelPicker(false); return; }
      return;
    }

    if (key.escape || (key.ctrl && input === "k")) {
      setCollapsed(true);
      return;
    }

    // Tab navigation ← →
    if (key.leftArrow) {
      setComposerState((s) => cycleTab(s, -1));
      return;
    }
    if (key.rightArrow) {
      setComposerState((s) => cycleTab(s, 1));
      return;
    }

    // ctrl+m = model picker
    if (key.ctrl && input === "m") {
      setShowModelPicker(true);
      setModelIdx(0);
      return;
    }

    // ctrl+f = attach current path (placeholder: just record cwd)
    if (key.ctrl && input === "f") {
      setComposerState((s) => attachFile(s, process.cwd()));
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

    if (key.upArrow && !slashActive) {
      setLineOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow && !slashActive) {
      setLineOffset((o) => Math.min(Math.max(0, totalLines - MAX_VISIBLE_LINES), o + 1));
      return;
    }

    // Remove last pill with 'x' when text empty
    if (input === "x" && text === "" && attachedFiles.length > 0) {
      setComposerState((s) => removeFile(s, s.attachedFiles.length - 1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setText((t) => t + input);
      const newLines = splitLines(text + input);
      if (newLines.length > MAX_VISIBLE_LINES) {
        setLineOffset(newLines.length - MAX_VISIBLE_LINES);
      }
    }
  }, { isActive });

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
      {/* Tabs */}
      <Box>
        {TABS.map((tab) => {
          const tabProps = tab === activeTab ? { bold: true, color: "cyan" as const } : { bold: false };
          return <Text key={tab} {...tabProps}>{` ${tab} `}</Text>;
        })}
        {queuedCount > 0 && <Text color="yellow">{` [${queuedCount} queued]`}</Text>}
        {composerState.selectedModel && <Text dimColor>{` model:${composerState.selectedModel}`}</Text>}
      </Box>
      {/* File pills */}
      {attachedFiles.length > 0 && (
        <Box>
          {attachedFiles.map((f, i) => (
            <Text key={i} color="blue">{`[${f.split("/").pop()}] `}</Text>
          ))}
          <Text dimColor>(x removes last)</Text>
        </Box>
      )}
      {/* Model picker */}
      {showModelPicker && (models ?? []).length > 0 && (
        <Box flexDirection="column">
          {(models ?? []).map((m, i) => {
            const mp = i === modelIdx ? { color: "cyan" as const } : {};
            return <Text key={m} {...mp}>{i === modelIdx ? `> ${m}` : `  ${m}`}</Text>;
          })}
        </Box>
      )}
      {/* Slash command picker */}
      {slashActive && slashMatches.length > 0 && (
        <Box flexDirection="column">
          {slashMatches.map((cmd) => (
            <Text key={cmd.name} dimColor>{`/${cmd.name}  ${cmd.description}`}</Text>
          ))}
        </Box>
      )}
      {/* Input */}
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
      <Text dimColor>{live ? "ctrl+enter send · esc collapse · ←/→ tabs · ctrl+m model · ctrl+f attach" : "ctrl+enter run · esc collapse"}</Text>
    </Box>
  );
}
