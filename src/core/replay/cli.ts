// `gate replay` — reconstruct a run's state from its journal at a chosen point.

import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { TimeTravel } from "./time-travel.js";
import { controlStateProjection, journalSummaryProjection } from "./projections.js";

export interface ReplayOutput {
  stdout: string;
  exitCode: number;
}

const err = (message: string): ReplayOutput => ({ stdout: `gate replay: ${message}\n`, exitCode: 1 });

export function runReplay(args: string[]): ReplayOutput {
  const path = args[0];
  if (!path) return err("missing <journal-path>. Usage: gate replay <path> [--at N | --ts ISO] [--summary]");

  let at: number | undefined;
  let ts: string | undefined;
  let summary = false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--summary") summary = true;
    else if (a === "--at") at = Number.parseInt(args[++i] ?? "", 10);
    else if (a === "--ts") ts = args[++i];
  }

  const store = new FileArtifactStore();
  if (!store.exists(path)) return err(`journal not found: ${path}`);

  const tt = new TimeTravel(new Journal(store, path));
  const len = tt.length();
  if (len === 0) return { stdout: "gate replay: empty journal\n", exitCode: 0 };

  let upTo = len - 1;
  if (at !== undefined) {
    if (Number.isNaN(at) || at < 0) return err("--at expects a non-negative integer");
    upTo = Math.min(at, len - 1);
  } else if (ts !== undefined) {
    upTo = tt.indexAtTimestamp(ts);
    if (upTo < 0) return err(`no events at or before ${ts}`);
  }

  const lines = [`replay @ event ${upTo} of ${len - 1}`];
  if (summary) lines.push(JSON.stringify(tt.project(journalSummaryProjection, upTo), null, 2));
  else lines.push(`control-state: ${tt.project(controlStateProjection, upTo)}`);
  return { stdout: `${lines.join("\n")}\n`, exitCode: 0 };
}
