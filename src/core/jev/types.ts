// Jev contracts — the local-AI judgment layer. Advisory by construction: a verdict
// is only approve/discard/abstain (never "block"), so Jev can inform the human gate
// but can never hard-block a turn on its own.

export type JevVerdict = "approve" | "discard" | "abstain";

/** A model's raw judgment, before the engine wraps it into an Action Card. */
export interface JevJudgment {
  verdict: JevVerdict;
  rationale: string;
  /** 0..1 self-reported confidence. */
  confidence: number;
}

/** What the engine asks Jev to judge. */
export interface JevContext {
  /** Budget bucket / call site, e.g. "proportion-gate". */
  feature: string;
  /** Short human-readable description of the situation. */
  summary: string;
  /** Structured signals the model may use (diff size, handoff text, etc.). */
  signals?: Record<string, unknown>;
}

/** The advisory artifact handed to the human gate (approve/discard pattern). */
export interface ActionCard {
  title: string;
  verdict: JevVerdict;
  rationale: string;
  confidence: number;
  evidence: string[];
}

/** A pluggable judgment backend (stub for tests, Ollama/LM Studio for real). */
export interface JevAdapter {
  readonly model: string;
  judge(prompt: string, ctx: JevContext): Promise<JevJudgment>;
}

/** An abstention never influences a deterministic decision. */
export const ABSTAIN: JevJudgment = { verdict: "abstain", rationale: "jev abstained", confidence: 0 };
