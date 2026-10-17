// Turn write-plans into animated StepList steps: one line per file (with backup
// detail), optional extra steps (scaffold, register), then a "record revision" step.
// Shared by the config / fix / dogfood pages so every change streams its own log.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { Step } from "./components/index.js";
import { applyPlan, type WritePlan } from "../core/init/config-writers.js";
import { ConfigHistory, newRevisionId } from "../core/history/config-history.js";
import type { FileChange, RevisionKind } from "../core/history/types.js";

const short = (p: string): string => p.replace(homedir(), "~");

export interface ApplyBuild {
  steps: Step[];
  /** Available after the steps run: the recorded revision id, if any. */
  revisionId: () => string | undefined;
}

export function buildApplySteps(plans: WritePlan[], opts: { project: string; kind: RevisionKind; extra?: Step[] }): ApplyBuild {
  const active = plans.filter((p) => p.action !== "noop");
  const changes: FileChange[] = [];
  let revisionId: string | undefined;

  const steps: Step[] = active.map((p) => ({
    label: p.action === "create" ? `Creating ${short(p.path)}` : `Updating ${short(p.path)}`,
    run: () => {
      const before = existsSync(p.path) ? readFileSync(p.path, "utf8") : null;
      const res = applyPlan(p, { backup: true });
      changes.push({ path: p.path, action: p.action as FileChange["action"], before, after: p.nextContent });
      return res.backupPath ? `backed up → ${short(res.backupPath)}` : p.action === "create" ? "created" : "updated";
    },
  }));

  if (opts.extra) steps.push(...opts.extra);

  steps.push({
    label: "Recording revision",
    run: () => {
      if (changes.length === 0) return "nothing changed";
      revisionId = newRevisionId();
      new ConfigHistory().record({
        id: revisionId,
        at: new Date().toISOString(),
        kind: opts.kind,
        summary: active.map((p) => p.summary).join("; "),
        project: opts.project,
        files: changes,
      });
      return `${revisionId} — rollback to undo`;
    },
  });

  return { steps, revisionId: () => revisionId };
}
