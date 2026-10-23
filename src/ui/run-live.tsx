// RunLive — the live run log, styled after OpenCode's TUI: a scrollable viewport,
// compact dot/symbol indicators (no "ai"/"tool" tags), tool calls that show WHAT they
// touched (Read <file>, Bash <cmd>), and assistant prose with markdown noise stripped.
// It auto-follows the tail; ↑↓ scroll back through history. "c" cancels, "b" goes back.

import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Panel, Spinner } from "./components/index.js";
import { HINTS_SCROLL, HINTS_BACK } from "./components/index.js";
import type { ControlState } from "../core/control/control-state.js";
import { isTerminal } from "../core/control/control-state.js";
import type { EngineEvent } from "../core/engine/types.js";
import { statusColor } from "./theme.js";

const VIEW_H = 18;

interface Line {
  text: string;
  /** Colors the whole line (used for errors — they're important). */
  color?: string;
  /** Colors only the first `leadLen` chars (the glyph/keyword); the rest stays default. */
  leadLen?: number;
  leadColor?: string;
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
 * ellipsis), so scrolling is exact and long text reads in full. Color is minimal:
 * only the glyph/tool-keyword is tinted; the body stays the default color (errors are
 * the exception and go fully red). This matches how OpenCode reads.
 */
export function toLines(events: EngineEvent[], width = 1000): Line[] {
  const out: Line[] = [];
  // Tint only the lead glyph/keyword; body default. Wraps body across rows, no ellipsis.
  const push = (lead: string, leadColor: string | undefined, body: string, dim?: boolean): void => {
    const indent = " ".repeat(lead.length);
    wrap(body, Math.max(8, width - lead.length)).forEach((seg, i) =>
      out.push({
        text: `${i === 0 ? lead : indent}${seg}`,
        ...(i === 0 && leadColor ? { leadLen: lead.length, leadColor } : {}),
        ...(dim ? { dim: true } : {}),
      }),
    );
  };
  const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
  let assistantAcc = "";
  for (const ev of events) {
    switch (ev.kind) {
      case "assistant": {
        const body = cleanMarkdown(ev.text ?? "").trimEnd();
        if (!body) break;
        assistantAcc += ` ${body}`;
        body.split("\n").forEach((para) => (para.trim() ? push("● ", undefined, para) : out.push({ text: "" })));
        break;
      }
      case "tool_use":
        push(`→ ${ev.tool} `, "cyan", ev.detail ?? "");
        break;
      case "tool_result":
        if (ev.detail) push("  ⤷ ", undefined, ev.detail, true);
        break;
      case "result": {
        const body = cleanMarkdown(ev.text ?? "").trimEnd();
        if (!body) break;
        // The engine repeats the final text in `result`; if it already streamed as
        // assistant messages, show a terse marker instead of duplicating it.
        if (assistantAcc && norm(assistantAcc).includes(norm(body))) {
          out.push({ text: "✓ done", leadLen: 2, leadColor: "green" });
          break;
        }
        body.split("\n").forEach((para, i) => (para.trim() ? push(i === 0 ? "✓ " : "  ", i === 0 ? "green" : undefined, para) : out.push({ text: "" })));
        break;
      }
      case "error":
        wrap(ev.text ?? "error", Math.max(8, width - 2)).forEach((seg, i) => out.push({ text: `${i === 0 ? "✗ " : "  "}${seg}`, color: "red" }));
        break;
      case "system":
        if (ev.text && ev.text !== "init") push("∴ ", undefined, ev.text, true);
        break;
      default:
        if (ev.text) push("", undefined, ev.text, true);
    }
  }
  return out;
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

  const stateIcon = done ? (state === "PASSED" ? "✓" : state === "CANCELLED" ? "◼" : "✗") : null;
  const hints = [
    ...HINTS_SCROLL,
    ...(done ? [] : [{ key: "c", label: "cancel" }]),
    ...HINTS_BACK,
  ];

  return (
    <AppFrame breadcrumb={`run · ${state.toLowerCase()}`} hints={hints}>
      <Panel title="Run · live log" color={statusColor(state)}>
        <Box>
          {stateIcon ? <Text color={statusColor(state)} bold>{stateIcon}</Text> : <Spinner label="" />}
          <Text color={statusColor(state)} bold>{` ${state}`}</Text>
          <Text dimColor>{`  ${events.length} events${scrollInfo}`}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1} minHeight={VIEW_H}>
          {visible.length === 0 ? (
            <Text dimColor>  waiting for the engine…</Text>
          ) : (
            visible.map((l, i) => {
              const key = effectiveOffset + i;
              if (l.color) return <Text key={key} color={l.color}>{l.text || " "}</Text>;
              if (l.leadLen && l.leadColor) {
                return (
                  <Text key={key}>
                    <Text color={l.leadColor}>{l.text.slice(0, l.leadLen)}</Text>
                    <Text dimColor={l.dim === true}>{l.text.slice(l.leadLen)}</Text>
                  </Text>
                );
              }
              return <Text key={key} dimColor={l.dim === true}>{l.text || " "}</Text>;
            })
          )}
        </Box>
      </Panel>
    </AppFrame>
  );
}
