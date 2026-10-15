import { describe, expect, it } from "vitest";
import type { ModuleGraph } from "./module-graph.js";
import type { Area, BoundaryRule } from "./boundaries.js";
import { classifyArea, findViolations } from "./boundaries.js";

const areas: Area[] = [
  { name: "core", match: ["src/core/**"] },
  { name: "gates", match: ["src/gates/**"] },
];

describe("classifyArea", () => {
  it("assigns a file to the first matching area", () => {
    expect(classifyArea("src/core/journal/journal.ts", areas)).toBe("core");
    expect(classifyArea("src/gates/secret-guard.ts", areas)).toBe("gates");
    expect(classifyArea("README.md", areas)).toBeNull();
  });
});

describe("findViolations", () => {
  const rules: BoundaryRule[] = [{ from: "core", to: "gates", allow: false }];

  it("flags an edge crossing a forbidden boundary", () => {
    const graph: ModuleGraph = { nodes: [], edges: [["src/core/x.ts", "src/gates/secret-guard.ts"]] };
    const v = findViolations(graph, areas, rules);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ fromArea: "core", toArea: "gates" });
  });

  it("ignores same-area, allowed, and unclassified edges", () => {
    const graph: ModuleGraph = {
      nodes: [],
      edges: [
        ["src/core/x.ts", "src/core/y.ts"], // same area
        ["src/gates/a.ts", "src/core/b.ts"], // gates->core, not forbidden
        ["README.md", "src/core/b.ts"], // unclassified source
      ],
    };
    expect(findViolations(graph, areas, rules)).toHaveLength(0);
  });
});
