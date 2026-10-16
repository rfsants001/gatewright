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
