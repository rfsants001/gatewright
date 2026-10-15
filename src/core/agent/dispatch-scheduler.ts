// AsyncDispatchScheduler — drains the execution graph by dispatching ready nodes to
// agents (bounded concurrency), folding results back into the graph, and recording
// dispatch/completion events on the journal. Stops when the graph completes or no
// further progress is possible (only unassigned nodes remain).

import type { Journal } from "../journal/journal.js";
import type { ExecutionGraph } from "../graph/execution-graph.js";
import type { AgentRegistry } from "./agent-registry.js";
import { buildDispatchPlan, type CapabilityResolver } from "./dispatch-plan.js";
import type { Agent } from "./types.js";

export interface NodeResult {
  outcome: "passed" | "failed";
}

export type NodeExecutor = (nodeId: string, agent: Agent) => Promise<NodeResult>;

export interface SchedulerOptions {
  runSlug: string;
  maxConcurrency?: number;
  requiredCapabilitiesOf?: CapabilityResolver;
  /** Clock for event timestamps; injectable for deterministic tests. */
  now?: () => string;
}

export interface SchedulerSummary {
  dispatched: number;
  passed: number;
  failed: number;
  /** Node ids still ready but with no eligible agent when the scheduler stopped. */
  unassigned: string[];
}

export class AsyncDispatchScheduler {
  readonly #graph: ExecutionGraph;
  readonly #registry: AgentRegistry;
  readonly #journal: Journal;

  constructor(graph: ExecutionGraph, registry: AgentRegistry, journal: Journal) {
    this.#graph = graph;
    this.#registry = registry;
    this.#journal = journal;
  }

  async run(executor: NodeExecutor, opts: SchedulerOptions): Promise<SchedulerSummary> {
    const maxConcurrency = Math.max(1, opts.maxConcurrency ?? Infinity);
    const now = opts.now ?? (() => new Date().toISOString());
    const summary: SchedulerSummary = { dispatched: 0, passed: 0, failed: 0, unassigned: [] };

    const inFlight = new Map<string, Promise<void>>();

    while (!this.#graph.isComplete()) {
      const plan = buildDispatchPlan(this.#graph, this.#registry, opts.requiredCapabilitiesOf);
      const assignable = plan.filter((e) => e.agentId !== null && !inFlight.has(e.nodeId));

      // Dispatch as many assignable nodes as concurrency allows.
      for (const entry of assignable) {
        if (inFlight.size >= maxConcurrency) break;
        const agent = this.#registry.get(entry.agentId as string);
        if (!agent) continue;
        this.#graph.markRunning(entry.nodeId);
        this.#journal.append({
          type: "agent.dispatched",
          at: now(),
          payload: { runSlug: opts.runSlug, nodeId: entry.nodeId, agentId: agent.id },
        });
        summary.dispatched += 1;
        const nodeId = entry.nodeId;
        const settled = this.#execute(executor, nodeId, agent, opts.runSlug, now, summary).finally(() => {
          inFlight.delete(nodeId);
        });
        inFlight.set(nodeId, settled);
      }

      if (inFlight.size === 0) {
        // Nothing running and nothing dispatchable → only unassigned ready nodes remain.
        summary.unassigned = plan.filter((e) => e.agentId === null).map((e) => e.nodeId);
        break;
      }

      // Wait for the next node to settle, then re-derive the ready-queue.
      await Promise.race(inFlight.values());
    }

    await Promise.all(inFlight.values());
    return summary;
  }

  async #execute(
    executor: NodeExecutor,
    nodeId: string,
    agent: Agent,
    runSlug: string,
    now: () => string,
    summary: SchedulerSummary,
  ): Promise<void> {
    let outcome: NodeResult["outcome"];
    try {
      outcome = (await executor(nodeId, agent)).outcome;
    } catch {
      outcome = "failed";
    }
    if (outcome === "passed") {
      this.#graph.markPassed(nodeId);
      summary.passed += 1;
    } else {
      this.#graph.markFailed(nodeId);
      summary.failed += 1;
    }
    this.#journal.append({
      type: "agent.completed",
      at: now(),
      payload: { runSlug, nodeId, agentId: agent.id, outcome },
    });
  }
}
