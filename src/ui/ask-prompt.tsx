import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Panel, SelectList, CheckboxGroup, TextInputField, type Choice } from "./components/index.js";
import { HINTS_BACK } from "./components/index.js";
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

  const breadcrumb = `${title}  ·  question ${index + 1}/${questions.length}`;
  const hints = onCancel ? [...HINTS_BACK] : [];

  return (
    <AppFrame breadcrumb={breadcrumb} hints={hints}>
      <Panel title={q.prompt} color="yellow">
        {q.type === "text" ? (
          <Box flexDirection="column">
            <TextInputField value={text} placeholder="type your answer" onChange={setText} onSubmit={() => answer(text.trim())} />
            <Text dimColor>  enter submit{onCancel ? " · esc cancel" : ""}</Text>
          </Box>
        ) : null}
        {q.type === "confirm" ? (
          <Box flexDirection="column">
            <SelectList options={[opt("Yes"), opt("No")]} index={selIdx} onMove={setSelIdx} onSelect={(v) => answer(v === "Yes")} />
            <Text dimColor>  ↑↓ · enter choose{onCancel ? " · esc cancel" : ""}</Text>
          </Box>
        ) : null}
        {q.type === "select" ? (
          <Box flexDirection="column">
            <SelectList options={(q.options ?? []).map(opt)} index={selIdx} onMove={setSelIdx} onSelect={(v) => answer(v)} />
            <Text dimColor>  ↑↓ · enter choose{onCancel ? " · esc cancel" : ""}</Text>
          </Box>
        ) : null}
        {q.type === "multiselect" ? (
          <Box flexDirection="column">
            <CheckboxGroup
              options={(q.options ?? []).map(opt)}
              selected={multi}
              onToggle={(v) => setMulti((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
              onSubmit={() => answer(multi)}
            />
            <Text dimColor>  space toggle · enter submit{onCancel ? " · esc cancel" : ""}</Text>
          </Box>
        ) : null}
      </Panel>
    </AppFrame>
  );
}
