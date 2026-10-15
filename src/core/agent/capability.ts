// Capability assignment — match a node's required capabilities to an eligible agent.

import type { AgentRegistry } from "./agent-registry.js";
import type { Agent, CapabilityDemand } from "./types.js";

/**
 * Pick an agent able to satisfy every required capability of `demand`.
 * Eligible = a SPECIALIST (or any agent) whose capabilities ⊇ required set.
 * Deterministic: candidates are id-sorted (AgentRegistry.all), first match wins.
 * No eligible agent → null (the node stays unassigned, never dropped).
 */
export function selectAgent(demand: CapabilityDemand, registry: AgentRegistry): Agent | null {
  const required = demand.requiredCapabilities;
  for (const agent of registry.all()) {
    if (required.every((cap) => agent.capabilities.has(cap))) return agent;
  }
  return null;
}
