// FileArtifactStore — filesystem implementation of the portable artifact store.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ArtifactStore } from "./types.js";
import { ArtifactStoreError } from "./types.js";

export class FileArtifactStore implements ArtifactStore {
  /** Atomically write `data` to `path`: tmp + fsync + rename (rename is atomic on one fs). */
  write(path: string, data: string | Uint8Array): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp.${randomBytes(6).toString("hex")}`;
    try {
      const fd = openSync(tmp, "w");
      try {
        writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, path);
    } catch (cause) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // best-effort cleanup; the original failure is what matters
      }
      throw new ArtifactStoreError("WRITE_FAILED", `failed to write artifact at ${path}`, { cause });
    }
  }

  /** Read `path` as UTF-8 text. Returns null when absent; throws on a real I/O error. */
  read(path: string): string | null {
    try {
      return readFileSync(path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw new ArtifactStoreError("READ_FAILED", `failed to read artifact at ${path}`, { cause });
    }
  }

  /** Whether `path` exists. */
  exists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Remove orphan temp files (`*.tmp.*`) left by a crashed write under `dir`.
   * The final destination only appears after an atomic rename, so a half-written
   * artifact never exists — clearing the temp files is enough to leave `dir` consistent.
   * Absent `dir` is a no-op.
   */
  recover(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return;
      throw new ArtifactStoreError("RECOVER_FAILED", `failed to scan ${dir} for recovery`, { cause });
    }
    for (const name of entries) {
      if (!/\.tmp\.[0-9a-f]+$/.test(name)) continue;
      try {
        rmSync(join(dir, name), { force: true });
      } catch (cause) {
        throw new ArtifactStoreError("RECOVER_FAILED", `failed to remove orphan temp ${name}`, { cause });
      }
    }
  }
}
