import { createStreamHost } from "./stream-host.js";
import { defaultCommandProbe, type CommandProbe } from "../../env/probes.js";
import { gateScript } from "../../init/gate-bin.js";

import { codexExecutable } from "../codex-executable.js";

export const createCodexAdapter = (probe?: CommandProbe) => ({
  ...createStreamHost("codex", probe),
  async detect() {
    const executable = codexExecutable();
    const version = (probe ?? defaultCommandProbe)(executable.command, [...executable.prefix, "--version"]);
    return version ? { installed: true, version } : { installed: false };
  },
  buildHeadlessCommand(opts: import("../types.js").EngineRunOptions) {
    return { bin: process.execPath, args: [gateScript(), "codex-run", "--json"], env: { GATEWRIGHT_CODEX_RUN: JSON.stringify(opts) } };
  },
});
export const codexAdapter = createCodexAdapter();
