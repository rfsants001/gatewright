import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "./artifact-store.js";
import { ArtifactStoreError } from "./types.js";

describe("FileArtifactStore", () => {
  let dir: string;
  const store = new FileArtifactStore();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-as-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes and reads back, creating parent dirs", () => {
    const p = join(dir, "a", "b", "c.txt");
    store.write(p, "hello");
    expect(store.read(p)).toBe("hello");
  });

  it("leaves no temp file after a successful write", () => {
    const sub = join(dir, "x");
    store.write(join(sub, "f.txt"), "data");
    expect(readdirSync(sub).filter((n) => n.includes(".tmp."))).toHaveLength(0);
  });

  it("read returns null for an absent path (does not throw)", () => {
    expect(store.read(join(dir, "nope.txt"))).toBeNull();
  });

  it("exists reflects presence", () => {
    const p = join(dir, "e.txt");
    expect(store.exists(p)).toBe(false);
    store.write(p, "x");
    expect(store.exists(p)).toBe(true);
  });

  it("recover removes orphan temp files but keeps finals", () => {
    const p = join(dir, "keep.txt");
    store.write(p, "final");
    // forge a crashed write
    writeFileSync(join(dir, "keep.txt.tmp.deadbeef"), "partial");
    store.recover(dir);
    expect(store.read(p)).toBe("final");
    expect(readdirSync(dir).some((n) => n.includes(".tmp."))).toBe(false);
  });

  it("recover on an absent dir is a no-op", () => {
    expect(() => store.recover(join(dir, "ghost"))).not.toThrow();
  });

  it("overwrite keeps the final content intact (no partial/truncated state)", () => {
    const p = join(dir, "o.txt");
    const big = "B".repeat(100_000);
    store.write(p, "A".repeat(100_000));
    store.write(p, big);
    expect(store.read(p)).toBe(big);
    expect(readdirSync(dir).filter((n) => n.includes(".tmp."))).toHaveLength(0);
  });

  it("surfaces a typed error code on an unreadable (directory) path", () => {
    const d = join(dir, "adir");
    store.write(join(d, "inner.txt"), "x"); // makes `d` a directory
    try {
      store.read(d); // reading a directory as a file → EISDIR, not ENOENT
      expect.unreachable("expected read of a directory to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ArtifactStoreError);
      expect((err as ArtifactStoreError).code).toBe("READ_FAILED");
    }
  });
});
