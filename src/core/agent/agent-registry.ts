// AgentRegistry — in-memory catalog of agents, indexed by id and by capability.

import { AgentError, type Agent, type AgentRole } from "./types.js";

export interface AgentSpec {
  id: string;
  role: AgentRole;
  capabilities: Iterable<string>;
}

export class AgentRegistry {
  readonly #agents = new Map<string, Agent>();

  /** Register an agent. Duplicate id → AgentError. */
  register(spec: AgentSpec): this {
    if (this.#agents.has(spec.id)) {
      throw new AgentError("DUPLICATE_AGENT", `agent '${spec.id}' already registered`);
    }
    this.#agents.set(spec.id, {
      id: spec.id,
      role: spec.role,
      capabilities: new Set(spec.capabilities),
    });
    return this;
  }

  get(id: string): Agent | undefined {
    return this.#agents.get(id);
  }

  /** Agents that declare `capability`, deterministically ordered by id. */
  withCapability(capability: string): Agent[] {
    return this.all().filter((a) => a.capabilities.has(capability));
  }

  /** All agents, deterministically ordered by id. */
  all(): Agent[] {
    return [...this.#agents.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
