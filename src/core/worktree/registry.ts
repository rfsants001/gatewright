// WorktreeRegistry — persistent map runSlug → worktree record, via the artifact
// store. Pure bookkeeping (no git here); the lifecycle module keeps it in sync.

import type { ArtifactStore } from "../artifact-store/types.js";
import { isSafeSlug } from "../run-binding/paths.js";
import { WorktreeError, type WorktreeRecord } from "./types.js";

interface RegistryFile {
  version: number;
  worktrees: Record<string, WorktreeRecord>;
}

function empty(): RegistryFile {
  return { version: 1, worktrees: {} };
}

export class WorktreeRegistry {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string) {
    this.#store = store;
    this.#path = path;
  }

  #read(): RegistryFile {
    const raw = this.#store.read(this.#path);
    if (!raw) return empty();
    try {
      const parsed = JSON.parse(raw) as Partial<RegistryFile>;
      return { version: 1, worktrees: parsed.worktrees ?? {} };
    } catch {
      return empty();
    }
  }

  #write(file: RegistryFile): void {
    this.#store.write(this.#path, JSON.stringify(file, null, 2));
  }

  register(record: WorktreeRecord): this {
    if (!isSafeSlug(record.runSlug)) throw new WorktreeError("UNSAFE_SLUG", `unsafe run slug '${record.runSlug}'`);
    const file = this.#read();
    file.worktrees[record.runSlug] = record;
    this.#write(file);
    return this;
  }

  get(runSlug: string): WorktreeRecord | undefined {
    return this.#read().worktrees[runSlug];
  }

  remove(runSlug: string): void {
    const file = this.#read();
    if (runSlug in file.worktrees) {
      delete file.worktrees[runSlug];
      this.#write(file);
    }
  }

  list(): WorktreeRecord[] {
    return Object.values(this.#read().worktrees).sort((a, b) => (a.runSlug < b.runSlug ? -1 : a.runSlug > b.runSlug ? 1 : 0));
  }
}
