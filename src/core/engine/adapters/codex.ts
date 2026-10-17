// Codex adapter — detectable, not yet runnable. Shows up in the cockpit as
// "detected, not yet supported" so the user knows it's on the roadmap.

import type { CommandProbe } from "../../env/probes.js";
import { defaultCommandProbe } from "../../env/probes.js";
import type { EngineAdapter, EngineAvailability } from "../types.js";
import { EngineNotSupportedError } from "../types.js";

export function createCodexAdapter(commandProbe: CommandProbe = defaultCommandProbe): EngineAdapter {
  return {
    id: "codex",
    name: "Codex",
    authModel: "inherited-cli",
    async detect(): Promise<EngineAvailability> {
      const version = commandProbe("codex", ["--version"]);
      return version === null ? { installed: false } : { installed: true, version, detail: "detected — headless support coming" };
    },
    buildHeadlessCommand() {
      throw new EngineNotSupportedError("codex");
    },
    parseStreamLine: (line) => ({ kind: "raw", text: line }),
  };
}

export const codexAdapter: EngineAdapter = createCodexAdapter();
