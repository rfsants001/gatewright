// Host contract — bridges a host's hook payload to the engine and back.

import type { GateContext } from "../core/gate/types.js";
import type { EngineResult } from "../core/gate/engine.js";

export interface HostOutput {
  /** Text to write to stdout (the host's hook output format). Empty string → write nothing. */
  stdout: string;
  exitCode: number;
}

export interface HostAdapter {
  /** Parse a raw hook payload into a GateContext, or null for an ungoverned/malformed event. */
  parse(raw: string): GateContext | null;
  /** Render an aggregated engine result into the host's hook output. */
  render(result: EngineResult, ctx: GateContext): HostOutput;
}
