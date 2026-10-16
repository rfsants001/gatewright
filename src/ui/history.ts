// `gate history` · `gate rollback` · `gate fix` — view and undo configuration
// changes, and repair only the pending items you pick. All share the safe
// preview → confirm flow and record their changes to ConfigHistory.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { homedir } from "node:os";
import { join } from "node:path";
import { detect } from "../core/env/detect.js";
import { planHooks, planJev, planMcp, type WritePlan } from "../core/init/config-writers.js";
import { jevConfigPath } from "../core/jev/config-store.js";
import { ConfigHistory, applyWithHistory } from "../core/history/config-history.js";
import { rollbackRevision } from "../core/history/rollback.js";
import type { Revision, RevisionKind } from "../core/history/types.js";

const home = homedir();
const tilde = (path: string): string => path.replace(home, "~");
const aborted = (): number => {
  p.cancel("No changes made.");
  return 1;
};

function kindTag(kind: RevisionKind): string {
  if (kind === "rollback") return pc.magenta("rollback");
  if (kind === "fix") return pc.yellow("fix");
  return pc.green("configure");
}

function renderRevision(r: Revision): string {
  const files = r.files.map((f) => tilde(f.path)).join(", ");
  return `${pc.bold(r.id)} ${pc.dim(r.at)} ${kindTag(r.kind)}\n  ${r.summary}\n  ${pc.dim(files)}`;
}

export async function runHistory(): Promise<number> {
  const revs = new ConfigHistory().list();
  p.intro(pc.bold(pc.cyan(" gatewright · history ")));
  if (revs.length === 0) {
    p.outro(pc.dim("no configuration changes recorded yet — run gate init"));
    return 0;
  }
  p.note(revs.map(renderRevision).join("\n\n"), "Configuration history (newest first)");
  p.outro(`${revs.length} revision(s) · ${pc.cyan("gate rollback [id]")} to revert`);
  return 0;
}

export async function runRollback(id?: string): Promise<number> {
  const history = new ConfigHistory();
  p.intro(pc.bold(pc.cyan(" gatewright · rollback ")));

  const revertable = history.list().filter((r) => r.kind !== "rollback");
  if (revertable.length === 0) {
    p.outro(pc.dim("nothing to roll back"));
    return 0;
  }

  let targetId = id;
  if (!targetId) {
    const choice = await p.select({
      message: "Revert which change?",
      options: revertable.map((r) => ({ value: r.id, label: `${r.id} — ${r.summary}`, hint: r.at })),
    });
    if (p.isCancel(choice)) return aborted();
    targetId = choice;
  }

  const target = history.get(targetId);
  if (!target) {
    p.cancel(`revision '${targetId}' not found`);
    return 1;
  }

  const preview = target.files
    .map((f) => `${f.before === null ? pc.red("delete ") : pc.yellow("restore")} ${tilde(f.path)}`)
    .join("\n");
  p.note(preview, `Rollback of ${target.id} — nothing written yet`);

  const go = await p.confirm({ message: "Apply this rollback?", initialValue: false });
  if (p.isCancel(go) || !go) return aborted();

  const result = rollbackRevision(history, { id: targetId });
  if (!result.ok) {
    p.cancel(result.reason ?? "rollback failed");
    return 1;
  }
  p.outro(`${pc.green("✓")} rolled back ${pc.bold(target.id)} ${pc.dim(`(recorded ${result.recorded?.id})`)}`);
  return 0;
}

async function ollamaFirstModel(): Promise<string> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const body = (await res.json()) as { models?: { name?: string }[] };
      const name = body.models?.[0]?.name;
      if (typeof name === "string") return name;
    }
  } catch {
    // fall through to default
  }
  return "llama3.2";
}

interface Fixable {
  value: "hooks" | "mcp" | "jev";
  label: string;
  hint: string;
}

export async function runFix(): Promise<number> {
  const cwd = process.cwd();
  p.intro(pc.bold(pc.cyan(" gatewright · fix ")));

  const spin = p.spinner();
  spin.start("diagnosing");
  const report = await detect();
  spin.stop("diagnosed");

  const status = (title: string, label: string): string =>
    report.groups.find((g) => g.title === title)?.checks.find((c) => c.label === label)?.status ?? "missing";

  const fixable: Fixable[] = [];
  const hooks = status("Hosts", "hooks wired");
  if (hooks !== "ok") fixable.push({ value: "hooks", label: "Wire Claude Code hooks", hint: hooks });
  if (status("Hosts", "MCP server") !== "ok") fixable.push({ value: "mcp", label: "Register MCP server", hint: "missing" });
  if (status("Jev", "Jev") !== "ok") fixable.push({ value: "jev", label: "Enable Jev (advisory)", hint: "configure" });

  if (fixable.length === 0) {
    p.outro(`${pc.green("✓")} nothing to fix — everything is configured`);
    return 0;
  }

  const picks = await p.multiselect({
    message: "Which pending items to fix?",
    options: fixable,
    initialValues: fixable.map((f) => f.value),
    required: false,
  });
  if (p.isCancel(picks)) return aborted();

  const plans: WritePlan[] = [];
  if (picks.includes("hooks")) plans.push(planHooks(join(cwd, ".claude", "settings.json")));
  if (picks.includes("mcp")) plans.push(planMcp(join(cwd, ".mcp.json")));
  if (picks.includes("jev")) {
    plans.push(planJev(jevConfigPath(), { enabled: true, endpoint: "http://localhost:11434", model: await ollamaFirstModel(), budget: {} }));
  }

  const preview = plans.map((pl) => `${pc.bold(tilde(pl.path))}\n   ${pl.preview.join("\n   ")}`).join("\n\n");
  p.note(preview || pc.dim("nothing selected"), "Planned fixes — nothing written yet");

  const go = await p.confirm({ message: "Apply these fixes? Existing files are backed up (.bak).", initialValue: true });
  if (p.isCancel(go) || !go) return aborted();

  const revision = applyWithHistory(plans, { history: new ConfigHistory(), project: cwd, kind: "fix", backup: true });
  p.outro(revision ? `${pc.green("✓")} fixed · recorded revision ${pc.bold(revision.id)} ${pc.dim("(gate rollback to undo)")}` : pc.dim("nothing changed"));
  return 0;
}
