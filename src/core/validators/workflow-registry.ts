// WorkflowRegistry — a workflow is an ordered list of steps. It runs fail-fast:
// steps execute in order and the first failing step stops the run and is reported.

import { runStep, type Step } from "./step-registry.js";
import type { Finding } from "./types.js";

export interface Workflow {
  id: string;
  steps: Step[];
}

export interface WorkflowResult {
  ok: boolean;
  findings: Finding[];
  /** id of the first step that failed, when `ok` is false. */
  failedStep?: string;
}

/**
 * Run steps in order, each against its input from `inputs` (keyed by step id).
 * Aggregates findings and stops at the first failing step (fail-fast).
 */
export function runWorkflow(workflow: Workflow, inputs: Record<string, unknown>): WorkflowResult {
  const findings: Finding[] = [];
  for (const step of workflow.steps) {
    const result = runStep(step, inputs[step.id]);
    findings.push(...result.findings);
    if (!result.ok) return { ok: false, findings, failedStep: step.id };
  }
  return { ok: true, findings };
}

export class WorkflowRegistryError extends Error {
  readonly code = "DUPLICATE_WORKFLOW" as const;
  constructor(message: string) {
    super(message);
    this.name = "WorkflowRegistryError";
  }
}

export class WorkflowRegistry {
  readonly #workflows = new Map<string, Workflow>();

  register(workflow: Workflow): this {
    if (this.#workflows.has(workflow.id)) throw new WorkflowRegistryError(`workflow '${workflow.id}' already registered`);
    this.#workflows.set(workflow.id, workflow);
    return this;
  }

  get(id: string): Workflow | undefined {
    return this.#workflows.get(id);
  }

  list(): Workflow[] {
    return [...this.#workflows.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
