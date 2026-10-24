// Model pricing + cost estimator — the single source of run cost, reused by the
// turn-usage row and the header. Pure. The table is embedded (not a .json asset):
// this toolchain has no resolveJsonModule and tsc wouldn't copy a json into dist,
// so a runtime file read would be fragile. Prices are USD per 1M tokens; a BRL
// rate converts to the "~R$" the cockpit shows.

export interface ModelPrice {
  /** USD per 1M input (non-cached) tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
  /** USD per 1M cache-read tokens (much cheaper than fresh input). */
  cacheReadPerM: number;
}

export interface PricingTable {
  usdToBrl: number;
  /** Keyed by a substring matched against the model id (e.g. "sonnet"). */
  models: Record<string, ModelPrice>;
}

/** Approximate list prices; adjust as providers change them. */
export const PRICING: PricingTable = {
  usdToBrl: 5.0,
  models: {
    opus: { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5 },
    sonnet: { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3 },
    haiku: { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08 },
  },
};

/** Resolve a model id to its price by substring match, or undefined when unknown. */
export function priceFor(model: string, table: PricingTable = PRICING): ModelPrice | undefined {
  const id = model.toLowerCase();
  for (const [key, price] of Object.entries(table.models)) {
    if (id.includes(key)) return price;
  }
  return undefined;
}

/**
 * Estimated cost in R$ for a turn, or undefined when the model isn't priced.
 * `cacheHit` (0..1) bills that fraction of the input at the cache-read rate.
 */
export function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cacheHit = 0,
  table: PricingTable = PRICING,
): number | undefined {
  const price = priceFor(model, table);
  if (!price) return undefined;
  const hit = Math.min(Math.max(cacheHit, 0), 1);
  const cached = tokensIn * hit;
  const uncached = tokensIn * (1 - hit);
  const usd = (uncached * price.inputPerM + cached * price.cacheReadPerM + tokensOut * price.outputPerM) / 1_000_000;
  return usd * table.usdToBrl;
}

/** Format a R$ amount for display: "R$0.12", "R$1.4k" for large values. */
export function formatBRL(value: number): string {
  if (value >= 1000) return `R$${(value / 1000).toFixed(1)}k`;
  return `R$${value.toFixed(2)}`;
}
