// The engines the gate knows about out of the box. Claude Code is runnable;
// Codex and OpenCode are detectable stubs until their headless paths land.

import { EngineRegistry } from "./registry.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { codexAdapter } from "./adapters/codex.js";
import { openCodeAdapter } from "./adapters/opencode.js";

export function defaultEngineRegistry(): EngineRegistry {
  return new EngineRegistry().register(claudeCodeAdapter).register(codexAdapter).register(openCodeAdapter);
}
