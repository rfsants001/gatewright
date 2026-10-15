import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import type { GateContext, GateDecision } from "../gate/types.js";
import { StubAdapter } from "./adapters/stub-adapter.js";
import { OllamaAdapter } from "./adapters/ollama-adapter.js";
import { BudgetLedger } from "./budget.js";
import { JevDecisionEngine } from "./jev-engine.js";
import { JevConfigStore } from "./config-store.js";
import { withAdvisory } from "./advisory.js";
import type { ActionCard, JevContext } from "./types.js";

const ctx = (feature: string): JevContext => ({ feature, summary: "is this diff proportionate?" });

describe("StubAdapter", () => {
  it("returns a fixed judgment deterministically", async () => {
    const a = new StubAdapter({ verdict: "discard", rationale: "too big", confidence: 0.9 });
    expect(await a.judge("p", ctx("f"))).toEqual({ verdict: "discard", rationale: "too big", confidence: 0.9 });
  });
});

describe("BudgetLedger", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-jev-b-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const journal = () => new Journal(store, join(dir, "log.json"));

  it("allows within quota and refuses past it", () => {
    const b = new BudgetLedger({ "proportion-gate": 2 }, journal());
    expect(b.tryConsume("proportion-gate").ok).toBe(true);
    expect(b.tryConsume("proportion-gate").ok).toBe(true);
    expect(b.tryConsume("proportion-gate")).toEqual({ ok: false, reason: "exhausted" });
    expect(b.consumed("proportion-gate")).toBe(2);
  });

  it("treats a feature with no quota as unlimited", () => {
    const b = new BudgetLedger({}, journal());
    expect(b.tryConsume("other", 999).ok).toBe(true);
  });

  it("replays consumption from the journal", () => {
    const j = journal();
    new BudgetLedger({ f: 5 }, j).tryConsume("f", 3);
    const restored = new BudgetLedger({ f: 5 }, j);
    expect(restored.consumed("f")).toBe(3);
  });
});

describe("JevDecisionEngine", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-jev-e-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const journal = () => new Journal(store, join(dir, "log.json"));

  it("abstains and does not call the model when disabled", async () => {
    const j = journal();
    const adapter = new StubAdapter({ verdict: "discard", rationale: "x", confidence: 1 });
    const spy = vi.spyOn(adapter, "judge");
    const engine = new JevDecisionEngine(adapter, new BudgetLedger({}, j), j, { enabled: false });
    const card = await engine.consult("f", "p", ctx("f"));
    expect(card.verdict).toBe("abstain");
    expect(spy).not.toHaveBeenCalled();
  });

  it("abstains when the budget is exhausted, without calling the model", async () => {
    const j = journal();
    const adapter = new StubAdapter({ verdict: "approve", rationale: "ok", confidence: 1 });
    const spy = vi.spyOn(adapter, "judge");
    const budget = new BudgetLedger({ f: 0 }, j);
    const engine = new JevDecisionEngine(adapter, budget, j, { enabled: true });
    const card = await engine.consult("f", "p", ctx("f"));
    expect(card.verdict).toBe("abstain");
    expect(spy).not.toHaveBeenCalled();
    expect(j.read().some((e) => e.type === "jev.decision")).toBe(true);
  });

  it("consults the model when enabled and in budget, logging the decision", async () => {
    const j = journal();
    const engine = new JevDecisionEngine(
      new StubAdapter({ verdict: "discard", rationale: "too broad", confidence: 0.8 }),
      new BudgetLedger({ f: 3 }, j),
      j,
      { enabled: true },
    );
    const card = await engine.consult("f", "p", ctx("f"));
    expect(card).toMatchObject({ verdict: "discard", confidence: 0.8, title: "Jev · f" });
    const logged = j.read().find((e) => e.type === "jev.decision");
    expect(logged?.payload).toMatchObject({ verdict: "discard", model: "stub" });
  });
});

describe("OllamaAdapter", () => {
  const okFetch = (response: unknown): typeof fetch =>
    (async () => ({ ok: true, json: async () => ({ response: JSON.stringify(response) }) })) as unknown as typeof fetch;

  it("parses a well-formed model response", async () => {
    const a = new OllamaAdapter("m", { fetchImpl: okFetch({ verdict: "approve", rationale: "fine", confidence: 0.7 }) });
    expect(await a.judge("p", ctx("f"))).toEqual({ verdict: "approve", rationale: "fine", confidence: 0.7 });
  });

  it("abstains on a transport error", async () => {
    const a = new OllamaAdapter("m", { fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch });
    expect((await a.judge("p", ctx("f"))).verdict).toBe("abstain");
  });

  it("abstains and clamps on a malformed verdict/confidence", async () => {
    const a = new OllamaAdapter("m", { fetchImpl: okFetch({ verdict: "block", rationale: "x", confidence: 5 }) });
    const r = await a.judge("p", ctx("f"));
    expect(r.verdict).toBe("abstain");
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe("JevConfigStore", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-jev-c-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const cfg = () => new JevConfigStore(store, join(dir, "jev.config.json"));

  it("defaults to disabled when absent", () => {
    expect(cfg().read().enabled).toBe(false);
  });

  it("round-trips a patched config, ignoring undefined keys", () => {
    const c = cfg();
    c.write({ enabled: true, model: "qwen", endpoint: undefined, budget: { "proportion-gate": 10 } });
    const read = c.read();
    expect(read).toMatchObject({ enabled: true, model: "qwen", endpoint: "http://localhost:11434" });
    expect(read.budget).toEqual({ "proportion-gate": 10 });
  });
});

describe("withAdvisory (advisory-only: never flips the decision)", () => {
  const gctx: GateContext = { event: "stop", cwd: "/ws" };
  const card: ActionCard = { title: "t", verdict: "discard", rationale: "too broad", confidence: 0.6, evidence: [] };
  const advisor = () => card;

  it("leaves allow untouched and is a no-op without an advisor", () => {
    expect(withAdvisory({ kind: "allow" }, advisor, gctx)).toEqual({ kind: "allow" });
    const advise: GateDecision = { kind: "advise", message: "m" };
    expect(withAdvisory(advise, undefined, gctx)).toEqual(advise);
  });

  it("annotates advise/deny messages while keeping the kind", () => {
    const advise = withAdvisory({ kind: "advise", message: "m" }, advisor, gctx);
    expect(advise.kind).toBe("advise");
    expect(advise.kind === "advise" && advise.message).toContain("jev:discard");
    const deny = withAdvisory({ kind: "deny", reason: "r" }, advisor, gctx);
    expect(deny.kind).toBe("deny");
    expect(deny.kind === "deny" && deny.reason).toContain("jev:discard");
  });

  it("ignores an abstaining card", () => {
    const abstainer = () => ({ ...card, verdict: "abstain" as const });
    const advise: GateDecision = { kind: "advise", message: "m" };
    expect(withAdvisory(advise, abstainer, gctx)).toEqual(advise);
  });
});
