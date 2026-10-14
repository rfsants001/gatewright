// Portable artifact store — public contract and typed errors.
// The lowest persistence layer of the backbone: atomic, durable writes with
// crash recovery. Everything else (journal, bindings, leases) persists through it.

export type ArtifactStoreErrorCode = "WRITE_FAILED" | "READ_FAILED" | "RECOVER_FAILED";

export class ArtifactStoreError extends Error {
  readonly code: ArtifactStoreErrorCode;

  constructor(code: ArtifactStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ArtifactStoreError";
    this.code = code;
  }
}

export interface ArtifactStore {
  /** Atomically write `data` to `path` (tmp + fsync + rename). Creates parent dirs. */
  write(path: string, data: string | Uint8Array): void;
  /** Read `path` as UTF-8 text. Returns null when the path is absent. */
  read(path: string): string | null;
  /** Whether `path` exists. */
  exists(path: string): boolean;
  /** Remove orphan temp files left by a crashed write under `dir`. No-op if `dir` is absent. */
  recover(dir: string): void;
}
