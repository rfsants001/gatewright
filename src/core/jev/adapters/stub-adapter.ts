// StubAdapter — a deterministic JevAdapter for tests and offline runs. It never
// touches the network; it returns a fixed judgment (or one computed from the ctx by
// an injected rule), so Jev's wiring is fully testable without a local model.

import type { JevAdapter, JevContext, JevJudgment } from "../types.js";

export type StubRule = (ctx: JevContext) => JevJudgment;

export class StubAdapter implements JevAdapter {
  readonly model = "stub";
  readonly #rule: StubRule;

  constructor(fixedOrRule: JevJudgment | StubRule) {
    this.#rule = typeof fixedOrRule === "function" ? fixedOrRule : () => fixedOrRule;
  }

  async judge(_prompt: string, ctx: JevContext): Promise<JevJudgment> {
    return this.#rule(ctx);
  }
}
