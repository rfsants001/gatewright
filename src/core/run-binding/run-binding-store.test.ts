import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { RunBindingStore, RunBindingError } from "./run-binding-store.js";
import { workspaceHash } from "./paths.js";

describe("RunBindingStore", () => {
  let dir: string;
  let regPath: string;
  const store = new FileArtifactStore();
  const make = () => new RunBindingStore(store, regPath);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-rb-"));
    regPath = join(dir, "run-bindings.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("observe on an absent registry is fail-open (observed, empty)", () => {
    const res = make().observe();
    expect(res).toEqual({ status: "observed", value: { version: 1, workspaces: {} } });
  });

  it("observe on a corrupt registry → unavailable (does not throw)", () => {
    writeFileSync(regPath, "{ not json");
    expect(make().observe()).toEqual({ status: "unavailable", code: "MALFORMED" });
  });

  it("update round-trips a binding", () => {
    const rb = make();
    const ws = dir;
    rb.update(ws, (b) => {
      b["sess-1"] = "v2";
    });
    const res = rb.observe();
    expect(res.status).toBe("observed");
    if (res.status !== "observed") return;
    expect(rb.bindingsFor(res.value, ws)).toEqual({ "sess-1": "v2" });
  });

  it("isolates bindings across workspaces", () => {
    const rb = make();
    const wsA = join(dir, "a");
    const wsB = join(dir, "b");
    mkdirSync(wsA);
    mkdirSync(wsB);
    rb.update(wsA, (b) => {
      b["s"] = "run-a";
    });
    rb.update(wsB, (b) => {
      b["s"] = "run-b";
    });
    const res = rb.observe();
    if (res.status !== "observed") throw new Error("expected observed");
    expect(rb.bindingsFor(res.value, wsA)).toEqual({ s: "run-a" });
    expect(rb.bindingsFor(res.value, wsB)).toEqual({ s: "run-b" });
  });

  it("rejects an unsafe slug with a typed error", () => {
    const rb = make();
    expect(() =>
      rb.update(dir, (b) => {
        b["s"] = "../evil";
      }),
    ).toThrow(RunBindingError);
  });

  it("refuses to overwrite a corrupt registry", () => {
    writeFileSync(regPath, "garbage");
    const rb = make();
    try {
      rb.update(dir, (b) => {
        b["s"] = "v2";
      });
      expect.unreachable("expected update to refuse on corrupt registry");
    } catch (err) {
      expect(err).toBeInstanceOf(RunBindingError);
      expect((err as RunBindingError).code).toBe("UNAVAILABLE");
    }
  });

  it("workspaceHash is stable across a symlink to the same target", () => {
    const real = join(dir, "real-ws");
    const link = join(dir, "link-ws");
    mkdirSync(real);
    symlinkSync(real, link);
    expect(workspaceHash(link)).toBe(workspaceHash(real));
  });
});
