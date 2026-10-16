// FleetCoordinator — ensures exactly one live worker drives a run. Assignment is
// guarded by a monotonically increasing fencing token: a lower-or-equal token can
// never win, so a stale controller can't reclaim the run after a newer one took over.
// A dead worker's run can be taken over only by presenting a higher token.

import type { ArtifactStore } from "../artifact-store/types.js";
import type { WorkerRegistry } from "./worker-registry.js";
import type { Assignment } from "./types.js";

interface AssignmentsFile {
  version: number;
  assignments: Record<string, Assignment>;
}

export type AssignResult =
  | { ok: true; assignment: Assignment }
  | { ok: false; reason: "worker_not_live" | "stale_token" };

export class FleetCoordinator {
  readonly #store: ArtifactStore;
  readonly #path: string;
  readonly #workers: WorkerRegistry;
  readonly #ttl: number;

  constructor(store: ArtifactStore, path: string, workers: WorkerRegistry, ttl: number) {
    this.#store = store;
    this.#path = path;
    this.#workers = workers;
    this.#ttl = ttl;
  }

  #read(): AssignmentsFile {
    const raw = this.#store.read(this.#path);
    if (!raw) return { version: 1, assignments: {} };
    try {
      const parsed = JSON.parse(raw) as Partial<AssignmentsFile>;
      return { version: 1, assignments: parsed.assignments ?? {} };
    } catch {
      return { version: 1, assignments: {} };
    }
  }

  current(runSlug: string): Assignment | undefined {
    return this.#read().assignments[runSlug];
  }

  /**
   * Claim `runSlug` for `workerId` with `token`. Succeeds only if the worker is live
   * and `token` strictly exceeds any current assignment's token.
   */
  assign(runSlug: string, workerId: string, token: number, now: number): AssignResult {
    if (!this.#workers.isLive(workerId, now, this.#ttl)) return { ok: false, reason: "worker_not_live" };

    const file = this.#read();
    const existing = file.assignments[runSlug];
    if (existing && token <= existing.fencingToken) return { ok: false, reason: "stale_token" };

    const assignment: Assignment = { runSlug, workerId, fencingToken: token };
    file.assignments[runSlug] = assignment;
    this.#store.write(this.#path, JSON.stringify(file, null, 2));
    return { ok: true, assignment };
  }

  /** Whether `workerId` is the current, still-live driver of `runSlug`. */
  isDriver(runSlug: string, workerId: string, now: number): boolean {
    const cur = this.current(runSlug);
    return cur?.workerId === workerId && this.#workers.isLive(workerId, now, this.#ttl);
  }
}
