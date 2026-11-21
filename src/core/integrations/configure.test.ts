import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { applyIntegration, proposeIntegration, type ProposeSuccess } from "./configure.js";
import type { CompleteFn } from "./configure.js";

const configs = new ConfigStore(new FileArtifactStore());

// A minimal Provider that is valid per providerSchema (no keyEnv, loopback http).
const provider = { id: "test", endpoint: "http://127.0.0.1:11434/v1", model: "test-model" } as const;

function makeComplete(text: string): CompleteFn {
  return vi.fn(async () => ({ text }));
}

let cwd: string;

beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "gw-configure-")));
  process.env["GATEWRIGHT_HOME"] = join(cwd, "gate-home");
});

afterEach(() => {
  delete process.env["GATEWRIGHT_HOME"];
  vi.unstubAllGlobals();
  rmSync(cwd, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// proposeIntegration
// ---------------------------------------------------------------------------

describe("proposeIntegration", () => {
  it("returns a typed advisor change + revision + plan when complete returns valid JSON", async () => {
    // The model must appear in the input (spec intent or reference) for checkProposalSources to pass.
    const advisorJson = JSON.stringify({
      kind: "advisor",
      name: "my-advisor",
      endpoint: "https://advisor.example.com/advise",
      model: "gpt-4o",
    });
    const result = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://advisor.example.com/advise", intent: "Replace Jev" },
      provider,
      // Supply the model in the reference so checkProposalSources finds it in the input.
      reference: "Use model gpt-4o for judgment",
      complete: makeComplete(advisorJson),
    });

    expect("message" in result).toBe(false);
    const ok = result as ProposeSuccess;
    expect(ok.change.kind).toBe("advisor");
    if (ok.change.kind !== "advisor") throw new Error("narrow");
    expect(ok.change.name).toBe("my-advisor");
    expect(ok.change.endpoint).toBe("https://advisor.example.com/advise");
    expect(ok.change.model).toBe("gpt-4o");
    expect(typeof ok.revision).toBe("string");
    expect(ok.revision).toHaveLength(64); // sha256 hex
    expect(Array.isArray(ok.plan.steps)).toBe(true);
    expect(ok.plan.steps.length).toBeGreaterThan(0);
  });

  it("returns { message } when complete returns non-JSON", async () => {
    const result = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://example.com/advise", intent: "Test" },
      provider,
      complete: makeComplete("Sorry, I cannot help with that."),
    });
    expect("message" in result).toBe(true);
    if (!("message" in result)) throw new Error("narrow");
    expect(result.message).toContain("Sorry");
  });

  it("returns { message } when complete returns invalid change JSON", async () => {
    const result = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://example.com/advise", intent: "Test" },
      provider,
      complete: makeComplete(JSON.stringify({ kind: "unknown-kind" })),
    });
    expect("message" in result).toBe(true);
  });

  it("includes reference doc in the AI input when provided", async () => {
    const completeFn: CompleteFn = vi.fn(async (_provider, input) => ({
      text: JSON.stringify({ kind: "advisor", name: "ref-advisor", endpoint: "https://example.com/advise" }),
    })) as unknown as CompleteFn;

    // This will throw checkProposalSources because the endpoint IS in the input
    // but we just want to confirm the reference text is passed through.
    // Use an endpoint present in both spec and reference.
    const result = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://example.com/advise", intent: "Use docs" },
      provider,
      reference: "See https://example.com/advise for details",
      complete: completeFn,
    });
    expect("message" in result).toBe(false);
    const calledWith = (completeFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    expect(calledWith).toContain("Documentação fornecida:");
    expect(calledWith).toContain("See https://example.com/advise");
  });
});

// ---------------------------------------------------------------------------
// applyIntegration
// ---------------------------------------------------------------------------

describe("applyIntegration", () => {
  it("applies the change and writes CONFIRMED then APPLIED to the journal", async () => {
    const advisorJson = JSON.stringify({
      kind: "advisor",
      name: "ext-advisor",
      endpoint: "https://ext.example.com/advise",
    });
    const proposed = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://ext.example.com/advise", intent: "Wire external" },
      provider,
      complete: makeComplete(advisorJson),
    }) as ProposeSuccess;

    await applyIntegration({ cwd, change: proposed.change, revision: proposed.revision });

    // Assert module landed in project config via ConfigStore merge-by-id.
    const projectCfg = configs.read("project", cwd);
    const module = projectCfg.modules?.find((m) => m.id === "ext-advisor");
    expect(module).toBeDefined();
    expect(module?.kind).toBe("advisor");
    expect(module?.provider).toBe("external");
    expect(module?.enabled).toBe(true);
    expect((module?.config as Record<string, unknown>)?.["endpoint"]).toBe("https://ext.example.com/advise");

    // Assert journal entries.
    const journalPath = join(cwd, ".gatewright", "integrations.json");
    const events = JSON.parse(readFileSync(journalPath, "utf8")) as Array<{ type: string; payload: { kind: string } }>;
    const types = events.map((e) => e.type);
    expect(types).toContain("PROPOSAL_CONFIRMED");
    expect(types).toContain("PROPOSAL_APPLIED");
    expect(types.indexOf("PROPOSAL_CONFIRMED")).toBeLessThan(types.indexOf("PROPOSAL_APPLIED"));
    expect(events.every((e) => e.payload.kind === "advisor")).toBe(true);
  });

  it("does not clobber an existing disabled jev module when advisor is applied", async () => {
    // Pre-seed a disabled jev module.
    configs.write("project", { modules: [{ id: "jev", kind: "jev", provider: "internal", enabled: false }] }, cwd);

    const advisorJson = JSON.stringify({
      kind: "advisor",
      name: "new-advisor",
      endpoint: "https://new.example.com/advise",
    });
    const proposed = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://new.example.com/advise", intent: "Add advisor" },
      provider,
      complete: makeComplete(advisorJson),
    }) as ProposeSuccess;

    await applyIntegration({ cwd, change: proposed.change, revision: proposed.revision });

    const modules = configs.read("project", cwd).modules ?? [];
    expect(modules).toHaveLength(2);
    const jev = modules.find((m) => m.id === "jev");
    expect(jev?.enabled).toBe(false); // unchanged
    const advisor = modules.find((m) => m.id === "new-advisor");
    expect(advisor?.kind).toBe("advisor");
  });

  it("throws and writes PROPOSAL_FAILED when revision is stale", async () => {
    const advisorJson = JSON.stringify({
      kind: "advisor",
      name: "stale-advisor",
      endpoint: "https://stale.example.com/advise",
    });
    const proposed = await proposeIntegration({
      cwd,
      spec: { kind: "advisor", endpoint: "https://stale.example.com/advise", intent: "Stale test" },
      provider,
      complete: makeComplete(advisorJson),
    }) as ProposeSuccess;

    // Mutate the target between propose and apply to invalidate the revision.
    configs.write("project", { linkedProjects: [cwd] }, cwd);

    await expect(
      applyIntegration({ cwd, change: proposed.change, revision: proposed.revision }),
    ).rejects.toThrow("destino mudou");

    const journalPath = join(cwd, ".gatewright", "integrations.json");
    const events = JSON.parse(readFileSync(journalPath, "utf8")) as Array<{ type: string }>;
    const types = events.map((e) => e.type);
    expect(types).toContain("PROPOSAL_CONFIRMED");
    expect(types).toContain("PROPOSAL_FAILED");
    expect(types).not.toContain("PROPOSAL_APPLIED");
  });
});
