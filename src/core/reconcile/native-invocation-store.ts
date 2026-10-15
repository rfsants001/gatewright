// NativeInvocationStore — records native start/stop invocations as journal events
// and reads them back by run + selector. Event-sourced: the journal is the source
// of truth, so invocations survive crashes and are replayable.

import type { Journal } from "../journal/journal.js";
import type { Invocation } from "./types.js";

const EVENT_TYPE = "native.invocation";

export class NativeInvocationStore {
  readonly #journal: Journal;

  constructor(journal: Journal) {
    this.#journal = journal;
  }

  /** Append an invocation to the journal. */
  record(inv: Invocation): void {
    this.#journal.append({ type: EVENT_TYPE, at: inv.at, payload: { ...inv } });
  }

  /** Invocations for a run (optionally a single selector), in insertion order. */
  forRun(runSlug: string, selector?: string): Invocation[] {
    const out: Invocation[] = [];
    for (const event of this.#journal.read()) {
      if (event.type !== EVENT_TYPE) continue;
      const inv = event.payload as Invocation;
      if (inv.runSlug !== runSlug) continue;
      if (selector !== undefined && inv.selector !== selector) continue;
      out.push(inv);
    }
    return out;
  }
}
