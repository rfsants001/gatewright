// StepList — runs a sequence of async steps and streams them like a package manager
// (npm/yarn/pip): each line spins while running, then settles to ✓ / ✗ with an
// optional detail. A step's run() may return a string shown as its detail.

import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Icon } from "./icon.js";
import { Spinner } from "./spinner.js";

export interface Step {
  label: string;
  run: () => void | string | Promise<void | string>;
}

type StepStatus = "pending" | "running" | "done" | "failed";

interface StepLine {
  label: string;
  status: StepStatus;
  detail?: string;
}

function StepRow({ line }: { line: StepLine }) {
  if (line.status === "running") {
    return (
      <Box>
        <Spinner label={line.label} />
      </Box>
    );
  }
  const mark =
    line.status === "done" ? <Icon name="ok" color="green" /> : line.status === "failed" ? <Icon name="bad" color="red" /> : <Text dimColor>·</Text>;
  return (
    <Text>
      {mark} {line.status === "pending" ? <Text dimColor>{line.label}</Text> : line.label}
      {line.detail ? <Text dimColor>{`  ${line.detail}`}</Text> : null}
    </Text>
  );
}

export function StepList({ steps, onDone, minDelayMs = 220 }: { steps: Step[]; onDone?: (ok: boolean) => void; minDelayMs?: number }) {
  const [lines, setLines] = useState<StepLine[]>(() => steps.map((s) => ({ label: s.label, status: "pending" })));

  useEffect(() => {
    let cancelled = false;
    const patch = (i: number, p: Partial<StepLine>): void => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

    void (async () => {
      let ok = true;
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        patch(i, { status: "running" });
        const started = Date.now();
        let detail: string | undefined;
        let failed = false;
        try {
          const r = await steps[i]!.run();
          if (typeof r === "string") detail = r;
        } catch (e) {
          failed = true;
          ok = false;
          detail = (e as Error).message;
        }
        const elapsed = Date.now() - started;
        if (elapsed < minDelayMs) await new Promise((r) => setTimeout(r, minDelayMs - elapsed));
        if (cancelled) return;
        patch(i, { status: failed ? "failed" : "done", ...(detail !== undefined ? { detail } : {}) });
        if (failed) break;
      }
      if (!cancelled) onDone?.(ok);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <StepRow key={i} line={l} />
      ))}
    </Box>
  );
}
