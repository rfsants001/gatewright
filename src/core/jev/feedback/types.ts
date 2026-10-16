// Jev feedback contracts — the human's verdict on an Action Card, recorded so Jev
// can calibrate per feature over time. Calibration never grants blocking power.

import type { JevVerdict } from "../types.js";

export type HumanDecision = "accepted" | "rejected";

export interface Correction {
  feature: string;
  /** The verdict Jev proposed on the Action Card. */
  jevVerdict: JevVerdict;
  /** Whether the human accepted (agreed with) Jev's verdict, or rejected it. */
  humanDecision: HumanDecision;
  /** ISO-8601 timestamp. */
  at: string;
}

export interface Calibration {
  samples: number;
  /** Share of corrections where the human accepted Jev's verdict (0..1). */
  agreementRate: number;
  /** Multiplier applied to Action Card confidence (0..1). */
  confidenceScale: number;
}
