// Ollama helpers for the Jev setup flow: detect a running local Ollama + its models,
// and write a ready-to-paste helper doc that the user's main agent (Claude Code,
// Codex, …) can follow to install Ollama and pull a model.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface OllamaStatus {
  reachable: boolean;
  models: string[];
}

export async function detectOllama(endpoint = "http://localhost:11434", fetchImpl: typeof fetch = fetch): Promise<OllamaStatus> {
  try {
    const res = await fetchImpl(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { reachable: false, models: [] };
    const body = (await res.json()) as { models?: { name?: string }[] };
    return { reachable: true, models: (body.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === "string") };
  } catch {
    return { reachable: false, models: [] };
  }
}

function helperMarkdown(model: string): string {
  return [
    "# Help me set up Ollama for Gatewright's Jev engine",
    "",
    "Jev is Gatewright's local-AI advisory engine. It needs a local Ollama endpoint",
    "and at least one model. Please do the following on this machine:",
    "",
    "1. Install Ollama if it's missing:",
    "   - macOS/Linux: `curl -fsSL https://ollama.com/install.sh | sh`",
    "   - or download from https://ollama.com/download",
    "2. Start the service (usually automatic): `ollama serve` (if not already running).",
    `3. Pull a small, capable model: \`ollama pull ${model}\``,
    "4. Verify it responds: `ollama run " + model + ' "say ok"`.',
    "5. Confirm the HTTP API lists it: `curl -s http://localhost:11434/api/tags`.",
    "",
    "When done, re-run `gate` → Configure → enable Jev and pick the model.",
    "Jev stays advisory-only: it never blocks, it just informs the human gate.",
    "",
  ].join("\n");
}

/** Write the AI-helper doc under <cwd>/.gatewright/ and return its path. */
export function writeOllamaHelper(cwd: string, model = "qwen2.5"): string {
  const path = join(cwd, ".gatewright", "ollama-setup.md");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, helperMarkdown(model), "utf8");
  return path;
}
