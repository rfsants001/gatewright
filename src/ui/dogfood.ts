// `gate dogfood` — self-configure the current project to govern a real agent session:
// wire the hooks + MCP server (safe merge + backup + history), then verify and report
// readiness. The CLI does the setup; the user just opens their agent here afterwards.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { join } from "node:path";
import { planHooks, planMcp, type WritePlan } from "../core/init/config-writers.js";
import { ConfigHistory, applyWithHistory } from "../core/history/config-history.js";
import { detect } from "../core/env/detect.js";

export async function runDogfood(): Promise<number> {
  const cwd = process.cwd();
  p.intro(pc.bold(pc.cyan(" gatewright · dogfood ")));
  p.log.info("This wires Gatewright to govern a real session in this project: hooks + MCP server.");

  const plans: WritePlan[] = [planHooks(join(cwd, ".claude", "settings.json")), planMcp(join(cwd, ".mcp.json"))];
  const toApply = plans.filter((pl) => pl.action !== "noop");

  if (toApply.length === 0) {
    p.outro(`${pc.green("✓")} already set up — open your agent here; the gates are live.`);
    return 0;
  }

  p.note(toApply.map((pl) => `${pc.bold(pl.path)}\n   ${pl.preview.join("\n   ")}`).join("\n\n"), "Will configure — nothing written yet");

  const go = await p.confirm({ message: "Set up dogfood now? (existing files backed up)", initialValue: true });
  if (p.isCancel(go) || !go) {
    p.cancel("No changes made.");
    return 1;
  }

  const revision = applyWithHistory(plans, { history: new ConfigHistory(), project: cwd, kind: "configure", backup: true });

  // Verify.
  const report = await detect({ cwd });
  const hosts = report.groups.find((g) => g.title === "Hosts");
  const ok = (label: string): boolean => hosts?.checks.find((c) => c.label === label)?.status === "ok";
  const lines = [
    `${ok("hooks wired") ? pc.green("✓") : pc.red("✗")} hooks wired`,
    `${ok("MCP server") ? pc.green("✓") : pc.red("✗")} MCP server registered`,
  ];
  if (revision) lines.push(`${pc.green("✓")} recorded revision ${pc.bold(revision.id)} ${pc.dim("(gate rollback to undo)")}`);
  p.note(lines.join("\n"), "Dogfood ready");

  p.outro(`Open your agent in ${pc.bold(cwd)} and work normally — the gates run on every tool use. ${pc.cyan("gate history")} to review.`);
  return 0;
}
