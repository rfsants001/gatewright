// RunLive — the live log panel, the #1 artifact of a run. Presentational: the
// parent feeds it the accumulated events + current ControlState (wired to the
// runner's onEvent/onState) and it renders a colored, tailing log with a status
// line. "c" cancels while running; "b" goes back once the run is terminal.

import { Box, Text, useInput } from "ink";
import { Logo, Panel, Icon, Spinner } from "./components/index.js";
import type { ControlState } from "../core/control/control-state.js";
import { isTerminal } from "../core/control/control-state.js";
import type { EngineEvent } from "../core/engine/types.js";

const MAX_VISIBLE = 16;

const KIND_COLOR: Record<EngineEvent["kind"], string> = {
  assistant: "white",
  tool_use: "cyan",
  tool_result: "gray",
  result: "green",
  system: "blue",
  error: "red",
  raw: "gray",
};

const KIND_LABEL: Record<EngineEvent["kind"], string> = {
  assistant: "ai",
  tool_use: "tool",
  tool_result: "ret",
  result: "done",
  system: "sys",
  error: "err",
  raw: "···",
};

function stateColor(state: ControlState): string {
  if (state === "PASSED") return "green";
  if (state === "FAILED") return "red";
  if (state === "CANCELLED") return "yellow";
  return "cyan";
}

function lineText(ev: EngineEvent): string {
  if (ev.kind === "tool_use") return ev.tool ?? "tool";
  return (ev.text ?? "").replace(/\s+/g, " ").slice(0, 120);
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
  useInput((input) => {
    if (input === "c" && !done) onCancel();
    else if (input === "b" && done) onBack();
  });

  const hidden = Math.max(0, events.length - MAX_VISIBLE);
  const visible = events.slice(-MAX_VISIBLE);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Run · live log" color={stateColor(state)}>
        <Box>
          {done ? <Icon name={state === "PASSED" ? "ok" : state === "CANCELLED" ? "warn" : "bad"} color={stateColor(state)} /> : <Spinner label="" />}
          <Text color={stateColor(state)} bold>{` ${state}`}</Text>
          <Text dimColor>{`  ${events.length} events`}</Text>
        </Box>
        {hidden > 0 ? <Text dimColor>{`  …${hidden} earlier events`}</Text> : null}
        {visible.map((ev, i) => (
          <Text key={`${i}-${ev.kind}`}>
            <Text color={KIND_COLOR[ev.kind]}>{`${KIND_LABEL[ev.kind].padEnd(4)} `}</Text>
            <Text dimColor={ev.kind === "raw" || ev.kind === "tool_result"}>{lineText(ev)}</Text>
          </Text>
        ))}
        <Text dimColor>{done ? "  b — back to dashboard" : "  c — cancel run"}</Text>
      </Panel>
    </Box>
  );
}
