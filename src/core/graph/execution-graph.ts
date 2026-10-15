// ExecutionGraph — a DAG of work nodes with dependency edges, topological order,
// a ready-queue, and state transitions with blocked-propagation. Pure, in-memory.

export type NodeState = "PENDING" | "READY" | "RUNNING" | "PASSED" | "FAILED" | "BLOCKED";

export type GraphErrorCode = "DUPLICATE_NODE" | "UNKNOWN_NODE" | "CYCLE";

export class GraphError extends Error {
  readonly code: GraphErrorCode;
  constructor(code: GraphErrorCode, message: string) {
    super(message);
    this.name = "GraphError";
    this.code = code;
  }
}

interface GraphNode {
  id: string;
  state: NodeState;
  /** ids this node depends on (must be PASSED before it is ready). */
  deps: Set<string>;
  meta?: unknown;
}

export class ExecutionGraph {
  readonly #nodes = new Map<string, GraphNode>();

  addNode(id: string, meta?: unknown): this {
    if (this.#nodes.has(id)) throw new GraphError("DUPLICATE_NODE", `node '${id}' already exists`);
    this.#nodes.set(id, { id, state: "PENDING", deps: new Set(), ...(meta !== undefined ? { meta } : {}) });
    return this;
  }

  /** Declare that `to` depends on `from` (from must complete first). Both must exist. */
  addDependency(from: string, to: string): this {
    const toNode = this.#nodes.get(to);
    if (!this.#nodes.has(from) || !toNode) throw new GraphError("UNKNOWN_NODE", `unknown node in dependency ${from} → ${to}`);
    toNode.deps.add(from);
    return this;
  }

  has(id: string): boolean {
    return this.#nodes.has(id);
  }

  stateOf(id: string): NodeState {
    const node = this.#nodes.get(id);
    if (!node) throw new GraphError("UNKNOWN_NODE", `unknown node '${id}'`);
    return node.state;
  }

  nodeIds(): string[] {
    return [...this.#nodes.keys()];
  }
}
