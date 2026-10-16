// Calibration — turn a feature's correction history into a confidence multiplier.
// Uses additive smoothing so a handful of corrections barely moves the scale; only a
// sustained disagreement pulls confidence down toward the observed agreement rate.

import type { Calibration, Correction } from "./types.js";

/** Smoothing constant: with K prior "agreements", few samples ⇒ scale ≈ 1. */
const SMOOTHING = 5;

export function calibrate(corrections: readonly Correction[], feature: string): Calibration {
  const forFeature = corrections.filter((c) => c.feature === feature);
  const samples = forFeature.length;
  if (samples === 0) return { samples: 0, agreementRate: 1, confidenceScale: 1 };

  const accepted = forFeature.filter((c) => c.humanDecision === "accepted").length;
  const agreementRate = accepted / samples;

  // Weight grows with evidence; scale interpolates from 1 toward agreementRate.
  const weight = samples / (samples + SMOOTHING);
  const confidenceScale = Math.min(1, Math.max(0, 1 - weight * (1 - agreementRate)));
  return { samples, agreementRate, confidenceScale };
}
