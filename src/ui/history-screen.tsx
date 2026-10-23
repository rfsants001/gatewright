import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Badge, ScrollableList, SelectList, StepList, type Step, type Choice } from "./components/index.js";
import { HINTS_BACK, HINTS_QUIT, HINTS_PAGE } from "./components/index.js";
import { ConfigHistory, newRevisionId } from "../core/history/config-history.js";
import type { FileChange, Revision } from "../core/history/types.js";

const short = (p: string): string => p.replace(homedir(), "~");
const when = (iso: string): string => iso.slice(0, 16).replace("T", " ");

export function HistoryScreen({ onBack, onQuit }: { onBack: () => void; onQuit: () => void }) {
  const revs = new ConfigHistory().list();

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onBack();
  });

  return (
    <AppFrame breadcrumb="history" hints={[...HINTS_BACK, ...HINTS_QUIT, ...HINTS_PAGE]}>
      <Text dimColor>What Gatewright changed on this machine, newest first.</Text>
      {revs.length === 0 ? (
        <Text dimColor>  no changes recorded yet</Text>
      ) : (
        <ScrollableList
          items={revs}
          renderItem={(r, active) => (
            <Box flexDirection="column" marginBottom={1}>
              <Box gap={1}>
                <Text {...(active ? { color: "cyan" as const } : {})} bold={active}>{when(r.at)}</Text>
                <Badge label={r.kind} color={r.kind === "rollback" ? "magenta" : "green"} />
              </Box>
              <Text>{r.summary}</Text>
              {r.files.map((f) => (
                <Text key={f.path} dimColor>{`  ${f.action}  ${short(f.path)}`}</Text>
              ))}
            </Box>
          )}
        />
      )}
    </AppFrame>
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
      <AppFrame breadcrumb="rollback" hints={[...HINTS_BACK, ...HINTS_QUIT]}>
        <Text dimColor>nothing to roll back</Text>
      </AppFrame>
    );
  }

  if (phase === "run" && target) {
    return (
      <AppFrame breadcrumb={`rollback · ${target.id}`} hints={finished ? [...HINTS_BACK] : []}>
        <StepList steps={buildRollbackSteps(history, target)} onDone={() => setFinished(true)} />
        {finished ? <Text dimColor>  enter / b — back</Text> : null}
      </AppFrame>
    );
  }

  if (phase === "confirm" && target) {
    const options: Choice<string>[] = [
      { value: "go", label: "Roll back this change" },
      { value: "back", label: "Back" },
    ];
    return (
      <AppFrame breadcrumb={`rollback · confirm`} hints={[...HINTS_BACK, ...HINTS_QUIT]}>
        <Text bold>{`Roll back ${when(target.at)}?`}</Text>
        <Text>{target.summary}</Text>
        {target.files.map((f) => (
          <Text key={f.path} dimColor>{`  ${f.before === null ? "remove" : "restore"}  ${short(f.path)}`}</Text>
        ))}
        <SelectList options={options} index={confirmIndex} onMove={setConfirmIndex} onSelect={(v) => (v === "go" ? setPhase("run") : setPhase("pick"))} />
      </AppFrame>
    );
  }

  const options: Choice<string>[] = revertable.map((r) => ({ value: r.id, label: `${when(r.at)} · ${r.kind}`, hint: r.summary }));
  return (
    <AppFrame breadcrumb="rollback" hints={[...HINTS_BACK, ...HINTS_QUIT]}>
      <Text dimColor>Pick a change to undo.</Text>
      <SelectList options={options} index={index} onMove={setIndex} onSelect={() => setPhase("confirm")} />
    </AppFrame>
  );
}
