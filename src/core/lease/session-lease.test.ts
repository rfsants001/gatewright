import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { SessionLease } from "./session-lease.js";

describe("SessionLease", () => {
  let dir: string;
  const store = new FileArtifactStore();
  const make = () => new SessionLease(store, join(dir, "lease.json"));
  const TTL = 5000;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-lease-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("acquires a free lease with fencing token 1", () => {
    const res = make().acquire({ owner: "A", now: 1000, ttlMs: TTL });
    expect(res.acquired).toBe(true);
    if (res.acquired) expect(res.lease.fencingToken).toBe(1);
  });

  it("refuses a live lease held by someone else", () => {
    const l = make();
    l.acquire({ owner: "A", now: 1000, ttlMs: TTL });
    const res = l.acquire({ owner: "B", now: 2000, ttlMs: TTL });
    expect(res).toEqual({ acquired: false, heldBy: "A" });
  });

  it("reclaims an expired lease and bumps the fencing token (monotonic)", () => {
    const l = make();
    l.acquire({ owner: "A", now: 1000, ttlMs: TTL });
    const res = l.acquire({ owner: "B", now: 1000 + TTL + 1, ttlMs: TTL });
    expect(res.acquired).toBe(true);
    if (res.acquired) expect(res.lease.fencingToken).toBe(2);
  });

  it("heartbeat extends the TTL for the rightful owner", () => {
    const l = make();
    const a = l.acquire({ owner: "A", now: 1000, ttlMs: TTL });
    const token = a.acquired ? a.lease.fencingToken : -1;
    const hb = l.heartbeat({ owner: "A", fencingToken: token, now: 3000, ttlMs: TTL });
    expect(hb.ok).toBe(true);
    if (hb.ok) expect(hb.lease.expiresAt).toBe(3000 + TTL);
  });

  it("rejects heartbeat with a stale token (same owner re-acquired)", () => {
    const l = make();
    l.acquire({ owner: "A", now: 1000, ttlMs: TTL }); // token 1
    l.acquire({ owner: "A", now: 1500, ttlMs: TTL }); // token 2
    const hb = l.heartbeat({ owner: "A", fencingToken: 1, now: 2000, ttlMs: TTL });
    expect(hb).toEqual({ ok: false, reason: "STALE_TOKEN" });
  });

  it("stops a stale owner after its lease was reclaimed (anti split-brain)", () => {
    const l = make();
    l.acquire({ owner: "A", now: 1000, ttlMs: TTL }); // A holds token 1
    l.acquire({ owner: "B", now: 1000 + TTL + 1, ttlMs: TTL }); // B reclaims, token 2
    // A wakes up believing it still owns token 1 → must be rejected
    const hb = l.heartbeat({ owner: "A", fencingToken: 1, now: 1000 + TTL + 2, ttlMs: TTL });
    expect(hb.ok).toBe(false);
    if (!hb.ok) expect(hb.reason).toBe("NOT_OWNER");
  });

  it("release is guarded and idempotent", () => {
    const l = make();
    const a = l.acquire({ owner: "A", now: 1000, ttlMs: TTL });
    const token = a.acquired ? a.lease.fencingToken : -1;
    expect(l.release({ owner: "B", fencingToken: token })).toEqual({ ok: false }); // wrong owner
    expect(l.release({ owner: "A", fencingToken: token })).toEqual({ ok: true });
    expect(l.release({ owner: "A", fencingToken: token })).toEqual({ ok: true }); // idempotent
    // a released lease is free to re-acquire
    const re = l.acquire({ owner: "B", now: 2000, ttlMs: TTL });
    expect(re.acquired).toBe(true);
  });
});
