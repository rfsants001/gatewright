import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { ExecutionGraph } from "../graph/execution-graph.js";
import { AgentRegistry } from "./agent-registry.js";
import { AgentError } from "./types.js";
import { selectAgent } from "./capability.js";
import { buildDispatchPlan } from "./dispatch-plan.js";
import { AsyncDispatchScheduler, type NodeExecutor } from "./dispatch-scheduler.js";

describe("AgentRegistry", () => {
  it("registers agents and rejects duplicate ids", () => {
    const reg = new AgentRegistry();
    reg.register({ id: "coord", role: "COORDINATOR", capabilities: [] });
    expect(() => reg.register({ id: "coord", role: "SPECIALIST", capabilities: [] })).toThrow(AgentError);
  });

  it("indexes by capability, id-sorted", () => {
    const reg = new AgentRegistry();
    reg.register({ id: "zeta", role: "SPECIALIST", capabilities: ["edit", "test"] });
    reg.register({ id: "alpha", role: "SPECIALIST", capabilities: ["edit"] });
    reg.register({ id: "mid", role: "SPECIALIST", capabilities: ["review"] });
    expect(reg.withCapability("edit").map((a) => a.id)).toEqual(["alpha", "zeta"]);
    expect(reg.withCapability("test").map((a) => a.id)).toEqual(["zeta"]);
  });
});

describe("selectAgent", () => {
  const reg = new AgentRegistry();
  reg.register({ id: "beta", role: "SPECIALIST", capabilities: ["edit", "test"] });
  reg.register({ id: "alpha", role: "SPECIALIST", capabilities: ["edit"] });

  it("picks the first id-sorted agent whose capabilities cover the demand", () => {
    expect(selectAgent({ nodeId: "n", requiredCapabilities: ["edit"] }, reg)?.id).toBe("alpha");
    expect(selectAgent({ nodeId: "n", requiredCapabilities: ["edit", "test"] }, reg)?.id).toBe("beta");
  });

  it("returns null when no agent is eligible", () => {
    expect(selectAgent({ nodeId: "n", requiredCapabilities: ["deploy"] }, reg)).toBeNull();
  });
});

describe("buildDispatchPlan", () => {
  it("keeps unassigned nodes instead of dropping them", () => {
    const reg = new AgentRegistry();
    reg.register({ id: "editor", role: "SPECIALIST", capabilities: ["edit"] });
    const g = new ExecutionGraph().addNode("a").addNode("b");
    const demands: Record<string, string[]> = { a: ["edit"], b: ["deploy"] };
    const plan = buildDispatchPlan(g, reg, (id) => demands[id] ?? []);
    expect(plan).toEqual([
      { nodeId: "a", agentId: "editor" },
      { nodeId: "b", agentId: null },
    ]);
  });
});

describe("AsyncDispatchScheduler", () => {
  let dir: string;
  const store = new FileArtifactStore();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-agent-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const makeJournal = () => new Journal(store, join(dir, "log.json"));
  const clock = () => {
    let n = 0;
    return () => `2026-01-01T00:00:${String(n++).padStart(2, "0")}Z`;
  };

  it("drains a dependency chain to completion and records journal events", async () => {
    const reg = new AgentRegistry();
    reg.register({ id: "worker", role: "SPECIALIST", capabilities: ["work"] });
    const g = new ExecutionGraph().addNode("a").addNode("b").addDependency("a", "b");
    const journal = makeJournal();
    const executor: NodeExecutor = async () => ({ outcome: "passed" });

    const summary = await new AsyncDispatchScheduler(g, reg, journal).run(executor, {
      runSlug: "run-1",
      requiredCapabilitiesOf: () => ["work"],
      now: clock(),
    });

    expect(g.isComplete()).toBe(true);
    expect(g.stateOf("b")).toBe("PASSED");
    expect(summary).toMatchObject({ dispatched: 2, passed: 2, failed: 0, unassigned: [] });
    const types = journal.read().map((e) => e.type);
    expect(types.filter((t) => t === "agent.dispatched")).toHaveLength(2);
    expect(types.filter((t) => t === "agent.completed")).toHaveLength(2);
  });

  it("honors global maxConcurrency", async () => {
    const reg = new AgentRegistry();
    reg.register({ id: "w", role: "SPECIALIST", capabilities: [] });
    const g = new ExecutionGraph().addNode("a").addNode("b").addNode("c");
    let active = 0;
    let peak = 0;
    const executor: NodeExecutor = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { outcome: "passed" };
    };

    await new AsyncDispatchScheduler(g, reg, makeJournal()).run(executor, {
      runSlug: "run-2",
      maxConcurrency: 2,
      now: clock(),
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(g.isComplete()).toBe(true);
  });

  it("stops without spinning when only unassigned nodes remain", async () => {
    const reg = new AgentRegistry(); // no agents
    const g = new ExecutionGraph().addNode("a");
    const summary = await new AsyncDispatchScheduler(g, reg, makeJournal()).run(
      async () => ({ outcome: "passed" }),
      { runSlug: "run-3", requiredCapabilitiesOf: () => ["impossible"], now: clock() },
    );
    expect(summary.unassigned).toEqual(["a"]);
    expect(g.isComplete()).toBe(false);
  });

  it("marks failures and transitively blocks dependents", async () => {
    const reg = new AgentRegistry();
    reg.register({ id: "w", role: "SPECIALIST", capabilities: [] });
    const g = new ExecutionGraph().addNode("a").addNode("b").addDependency("a", "b");
    const executor: NodeExecutor = async (nodeId) => ({ outcome: nodeId === "a" ? "failed" : "passed" });
    const summary = await new AsyncDispatchScheduler(g, reg, makeJournal()).run(executor, {
      runSlug: "run-4",
      now: clock(),
    });
    expect(g.stateOf("a")).toBe("FAILED");
    expect(g.stateOf("b")).toBe("BLOCKED");
    expect(summary).toMatchObject({ failed: 1 });
    expect(g.isComplete()).toBe(true);
  });
});
