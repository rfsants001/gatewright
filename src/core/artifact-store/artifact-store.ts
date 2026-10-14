// FileArtifactStore — filesystem implementation of the portable artifact store.

import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { ArtifactStoreError } from "./types.js";

export class FileArtifactStore {
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
}
