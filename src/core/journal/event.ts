// Journal events — canonical serialization and sha256 hash chaining.
// Each event stores the previous event's hash and its own, forming a linear
// Merkle-style chain that makes the log tamper-evident and replayable.

import { createHash } from "node:crypto";

/** Sentinel `prevHash` for the first (genesis) event. */
export const GENESIS_PREV_HASH = "";

export interface JournalEventInput {
  type: string;
  payload: unknown;
  /** ISO-8601 timestamp. */
  at: string;
}

export interface JournalEvent extends JournalEventInput {
  prevHash: string;
  hash: string;
}

/** The content that a hash commits to (everything but the `hash` field itself). */
export type HashableEvent = JournalEventInput & { prevHash: string };

/**
 * Deterministic JSON: object keys sorted recursively so the serialization — and
 * therefore the hash — is identical across machines and insertion orders.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortValue(source[key]);
    return out;
  }
  return value;
}

/** sha256 (hex) of the canonical serialization of an event's hashable content. */
export function computeHash(record: HashableEvent): string {
  return createHash("sha256").update(canonicalize(record)).digest("hex");
}
