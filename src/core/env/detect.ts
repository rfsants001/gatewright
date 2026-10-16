// detect() — run all probes into a grouped EnvironmentReport. Network probes run in
// parallel; everything is injectable so the detection is unit-testable without real
// tools or network. No probe throws (each degrades to warn/missing).

import { homedir } from "node:os";
import { join } from "node:path";
import { jevConfigPath } from "../jev/config-store.js";
import type { EnvironmentReport } from "./types.js";
import {
  claudeCodeCheck,
  codexCheck,
  defaultCommandProbe,
  gitCheck,
  hooksCheck,
  jevCheck,
  lmStudioCheck,
  mcpCheck,
  nodeCheck,
  ollamaCheck,
  skillsCheck,
  type CommandProbe,
  type ProbeContext,
} from "./probes.js";

export interface DetectOptions {
  home?: string;
  cwd?: string;
  now?: number;
  fetchImpl?: typeof fetch;
  commandProbe?: CommandProbe;
  ollamaEndpoint?: string;
  lmStudioEndpoint?: string;
  skillsDir?: string;
  jevConfigPath?: string;
}

function context(opts: DetectOptions): ProbeContext {
  const cwd = opts.cwd ?? process.cwd();
  return {
    home: opts.home ?? homedir(),
    cwd,
    now: opts.now ?? Date.now(),
    fetchImpl: opts.fetchImpl ?? fetch,
    commandProbe: opts.commandProbe ?? defaultCommandProbe,
    ollamaEndpoint: (opts.ollamaEndpoint ?? "http://localhost:11434").replace(/\/$/, ""),
    lmStudioEndpoint: (opts.lmStudioEndpoint ?? "http://localhost:1234").replace(/\/$/, ""),
    skillsDir: opts.skillsDir ?? process.env.GATEWRIGHT_SKILLS_DIR ?? join(cwd, "skills"),
    jevConfigPath: opts.jevConfigPath ?? jevConfigPath(),
  };
}

export async function detect(opts: DetectOptions = {}): Promise<EnvironmentReport> {
  const ctx = context(opts);
  const [ollama, lmStudio] = await Promise.all([ollamaCheck(ctx), lmStudioCheck(ctx)]);
  return {
    groups: [
      { title: "Environment", checks: [nodeCheck(), gitCheck(ctx)] },
      { title: "Hosts", checks: [claudeCodeCheck(ctx), hooksCheck(ctx), mcpCheck(ctx), codexCheck(ctx)] },
      { title: "Local AI", checks: [ollama, lmStudio] },
      { title: "Jev", checks: [jevCheck(ctx)] },
      { title: "Skills", checks: [skillsCheck(ctx)] },
    ],
  };
}
