// RunLive — the live run cockpit. Projects engine events into the Turn/Part
// model, groups parts by verbosity, budgets the viewport, and wires chrome
// (header, context bar, gate footer, keymap).
//
// Public props are unchanged from Phase 28; cleanMarkdown and wrap stay exported
// so flow-screen.tsx compiles unchanged.

import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Key } from "ink";
import { Logo, Panel, Spinner } from "./components/index.js";
import type { ControlState } from "../core/control/control-state.js";
import { isTerminal } from "../core/control/control-state.js";
import type { EngineEvent } from "../core/engine/types.js";
import { projectTurns } from "../core/run/project-turns.js";
import { groupParts, coerceVerbosity } from "../core/run/grouping.js";
import type { GroupedRow, GroupKind, PartGroup } from "../core/run/grouping.js";
import { rowWeights } from "../core/run/mount-budget.js";
import { visibleRange } from "./run/viewport.js";
import { handleKey, defaultCockpitState } from "./run/keymap.js";
import type { RunHeaderProps } from "./run/header.js";
import { RunHeader } from "./run/header.js";
import { ContextBar } from "./run/context-bar.js";
import { GateFooter } from "./run/gate-footer.js";
import type { GateStatus } from "./run/gate-footer.js";
import { Markdown } from "./run/markdown.js";
import { Reasoning } from "./run/reasoning.js";
import { ToolPart } from "./run/tool-part.js";
import { TurnUsage } from "./run/turn-usage.js";
import { TimelineDialog } from "./run/timeline-dialog.js";
import type { Turn } from "../core/run/parts.js";
import type { ReactElement } from "react";

// ── Legacy helpers — kept for flow-screen.tsx compatibility ──────────────

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

// ── Row renderer ─────────────────────────────────────────────────────────

function renderRow(row: GroupedRow, key: number, expanded: boolean): ReactElement {
  if (row.type === "part") {
    const { part } = row;
    if (part.type === "text") {
      const streamingProps = part.status === "streaming" ? { streaming: true } : {};
      return <Markdown key={key} text={part.text} {...streamingProps} />;
    }
    if (part.type === "reasoning") {
      const expandedProps = expanded ? { expanded: true } : {};
      return <Reasoning key={key} part={part} {...expandedProps} />;
    }
    if (part.type === "tool") {
      const expandedProps = expanded ? { expanded: true } : {};
      return <ToolPart key={key} part={part} {...expandedProps} />;
    }
  }
  if (row.type === "group") {
    const { group } = row;
    return (
      <Box key={key} flexDirection="column">
        {group.parts.map((part, i) => {
          if (part.type === "text") {
            const streamingProps = part.status === "streaming" ? { streaming: true } : {};
            return <Markdown key={i} text={part.text} {...streamingProps} />;
          }
          if (part.type === "reasoning") {
            const expandedProps = expanded ? { expanded: true } : {};
            return <Reasoning key={i} part={part} {...expandedProps} />;
          }
          if (part.type === "tool") {
            const expandedProps = expanded ? { expanded: true } : {};
            return <ToolPart key={i} part={part} {...expandedProps} />;
          }
          return null;
        })}
      </Box>
    );
  }
  return <Text key={key} dimColor>—</Text>;
}

// ── Mock gate statuses ────────────────────────────────────────────────────

const DEFAULT_GATES: GateStatus[] = [
  { name: "secret", state: "not-fired" },
  { name: "proportion", state: "not-fired" },
  { name: "plan", state: "not-fired" },
  { name: "completion", state: "not-fired" },
  { name: "quality", state: "not-fired" },
];

function stateColor(state: ControlState): string {
  if (state === "PASSED") return "green";
  if (state === "FAILED") return "red";
  if (state === "CANCELLED") return "yellow";
  return "cyan";
}

// ── Cumulative usage ──────────────────────────────────────────────────────

interface CumulativeUsage {
  tokensIn: number;
  tokensOut: number;
  cacheHit: number | undefined;
}

function sumUsage(turns: Turn[]): CumulativeUsage {
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheHit: number | undefined;
  for (const t of turns) {
    tokensIn += t.tokensIn;
    tokensOut += t.tokensOut;
    cacheHit = t.cacheHit;
  }
  return { tokensIn, tokensOut, cacheHit };
}

