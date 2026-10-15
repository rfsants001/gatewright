// Goal-verification contracts — findings, evidence, and the shape of a goal.
// Self-contained (does not import the validators module) so this feature ships
// independently; a validator Finding can be mapped into a goal Finding at the edge.

export type Severity = "blocking" | "warning" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  area: string;
  message: string;
  /** ISO-8601 timestamp. */
  at: string;
}

/** A goal is a set of done-when criteria, each identified by a stable id. */
export interface Goal {
  id: string;
  criteria: readonly string[];
}

export interface VerifyResult {
  satisfied: boolean;
  /** Criteria with no recorded evidence yet. */
  missing: string[];
  /** Blocking-severity findings that veto satisfaction. */
  blockingFindings: Finding[];
}
