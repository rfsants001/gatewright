// Dispatch plan — map the graph's ready nodes to eligible agents, deterministically.

import type { ExecutionGraph } from "../graph/execution-graph.js";
import type { AgentRegistry } from "./agent-registry.js";
import { selectAgent } from "./capability.js";
import type { DispatchEntry } from "./types.js";

/** Resolve the capabilities a node requires; unknown node → none required. */
export type CapabilityResolver = (nodeId: string) => readonly string[];

/**
 * Build a dispatch plan from the graph's current ready-queue: every ready node
 * becomes an entry mapped to an eligible agent, or `agentId: null` when none fits.
 * Unassigned nodes are kept (never silently dropped). Order follows readyQueue
 * (already id-sorted) so the plan is deterministic.
 */
export function buildDispatchPlan(
  graph: ExecutionGraph,
  registry: AgentRegistry,
  requiredCapabilitiesOf: CapabilityResolver = () => [],
): DispatchEntry[] {
  return graph.readyQueue().map((nodeId) => {
    const agent = selectAgent({ nodeId, requiredCapabilities: requiredCapabilitiesOf(nodeId) }, registry);
    return { nodeId, agentId: agent?.id ?? null };
  });
}
