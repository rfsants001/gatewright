// Two-level configuration. The gate has a GLOBAL config (~/.gatewright/config.json)
// that applies everywhere, and each project has its OWN config (<cwd>/.gatewright/
// config.json) that overrides the gate's. `resolve()` deep-merges project over gate,
// so "install LiteLLM for the gate" and "wire graphify for this project" are distinct,
// first-class scopes. Absent/malformed files degrade to an empty config (never throws).

import { homedir } from "node:os";
import { join } from "node:path";
import type { ArtifactStore } from "../artifact-store/types.js";

export type ConfigScope = "gate" | "project";

/** A provisioned tool recorded in config (filled by the provisioner). */
export interface PackageRecord {
  id: string;
  installedAt: string;
  version?: string;
  via?: string;
}

export interface GatewrightConfig {
  /** Engine pre-selected in the Run composer. */
  defaultEngine?: string;
  /** Jev preferences at this scope (merged over the dedicated jev.config.json at use). */
  jev?: { enabled?: boolean; model?: string; endpoint?: string };
  /** Tools the provisioner has set up at this scope. */
  packages?: PackageRecord[];
}

export type ConfigPatch = Partial<GatewrightConfig>;

/** Resolve the config file path for a scope. GATEWRIGHT_HOME overrides the gate dir (test isolation). */
export function configPath(scope: ConfigScope, cwd: string = process.cwd()): string {
  const gateHome = process.env.GATEWRIGHT_HOME ?? join(homedir(), ".gatewright");
  return scope === "gate" ? join(gateHome, "config.json") : join(cwd, ".gatewright", "config.json");
}

function mergePackages(base: PackageRecord[] | undefined, over: PackageRecord[] | undefined): PackageRecord[] | undefined {
  if (!base && !over) return undefined;
  const byId = new Map<string, PackageRecord>();
  for (const p of base ?? []) byId.set(p.id, p);
  for (const p of over ?? []) byId.set(p.id, p); // project record wins per id
  return [...byId.values()];
}

/** Deep-merge two configs (over wins). Packages merge by id; jev merges key-wise. */
export function mergeConfig(base: GatewrightConfig, over: GatewrightConfig): GatewrightConfig {
  const merged: GatewrightConfig = { ...base, ...over };
  if (base.jev || over.jev) merged.jev = { ...base.jev, ...over.jev };
  const pkgs = mergePackages(base.packages, over.packages);
  if (pkgs) merged.packages = pkgs;
  return merged;
}

export class ConfigStore {
  readonly #store: ArtifactStore;
  constructor(store: ArtifactStore) {
    this.#store = store;
  }

  /** Read one scope's config, or an empty object when absent/malformed. */
  read(scope: ConfigScope, cwd: string = process.cwd()): GatewrightConfig {
    const raw = this.#store.read(configPath(scope, cwd));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as GatewrightConfig;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Persist a patch merged over the scope's current config; returns the new config. */
  write(scope: ConfigScope, patch: ConfigPatch, cwd: string = process.cwd()): GatewrightConfig {
    const next = mergeConfig(this.read(scope, cwd), patch);
    this.#store.write(configPath(scope, cwd), `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  /** Effective config for a project: gate config with the project's overrides on top. */
  resolve(cwd: string = process.cwd()): GatewrightConfig {
    return mergeConfig(this.read("gate", cwd), this.read("project", cwd));
  }
}
