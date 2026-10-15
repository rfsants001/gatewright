// Module dependency graph — built from import specifiers. Directed, cycle-tolerant.
// Scanner-based (no AST dep this phase); only relative imports become internal edges.

import { dirname, resolve } from "node:path";

const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bimport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g, // import ... from "x"
  /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g, // export ... from "x"
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import("x")
  /\bimport\s+['"]([^'"]+)['"]/g, // side-effect import "x"
];

export function extractImports(source: string): string[] {
  const specs = new Set<string>();
  for (const re of IMPORT_PATTERNS) for (const m of source.matchAll(re)) if (m[1]) specs.add(m[1]);
  return [...specs];
}

export interface ModuleGraph {
  nodes: string[];
  /** Directed edges [from, to] meaning `from` imports `to`. May contain cycles. */
  edges: Array<[string, string]>;
}

const CANDIDATE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cjs"];

function resolveRelative(fromFile: string, spec: string, resolvedToId: Map<string, string>): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const ext of CANDIDATE_EXT) {
    const id = resolvedToId.get(base + ext);
    if (id) return id;
  }
  for (const index of ["/index.ts", "/index.js", "/index.mjs"]) {
    const id = resolvedToId.get(base + index);
    if (id) return id;
  }
  return null;
}

/** Build the internal dependency graph. Bare specifiers (external deps) are ignored. */
export function buildModuleGraph(files: string[], readFile: (file: string) => string): ModuleGraph {
  const resolvedToId = new Map<string, string>();
  for (const file of files) resolvedToId.set(resolve(file), file);

  const edges: Array<[string, string]> = [];
  for (const file of files) {
    for (const spec of extractImports(readFile(file))) {
      if (!spec.startsWith(".")) continue; // external
      const target = resolveRelative(resolve(file), spec, resolvedToId);
      if (target) edges.push([file, target]);
    }
  }
  return { nodes: [...files], edges };
}
