import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { ModuleRegistry } from "./modules.js";
import type { ModuleState } from "./modules.js";

const jevModule: ModuleState = { id: "jev", kind: "jev", enabled: true, provider: "internal" };
const advisorModule: ModuleState = { id: "advisor-ext", kind: "advisor", enabled: false, provider: "external", config: { endpoint: "http://localhost:9000" } };

describe("ModuleRegistry", () => {
  let gate: string;
  let proj: string;

  beforeEach(() => {
    gate = mkdtempSync(join(tmpdir(), "gw-gate-"));
    proj = mkdtempSync(join(tmpdir(), "gw-proj-"));
    process.env.GATEWRIGHT_HOME = gate;
  });

  afterEach(() => {
    delete process.env.GATEWRIGHT_HOME;
    rmSync(gate, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  const makeRegistry = (scope: "gate" | "project" = "project") =>
    new ModuleRegistry(new ConfigStore(new FileArtifactStore()), scope);

  it("list() returns empty array when no modules have been upserted", () => {
    const reg = makeRegistry();
    expect(reg.list(proj)).toEqual([]);
  });

  it("upsert then get round-trips a module", () => {
    const reg = makeRegistry();
    reg.upsert(jevModule, proj);
    expect(reg.get("jev", proj)).toEqual(jevModule);
  });

  it("upsert then list returns all upserted modules", () => {
    const reg = makeRegistry();
    reg.upsert(jevModule, proj);
    reg.upsert(advisorModule, proj);
    const listed = reg.list(proj);
    expect(listed).toHaveLength(2);
    expect(listed).toContainEqual(jevModule);
    expect(listed).toContainEqual(advisorModule);
  });

  it("setEnabled flips enabled and persists", () => {
    const reg = makeRegistry();
    reg.upsert(jevModule, proj); // jev starts enabled:true
    reg.setEnabled("jev", false, proj);
    expect(reg.get("jev", proj)?.enabled).toBe(false);
    // flip back
    reg.setEnabled("jev", true, proj);
    expect(reg.get("jev", proj)?.enabled).toBe(true);
  });

  it("setEnabled no-ops silently when module is absent", () => {
    const reg = makeRegistry();
    expect(() => reg.setEnabled("nonexistent", true, proj)).not.toThrow();
    expect(reg.list(proj)).toEqual([]);
  });

  it("merge-by-id: gate module is overridden by project module of the same id", () => {
    const store = new ConfigStore(new FileArtifactStore());
    const gateReg = new ModuleRegistry(store, "gate");
    const projReg = new ModuleRegistry(store, "project");

    // gate declares jev as enabled, project overrides it as disabled
    gateReg.upsert({ id: "jev", kind: "jev", enabled: true, provider: "internal" }, proj);
    projReg.upsert({ id: "jev", kind: "jev", enabled: false, provider: "internal" }, proj);

    const resolved = store.resolve(proj);
    expect(resolved.modules).toHaveLength(1);
    expect(resolved.modules?.[0]?.enabled).toBe(false); // project wins
  });

  it("resolve reflects both scopes: gate-only module + project-only module both appear", () => {
    const store = new ConfigStore(new FileArtifactStore());
    const gateReg = new ModuleRegistry(store, "gate");
    const projReg = new ModuleRegistry(store, "project");

    gateReg.upsert(jevModule, proj);
    projReg.upsert(advisorModule, proj);

    const resolved = store.resolve(proj);
    expect(resolved.modules).toHaveLength(2);
    expect(resolved.modules?.map((m) => m.id)).toContain("jev");
    expect(resolved.modules?.map((m) => m.id)).toContain("advisor-ext");
  });

  it("absent modules produce no modules key on resolved config", () => {
    const store = new ConfigStore(new FileArtifactStore());
    const resolved = store.resolve(proj);
    expect(resolved.modules).toBeUndefined();
  });
});
