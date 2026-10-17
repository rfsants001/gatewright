// OpenCode adapter — detectable, not yet runnable (same shape as Codex).

import type { CommandProbe } from "../../env/probes.js";
import { defaultCommandProbe } from "../../env/probes.js";
import type { EngineAdapter, EngineAvailability } from "../types.js";
import { EngineNotSupportedError } from "../types.js";

export function createOpenCodeAdapter(commandProbe: CommandProbe = defaultCommandProbe): EngineAdapter {
  return {
    id: "opencode",
    name: "OpenCode",
    authModel: "inherited-cli",
    async detect(): Promise<EngineAvailability> {
      const version = commandProbe("opencode", ["--version"]);
      return version === null ? { installed: false } : { installed: true, version, detail: "detected — headless support coming" };
    },
    buildHeadlessCommand() {
      throw new EngineNotSupportedError("opencode");
    },
    parseStreamLine: (line) => ({ kind: "raw", text: line }),
  };
}

export const openCodeAdapter: EngineAdapter = createOpenCodeAdapter();
