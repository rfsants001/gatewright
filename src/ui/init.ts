// `gate init` — interactive self-configuration wizard. Detects the environment,
// asks only the essential choices, previews every write, and applies on confirm
// (backup + merge, never clobber). Finishes by scaffolding project dirs and
// registering the project in the global registry.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { planHooks, planJev, planMcp, type WritePlan } from "../core/init/config-writers.js";
import { scaffoldProject } from "../core/init/scaffold.js";
import { ProjectRegistry } from "../core/project/registry.js";
import { jevConfigPath } from "../core/jev/config-store.js";
import { ConfigHistory, applyWithHistory } from "../core/history/config-history.js";

const OLLAMA_ENDPOINT = "http://localhost:11434";

async function ollamaModels(endpoint = OLLAMA_ENDPOINT): Promise<string[]> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { models?: { name?: string }[] };
    return (body.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}

function actionTag(plan: WritePlan): string {
  if (plan.action === "create") return pc.green("create");
  if (plan.action === "merge") return pc.yellow("merge ");
  return pc.dim("noop  ");
}

const aborted = (): number => {
  p.cancel("No changes written.");
  return 1;
};

export async function runInit(): Promise<number> {
  const cwd = process.cwd();
  const home = homedir();
  p.intro(pc.bold(pc.cyan(" gatewright · init ")));

  const spin = p.spinner();
  spin.start("detecting environment");
  const models = await ollamaModels();
  spin.stop(models.length > 0 ? `Ollama: ${models.length} model(s)` : "environment detected");

  const hosts = await p.multiselect({
    message: "Which hosts to wire?",
    options: [
      { value: "claude", label: "Claude Code hooks", hint: `${join(cwd, ".claude", "settings.json")}` },
      { value: "mcp", label: "MCP server (.mcp.json)" },
    ],
    initialValues: ["claude", "mcp"],
    required: false,
  });
  if (p.isCancel(hosts)) return aborted();

  let jev: { enabled: boolean; endpoint: string; model: string; budget: Record<string, number> } | null = null;
  if (models.length > 0) {
    const picked = await p.multiselect({
      message: "Ollama models to make available to Jev (advisory)",
      options: models.map((m) => ({ value: m, label: m })),
      required: false,
    });
    if (p.isCancel(picked)) return aborted();
    const enable = await p.confirm({ message: "Enable Jev now? (advisory only — never blocks)", initialValue: false });
    if (p.isCancel(enable)) return aborted();
    jev = { enabled: enable, endpoint: OLLAMA_ENDPOINT, model: picked[0] ?? "llama3.2", budget: {} };
  } else {
    p.log.info(pc.dim("Ollama not reachable — skipping Jev (configure later with gate init)."));
  }

  // Build plans (nothing written yet).
  const plans: WritePlan[] = [];
  if (hosts.includes("claude")) plans.push(planHooks(join(cwd, ".claude", "settings.json")));
  if (hosts.includes("mcp")) plans.push(planMcp(join(cwd, ".mcp.json")));
  if (jev) plans.push(planJev(jevConfigPath(), jev));

  const preview = plans
    .map((pl) => `${actionTag(pl)} ${pc.bold(pl.path.replace(home, "~"))}\n   ${pl.preview.join("\n   ")}`)
    .join("\n\n");
  p.note(preview || pc.dim("nothing to change"), "Planned changes — nothing written yet");

  const go = await p.confirm({ message: "Apply these changes? Existing files are backed up (.bak).", initialValue: true });
  if (p.isCancel(go) || !go) return aborted();

  // Apply, recording one revision so the change can be rolled back later.
  const revision = applyWithHistory(plans, { history: new ConfigHistory(), project: cwd, kind: "configure", backup: true });
  const scaffold = scaffoldProject(cwd);
  new ProjectRegistry().register({
    path: cwd,
    name: basename(cwd),
    configuredAt: new Date().toISOString(),
    meta: { hosts, jevEnabled: jev?.enabled ?? false },
  });

  const summary: string[] = [];
  for (const plan of plans) {
    summary.push(plan.action === "noop" ? `${pc.dim("·")} ${plan.summary}` : `${pc.green("✓")} ${plan.summary}`);
  }
  summary.push(`${pc.green("✓")} scaffold: ${scaffold.created.length > 0 ? scaffold.created.join(", ") : pc.dim("all present")}`);
  summary.push(`${pc.green("✓")} registered project ${pc.bold(basename(cwd))}`);
  if (revision) summary.push(`${pc.green("✓")} recorded revision ${pc.bold(revision.id)} ${pc.dim("(gate rollback to undo)")}`);
  p.note(summary.join("\n"), "Done");

  p.outro(`${pc.cyan("gate doctor")} to review · ${pc.cyan("gate history")} to see changes`);
  return 0;
}
