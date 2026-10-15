// Gate contract — a gate is a pure context → decision function.

export type GateEvent = "pre-read" | "pre-edit" | "pre-bash" | "post-bash" | "post-edit" | "stop" | "subagent-stop";

export interface GateContext {
  event: GateEvent;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: unknown;
  cwd: string;
  sessionKey?: string;
  lastMessage?: string;
}

export type GateDecision =
  | { kind: "allow" }
  | { kind: "advise"; message: string }
  | { kind: "deny"; reason: string };

export interface Gate {
  readonly name: string;
  readonly description: string;
  /** Lifecycle events this gate may act on. */
  readonly events: readonly GateEvent[];
  /** Whether the gate should run for this context (event + tool-level matching). */
  appliesTo(ctx: GateContext): boolean;
  /** The gate's decision for an applicable context. Must be side-effect-free w.r.t. the engine. */
  check(ctx: GateContext): GateDecision;
}

/** Convenience constant to return from gates that don't act. */
export const ALLOW: GateDecision = { kind: "allow" };
