import { describe, expect, it } from "vitest";
import { buildModuleGraph, extractImports } from "./module-graph.js";

describe("extractImports", () => {
  it("captures static, export-from, dynamic and side-effect imports", () => {
    const src = `import a from "./a";\nexport * from "./b";\nconst c = await import("./c");\nimport "./d";\nimport x from "pkg";`;
    expect(extractImports(src).sort()).toEqual(["./a", "./b", "./c", "./d", "pkg"]);
  });
});

describe("buildModuleGraph", () => {
  const files = ["/w/a.ts", "/w/b.ts", "/w/c.ts"];
  const sources: Record<string, string> = {
    "/w/a.ts": `import b from "./b"; import c from "./c"; import ext from "pkg";`,
    "/w/b.ts": `import a from "./a";`, // cycle a <-> b
    "/w/c.ts": `export const c = 1;`,
  };
  const graph = buildModuleGraph(files, (f) => sources[f] ?? "");

  it("links relative imports and ignores external (bare) specifiers", () => {
    const edges = graph.edges.map(([f, t]) => `${f.split("/").pop()}->${t.split("/").pop()}`).sort();
    expect(edges).toEqual(["a.ts->b.ts", "a.ts->c.ts", "b.ts->a.ts"]);
  });

  it("tolerates cycles (no throw)", () => {
    expect(graph.edges).toContainEqual(["/w/a.ts", "/w/b.ts"]);
    expect(graph.edges).toContainEqual(["/w/b.ts", "/w/a.ts"]);
  });
});
