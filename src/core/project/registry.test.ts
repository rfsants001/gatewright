import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRegistry, type ProjectEntry } from "./registry.js";

const entry = (over: Partial<ProjectEntry> = {}): ProjectEntry => ({
  path: "/home/rafa/dev/alpha",
  name: "alpha",
  configuredAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("ProjectRegistry", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-proj-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const reg = () => new ProjectRegistry(join(dir, "projects.json"));

  it("registers, lists path-sorted, and is idempotent by path", () => {
    const r = reg();
    r.register(entry({ path: "/b", name: "b" }));
    r.register(entry({ path: "/a", name: "a" }));
    r.register(entry({ path: "/a", name: "a2" })); // update, not duplicate
    expect(r.list().map((p) => p.path)).toEqual(["/a", "/b"]);
    expect(r.get("/a")?.name).toBe("a2");
  });

  it("removes an entry; removing an absent path is a no-op", () => {
    const r = reg();
    r.register(entry({ path: "/a" }));
    r.remove("/a");
    r.remove("/a");
    expect(r.list()).toEqual([]);
  });

  it("missing registry file yields an empty list", () => {
    expect(reg().list()).toEqual([]);
  });
});
