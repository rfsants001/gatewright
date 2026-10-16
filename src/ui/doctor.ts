// `gate doctor` — render the environment report as a polished, read-only board.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { detect, type DetectOptions } from "../core/env/detect.js";
import { summarize, type Check, type CheckStatus } from "../core/env/types.js";

function symbol(status: CheckStatus): string {
  if (status === "ok") return pc.green("✓");
  if (status === "warn") return pc.yellow("⚠");
  return pc.red("✗");
}

function renderCheck(check: Check): string {
  const head = `${symbol(check.status)} ${check.status === "ok" ? check.label : pc.bold(check.label)}`;
  const detail = check.detail ? pc.dim(` — ${check.detail}`) : "";
  const fix = check.fix && check.status !== "ok" ? pc.dim(pc.italic(`  → ${check.fix}`)) : "";
  return `${head}${detail}${fix}`;
}

export async function runDoctor(opts?: DetectOptions): Promise<number> {
  p.intro(pc.bold(pc.cyan(" gatewright · doctor ")));

  const spin = p.spinner();
  spin.start("probing environment");
  const report = await detect(opts);
  spin.stop("environment probed");

  for (const group of report.groups) {
    p.note(group.checks.map(renderCheck).join("\n"), group.title);
  }

  const t = summarize(report);
  const tally = `${pc.green(`${t.ok} ok`)} · ${pc.yellow(`${t.warn} warn`)} · ${pc.red(`${t.missing} to do`)}`;
  p.outro(t.missing > 0 ? `${tally}    run ${pc.cyan("gate init")} to finish setup` : tally);
  return 0;
}
