// RunLive — the live run log, styled after OpenCode's TUI: a scrollable viewport,
// compact dot/symbol indicators (no "ai"/"tool" tags), tool calls that show WHAT they
// touched (Read <file>, Bash <cmd>), and assistant prose with markdown noise stripped.
// It auto-follows the tail; ↑↓ scroll back through history. "c" cancels, "b" goes back.

import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel, Spinner } from "./components/index.js";
import type { ControlState } from "../core/control/control-state.js";
import { isTerminal } from "../core/control/control-state.js";
import type { EngineEvent } from "../core/engine/types.js";

const VIEW_H = 18;

interface Line {
  text: string;
  color?: string;
  dim?: boolean;
}

/** Strip markdown noise so prose reads cleanly in a terminal. */
export function cleanMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "");
}

/** Greedy word-wrap to `width`; hard-splits a word longer than the width. */
export function wrap(text: string, width: number): string[] {
  if (width < 4) width = 4;
  const rows: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > width) {
      if (rows.length && rows[rows.length - 1] === "") rows.pop();
      rows.push(w.slice(0, width));
      w = w.slice(width);
    }
    const last = rows[rows.length - 1];
    if (last === undefined || last.length + 1 + w.length > width || last === "") rows.push(w);
    else rows[rows.length - 1] = `${last} ${w}`;
  }
  return rows.length ? rows : [""];
}

/**
 * Flatten events into display lines — one terminal row each (wrapped to `width`, no
 * ellipsis), so scrolling is exact and long text reads in full.
 */
export function toLines(events: EngineEvent[], width = 1000): Line[] {
  const out: Line[] = [];
  const push = (prefix: string, cont: string, body: string, color?: string, dim?: boolean): void => {
    const base: Partial<Line> = { ...(color ? { color } : {}), ...(dim ? { dim: true } : {}) };
    wrap(body, width - prefix.length).forEach((seg, i) => out.push({ text: `${i === 0 ? prefix : cont}${seg}`, ...base } as Line));
  };
  for (const ev of events) {
    switch (ev.kind) {
      case "assistant": {
        const body = cleanMarkdown(ev.text ?? "").trimEnd();
        if (!body) break;
        body.split("\n").forEach((para) => (para.trim() ? push("● ", "  ", para) : out.push({ text: "" })));
        break;
      }
      case "tool_use":
        push("→ ", "  ", `${ev.tool}${ev.detail ? `  ${ev.detail}` : ""}`, "cyan");
        break;
      case "tool_result":
        if (ev.detail) push("  ⤷ ", "     ", ev.detail, undefined, true);
        break;
      case "result": {
        const body = cleanMarkdown(ev.text ?? "").trim();
        if (body) push("✓ ", "  ", body, "green");
        break;
      }
      case "error":
        push("✗ ", "  ", ev.text ?? "error", "red");
        break;
      case "system":
        if (ev.text && ev.text !== "init") push("∴ ", "  ", ev.text, undefined, true);
        break;
      default:
        if (ev.text) push("", "", ev.text, undefined, true);
    }
  }
  return out;
}

function stateColor(state: ControlState): string {
  if (state === "PASSED") return "green";
  if (state === "FAILED") return "red";
  if (state === "CANCELLED") return "yellow";
  return "cyan";
}

export function RunLive({
  events,
  state,
  onCancel,
  onBack,
}: {
  events: EngineEvent[];
  state: ControlState;
  onCancel: () => void;
  onBack: () => void;
}) {
  const done = isTerminal(state);
  const wrapW = Math.max(40, (process.stdout.columns ?? 80) - 6);
  const lines = useMemo(() => toLines(events, wrapW), [events, wrapW]);
  const maxOffset = Math.max(0, lines.length - VIEW_H);
  // follow = pinned to the tail; any scroll-up detaches until the user returns to bottom.
  const [follow, setFollow] = useState(true);
  const [offset, setOffset] = useState(0);
  const effectiveOffset = follow ? maxOffset : Math.min(offset, maxOffset);

  const leave = (): void => {
    if (!done) onCancel(); // leaving a live run cancels it
    onBack();
  };

  useInput((input, key) => {
    if (input === "b" || key.escape) return leave(); // back to dashboard anytime
    if (input === "q") return leave();
    if (input === "c" && !done) return onCancel(); // cancel but stay to read the log
    if (key.upArrow || input === "k") {
      setFollow(false);
      setOffset((o) => Math.max(0, (follow ? maxOffset : o) - 1));
    } else if (key.downArrow || input === "j") {
      const next = (follow ? maxOffset : offset) + 1;
      if (next >= maxOffset) setFollow(true);
      else setOffset(next);
    } else if (input === "G") {
      setFollow(true);
    } else if (input === "g") {
      setFollow(false);
      setOffset(0);
    }
  });

  const visible = lines.slice(effectiveOffset, effectiveOffset + VIEW_H);
  const scrollInfo = lines.length > VIEW_H ? `  [${effectiveOffset + 1}-${Math.min(effectiveOffset + VIEW_H, lines.length)}/${lines.length}]${follow ? " ⤓" : ""}` : "";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Run · live log" color={stateColor(state)}>
        <Box>
          {done ? <Text color={stateColor(state)} bold>{state === "PASSED" ? "✓" : state === "CANCELLED" ? "◼" : "✗"}</Text> : <Spinner label="" />}
          <Text color={stateColor(state)} bold>{` ${state}`}</Text>
          <Text dimColor>{`  ${events.length} events${scrollInfo}`}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1} minHeight={VIEW_H}>
          {visible.length === 0 ? (
            <Text dimColor>  waiting for the engine…</Text>
          ) : (
            visible.map((l, i) => (
              <Text key={effectiveOffset + i} {...(l.color ? { color: l.color } : {})} dimColor={l.dim === true}>
                {l.text}
              </Text>
            ))
          )}
        </Box>
        <Text dimColor>{done ? "  ↑↓ scroll · g/G top/bottom · b/esc dashboard" : "  ↑↓ scroll · g/G top/bottom · c cancel · b/esc dashboard"}</Text>
      </Panel>
    </Box>
  );
}
