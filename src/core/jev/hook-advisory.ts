// Live-hook Jev consult. Reads jev.config; if enabled, asks the local model to judge
// a situation and returns an Action Card (or null when disabled / abstaining / off).
// Advisory only — this never changes a gate's allow/deny, it only annotates it.

import { homedir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { JevConfigStore } from "./config-store.js";
import { OllamaAdapter } from "./adapters/ollama-adapter.js";
import { BudgetLedger } from "./budget.js";
import { JevDecisionEngine } from "./jev-engine.js";
import type { ActionCard } from "./types.js";

export async function jevAdvise(feature: string, summary: string): Promise<ActionCard | null> {
  const cfg = new JevConfigStore(new FileArtifactStore()).read();
  if (!cfg.enabled) return null;

  const journal = new Journal(new FileArtifactStore(), join(homedir(), ".gatewright", "jev-journal.json"));
  const engine = new JevDecisionEngine(
    new OllamaAdapter(cfg.model, { endpoint: cfg.endpoint, timeoutMs: 8000 }),
    new BudgetLedger(cfg.budget, journal),
    journal,
    { enabled: true },
  );
  const prompt = `${summary}\n\nReply ONLY with JSON: {"verdict":"approve|discard|abstain","rationale":"<one short sentence>","confidence":<0-1>}.`;
  const card = await engine.consult(feature, prompt, { feature, summary });
  return card.verdict === "abstain" ? null : card;
}
