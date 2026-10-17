// A small curated catalog of popular Ollama models with approximate RAM needs
// (Q4-ish quant), and a ranker that categorizes them against a machine's RAM —
// most-recommended first, canirun.ai-style.

import type { Hardware } from "../env/hardware.js";

export interface CatalogModel {
  /** Ollama tag to pull, e.g. "qwen2.5:7b". */
  tag: string;
  family: string;
  /** Parameter count in billions (for ranking capability). */
  params: number;
  /** Approximate RAM needed to run comfortably, in GB (Q4-ish). */
  minRamGB: number;
}

export const MODEL_CATALOG: CatalogModel[] = [
  { tag: "qwen2.5:0.5b", family: "qwen2.5", params: 0.5, minRamGB: 0.6 },
  { tag: "llama3.2:1b", family: "llama3.2", params: 1, minRamGB: 1.0 },
  { tag: "qwen2.5:1.5b", family: "qwen2.5", params: 1.5, minRamGB: 1.3 },
  { tag: "llama3.2:3b", family: "llama3.2", params: 3, minRamGB: 2.4 },
  { tag: "qwen2.5:3b", family: "qwen2.5", params: 3, minRamGB: 2.4 },
  { tag: "phi3.5", family: "phi", params: 3.8, minRamGB: 2.8 },
  { tag: "gemma2:9b", family: "gemma2", params: 9, minRamGB: 6.5 },
  { tag: "qwen2.5:7b", family: "qwen2.5", params: 7, minRamGB: 5.0 },
  { tag: "llama3.1:8b", family: "llama3.1", params: 8, minRamGB: 5.6 },
  { tag: "deepseek-r1:8b", family: "deepseek-r1", params: 8, minRamGB: 5.6 },
  { tag: "qwen2.5:14b", family: "qwen2.5", params: 14, minRamGB: 9.5 },
  { tag: "deepseek-r1:14b", family: "deepseek-r1", params: 14, minRamGB: 9.5 },
  { tag: "qwen2.5:32b", family: "qwen2.5", params: 32, minRamGB: 20 },
  { tag: "llama3.1:70b", family: "llama3.1", params: 70, minRamGB: 42 },
];

export type FitCategory = "recommended" | "runs" | "heavy" | "too-big";

export interface RankedModel extends CatalogModel {
  category: FitCategory;
  /** minRamGB as a share of the machine's usable RAM. */
  ratio: number;
}

const ORDER: Record<FitCategory, number> = { recommended: 0, runs: 1, heavy: 2, "too-big": 3 };

function categorize(ratio: number): FitCategory {
  if (ratio <= 0.5) return "recommended";
  if (ratio <= 0.8) return "runs";
  if (ratio <= 1.05) return "heavy";
  return "too-big";
}

/**
 * Rank the catalog for a machine. Usable RAM reserves ~2 GB for the OS. Sorted
 * most-recommended first; within a category the largest (most capable) model wins.
 */
export function rankModels(hardware: Hardware, catalog: CatalogModel[] = MODEL_CATALOG): RankedModel[] {
  const usable = Math.max(1, hardware.totalRamGB - 2);
  return catalog
    .map((m) => {
      const ratio = Math.round((m.minRamGB / usable) * 100) / 100;
      return { ...m, ratio, category: categorize(ratio) };
    })
    .sort((a, b) => ORDER[a.category] - ORDER[b.category] || b.params - a.params);
}
