// Agent-system contracts — roles, agents, and the errors the registry raises.

/** COORDINATOR orchestrates; SPECIALIST executes work matching its capabilities. */
export type AgentRole = "COORDINATOR" | "SPECIALIST";

export interface Agent {
  readonly id: string;
  readonly role: AgentRole;
  /** Capabilities this agent can satisfy (e.g. "edit", "test", "review"). */
  readonly capabilities: ReadonlySet<string>;
}

export type AgentErrorCode = "DUPLICATE_AGENT";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

/** A graph node annotated with the capabilities an agent must have to run it. */
export interface CapabilityDemand {
  readonly nodeId: string;
  readonly requiredCapabilities: readonly string[];
}

/** One line of a dispatch plan: a node mapped to an agent, or left unassigned. */
export interface DispatchEntry {
  readonly nodeId: string;
  readonly agentId: string | null;
}
