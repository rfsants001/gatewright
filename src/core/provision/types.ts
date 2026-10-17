// Provisioner contract. The gate installs/configures tools itself — Ollama (+model
// pull), LiteLLM, graphify, or any pasted install command — and records what it set
// up in the two-level config. Steps are plain commands; the executor is injectable so
// tests never run a real install.

import type { CommandProbe } from "../env/probes.js";
import type { ConfigScope } from "../config/config-store.js";

/** One install/configure command. Pipes/shell go through `sh -c "<...>"`. */
export interface ProvisionStep {
  label: string;
  command: string;
  args: string[];
}

export interface ProvisionStatus {
  installed: boolean;
  version?: string;
  detail?: string;
}

export interface ProvisionTool {
  id: string;
  name: string;
  description: string;
  /** Where a successful install is recorded (gate = everywhere, project = this folder). */
  scope: ConfigScope;
  /** Probe whether it's already present (never installs, never throws). */
  detect(probe: CommandProbe): ProvisionStatus;
  /**
   * The commands to install/configure it. When undefined, the tool needs a
   * user-supplied command (we don't ship an installer we can't verify).
   */
  buildSteps?: (params: Record<string, string>) => ProvisionStep[];
  /** Params the UI should collect before building steps (e.g. Ollama model). */
  params?: { key: string; label: string; default?: string }[];
}

export interface StepOutcome {
  step: ProvisionStep;
  ok: boolean;
  output: string;
}

export interface ProvisionResult {
  ok: boolean;
  outcomes: StepOutcome[];
}

/** Runs one step, returning its combined output. Injected; default shells out. */
export type Executor = (step: ProvisionStep) => Promise<{ ok: boolean; output: string }>;
