// FlowEngine — a deterministic stepper for the end-to-end dev flow. It holds the
// step list + a context accumulator and yields one Directive at a time; the UI is the
// effect executor (it runs the engine for `run`, shows AskPrompts for `ask`/`gate`)
// and reports back. Pure and I/O-free, so it's fully testable.
//
// Dynamic behavior:
//  - a `run` whose output contains a <gate-ask> block injects an `ask` right after it,
//    then a re-run of the same step with the answers appended (so the engine finishes).
//  - a `gate` answered with a `false` confirm aborts the flow (no sign-off → stop).

import { parseQuestions, type Answers, type Question } from "./questions.js";

export type StepKind = "run" | "ask" | "gate";

export interface FlowStep {
  id: string;
  kind: StepKind;
  title: string;
  /** For `run`: build the engine prompt from the accumulated context. */
  prompt?: (ctx: FlowContext) => string;
  /** For `ask`/`gate`: the questions to put to the human. */
  questions?: (ctx: FlowContext) => Question[];
  /** Internal: for an injected ask, the prompt of the run that triggered it. */
  _parentPrompt?: string;
}

export interface FlowContext {
  goal: string;
  answers: Record<string, Answers>;
  outputs: Record<string, string>;
}

export type Directive =
  | { type: "run"; step: FlowStep; prompt: string }
  | { type: "ask"; step: FlowStep; questions: Question[] }
  | { type: "done"; aborted?: boolean };

function formatAnswers(answers: Answers): string {
  return Object.entries(answers)
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("\n");
}

export class FlowEngine {
  readonly #steps: FlowStep[];
  #index = 0;
  readonly ctx: FlowContext;

  constructor(steps: FlowStep[], goal: string) {
    this.#steps = [...steps];
    this.ctx = { goal, answers: {}, outputs: {} };
  }

  /** The steps as they stand (grows as asks/reruns are injected) — for display/debug. */
  steps(): FlowStep[] {
    return [...this.#steps];
  }

  index(): number {
    return this.#index;
  }

  /** What to do now. */
  peek(): Directive {
    const step = this.#steps[this.#index];
    if (!step) return { type: "done" };
    if (step.kind === "run") return { type: "run", step, prompt: step.prompt?.(this.ctx) ?? this.ctx.goal };
    return { type: "ask", step, questions: step.questions?.(this.ctx) ?? [] };
  }

  /** Report a run's final output; may inject an ask (and later a re-run). */
  submitRun(output: string): Directive {
    const step = this.#steps[this.#index];
    if (!step) return { type: "done" };
    this.ctx.outputs[step.id] = output;
    const parentPrompt = step.prompt?.(this.ctx) ?? this.ctx.goal;
    this.#index++;
    const qs = parseQuestions(output);
    if (qs.length > 0) {
      this.#steps.splice(this.#index, 0, { id: `${step.id}:ask`, kind: "ask", title: `Answer: ${step.title}`, questions: () => qs, _parentPrompt: parentPrompt });
    }
    return this.peek();
  }

  /** Report answers for an ask/gate; aborts on a declined gate; re-runs after an injected ask. */
  submitAnswers(answers: Answers): Directive {
    const step = this.#steps[this.#index];
    if (!step) return { type: "done" };
    this.ctx.answers[step.id] = answers;
    this.#index++;

    const declined = step.kind === "gate" && Object.values(answers).some((v) => v === false);
    if (declined) return { type: "done", aborted: true };

    if (step._parentPrompt) {
      const parent = step._parentPrompt;
      this.#steps.splice(this.#index, 0, {
        id: `${step.id}:redo`,
        kind: "run",
        title: step.title.replace(/^Answer: /, ""),
        prompt: () => `${parent}\n\nMy answers:\n${formatAnswers(answers)}\n\nContinue.`,
      });
    }
    return this.peek();
  }
}
