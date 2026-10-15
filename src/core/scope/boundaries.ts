// Architecture boundaries - classify files into areas and flag forbidden cross-area imports.

import { matchGlob } from "../plan/plan.js";
import type { ModuleGraph } from "./module-graph.js";

export interface Area {
  name: string;
  /** Globs identifying files in this area. */
  match: string[];
}

export interface BoundaryRule {
  from: string;
  to: string;
  allow: false;
}

export interface BoundaryViolation {
  from: string;
  to: string;
  fromArea: string;
  toArea: string;
}

/** The first area whose globs match `path`, or null. */
export function classifyArea(path: string, areas: readonly Area[]): string | null {
  for (const area of areas) if (area.match.some((glob) => matchGlob(glob, path))) return area.name;
  return null;
}

/** Edges that cross a forbidden area boundary. Same-area and unclassified edges are ignored. */
export function findViolations(graph: ModuleGraph, areas: readonly Area[], rules: readonly BoundaryRule[]): BoundaryViolation[] {
  const key = (from: string, to: string): string => `${from}=>${to}`;
  const forbidden = new Set(rules.filter((r) => r.allow === false).map((r) => key(r.from, r.to)));
  const violations: BoundaryViolation[] = [];
  for (const [from, to] of graph.edges) {
    const fromArea = classifyArea(from, areas);
    const toArea = classifyArea(to, areas);
    if (fromArea && toArea && fromArea !== toArea && forbidden.has(key(fromArea, toArea))) {
      violations.push({ from, to, fromArea, toArea });
    }
  }
  return violations;
}
