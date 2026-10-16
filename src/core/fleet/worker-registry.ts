// WorkerRegistry — the fleet roster, persisted via the artifact store. Workers
// renew a heartbeat; liveness is a TTL over the last heartbeat. Stale workers are
// pruned so the coordinator only assigns to live ones.

import type { ArtifactStore } from "../artifact-store/types.js";
import type { Worker } from "./types.js";

interface RegistryFile {
  version: number;
  workers: Record<string, Worker>;
}

export class WorkerRegistry {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string) {
    this.#store = store;
    this.#path = path;
  }

  #read(): RegistryFile {
    const raw = this.#store.read(this.#path);
    if (!raw) return { version: 1, workers: {} };
    try {
      const parsed = JSON.parse(raw) as Partial<RegistryFile>;
      return { version: 1, workers: parsed.workers ?? {} };
    } catch {
      return { version: 1, workers: {} };
    }
  }

  #write(file: RegistryFile): void {
    this.#store.write(this.#path, JSON.stringify(file, null, 2));
  }

  register(worker: Worker): this {
    const file = this.#read();
    file.workers[worker.id] = worker;
    this.#write(file);
    return this;
  }

  /** Renew a worker's heartbeat. Unknown id → no-op (returns false). */
  heartbeat(id: string, now: number): boolean {
    const file = this.#read();
    const worker = file.workers[id];
    if (!worker) return false;
    worker.heartbeatAt = now;
    this.#write(file);
    return true;
  }

  get(id: string): Worker | undefined {
    return this.#read().workers[id];
  }

  /** Workers whose heartbeat is within `ttl` ms of `now`, id-sorted. */
  live(now: number, ttl: number): Worker[] {
    return Object.values(this.#read().workers)
      .filter((w) => now - w.heartbeatAt <= ttl)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  isLive(id: string, now: number, ttl: number): boolean {
    const worker = this.get(id);
    return worker !== undefined && now - worker.heartbeatAt <= ttl;
  }

  /** Drop workers whose heartbeat is older than `ttl`. Returns pruned ids. */
  prune(now: number, ttl: number): string[] {
    const file = this.#read();
    const pruned: string[] = [];
    for (const [id, worker] of Object.entries(file.workers)) {
      if (now - worker.heartbeatAt > ttl) {
        delete file.workers[id];
        pruned.push(id);
      }
    }
    if (pruned.length > 0) this.#write(file);
    return pruned.sort();
  }
}
