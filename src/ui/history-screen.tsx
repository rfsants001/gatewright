// History + Rollback screens (Ink). History is a read-only log of what Gatewright
// changed (date + files). Rollback picks a revision, confirms, and restores it with
// animated per-file steps.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Panel, SelectList, StepList, type Step, type Choice } from "./components/index.js";
import { ConfigHistory, newRevisionId } from "../core/history/config-history.js";
import type { FileChange, Revision } from "../core/history/types.js";

const short = (p: string): string => p.replace(homedir(), "~");
const when = (iso: string): string => iso.slice(0, 16).replace("T", " ");
const PER_PAGE = 5;

export function HistoryScreen({ onBack, onQuit }: { onBack: () => void; onQuit: () => void }) {
  const revs = new ConfigHistory().list();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(revs.length / PER_PAGE));
  const current = Math.min(page, pages - 1);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onBack();
    else if (input === "n" || key.rightArrow) setPage((p) => Math.min(pages - 1, p + 1));
    else if (input === "p" || key.leftArrow) setPage((p) => Math.max(0, p - 1));
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">{" Configuration history "}</Text>
      <Text dimColor>What Gatewright changed on this machine, newest first.</Text>
      {revs.length === 0 ? (
        <Text dimColor>  no changes recorded yet</Text>
      ) : (
        revs.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE).map((r) => (
          <Panel key={r.id} title={`${when(r.at)}  ·  ${r.kind}`} color={r.kind === "rollback" ? "magenta" : "green"}>
            <Text>{r.summary}</Text>
            {r.files.map((f) => (
              <Text key={f.path} dimColor>{`  ${f.action}  ${short(f.path)}`}</Text>
            ))}
          </Panel>
        ))
      )}
      <Text dimColor>{revs.length ? `  page ${current + 1}/${pages} · n/p page · b back · q quit` : "  b back · q quit"}</Text>
    </Box>
  );
}

function buildRollbackSteps(history: ConfigHistory, target: Revision): Step[] {
  const inverse: FileChange[] = [];
  const steps: Step[] = target.files.map((f) => ({
    label: f.before === null ? `Removing ${short(f.path)}` : `Restoring ${short(f.path)}`,
    run: () => {
      const current = existsSync(f.path) ? readFileSync(f.path, "utf8") : null;
      if (f.before === null) {
        if (existsSync(f.path)) rmSync(f.path);
        inverse.push({ path: f.path, action: "delete", before: current, after: null });
        return "removed";
      }
      mkdirSync(dirname(f.path), { recursive: true });
      writeFileSync(f.path, f.before, "utf8");
      inverse.push({ path: f.path, action: "overwrite", before: current, after: f.before });
      return "restored";
    },
  }));
  steps.push({
    label: "Recording rollback",
    run: () => {
      const id = newRevisionId();
      history.record({
        id,
        at: new Date().toISOString(),
        kind: "rollback",
        summary: `rollback of ${target.id} (${target.summary})`,
        reverts: target.id,
        ...(target.project ? { project: target.project } : {}),
        files: inverse,
      });
      return id;
    },
  });
  return steps;
}

export function RollbackScreen({ onDone, onQuit }: { onDone: () => void; onQuit: () => void }) {
  const history = new ConfigHistory();
  const revertable = history.list().filter((r) => r.kind !== "rollback");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"pick" | "confirm" | "run">("pick");
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const target = revertable[index];

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if ((input === "b" || key.escape) && phase === "pick") onDone();
    else if ((input === "b" || key.escape) && phase === "confirm") setPhase("pick");
    else if (finished && (key.return || input === "b")) onDone();
  });

  if (revertable.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Panel title="Rollback" color="cyan">
          <Text dimColor>nothing to roll back</Text>
          <Text dimColor>  b back · q quit</Text>
        </Panel>
      </Box>
    );
  }

  if (phase === "run" && target) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Panel title={`Rolling back ${target.id}`} color="magenta">
          <StepList steps={buildRollbackSteps(history, target)} onDone={() => setFinished(true)} />
          {finished ? <Text dimColor>  enter / b — back</Text> : null}
        </Panel>
      </Box>
    );
  }

  if (phase === "confirm" && target) {
    const options: Choice<string>[] = [
      { value: "go", label: "Roll back this change" },
      { value: "back", label: "Back" },
    ];
    return (
      <Box flexDirection="column" paddingX={1}>
        <Panel title={`Roll back ${when(target.at)}?`} color="cyan">
          <Text>{target.summary}</Text>
          {target.files.map((f) => (
            <Text key={f.path} dimColor>{`  ${f.before === null ? "remove" : "restore"}  ${short(f.path)}`}</Text>
          ))}
          <SelectList options={options} index={confirmIndex} onMove={setConfirmIndex} onSelect={(v) => (v === "go" ? setPhase("run") : setPhase("pick"))} />
          <Text dimColor>  enter select · b back · q quit</Text>
        </Panel>
      </Box>
    );
  }

  const options: Choice<string>[] = revertable.map((r) => ({ value: r.id, label: `${when(r.at)} · ${r.kind}`, hint: r.summary }));
  return (
    <Box flexDirection="column" paddingX={1}>
      <Panel title="Rollback · pick a change" color="cyan">
        <SelectList options={options} index={index} onMove={setIndex} onSelect={() => setPhase("confirm")} />
        <Text dimColor>  enter select · b back · q quit</Text>
      </Panel>
    </Box>
  );
}
