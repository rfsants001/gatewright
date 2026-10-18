// JevConfigStore — persists Jev's runtime config (endpoint, model, budget, enabled)
// via the artifact store. The server owns configuration (HubStack-style): nothing is
// installed here; the config just points Jev at an already-running local endpoint.
// Default is disabled, so an unconfigured Jev is a safe no-op.

import { homedir } from "node:os";
import { join } from "node:path";
import type { ArtifactStore } from "../artifact-store/types.js";

export interface JevConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  /** feature → quota (calls). */
  budget: Record<string, number>;
  /** Max ms to wait for the local model before abstaining. Local 7B models on modest
   *  hardware routinely need ~10s for the first token, so the default is generous. */
  timeoutMs: number;
}

/** A partial config patch; keys may be explicitly undefined (ignored on write). */
export type JevConfigPatch = { [K in keyof JevConfig]?: JevConfig[K] | undefined };

export const DEFAULT_JEV_CONFIG: JevConfig = {
  enabled: false,
  endpoint: "http://localhost:11434",
  model: "llama3.2",
  budget: {},
  timeoutMs: 30000,
};

/** Path of the Jev config file. Overridable via GATEWRIGHT_JEV_CONFIG (test isolation). */
export function jevConfigPath(): string {
  return process.env.GATEWRIGHT_JEV_CONFIG ?? join(homedir(), ".gatewright", "jev.config.json");
}

export class JevConfigStore {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string = jevConfigPath()) {
    this.#store = store;
    this.#path = path;
  }

  /** Read the config, merged over defaults. Absent/malformed → defaults (disabled). */
  read(): JevConfig {
    const raw = this.#store.read(this.#path);
    if (!raw) return { ...DEFAULT_JEV_CONFIG };
    try {
      const parsed = JSON.parse(raw) as Partial<JevConfig>;
      return { ...DEFAULT_JEV_CONFIG, ...parsed, budget: { ...DEFAULT_JEV_CONFIG.budget, ...parsed.budget } };
    } catch {
      return { ...DEFAULT_JEV_CONFIG };
    }
  }

  /** Persist a (partial) config, merged over the current one. Undefined keys are ignored. */
  write(patch: JevConfigPatch): JevConfig {
    const current = this.read();
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const next: JevConfig = { ...current, ...defined, budget: { ...current.budget, ...patch.budget } };
    this.#store.write(this.#path, JSON.stringify(next, null, 2));
    return next;
  }
}
