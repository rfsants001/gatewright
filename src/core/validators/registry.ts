// ValidatorRegistry — catalog of validators by id, deterministic listing.

import type { Validator } from "./types.js";

export class ValidatorRegistryError extends Error {
  readonly code = "DUPLICATE_VALIDATOR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidatorRegistryError";
  }
}

export class ValidatorRegistry {
  readonly #validators = new Map<string, Validator>();

  register(validator: Validator): this {
    if (this.#validators.has(validator.id)) {
      throw new ValidatorRegistryError(`validator '${validator.id}' already registered`);
    }
    this.#validators.set(validator.id, validator);
    return this;
  }

  get(id: string): Validator | undefined {
    return this.#validators.get(id);
  }

  /** All validators, id-sorted (deterministic). */
  list(): Validator[] {
    return [...this.#validators.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
