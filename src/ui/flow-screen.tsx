// FlowScreen — drives a FlowEngine end to end. For a `run` directive it calls the
// injected runEngine (streaming into RunLive); when that run finishes it feeds the
// output back (which may inject a question). For an `ask`/`gate` directive it shows
// AskPrompts and feeds the answers back. runEngine is injected so tests use a fake.

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel } from "./components/index.js";
import { RunLive, cleanMarkdown, wrap } from "./run-live.js";
import { AskPrompts } from "./ask-prompt.js";
import { FlowEngine, type Directive, type FlowStep } from "../core/flow/flow.js";
import { buildSddFlow } from "../core/flow/sdd-flow.js";
import { stripQuestions, type Answers } from "../core/flow/questions.js";
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
  const [lastOutput, setLastOutput] = useState("");
  const [reviewed, setReviewed] = useState(false);
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
      if (stale) return;
      setLastOutput(output);
      setReviewed(false);
      setDirective(engineRef.current.submitRun(output));
    });
    return () => {
      stale = true;
    };
  }, [directive]);

  if (directive.type === "done") {
    return <FlowDone aborted={directive.aborted === true} onBack={onDone} />;
  }
  if (directive.type === "ask") {
    // Show what the engine produced (the plan, etc.) before asking to approve it —
    // but only when there's prose to read (a bare <gate-ask> leaves nothing to review).
    const reviewText = lastOutput ? stripQuestions(lastOutput) : "";
    if (reviewText && !reviewed) {
      return <FlowReview title={directive.step.title} text={reviewText} onContinue={() => setReviewed(true)} onBack={onDone} />;
    }
    return (
      <AskPrompts
        questions={directive.questions}
        title={directive.step.title}
        onComplete={(a: Answers) => {
          setReviewed(false);
          setLastOutput("");
          setDirective(engineRef.current.submitAnswers(a));
        }}
        onCancel={onDone}
      />
    );
  }
  // run directive → live log (leaving cancels the whole flow)
  return <RunLive events={events} state={runState} onCancel={() => cancelRef.current?.()} onBack={onDone} />;
}

const REVIEW_H = 18;

/** Scrollable read view of the last run's output, shown before a gate/ask so the human
 *  actually sees what they're approving. Enter/a continues; b/esc aborts the flow. */
function FlowReview({ title, text, onContinue, onBack }: { title: string; text: string; onContinue: () => void; onBack: () => void }) {
  const wrapW = Math.max(40, (process.stdout.columns ?? 80) - 6);
  const lines = useMemo(() => cleanMarkdown(text).split("\n").flatMap((l) => (l.trim() ? wrap(l, wrapW) : [""])), [text, wrapW]);
  const maxOffset = Math.max(0, lines.length - REVIEW_H);
  const [offset, setOffset] = useState(Math.max(0, lines.length - REVIEW_H)); // start at the end (freshest)

  useInput((input, key) => {
    if (key.return || input === "a") return onContinue();
    if (input === "b" || key.escape) return onBack();
    if (key.upArrow || input === "k") setOffset((o) => Math.max(0, o - 1));
    else if (key.downArrow || input === "j") setOffset((o) => Math.min(maxOffset, o + 1));
    else if (input === "g") setOffset(0);
    else if (input === "G") setOffset(maxOffset);
  });

  const visible = lines.slice(offset, offset + REVIEW_H);
  const scroll = lines.length > REVIEW_H ? `  [${offset + 1}-${Math.min(offset + REVIEW_H, lines.length)}/${lines.length}]` : "";
  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title={`Review  ·  ${title}${scroll}`} color="yellow">
        <Box flexDirection="column" minHeight={REVIEW_H}>
          {visible.map((l, i) => (
            <Text key={offset + i}>{l || " "}</Text>
          ))}
        </Box>
        <Text dimColor>  ↑↓ scroll · g/G top/bottom · enter continue to decision · b abort</Text>
      </Panel>
    </Box>
  );
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
