// Time-travel — deterministic replay of a run from its journal. State is a fold of
// events, so any past point is reconstructable by bounding the fold at an index or a
// timestamp. Pure and read-only: replay never mutates the journal.

import type { Journal } from "../journal/journal.js";
import type { JournalEvent } from "../journal/event.js";

export interface Projection<S> {
  readonly initial: S;
  apply(state: S, event: JournalEvent): S;
}

/**
 * Fold `events` through a projection. `upTo` (inclusive event index) bounds the fold;
 * omitted → all events. Out-of-range indices clamp to the available range.
 */
export function replay<S>(events: readonly JournalEvent[], projection: Projection<S>, upTo?: number): S {
  const end = upTo === undefined ? events.length - 1 : Math.min(upTo, events.length - 1);
  let state = projection.initial;
  for (let i = 0; i <= end; i++) {
    const event = events[i];
    if (event) state = projection.apply(state, event);
  }
  return state;
}

export class TimeTravel {
  readonly #journal: Journal;

  constructor(journal: Journal) {
    this.#journal = journal;
  }

  length(): number {
    return this.#journal.read().length;
  }

  /** Events up to and including `index` (clamped). */
  eventsUpTo(index: number): JournalEvent[] {
    return this.#journal.read().slice(0, Math.max(0, index + 1));
  }

  /** Index of the last event whose `at` is ≤ `iso`; -1 if none. */
  indexAtTimestamp(iso: string): number {
    const events = this.#journal.read();
    let found = -1;
    for (let i = 0; i < events.length; i++) {
      if ((events[i] as JournalEvent).at <= iso) found = i;
      else break;
    }
    return found;
  }

  /** Project the run's state at `upTo` (inclusive index; omitted → latest). */
  project<S>(projection: Projection<S>, upTo?: number): S {
    return replay(this.#journal.read(), projection, upTo);
  }
}
