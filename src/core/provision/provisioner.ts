// Provisioner — runs a tool's steps through the injected executor, stops on the first
// failure, and on full success records the tool in the config at its scope (gate or
// project). The default executor shells out, capturing stdout+stderr.

import { execFile } from "node:child_process";
import { ConfigStore, type PackageRecord } from "../config/config-store.js";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import type { Executor, ProvisionResult, ProvisionTool, StepOutcome } from "./types.js";

export const defaultExecutor: Executor = (step) =>
  new Promise((resolve) => {
    execFile(step.command, step.args, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
      resolve({ ok: !err, output: output || (err ? err.message : "") });
    });
  });

export interface ProvisionDeps {
  executor?: Executor;
  configStore?: ConfigStore;
  cwd?: string;
  now?: () => string;
  onStep?: (outcome: StepOutcome) => void;
}

export async function provision(tool: ProvisionTool, params: Record<string, string>, deps: ProvisionDeps = {}): Promise<ProvisionResult> {
  const executor = deps.executor ?? defaultExecutor;
  const store = deps.configStore ?? new ConfigStore(new FileArtifactStore());
  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now ?? (() => new Date().toISOString());

  if (!tool.buildSteps) {
    return { ok: false, outcomes: [{ step: { label: tool.name, command: "", args: [] }, ok: false, output: `${tool.name} needs an install command` }] };
  }

  const outcomes: StepOutcome[] = [];
  let ok = true;
  for (const step of tool.buildSteps(params)) {
    const res = await executor(step);
    const outcome: StepOutcome = { step, ok: res.ok, output: res.output };
    outcomes.push(outcome);
    deps.onStep?.(outcome);
    if (!res.ok) {
      ok = false;
      break; // stop on first failure
    }
  }

  if (ok) {
    const record: PackageRecord = { id: tool.id, installedAt: now(), via: "gate-provisioner" };
    store.write(tool.scope, { packages: [record] }, cwd);
  }
  return { ok, outcomes };
}
