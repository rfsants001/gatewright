import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Panel, Badge } from "./components/index.js";
import { HINTS_BACK, HINTS_SCROLL } from "./components/index.js";
import { RunLive, cleanMarkdown, wrap } from "./run-live.js";
import { AskPrompts } from "./ask-prompt.js";
import { FlowEngine, type Directive, type FlowStep } from "../core/flow/flow.js";
import { buildSddFlow } from "../core/flow/sdd-flow.js";
import { stripQuestions, type Answers } from "../core/flow/questions.js";
import type { EngineEvent } from "../core/engine/types.js";
import type { ControlState } from "../core/control/control-state.js";

export type RunEngine = (prompt: string, handlers: { onEvent: (e: EngineEvent) => void; onState: (s: ControlState) => void }) => {
  done: Promise<string>;
  cancel: () => void;
};

function FlowProgress({ steps, currentTitle }: { steps: FlowStep[]; currentTitle: string }) {
  return (
    <Box gap={1} marginBottom={1}>
      {steps.map((s, i) => {
        const isCurrent = s.title === currentTitle;
        return (
          <Box key={s.title}>
            {i > 0 && <Text dimColor>{" → "}</Text>}
            {isCurrent ? (
              <Text color="cyan" bold>{`[▶ ${s.title}]`}</Text>
            ) : (
              <Text dimColor>{s.title}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

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
    return () => { stale = true; };
  }, [directive]);

  if (directive.type === "done") {
    return <FlowDone steps={steps} aborted={directive.aborted === true} onBack={onDone} />;
  }

  if (directive.type === "ask") {
    const reviewText = lastOutput ? stripQuestions(lastOutput) : "";
    if (reviewText && !reviewed) {
      return (
        <FlowReview
          title={directive.step.title}
          steps={steps}
          text={reviewText}
          onContinue={() => setReviewed(true)}
          onBack={onDone}
        />
      );
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

  return <RunLive events={events} state={runState} onCancel={() => cancelRef.current?.()} onBack={onDone} />;
}

const REVIEW_H = 18;

function FlowReview({
  title,
  steps,
  text,
  onContinue,
  onBack,
}: {
  title: string;
  steps: FlowStep[];
  text: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const wrapW = Math.max(40, (process.stdout.columns ?? 80) - 6);
  const lines = useMemo(() => cleanMarkdown(text).split("\n").flatMap((l) => (l.trim() ? wrap(l, wrapW) : [""])), [text, wrapW]);
  const maxOffset = Math.max(0, lines.length - REVIEW_H);
  const [offset, setOffset] = useState(Math.max(0, lines.length - REVIEW_H));

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
    <AppFrame
      breadcrumb={`flow · review · ${title}`}
      hints={[...HINTS_SCROLL, { key: "enter/a", label: "continue" }, ...HINTS_BACK]}
    >
      <FlowProgress steps={steps} currentTitle={title} />
      <Panel title={`Review  ·  ${title}${scroll}`} color="yellow">
        <Box flexDirection="column" minHeight={REVIEW_H}>
          {visible.map((l, i) => (
            <Text key={offset + i}>{l || " "}</Text>
          ))}
        </Box>
      </Panel>
    </AppFrame>
  );
}

function FlowDone({ steps, aborted, onBack }: { steps: FlowStep[]; aborted: boolean; onBack: () => void }) {
  useInput(() => onBack());
  return (
    <AppFrame breadcrumb="flow · done" hints={[{ key: "any key", label: "back to dashboard" }]}>
      <FlowProgress steps={steps} currentTitle="" />
      <Panel title="Flow complete" color={aborted ? "yellow" : "green"}>
        <Box gap={1}>
          <Badge label={aborted ? "stopped" : "done"} color={aborted ? "yellow" : "green"} />
          <Text color={aborted ? "yellow" : "green"}>
            {aborted ? "Flow stopped — you declined a gate." : "Flow finished — all steps done."}
          </Text>
        </Box>
      </Panel>
    </AppFrame>
  );
}
