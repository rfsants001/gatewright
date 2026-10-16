// CorrectionLedger — append-only record of human decisions on Jev Action Cards,
// journal-backed so calibration is replayable from the event log.

import type { Journal } from "../../journal/journal.js";
import type { Correction } from "./types.js";

const EVENT_TYPE = "jev.correction";

export class CorrectionLedger {
  readonly #journal: Journal;

  constructor(journal: Journal) {
    this.#journal = journal;
  }

  record(correction: Correction): void {
    this.#journal.append({ type: EVENT_TYPE, at: correction.at, payload: { ...correction } });
  }

  all(): Correction[] {
    const out: Correction[] = [];
    for (const event of this.#journal.read()) {
      if (event.type === EVENT_TYPE) out.push(event.payload as Correction);
    }
    return out;
  }

  byFeature(feature: string): Correction[] {
    return this.all().filter((c) => c.feature === feature);
  }
}
