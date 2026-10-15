// StepRegistry — a step is an ordered list of validators run against one input,
// aggregating their findings. Steps are the mid-level composition unit.

import type { ValidationResult, Validator } from "./types.js";

export interface Step {
  id: string;
  validators: Validator[];
}

/** Run every validator in order against the same input; aggregate findings; ok = all ok. */
export function runStep(step: Step, input: unknown): ValidationResult {
  const findings = [];
  let ok = true;
  for (const validator of step.validators) {
    const result = validator.validate(input);
    if (!result.ok) ok = false;
    findings.push(...result.findings);
  }
  return { ok, findings };
}

export class StepRegistryError extends Error {
  readonly code = "DUPLICATE_STEP" as const;
  constructor(message: string) {
    super(message);
    this.name = "StepRegistryError";
  }
}

export class StepRegistry {
  readonly #steps = new Map<string, Step>();

  register(step: Step): this {
    if (this.#steps.has(step.id)) throw new StepRegistryError(`step '${step.id}' already registered`);
    this.#steps.set(step.id, step);
    return this;
  }

  get(id: string): Step | undefined {
    return this.#steps.get(id);
  }

  list(): Step[] {
    return [...this.#steps.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
