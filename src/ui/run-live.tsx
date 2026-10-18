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
const WIDTH = 96;

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

const clip = (s: string): string => (s.length > WIDTH ? `${s.slice(0, WIDTH - 1)}…` : s);

/** Flatten events into display lines — one terminal row each, so scrolling is exact. */
export function toLines(events: EngineEvent[]): Line[] {
  const out: Line[] = [];
  for (const ev of events) {
    switch (ev.kind) {
      case "assistant": {
        const body = cleanMarkdown(ev.text ?? "").trimEnd();
        if (!body) break;
        body.split("\n").forEach((l, i) => out.push({ text: clip(`${i === 0 ? "● " : "  "}${l}`) }));
        break;
      }
      case "tool_use":
        out.push({ text: clip(`→ ${ev.tool}${ev.detail ? `  ${ev.detail}` : ""}`), color: "cyan" });
        break;
      case "tool_result":
        if (ev.detail) out.push({ text: clip(`  ⤷ ${ev.detail}`), dim: true });
        break;
      case "result": {
        const body = cleanMarkdown(ev.text ?? "").trim();
        if (body) out.push({ text: clip(`✓ ${body.split("\n")[0]}`), color: "green" });
        break;
      }
      case "error":
        out.push({ text: clip(`✗ ${ev.text ?? "error"}`), color: "red" });
        break;
      case "system":
        if (ev.text && ev.text !== "init") out.push({ text: clip(`∴ ${ev.text}`), dim: true });
        break;
      default:
        if (ev.text) out.push({ text: clip(ev.text), dim: true });
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
  const lines = useMemo(() => toLines(events), [events]);
  const maxOffset = Math.max(0, lines.length - VIEW_H);
  // follow = pinned to the tail; any scroll-up detaches until the user returns to bottom.
  const [follow, setFollow] = useState(true);
  const [offset, setOffset] = useState(0);
  const effectiveOffset = follow ? maxOffset : Math.min(offset, maxOffset);

  useInput((input, key) => {
    if (input === "q" && done) return onBack();
    if (input === "c" && !done) return onCancel();
    if (input === "b" && done) return onBack();
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
        <Text dimColor>{done ? "  ↑↓ scroll · g/G top/bottom · b back" : "  ↑↓ scroll · g/G top/bottom · c cancel"}</Text>
      </Panel>
    </Box>
  );
}
