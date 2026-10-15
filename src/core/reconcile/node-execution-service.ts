// NodeExecutionService — fold native invocations into graph-node transitions.
// `start` → markRunning; `stop` with an outcome → markPassed/markFailed. The
// selector matches a node id; invocations for unknown nodes are ignored (noted).

import { ExecutionGraph, GraphError } from "../graph/execution-graph.js";
import type { Invocation } from "./types.js";

export interface ApplyResult {
  applied: number;
  /** Selectors that did not match any graph node. */
  ignored: string[];
}

export class NodeExecutionService {
  readonly #graph: ExecutionGraph;

  constructor(graph: ExecutionGraph) {
    this.#graph = graph;
  }

  /** Apply one invocation to the graph. Returns false when the selector is unknown. */
  apply(inv: Invocation): boolean {
    if (!this.#graph.has(inv.selector)) return false;
    if (inv.kind === "start") {
      this.#graph.markRunning(inv.selector);
      return true;
    }
    // stop
    if (inv.outcome === "failed") this.#graph.markFailed(inv.selector);
    else this.#graph.markPassed(inv.selector);
    return true;
  }

  /** Apply invocations in order; collect selectors that matched no node. */
  applyAll(invocations: Iterable<Invocation>): ApplyResult {
    let applied = 0;
    const ignored: string[] = [];
    for (const inv of invocations) {
      try {
        if (this.apply(inv)) applied += 1;
        else ignored.push(inv.selector);
      } catch (error) {
        if (error instanceof GraphError) ignored.push(inv.selector);
        else throw error;
      }
    }
    return { applied, ignored };
  }
}
