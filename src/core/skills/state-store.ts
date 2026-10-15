// SkillStateStore — persists which skills are enabled via the artifact store.
// enable/disable are idempotent; the enabled set is a sorted, deduped list.

import type { ArtifactStore } from "../artifact-store/types.js";

interface SkillState {
  enabled: string[];
}

export class SkillStateStore {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string) {
    this.#store = store;
    this.#path = path;
  }

  #read(): SkillState {
    const raw = this.#store.read(this.#path);
    if (!raw) return { enabled: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<SkillState>;
      return { enabled: Array.isArray(parsed.enabled) ? parsed.enabled : [] };
    } catch {
      return { enabled: [] };
    }
  }

  #write(enabled: Set<string>): void {
    this.#store.write(this.#path, JSON.stringify({ enabled: [...enabled].sort() }, null, 2));
  }

  enabled(): string[] {
    return this.#read().enabled;
  }

  isEnabled(name: string): boolean {
    return this.#read().enabled.includes(name);
  }

  /** Enable a skill (idempotent). */
  enable(name: string): void {
    const set = new Set(this.#read().enabled);
    set.add(name);
    this.#write(set);
  }

  /** Disable a skill (idempotent — disabling an absent skill is a no-op). */
  disable(name: string): void {
    const set = new Set(this.#read().enabled);
    set.delete(name);
    this.#write(set);
  }
}
