// Engine registry — holds the adapters the gate can drive. register() is pure
// (no I/O); detectAll() probes every adapter concurrently.

import type { EngineAdapter, EngineAvailability } from "./types.js";

export interface DetectedEngine {
  adapter: EngineAdapter;
  availability: EngineAvailability;
}

export class EngineRegistry {
  readonly #adapters = new Map<string, EngineAdapter>();

  register(adapter: EngineAdapter): this {
    this.#adapters.set(adapter.id, adapter);
    return this;
  }

  list(): EngineAdapter[] {
    return [...this.#adapters.values()];
  }

  has(id: string): boolean {
    return this.#adapters.has(id);
  }

  get(id: string): EngineAdapter {
    const adapter = this.#adapters.get(id);
    if (!adapter) throw new Error(`unknown engine '${id}' (registered: ${[...this.#adapters.keys()].join(", ") || "none"})`);
    return adapter;
  }

  /** Probe every adapter concurrently; order follows registration. */
  async detectAll(): Promise<DetectedEngine[]> {
    const adapters = this.list();
    const results = await Promise.all(adapters.map((a) => a.detect()));
    return adapters.map((adapter, i) => ({ adapter, availability: results[i]! }));
  }
}
