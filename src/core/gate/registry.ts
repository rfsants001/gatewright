// GateRegistry — holds the registered gates in registration order, names unique.

import type { Gate } from "./types.js";

export class GateRegistryError extends Error {
  readonly code = "DUPLICATE_GATE" as const;
  constructor(message: string) {
    super(message);
    this.name = "GateRegistryError";
  }
}

export class GateRegistry {
  readonly #gates: Gate[] = [];

  register(gate: Gate): this {
    if (this.#gates.some((g) => g.name === gate.name)) {
      throw new GateRegistryError(`gate '${gate.name}' already registered`);
    }
    this.#gates.push(gate);
    return this;
  }

  list(): readonly Gate[] {
    return [...this.#gates];
  }
}
