// run-hook — assemble the default gates, run them for a host payload, render the output.

import { GateRegistry } from "../core/gate/registry.js";
import { runGates } from "../core/gate/engine.js";
import type { HostAdapter, HostOutput } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { secretGuard } from "../gates/secret-guard.js";
import { verifyOnEdit } from "../gates/verify-on-edit.js";
import { errorClassifier } from "../gates/error-classifier.js";
import { proportionGate } from "../gates/proportion-gate.js";

/** The default gate set wired into the hook entrypoint. */
export function defaultRegistry(): GateRegistry {
  return new GateRegistry()
    .register(secretGuard())
    .register(verifyOnEdit())
    .register(errorClassifier())
    .register(proportionGate());
}

/** Parse a host payload, run the gates, render the host output. Fail-open end to end. */
export function runHook(raw: string, adapter: HostAdapter = claudeCodeAdapter): HostOutput {
  try {
    const ctx = adapter.parse(raw);
    if (!ctx) return { stdout: "", exitCode: 0 }; // ungoverned/malformed event → allow
    const result = runGates(defaultRegistry().list(), ctx);
    return adapter.render(result, ctx);
  } catch {
    return { stdout: "", exitCode: 0 }; // never break the host
  }
}
