import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planMcp } from "../init/config-writers.js";
import { ConfigHistory, applyWithHistory } from "./config-history.js";
import { rollbackRevision } from "./rollback.js";

describe("ConfigHistory + applyWithHistory", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-hist-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const history = () => new ConfigHistory(join(dir, "history.json"));

  it("records a revision capturing before/after and writes the file", () => {
    const h = history();
    const mcpPath = join(dir, ".mcp.json");
    const rev = applyWithHistory([planMcp(mcpPath)], { history: h, project: dir, kind: "configure" });

    expect(rev).not.toBeNull();
    expect(existsSync(mcpPath)).toBe(true);
    expect(h.list()).toHaveLength(1);
    expect(rev!.files[0]).toMatchObject({ path: mcpPath, before: null });
    expect(rev!.files[0]!.after).toContain("gatewright");
  });

  it("skips noop plans and records nothing when there is no change", () => {
    const h = history();
    const mcpPath = join(dir, ".mcp.json");
    writeFileSync(mcpPath, planMcp(mcpPath).nextContent); // already registered with the current invocation
    const rev = applyWithHistory([planMcp(mcpPath)], { history: h, project: dir });
    expect(rev).toBeNull();
    expect(h.list()).toHaveLength(0);
  });

  it("lists newest-first and resolves get/latest", () => {
    const h = history();
    applyWithHistory([planMcp(join(dir, "a.json"))], { history: h, makeId: () => "r1", now: () => "2026-01-01T00:00:00Z" });
    applyWithHistory([planMcp(join(dir, "b.json"))], { history: h, makeId: () => "r2", now: () => "2026-01-02T00:00:00Z" });
    expect(h.list().map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(h.get("r1")?.files[0]?.path).toContain("a.json");
    expect(h.latest()?.id).toBe("r2");
  });
});

describe("rollback", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-rb-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const history = () => new ConfigHistory(join(dir, "history.json"));

  it("deletes a file that did not exist before the revision", () => {
    const h = history();
    const path = join(dir, ".mcp.json");
    applyWithHistory([planMcp(path)], { history: h, makeId: () => "rev1" });
    expect(existsSync(path)).toBe(true);

    const res = rollbackRevision(h, { id: "rev1" });
    expect(res.ok).toBe(true);
    expect(existsSync(path)).toBe(false); // restored to "absent"
    expect(h.list()[0]?.kind).toBe("rollback");
    expect(h.list()[0]?.reverts).toBe("rev1");
  });

  it("restores prior content on a merged file", () => {
    const h = history();
    const path = join(dir, ".mcp.json");
    const original = JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2);
    writeFileSync(path, original);
    applyWithHistory([planMcp(path)], { history: h, makeId: () => "rev1" }); // merges gatewright in
    expect(readFileSync(path, "utf8")).toContain("gatewright");

    rollbackRevision(h, { id: "rev1" });
    expect(readFileSync(path, "utf8")).toBe(original); // exact prior content back
    expect(readFileSync(path, "utf8")).not.toContain("gatewright");
  });

  it("rolls back the latest non-rollback revision by default and is itself revertible", () => {
    const h = history();
    const path = join(dir, ".mcp.json");
    applyWithHistory([planMcp(path)], { history: h, makeId: () => "rev1" });
    const first = rollbackRevision(h, { makeId: () => "rb1" });
    expect(first.reverted?.id).toBe("rev1");
    expect(existsSync(path)).toBe(false);

    // rolling back the rollback restores the file
    const second = rollbackRevision(h, { id: "rb1", makeId: () => "rb2" });
    expect(second.ok).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it("reports a clear reason for an unknown revision and empty history", () => {
    const h = history();
    expect(rollbackRevision(h, { id: "nope" })).toMatchObject({ ok: false });
    expect(rollbackRevision(h)).toMatchObject({ ok: false });
  });
});
