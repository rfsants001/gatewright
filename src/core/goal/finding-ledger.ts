// FindingLedger — append-only record of findings for a run, journal-backed.
// De-dups by finding id (same finding recorded twice is a no-op), so the ledger
// is idempotent and replayable from the event log.

import type { Journal } from "../journal/journal.js";
import type { Finding } from "./types.js";

const EVENT_TYPE = "goal.finding";

export class FindingLedger {
  readonly #journal: Journal;
  readonly #runSlug: string;

  constructor(journal: Journal, runSlug: string) {
    this.#journal = journal;
    this.#runSlug = runSlug;
  }

  /** Record a finding unless one with the same id already exists for this run. */
  record(finding: Finding): boolean {
    if (this.all().some((f) => f.id === finding.id)) return false;
    this.#journal.append({ type: EVENT_TYPE, at: finding.at, payload: { runSlug: this.#runSlug, ...finding } });
    return true;
  }

  /** All findings for this run, in insertion order. */
  all(): Finding[] {
    const out: Finding[] = [];
    for (const event of this.#journal.read()) {
      if (event.type !== EVENT_TYPE) continue;
      const p = event.payload as Finding & { runSlug: string };
      if (p.runSlug !== this.#runSlug) continue;
      const { runSlug: _runSlug, ...finding } = p;
      out.push(finding);
    }
    return out;
  }

  blocking(): Finding[] {
    return this.all().filter((f) => f.severity === "blocking");
  }
}
