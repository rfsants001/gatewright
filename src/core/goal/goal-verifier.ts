// GoalVerifier — decides whether a goal is satisfied: every done-when criterion
// covered by evidence AND no blocking findings. Deterministic and explainable — the
// result lists exactly what is missing and what is blocking (no AI here; fuzzy
// judgment is Jev's job).

import type { EvidenceProgress } from "./evidence-progress.js";
import type { FindingLedger } from "./finding-ledger.js";
import type { Goal, VerifyResult } from "./types.js";

export class GoalVerifier {
  verify(goal: Goal, evidence: EvidenceProgress, findings: FindingLedger): VerifyResult {
    const { missing } = evidence.progress();
    const blockingFindings = findings.blocking();
    return {
      satisfied: missing.length === 0 && blockingFindings.length === 0,
      missing,
      blockingFindings,
    };
  }
}
