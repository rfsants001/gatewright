import { describe, expect, it } from "vitest";
import { estimateCost, formatBRL, priceFor, PRICING } from "./pricing.js";

describe("priceFor", () => {
  it("matches a model id by substring", () => {
    expect(priceFor("claude-sonnet-4-6")).toBe(PRICING.models.sonnet);
    expect(priceFor("claude-opus-4-8")).toBe(PRICING.models.opus);
    expect(priceFor("claude-haiku-4-5")).toBe(PRICING.models.haiku);
  });

  it("returns undefined for an unknown model", () => {
    expect(priceFor("some-other-llm")).toBeUndefined();
  });
});

describe("estimateCost", () => {
  it("computes input+output cost in R$ via the BRL rate", () => {
    // sonnet: in 3, out 15 USD/1M; rate 5. 1M in + 1M out = (3+15)*5 = 90 R$.
    expect(estimateCost("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBeCloseTo(90, 5);
  });

  it("bills the cache-hit fraction of input at the cheaper cache-read rate", () => {
    // 1M input, 100% cache hit, no output → cacheReadPerM 0.3 * 5 = 1.5 R$.
    expect(estimateCost("claude-sonnet-4-6", 1_000_000, 0, 1)).toBeCloseTo(1.5, 5);
    // 0% cache hit → full input rate 3 * 5 = 15 R$.
    expect(estimateCost("claude-sonnet-4-6", 1_000_000, 0, 0)).toBeCloseTo(15, 5);
  });

  it("clamps the cache ratio and returns undefined for unknown models", () => {
    expect(estimateCost("claude-sonnet-4-6", 1_000_000, 0, 2)).toBeCloseTo(1.5, 5); // clamped to 1
    expect(estimateCost("mystery", 100, 100)).toBeUndefined();
  });
});

describe("formatBRL", () => {
  it("formats small and large amounts", () => {
    expect(formatBRL(0.12)).toBe("R$0.12");
    expect(formatBRL(0)).toBe("R$0.00");
    expect(formatBRL(1400)).toBe("R$1.4k");
  });
});
