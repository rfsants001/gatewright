// Gate marketplace package loader — admit a third-party gate/validator through a
// typed contract check keyed by the package manifest's declared kind, then register
// it. An invalid candidate is rejected and never registered. No arbitrary eval: the
// caller provides the constructed object; this module only validates and registers.

import type { Gate } from "../gate/types.js";
import type { GateRegistry } from "../gate/registry.js";
import type { Validator } from "../validators/types.js";
import type { ValidatorRegistry } from "../validators/registry.js";
import { validateGateContract, validateValidatorContract } from "./contract.js";

export type PackageKind = "gate" | "validator";

export interface GatePackageManifest {
  name: string;
  version: string;
  kind: PackageKind;
}

export interface Registries {
  gate?: GateRegistry;
  validator?: ValidatorRegistry;
}

export type RegisterResult = { ok: true } | { ok: false; problems: string[] };

/**
 * Contract-check `provided` against `manifest.kind`, then register it into the
 * matching registry. Missing registry or failing contract → rejected (not registered).
 */
export function registerFromPackage(manifest: GatePackageManifest, provided: unknown, registries: Registries): RegisterResult {
  if (manifest.kind === "gate") {
    const result = validateGateContract(provided);
    if (!result.ok) return { ok: false, problems: result.problems };
    if (!registries.gate) return { ok: false, problems: ["no gate registry provided"] };
    registries.gate.register(provided as Gate);
    return { ok: true };
  }

  const result = validateValidatorContract(provided);
  if (!result.ok) return { ok: false, problems: result.problems };
  if (!registries.validator) return { ok: false, problems: ["no validator registry provided"] };
  registries.validator.register(provided as Validator);
  return { ok: true };
}
