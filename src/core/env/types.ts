// Environment-detection model — a grouped, status-tagged report that both
// `gate doctor` (render) and `gate init` (decide what to configure) consume.

export type CheckStatus = "ok" | "warn" | "missing";

export interface Check {
  label: string;
  status: CheckStatus;
  /** Extra context shown under the label (version, model list, path…). */
  detail?: string;
  /** How to resolve a warn/missing check (e.g. "gate init"). */
  fix?: string;
  /**
   * Whether this check is a hard requirement. Required checks that aren't `ok` block
   * (Node/git/Claude Code). Optional checks (Jev, Ollama, Codex, LM Studio) may warn or be
   * missing without it being an error — they gate optional capabilities, not the core.
   */
  required?: boolean;
}

export interface CheckGroup {
  title: string;
  checks: Check[];
}

export interface EnvironmentReport {
  groups: CheckGroup[];
}

export interface Tally {
  ok: number;
  warn: number;
  missing: number;
}

/** Count checks by status across all groups. */
export function summarize(report: EnvironmentReport): Tally {
  const tally: Tally = { ok: 0, warn: 0, missing: 0 };
  for (const group of report.groups) {
    for (const check of group.checks) tally[check.status] += 1;
  }
  return tally;
}

/**
 * Required checks that are not `ok` — the real blockers. Optional checks never appear here,
 * so an unconfigured Jev or an offline Ollama is not treated as an error.
 */
export function requiredProblems(report: EnvironmentReport): Check[] {
  const out: Check[] = [];
  for (const group of report.groups) {
    for (const check of group.checks) {
      if (check.required && check.status !== "ok") out.push(check);
    }
  }
  return out;
}
