// Journal — append-only, hash-chained event log persisted via an ArtifactStore.

import type { ArtifactStore } from "../artifact-store/types.js";
import type { JournalEvent, JournalEventInput } from "./event.js";
import { canonicalize, computeHash, GENESIS_PREV_HASH } from "./event.js";

export interface VerifyResult {
  ok: boolean;
  /** Index of the first event that breaks the chain, when `ok` is false. */
  brokenAt?: number;
}

export class Journal {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string) {
    this.#store = store;
    this.#path = path;
  }

  /** All events in insertion order. Absent log → empty list (never throws on absence). */
  read(): JournalEvent[] {
    const raw = this.#store.read(this.#path);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JournalEvent[]) : [];
  }

  /** Current head hash — the last event's hash, or the genesis sentinel when empty. */
  head(): string {
    return this.read().at(-1)?.hash ?? GENESIS_PREV_HASH;
  }

  /** Append an event, chaining it to the current head, and persist atomically. */
  append(input: JournalEventInput): JournalEvent {
    const events = this.read();
    const prevHash = events.at(-1)?.hash ?? GENESIS_PREV_HASH;
    const hashable = { type: input.type, payload: input.payload, at: input.at, prevHash };
    const event: JournalEvent = { ...hashable, hash: computeHash(hashable) };
    events.push(event);
    this.#store.write(this.#path, canonicalize(events));
    return event;
  }
}
