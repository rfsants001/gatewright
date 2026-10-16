// Project scaffold — idempotently ensure Gatewright's project directories exist.
// Never overwrites existing content; only creates missing dirs.

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PROJECT_DIRS = [".specs", ".gatewright"] as const;

export interface ScaffoldResult {
  /** Dirs that were created now (absent before). */
  created: string[];
  /** Dirs that already existed. */
  existing: string[];
}

export function scaffoldProject(root: string): ScaffoldResult {
  const created: string[] = [];
  const existing: string[] = [];
  for (const dir of PROJECT_DIRS) {
    const path = join(root, dir);
    if (existsSync(path)) {
      existing.push(dir);
    } else {
      mkdirSync(path, { recursive: true });
      created.push(dir);
    }
  }
  return { created, existing };
}
