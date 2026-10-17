import { describe, expect, it } from "vitest";
import { rankModels, type FitCategory } from "./model-catalog.js";
import type { Hardware } from "../env/hardware.js";

const hw = (totalRamGB: number): Hardware => ({ totalRamGB, freeRamGB: totalRamGB / 2, cpuModel: "test", cpuCount: 8 });

describe("rankModels", () => {
  it("categorizes by usable RAM and sorts most-recommended first", () => {
    const ranked = rankModels(hw(16)); // usable ≈ 14 GB
    const byTag = Object.fromEntries(ranked.map((m) => [m.tag, m.category])) as Record<string, FitCategory>;
    expect(byTag["qwen2.5:7b"]).toBe("recommended"); // 5/14 ≈ 0.36
    expect(byTag["qwen2.5:14b"]).toBe("runs"); // 9.5/14 ≈ 0.68
    expect(byTag["llama3.1:70b"]).toBe("too-big"); // 42/14 ≫ 1
    // first item is a "recommended" one, and the most capable among recommended
    expect(ranked[0]?.category).toBe("recommended");
  });

  it("a tiny machine still recommends small models and rejects big ones", () => {
    const ranked = rankModels(hw(4)); // usable ≈ 2 GB
    const rec = ranked.filter((m) => m.category === "recommended").map((m) => m.tag);
    expect(rec).toContain("qwen2.5:0.5b");
    expect(ranked.find((m) => m.tag === "qwen2.5:7b")?.category).toBe("too-big");
  });

  it("a big machine makes large models runnable", () => {
    const ranked = rankModels(hw(64)); // usable ≈ 62
    expect(ranked.find((m) => m.tag === "qwen2.5:32b")?.category).toBe("recommended");
    expect(ranked[0]?.params).toBeGreaterThanOrEqual(32); // most capable first
  });
});
