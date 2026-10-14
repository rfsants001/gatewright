import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "./journal.js";
import type { JournalEvent } from "./event.js";

describe("Journal", () => {
  let dir: string;
  let path: string;
  const store = new FileArtifactStore();
  const make = () => new Journal(store, path);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-journal-"));
    path = join(dir, "log.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const seed = (j: Journal) => {
    const a = j.append({ type: "created", payload: { id: 1 }, at: "2026-01-01T00:00:00Z" });
    const b = j.append({ type: "updated", payload: { id: 1, v: 2 }, at: "2026-01-01T00:01:00Z" });
    const c = j.append({ type: "closed", payload: { id: 1 }, at: "2026-01-01T00:02:00Z" });
    return { a, b, c };
  };

  it("chains events and tracks head", () => {
    const j = make();
    expect(j.head()).toBe("");
    const { a, b, c } = seed(j);
    expect(b.prevHash).toBe(a.hash);
    expect(c.prevHash).toBe(b.hash);
    expect(j.head()).toBe(c.hash);
  });

  it("reads events in insertion order; absent log → empty", () => {
    expect(make().read()).toEqual([]);
    const j = make();
    seed(j);
    expect(j.read().map((e) => e.type)).toEqual(["created", "updated", "closed"]);
  });

  it("verify() passes on an intact chain", () => {
    const j = make();
    seed(j);
    expect(j.verify()).toEqual({ ok: true });
  });

  it("verify() detects tampered content at the right index", () => {
    const j = make();
    seed(j);
    const events = JSON.parse(readFileSync(path, "utf8")) as JournalEvent[];
    events[1]!.payload = { id: 1, v: 999 }; // tamper, leave hash stale
    writeFileSync(path, JSON.stringify(events));
    expect(make().verify()).toEqual({ ok: false, brokenAt: 1 });
  });

  it("verify() detects reordering", () => {
    const j = make();
    seed(j);
    const events = JSON.parse(readFileSync(path, "utf8")) as JournalEvent[];
    [events[0], events[1]] = [events[1]!, events[0]!]; // swap
    writeFileSync(path, JSON.stringify(events));
    expect(make().verify().ok).toBe(false);
  });

  it("project() folds events deterministically", () => {
    const j = make();
    seed(j);
    const count = (): number => j.project((n) => n + 1, 0);
    expect(count()).toBe(3);
    expect(count()).toBe(3); // deterministic / read-only
    const lastType = j.project<string | null>((_, e) => e.type, null);
    expect(lastType).toBe("closed");
  });

  it("reloads chain from the store (new instance, same path)", () => {
    seed(make());
    const reopened = make();
    expect(reopened.read()).toHaveLength(3);
    expect(reopened.verify()).toEqual({ ok: true });
    // appending after reload keeps the chain linked
    const d = reopened.append({ type: "reopened", payload: {}, at: "2026-01-01T00:03:00Z" });
    expect(d.prevHash).toBe(reopened.read()[2]!.hash);
    expect(reopened.verify()).toEqual({ ok: true });
  });
});
