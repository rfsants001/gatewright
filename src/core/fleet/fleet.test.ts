import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { WorkerRegistry } from "./worker-registry.js";
import { FleetCoordinator } from "./coordinator.js";
import type { Worker } from "./types.js";

const TTL = 10_000;
const worker = (id: string, host = "m1", heartbeatAt = 1_000): Worker => ({ id, host, capabilities: ["edit"], heartbeatAt });

describe("WorkerRegistry", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-fleet-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const reg = () => new WorkerRegistry(store, join(dir, "workers.json"));

  it("heartbeat renews liveness; live/prune respect TTL", () => {
    const r = reg();
    r.register(worker("a", "m1", 1_000));
    r.register(worker("b", "m2", 1_000));
    expect(r.live(5_000, TTL).map((w) => w.id)).toEqual(["a", "b"]);
    // let 'a' go stale, 'b' heartbeats
    r.heartbeat("b", 20_000);
    expect(r.isLive("a", 20_000, TTL)).toBe(false);
    expect(r.isLive("b", 20_000, TTL)).toBe(true);
    expect(r.prune(20_000, TTL)).toEqual(["a"]);
    expect(r.get("a")).toBeUndefined();
  });

  it("heartbeat on an unknown worker is a no-op", () => {
    expect(reg().heartbeat("ghost", 1)).toBe(false);
  });
});

describe("FleetCoordinator — single-driver via fencing", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-coord-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const setup = () => {
    const workers = new WorkerRegistry(store, join(dir, "workers.json"));
    workers.register(worker("a", "m1", 1_000));
    workers.register(worker("b", "m2", 1_000));
    const coord = new FleetCoordinator(store, join(dir, "assign.json"), workers, TTL);
    return { workers, coord };
  };

  it("assigns to a live worker and rejects a stale (lower/equal) token", () => {
    const { coord } = setup();
    expect(coord.assign("run-1", "a", 5, 1_000).ok).toBe(true);
    expect(coord.assign("run-1", "b", 5, 1_000)).toEqual({ ok: false, reason: "stale_token" }); // equal loses
    expect(coord.assign("run-1", "b", 4, 1_000)).toEqual({ ok: false, reason: "stale_token" }); // lower loses
    expect(coord.isDriver("run-1", "a", 1_000)).toBe(true);
  });

  it("a higher token reclaims the run (new driver wins)", () => {
    const { coord } = setup();
    coord.assign("run-1", "a", 5, 1_000);
    expect(coord.assign("run-1", "b", 6, 1_000).ok).toBe(true);
    expect(coord.isDriver("run-1", "b", 1_000)).toBe(true);
    expect(coord.isDriver("run-1", "a", 1_000)).toBe(false);
  });

  it("refuses to assign to a worker that is not live", () => {
    const { coord } = setup();
    expect(coord.assign("run-1", "a", 5, 999_999)).toEqual({ ok: false, reason: "worker_not_live" });
  });
});
