// Validator contract — the atomic unit of composition. A validator is a pure
// function over some input that yields a pass/fail plus structured findings.
// Big gates are built by composing validators into steps and steps into workflows.

export type Severity = "error" | "warning" | "info";

export interface Finding {
  /** Stable machine code, e.g. "json-validity". */
  code: string;
  message: string;
  severity: Severity;
}

export interface ValidationResult {
  ok: boolean;
  findings: Finding[];
}

export interface Validator {
  readonly id: string;
  validate(input: unknown): ValidationResult;
}

/** Convenience: a clean pass with no findings. */
export const PASS: ValidationResult = { ok: true, findings: [] };

/** Build a single-finding failure (ok=false) from an error-severity finding. */
export function fail(code: string, message: string, severity: Severity = "error"): ValidationResult {
  return { ok: false, findings: [{ code, message, severity }] };
}
