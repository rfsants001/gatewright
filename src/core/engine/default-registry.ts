import { EngineRegistry } from "./registry.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { codexAdapter } from "./adapters/codex.js";
import { geminiAdapter } from "./adapters/gemini.js";
import { openCodeAdapter } from "./adapters/opencode.js";

export function defaultEngineRegistry(): EngineRegistry {
  return new EngineRegistry().register(claudeCodeAdapter).register(codexAdapter).register(geminiAdapter).register(openCodeAdapter);
}
