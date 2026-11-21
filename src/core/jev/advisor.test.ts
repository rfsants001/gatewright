// Tests for advisor.ts: resolver selection matrix (R2-002 + R2-003) and
// JevAdvisor card→verdict mapping.
//
// resolveAdvisor() only SELECTS an advisor — it never calls advise().
// JevAdvisor accepts an injectable adviseFn to avoid hitting Ollama in unit tests.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import type { ModuleState } from "../integrations/modules.js";
import { ExternalAdvisor, JevAdvisor, resolveAdvisor } from "./advisor.js";
import type { ActionCard } from "./types.js";
import type { AdvisorVerdict } from "./advisor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class MemStore {
  #m = new Map<string, string>();
  write(p: string, d: string | Uint8Array): void {
    this.#m.set(p, typeof d === "string" ? d : Buffer.from(d).toString("utf8"));
  }
  read(p: string): string | null { return this.#m.get(p) ?? null; }
  exists(p: string): boolean { return this.#m.has(p); }
  recover(): void {}
}

/** Build a ConfigStore backed by an in-memory store with a preset project-scope modules list. */
function storeWithModules(cwd: string, modules: ModuleState[]): ConfigStore {
  const mem = new MemStore();
  const projectCfgPath = join(cwd, ".gatewright", "config.json");
  mem.write(projectCfgPath, JSON.stringify({ modules }));
  return new ConfigStore(mem as unknown as import("../artifact-store/types.js").ArtifactStore);
}

// ---------------------------------------------------------------------------
// Resolver selection matrix (R2-002 + R2-003)
// ---------------------------------------------------------------------------

describe("resolveAdvisor — selection matrix", () => {
  const cwd = "/fake/project";

  it("returns JevAdvisor when no module record is present (legacy fallback)", () => {
    const store = storeWithModules(cwd, []);
    const advisor = resolveAdvisor(cwd, store);
    expect(advisor).toBeInstanceOf(JevAdvisor);
  });

  it("R2-003: returns null when jev module is present but disabled", () => {
    const jevDisabled: ModuleState = { id: "jev", kind: "jev", enabled: false, provider: "internal" };
    const store = storeWithModules(cwd, [jevDisabled]);
    const advisor = resolveAdvisor(cwd, store);
    expect(advisor).toBeNull();
  });

  it("R2-003: returns JevAdvisor when jev module is present and enabled", () => {
    const jevEnabled: ModuleState = { id: "jev", kind: "jev", enabled: true, provider: "internal" };
    const store = storeWithModules(cwd, [jevEnabled]);
    const advisor = resolveAdvisor(cwd, store);
    expect(advisor).toBeInstanceOf(JevAdvisor);
  });

  it("returns ExternalAdvisor when an enabled external advisor module is present", () => {
    const extAdvisor: ModuleState = {
      id: "my-advisor",
      kind: "advisor",
      enabled: true,
      provider: "external",
      config: { endpoint: "http://advisor.local/api" },
    };
    const store = storeWithModules(cwd, [extAdvisor]);
    const advisor = resolveAdvisor(cwd, store);
    expect(advisor).toBeInstanceOf(ExternalAdvisor);
  });

  it("external advisor wins over a present+enabled jev module", () => {
    const modules: ModuleState[] = [
      { id: "jev", kind: "jev", enabled: true, provider: "internal" },
      { id: "my-advisor", kind: "advisor", enabled: true, provider: "external" },
    ];
    const store = storeWithModules(cwd, modules);
    const advisor = resolveAdvisor(cwd, store);
    expect(advisor).toBeInstanceOf(ExternalAdvisor);
  });

  it("disabled external advisor is NOT selected (falls through to jev logic)", () => {
    const modules: ModuleState[] = [
      { id: "my-advisor", kind: "advisor", enabled: false, provider: "external" },
      { id: "jev", kind: "jev", enabled: true, provider: "internal" },
    ];
    const store = storeWithModules(cwd, modules);
    const advisor = resolveAdvisor(cwd, store);
    // External is disabled → falls through to jev module → jev is enabled → JevAdvisor
    expect(advisor).toBeInstanceOf(JevAdvisor);
  });

  it("disabled external advisor + disabled jev → null", () => {
    const modules: ModuleState[] = [
      { id: "my-advisor", kind: "advisor", enabled: false, provider: "external" },
      { id: "jev", kind: "jev", enabled: false, provider: "internal" },
    ];
    const store = storeWithModules(cwd, modules);
    const advisor = resolveAdvisor(cwd, store);
    expect(advisor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers for JevAdvisor tests
// ---------------------------------------------------------------------------

function card(verdict: "approve" | "discard" | "abstain", rationale: string, confidence: number): ActionCard {
  return { title: `Jev · test`, verdict, rationale, confidence, evidence: [] };
}

// ---------------------------------------------------------------------------
// JevAdvisor card → AdvisorVerdict mapping (R2-002)
// ---------------------------------------------------------------------------

describe("JevAdvisor.advise — card → AdvisorVerdict mapping", () => {
  it("maps an approve card to AdvisorVerdict with correct fields", async () => {
    const stubFn = vi.fn().mockResolvedValue(card("approve", "looks fine", 0.9));
    const advisor = new JevAdvisor(stubFn);
    const v: AdvisorVerdict | null = await advisor.advise("proportion-gate", "diff ok?");
    expect(v).not.toBeNull();
    expect(v?.verdict).toBe("approve");
    expect(v?.confidence).toBe(0.9);
    expect(v?.rationale).toBe("looks fine");
  });

  it("maps a discard card correctly", async () => {
    const stubFn = vi.fn().mockResolvedValue(card("discard", "too broad", 0.75));
    const advisor = new JevAdvisor(stubFn);
    const v = await advisor.advise("proportion-gate", "diff huge?");
    expect(v?.verdict).toBe("discard");
    expect(v?.confidence).toBe(0.75);
    expect(v?.rationale).toBe("too broad");
  });

  it("returns null when adviseFn returns null (jev disabled / abstained at engine level)", async () => {
    const stubFn = vi.fn().mockResolvedValue(null);
    const advisor = new JevAdvisor(stubFn);
    expect(await advisor.advise("proportion-gate", "?")).toBeNull();
  });

  it("forwards the feature and summary arguments to adviseFn", async () => {
    const stubFn = vi.fn().mockResolvedValue(null);
    const advisor = new JevAdvisor(stubFn);
    await advisor.advise("my-feature", "my summary");
    expect(stubFn).toHaveBeenCalledWith("my-feature", "my summary");
  });
});

// ---------------------------------------------------------------------------
// ExternalAdvisor — HTTP transport (R2-005)
// ---------------------------------------------------------------------------

describe("ExternalAdvisor.advise — HTTP transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps a valid verdict JSON response to AdvisorVerdict", async () => {
    const body = { verdict: "approve", confidence: 0.95, rationale: "Looks good" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    const result = await a.advise("proportion-gate", "diff ok?");
    expect(result).not.toBeNull();
    expect(result?.verdict).toBe("approve");
    expect(result?.confidence).toBe(0.95);
    expect(result?.rationale).toBe("Looks good");
  });

  it("sends feature, summary (and model if present) in POST body", async () => {
    const fetchMock = vi.fn(async () => Response.json({ verdict: "abstain" }));
    vi.stubGlobal("fetch", fetchMock);
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise", model: "gpt-4o" });
    await a.advise("my-feature", "my summary");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://advisor.example.com/advise");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent["feature"]).toBe("my-feature");
    expect(sent["summary"]).toBe("my summary");
    expect(sent["model"]).toBe("gpt-4o");
  });

  it("omits model from body when not configured", async () => {
    const fetchMock = vi.fn(async () => Response.json({ verdict: "abstain" }));
    vi.stubGlobal("fetch", fetchMock);
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    await a.advise("f", "s");
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(Object.hasOwn(sent, "model")).toBe(false);
  });

  it("returns null for a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    expect(await a.advise("f", "s")).toBeNull();
  });

  it("returns null when response body is not valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } })));
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    expect(await a.advise("f", "s")).toBeNull();
  });

  it("returns null when response JSON has an invalid verdict shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ verdict: "unknown-verdict" })));
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    expect(await a.advise("f", "s")).toBeNull();
  });

  it("returns null when fetch throws (network error / timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    expect(await a.advise("f", "s")).toBeNull();
  });

  it("returns null when no endpoint is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const a = new ExternalAdvisor({});
    expect(await a.advise("f", "s")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when config is empty", async () => {
    const a = new ExternalAdvisor();
    expect(await a.advise("f", "s")).toBeNull();
  });

  it("omits confidence and rationale keys when not in response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ verdict: "abstain" })));
    const a = new ExternalAdvisor({ endpoint: "https://advisor.example.com/advise" });
    const result = await a.advise("f", "s");
    expect(result).not.toBeNull();
    expect(result?.verdict).toBe("abstain");
    expect(Object.hasOwn(result!, "confidence")).toBe(false);
    expect(Object.hasOwn(result!, "rationale")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAdvisor reads merged (gate + project) config (integration sanity)
// ---------------------------------------------------------------------------

describe("resolveAdvisor — uses FileArtifactStore with tmp dirs", () => {
  let dir: string;
  const store = new FileArtifactStore();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-advisor-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns JevAdvisor from real filesystem when no config exists", () => {
    // No .gatewright/config.json in dir → empty modules → legacy fallback.
    const cs = new ConfigStore(store);
    // Point GATEWRIGHT_HOME to a non-existent dir to avoid reading real ~/.gatewright.
    const origHome = process.env["GATEWRIGHT_HOME"];
    process.env["GATEWRIGHT_HOME"] = join(dir, "gate-home");
    try {
      const advisor = resolveAdvisor(dir, cs);
      expect(advisor).toBeInstanceOf(JevAdvisor);
    } finally {
      if (origHome === undefined) delete process.env["GATEWRIGHT_HOME"];
      else process.env["GATEWRIGHT_HOME"] = origHome;
    }
  });

  it("returns null when project config disables jev via module record", () => {
    const projectGwDir = join(dir, ".gatewright");
    mkdirSync(projectGwDir, { recursive: true });
    writeFileSync(
      join(projectGwDir, "config.json"),
      JSON.stringify({ modules: [{ id: "jev", kind: "jev", enabled: false, provider: "internal" }] }),
    );
    const cs = new ConfigStore(store);
    const origHome = process.env["GATEWRIGHT_HOME"];
    process.env["GATEWRIGHT_HOME"] = join(dir, "gate-home");
    try {
      expect(resolveAdvisor(dir, cs)).toBeNull();
    } finally {
      if (origHome === undefined) delete process.env["GATEWRIGHT_HOME"];
      else process.env["GATEWRIGHT_HOME"] = origHome;
    }
  });
});
