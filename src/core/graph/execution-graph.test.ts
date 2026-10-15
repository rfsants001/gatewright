import { describe, expect, it } from "vitest";
import { ExecutionGraph, GraphError } from "./execution-graph.js";

function chain(...ids: string[]): ExecutionGraph {
  const g = new ExecutionGraph();
  for (const id of ids) g.addNode(id);
  for (let i = 1; i < ids.length; i++) g.addDependency(ids[i - 1] as string, ids[i] as string);
  return g;
}

describe("ExecutionGraph model", () => {
  it("rejects duplicate nodes and unknown dependency endpoints", () => {
    const g = new ExecutionGraph().addNode("a");
    expect(() => g.addNode("a")).toThrow(GraphError);
    expect(() => g.addDependency("a", "ghost")).toThrow(GraphError);
  });

  it("starts nodes PENDING", () => {
    expect(new ExecutionGraph().addNode("a").stateOf("a")).toBe("PENDING");
  });
});

describe("topologicalOrder", () => {
  it("orders dependencies before dependents (deterministic)", () => {
    expect(chain("a", "b", "c").topologicalOrder()).toEqual(["a", "b", "c"]);
  });

  it("throws on a cycle", () => {
    const g = new ExecutionGraph().addNode("x").addNode("y");
    g.addDependency("x", "y").addDependency("y", "x");
    expect(() => g.topologicalOrder()).toThrow(GraphError);
  });
});

describe("ready-queue and transitions", () => {
  it("only surfaces nodes whose deps have all PASSED", () => {
    const g = new ExecutionGraph();
    for (const n of ["a", "b", "c", "d"]) g.addNode(n);
    g.addDependency("a", "b").addDependency("b", "c").addDependency("a", "d");
    expect(g.readyQueue()).toEqual(["a"]);
    g.markPassed("a");
    expect(g.readyQueue()).toEqual(["b", "d"]);
  });

  it("propagates BLOCKED transitively on failure, leaving siblings untouched", () => {
    const g = new ExecutionGraph();
    for (const n of ["a", "b", "c", "d"]) g.addNode(n);
    g.addDependency("a", "b").addDependency("b", "c").addDependency("a", "d");
    g.markPassed("a");
    g.markFailed("b");
    expect(g.stateOf("c")).toBe("BLOCKED");
    expect(g.stateOf("d")).toBe("PENDING");
  });

  it("reports completion when all nodes are terminal", () => {
    const g = chain("a", "b");
    expect(g.isComplete()).toBe(false);
    g.markPassed("a");
    g.markPassed("b");
    expect(g.isComplete()).toBe(true);
  });
});
