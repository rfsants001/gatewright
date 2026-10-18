// AskPrompts — renders the flow's structured questions (from a <gate-ask> block) one
// at a time, picking the right control per type: free text, confirm (yes/no), single
// select, or multiselect (checkbox). Collects all answers and hands them back. This is
// how the end-to-end flow gets human input/approval between engine steps.

import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel, SelectList, CheckboxGroup, TextInputField, type Choice } from "./components/index.js";
import type { Answers, Question } from "../core/flow/questions.js";

const opt = (o: string): Choice<string> => ({ value: o, label: o });

export function AskPrompts({
  questions,
  onComplete,
  onCancel,
  title = "Input needed",
}: {
  questions: Question[];
  onComplete: (answers: Answers) => void;
  onCancel?: () => void;
  title?: string;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [text, setText] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [selIdx, setSelIdx] = useState(0);

  useEffect(() => {
    setText("");
    setMulti([]);
    setSelIdx(0);
  }, [index]);

  // Nothing to ask → complete immediately (hook stays unconditional).
  useEffect(() => {
    if (questions.length === 0) onComplete({});
  }, []);

  useInput((_input, key) => {
    if (key.escape && onCancel) onCancel();
  });

  const q = questions[index];
  if (!q) return null;

  const answer = (value: Answers[string]): void => {
    const next: Answers = { ...answers, [q.id]: value };
    if (index + 1 < questions.length) {
      setAnswers(next);
      setIndex(index + 1);
    } else {
      onComplete(next);
    }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title={`${title}  ·  ${index + 1}/${questions.length}`} color="yellow">
        <Text bold>{q.prompt}</Text>
        {q.type === "text" ? (
          <>
            <TextInputField value={text} placeholder="type your answer" onChange={setText} onSubmit={() => answer(text.trim())} />
            <Text dimColor>  enter submit{onCancel ? " · esc cancel" : ""}</Text>
          </>
        ) : null}
        {q.type === "confirm" ? (
          <>
            <SelectList options={[opt("Yes"), opt("No")]} index={selIdx} onMove={setSelIdx} onSelect={(v) => answer(v === "Yes")} />
            <Text dimColor>  ↑↓ · enter choose{onCancel ? " · esc cancel" : ""}</Text>
          </>
        ) : null}
        {q.type === "select" ? (
          <>
            <SelectList options={(q.options ?? []).map(opt)} index={selIdx} onMove={setSelIdx} onSelect={(v) => answer(v)} />
            <Text dimColor>  ↑↓ · enter choose{onCancel ? " · esc cancel" : ""}</Text>
          </>
        ) : null}
        {q.type === "multiselect" ? (
          <>
            <CheckboxGroup
              options={(q.options ?? []).map(opt)}
              selected={multi}
              onToggle={(v) => setMulti((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
              onSubmit={() => answer(multi)}
            />
            <Text dimColor>  space toggle · enter submit{onCancel ? " · esc cancel" : ""}</Text>
          </>
        ) : null}
      </Panel>
    </Box>
  );
}
