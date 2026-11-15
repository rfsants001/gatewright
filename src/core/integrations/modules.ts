// Module registry — manages pluggable module state across config scopes.
//
// Design: CRUD (upsert / setEnabled / get / list) always targets the registry's
// chosen scope (default "project"). `list()` reads that scope directly so callers
// get exactly what that scope declares — not a merged view. When an effective view
// (gate + project merged) is needed use `ConfigStore.resolve(cwd)` directly and
// read `.modules` from the result. This keeps the registry API simple and
// predictable: one scope, no surprises.

import type { ConfigScope, ConfigStore } from "../config/config-store.js";

export type ModuleKind = "jev" | "advisor" | "saver" | "model" | "mcp";

export type ModuleProvider = "internal" | "external";

export interface ModuleState {
  id: string;
  kind: ModuleKind;
  enabled: boolean;
  provider: ModuleProvider;
  config?: Record<string, unknown>;
}

export class ModuleRegistry {
  readonly #store: ConfigStore;
  readonly #scope: ConfigScope;

  constructor(store: ConfigStore, scope: ConfigScope = "project") {
    this.#store = store;
    this.#scope = scope;
  }

  /** All modules declared in the registry's scope (not merged with other scopes). */
  list(cwd?: string): ModuleState[] {
    return this.#store.read(this.#scope, cwd).modules ?? [];
  }

  /** Look up one module by id from the registry's scope. */
  get(id: string, cwd?: string): ModuleState | undefined {
    return this.list(cwd).find((m) => m.id === id);
  }

  /** Insert or replace a module in the registry's scope (merge-by-id via ConfigStore). */
  upsert(module: ModuleState, cwd?: string): void {
    this.#store.write(this.#scope, { modules: [module] }, cwd);
  }

  /**
   * Flip `enabled` on an existing module. No-ops silently when the module is absent
   * in this scope (it may live only in the other scope — callers can upsert first).
   */
  setEnabled(id: string, enabled: boolean, cwd?: string): void {
    const existing = this.get(id, cwd);
    if (!existing) return;
    this.upsert({ ...existing, enabled }, cwd);
  }
}
