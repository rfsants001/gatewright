// SessionLease — single-controller ownership lock backed by the artifact store.

import type { ArtifactStore } from "../artifact-store/types.js";
import type { AcquireResult, HeartbeatResult, Lease, ReleaseResult } from "./types.js";
import { isLive } from "./types.js";

export const DEFAULT_LEASE_TTL_MS = 30_000;

function isLease(value: unknown): value is Lease {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["owner"] === "string" &&
    typeof v["fencingToken"] === "number" &&
    typeof v["acquiredAt"] === "number" &&
    typeof v["heartbeatAt"] === "number" &&
    typeof v["expiresAt"] === "number" &&
    typeof v["released"] === "boolean"
  );
}

export class SessionLease {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string) {
    this.#store = store;
    this.#path = path;
  }

  /** Current lease, or null when none exists / the file is unparseable. */
  read(): Lease | null {
    const raw = this.#store.read(this.#path);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isLease(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Grant the lease when it is free, released, expired, or already ours. Reclaiming a
   * prior lease bumps the fencing token (monotonic), so a stale owner can never win a race.
   * A live lease held by someone else is refused.
   */
  acquire({ owner, now = Date.now(), ttlMs = DEFAULT_LEASE_TTL_MS }: { owner: string; now?: number; ttlMs?: number }): AcquireResult {
    const existing = this.read();
    if (existing && isLive(existing, now) && existing.owner !== owner) {
      return { acquired: false, heldBy: existing.owner };
    }
    const fencingToken = existing ? existing.fencingToken + 1 : 1;
    const lease: Lease = {
      owner,
      fencingToken,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: now + ttlMs,
      released: false,
    };
    this.#store.write(this.#path, JSON.stringify(lease));
    return { acquired: true, lease };
  }

  /** Renew the lease (heartbeatAt/expiresAt) only when owner AND fencing token match and it is still live. */
  heartbeat({ owner, fencingToken, now = Date.now(), ttlMs = DEFAULT_LEASE_TTL_MS }: { owner: string; fencingToken: number; now?: number; ttlMs?: number }): HeartbeatResult {
    const lease = this.read();
    if (!lease) return { ok: false, reason: "NO_LEASE" };
    if (lease.owner !== owner) return { ok: false, reason: "NOT_OWNER" };
    if (lease.fencingToken !== fencingToken) return { ok: false, reason: "STALE_TOKEN" };
    if (!isLive(lease, now)) return { ok: false, reason: "EXPIRED" };
    const updated: Lease = { ...lease, heartbeatAt: now, expiresAt: now + ttlMs };
    this.#store.write(this.#path, JSON.stringify(updated));
    return { ok: true, lease: updated };
  }

  /** Mark the lease released when owner AND token match. Idempotent (absent/already-released → ok). */
  release({ owner, fencingToken }: { owner: string; fencingToken: number }): ReleaseResult {
    const lease = this.read();
    if (!lease || lease.released) return { ok: true };
    if (lease.owner !== owner || lease.fencingToken !== fencingToken) return { ok: false };
    this.#store.write(this.#path, JSON.stringify({ ...lease, released: true }));
    return { ok: true };
  }
}