// ── RunLive ───────────────────────────────────────────────────────────────

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
  const startedAt = useMemo(() => Date.now(), []);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cockpit, setCockpit] = useState(() => defaultCockpitState(coerceVerbosity("medium")));
  const [follow, setFollow] = useState(true);
  const [anchor, setAnchor] = useState(0);

  useMemo(() => {
    if (done) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [done, startedAt]);

  const turns = useMemo(() => projectTurns(events, { userMessage: "" }), [events]);

  const allRows: GroupedRow[] = useMemo(() => {
    const rows: GroupedRow[] = [];
    for (const turn of turns) {
      const grouped = groupParts(turn.parts, cockpit.verbosity);
      rows.push(...grouped);
    }
    return rows;
  }, [turns, cockpit.verbosity]);

  const controls: { expanded: (g: PartGroup) => boolean; grouped: (k: GroupKind) => boolean } = {
    expanded: (_g: PartGroup) => cockpit.expanded,
    grouped: (_k: GroupKind) => true,
  };
  const weights = useMemo(() => rowWeights(allRows, controls), [allRows, cockpit.expanded]);

  const tRows = process.stdout.rows ?? 24;
  const chromRows = cockpit.showContextBar ? 5 : 4;
  const viewH = Math.max(4, tRows - chromRows);

  const usage = useMemo(() => sumUsage(turns), [turns]);

  const { start, end } = useMemo(
    () => visibleRange(weights, anchor, viewH, { follow: follow || !done }),
    [weights, anchor, viewH, follow, done],
  );

  const leave = (): void => {
    if (!done) onCancel();
    onBack();
  };

  useInput((input: string, key: Key) => {
    const result = handleKey(input, key.escape ?? false, cockpit);
    if (result.state !== cockpit) setCockpit(result.state);
    if (result.action === "back") { leave(); return; }
    if (result.action === "cancel" && !done) { onCancel(); return; }

    const maxAnchor = Math.max(0, allRows.length - 1);
    if (key.upArrow || input === "k") {
      setFollow(false);
      setAnchor((a: number) => Math.max(0, a - 1));
    } else if (key.downArrow || input === "j") {
      const next = anchor + 1;
      if (next >= maxAnchor) setFollow(true);
      else { setFollow(false); setAnchor(next); }
    } else if (input === "G") {
      setFollow(true);
    } else if (input === "g") {
      setFollow(false);
      setAnchor(0);
    }
  });

  const model = "claude-sonnet";
  const visibleRows = allRows.slice(start, end);
  const scrollInfo = allRows.length > viewH
    ? `  [${start + 1}-${Math.min(end, allRows.length)}/${allRows.length}]${follow ? " ⤓" : ""}`
    : "";

  const headerProps: RunHeaderProps = {
    model,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    elapsedMs: done ? elapsedMs : Date.now() - startedAt,
    paused: cockpit.paused,
  };
  if (usage.cacheHit !== undefined) headerProps.cacheHit = usage.cacheHit;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Run · live log" color={stateColor(state)}>
        <RunHeader {...headerProps} />

        {cockpit.showContextBar && (
          <ContextBar used={usage.tokensIn} total={200_000} />
        )}

        <Box>
          {done ? (
            <Text color={stateColor(state)} bold>
              {state === "PASSED" ? "✓" : state === "CANCELLED" ? "◼" : "✗"}
            </Text>
          ) : (
            <Spinner label="" />
          )}
          <Text color={stateColor(state)} bold>{` ${state}`}</Text>
          <Text dimColor>{`  ${events.length} events${scrollInfo}`}</Text>
        </Box>

        <Box flexDirection="column" marginTop={1} minHeight={viewH}>
          {visibleRows.length === 0 ? (
            <Text dimColor>  waiting for the engine…</Text>
          ) : (
            visibleRows.map((row, i) => renderRow(row, start + i, cockpit.expanded))
          )}
          {turns.map((turn: Turn, i: number) => {
            if (!turn.tokensIn && !turn.tokensOut) return null;
            return <TurnUsage key={i} turn={turn} model={model} />;
          })}
        </Box>

        {cockpit.showTimeline && <TimelineDialog turns={turns} />}

        <GateFooter gates={DEFAULT_GATES} />

        <Text dimColor>
          {done
            ? "  ↑↓ scroll · g/G top/bottom · t timeline · b/esc dashboard"
            : "  ↑↓ scroll · g/G · v verbosity · e expand · c context · t timeline · p pause · b/esc dashboard"}
        </Text>
      </Panel>
    </Box>
  );
}
