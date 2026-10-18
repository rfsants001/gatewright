// FlowScreen — drives a FlowEngine end to end. For a `run` directive it calls the
// injected runEngine (streaming into RunLive); when that run finishes it feeds the
// output back (which may inject a question). For an `ask`/`gate` directive it shows
// AskPrompts and feeds the answers back. runEngine is injected so tests use a fake.

import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel } from "./components/index.js";
import { RunLive } from "./run-live.js";
import { AskPrompts } from "./ask-prompt.js";
import { FlowEngine, type Directive, type FlowStep } from "../core/flow/flow.js";
import { buildSddFlow } from "../core/flow/sdd-flow.js";
import type { Answers } from "../core/flow/questions.js";
import type { EngineEvent } from "../core/engine/types.js";
import type { ControlState } from "../core/control/control-state.js";

/** Runs one engine step; streams events and resolves with the run's text output. */
export type RunEngine = (prompt: string, handlers: { onEvent: (e: EngineEvent) => void; onState: (s: ControlState) => void }) => {
  done: Promise<string>;
  cancel: () => void;
};

export function FlowScreen({
  goal,
  runEngine,
  onDone,
  steps = buildSddFlow(),
}: {
  goal: string;
  runEngine: RunEngine;
  onDone: () => void;
  steps?: FlowStep[];
}) {
  const engineRef = useRef<FlowEngine>(new FlowEngine(steps, goal));
  const [directive, setDirective] = useState<Directive>(() => engineRef.current.peek());
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [runState, setRunState] = useState<ControlState>("IDLE");
  const cancelRef = useRef<(() => void) | null>(null);

  // Start the engine whenever the directive is a run.
  useEffect(() => {
    if (directive.type !== "run") return;
    setEvents([]);
    setRunState("RUNNING");
    let stale = false;
    const h = runEngine(directive.prompt, { onEvent: (e) => setEvents((p) => [...p, e]), onState: setRunState });
    cancelRef.current = h.cancel;
    void h.done.then((output) => {
      if (!stale) setDirective(engineRef.current.submitRun(output));
    });
    return () => {
      stale = true;
    };
  }, [directive]);

  if (directive.type === "done") {
    return <FlowDone aborted={directive.aborted === true} onBack={onDone} />;
  }
  if (directive.type === "ask") {
    return (
      <AskPrompts
        questions={directive.questions}
        title={directive.step.title}
        onComplete={(a: Answers) => setDirective(engineRef.current.submitAnswers(a))}
        onCancel={onDone}
      />
    );
  }
  // run directive → live log (leaving cancels the whole flow)
  return <RunLive events={events} state={runState} onCancel={() => cancelRef.current?.()} onBack={onDone} />;
}

function FlowDone({ aborted, onBack }: { aborted: boolean; onBack: () => void }) {
  useInput(() => onBack());
  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Flow complete" color={aborted ? "yellow" : "green"}>
        <Text color={aborted ? "yellow" : "green"}>{aborted ? "◼ Flow stopped — you declined a gate." : "✓ Flow finished — all steps done."}</Text>
        <Text dimColor>  any key — back to dashboard</Text>
      </Panel>
    </Box>
  );
}
