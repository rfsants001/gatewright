import { describe, expect, it } from "vitest";
import { DEFAULT_JEV_CONFIG, JevConfigStore } from "./config-store.js";
import type { ArtifactStore } from "../artifact-store/types.js";

class MemStore implements ArtifactStore {
  #m = new Map<string, string>();
  write(p: string, d: string | Uint8Array): void {
    this.#m.set(p, typeof d === "string" ? d : Buffer.from(d).toString("utf8"));
  }
  read(p: string): string | null {
    return this.#m.get(p) ?? null;
  }
  exists(p: string): boolean {
    return this.#m.has(p);
  }
  recover(): void {}
}

describe("Jev config timeout", () => {
  it("defaults to a generous timeout for slow local models", () => {
    expect(DEFAULT_JEV_CONFIG.timeoutMs).toBeGreaterThanOrEqual(20000);
  });

  it("an on-disk config without timeoutMs still reads the default (so old configs don't time out at 8s)", () => {
    const store = new MemStore();
    store.write("/mem/jev.json", JSON.stringify({ enabled: true, model: "qwen2.5:7b", endpoint: "http://localhost:11434" }));
    expect(new JevConfigStore(store, "/mem/jev.json").read().timeoutMs).toBe(DEFAULT_JEV_CONFIG.timeoutMs);
  });
});
