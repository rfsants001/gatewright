// Session lease — ownership lock with fencing token, heartbeat and TTL.

export interface Lease {
  owner: string;
  /** Monotonic, strictly increasing across reclaims — the anti-split-brain guard. */
  fencingToken: number;
  acquiredAt: number;
  heartbeatAt: number;
  expiresAt: number;
  released: boolean;
}

export type AcquireResult = { acquired: true; lease: Lease } | { acquired: false; heldBy: string };

export type HeartbeatFailureReason = "NO_LEASE" | "NOT_OWNER" | "STALE_TOKEN" | "EXPIRED";
export type HeartbeatResult = { ok: true; lease: Lease } | { ok: false; reason: HeartbeatFailureReason };

export type ReleaseResult = { ok: boolean };

export type LeaseErrorCode = "IO";

export class LeaseError extends Error {
  readonly code: LeaseErrorCode;
  constructor(code: LeaseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LeaseError";
    this.code = code;
  }
}

/** A lease is live when it is not released and the clock hasn't passed its expiry. */
export function isLive(lease: Lease | null, now: number): boolean {
  return lease !== null && !lease.released && now < lease.expiresAt;
}
