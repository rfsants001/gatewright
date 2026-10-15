// proportion-gate — over-reach sensor: flags a turn whose diff is disproportionate.
// Advisory by default; hard-blocks only under `enforce` (raw diff size is a footgun to enforce).
// Clean-room reimplementation.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gate, GateContext, GateDecision } from "../core/gate/types.js";
import { withAdvisory, type Advisor } from "../core/jev/advisory.js";

const DEFAULT_MAX_FILES = 25;
const DEFAULT_MAX_LINES = 800;
const GIT_TIMEOUT_MS = 15_000;

function sh(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, timeout: GIT_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch {
    return "";
  }
}

function changedFileCount(root: string): number {
  return sh("git status --porcelain", root).split("\n").filter((l) => l.trim().length > 0).length;
}

function changedLineCount(root: string): number {
  let total = 0;
  for (const line of sh("git diff --numstat HEAD", root).split("\n")) {
    if (!line.trim()) continue;
    const [added, removed] = line.split("\t");
    const a = Number.parseInt(added ?? "", 10);
    const r = Number.parseInt(removed ?? "", 10);
    total += (Number.isFinite(a) ? a : 0) + (Number.isFinite(r) ? r : 0);
  }
  return total;
}

export interface ProportionOptions {
  maxFiles?: number;
  maxLines?: number;
  enforce?: boolean;
  /** Optional Jev advisory attached to the over-reach message (never changes the decision). */
  advisor?: Advisor;
}

export function proportionGate(options: ProportionOptions = {}): Gate {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const enforce = options.enforce ?? false;
  return {
    name: "proportion-gate",
    description: "Flags a turn whose diff exceeds the expected file/line budget.",
    events: ["stop"],
    appliesTo: (ctx) => ctx.event === "stop",
    check: (ctx: GateContext): GateDecision => {
      const root = ctx.cwd;
      if (!existsSync(join(root, ".git")) && !sh("git rev-parse --is-inside-work-tree", root).trim()) return { kind: "allow" };
      const files = changedFileCount(root);
      if (files === 0) return { kind: "allow" };
      const lines = changedLineCount(root);
      const overFiles = files > maxFiles;
      const overLines = lines > maxLines;
      if (!overFiles && !overLines) return { kind: "allow" };
      const parts: string[] = [];
      if (overFiles) parts.push(`${files} files changed (limit ${maxFiles})`);
      if (overLines) parts.push(`${lines} lines changed (limit ${maxLines})`);
      const msg = `[proportion-gate] Broad scope in this turn — ${parts.join(" · ")}. Confirm this matches the ask; split into smaller deliveries or revert the excess if it drifted.`;
      const decision: GateDecision = enforce ? { kind: "deny", reason: msg } : { kind: "advise", message: msg };
      return withAdvisory(decision, options.advisor, ctx);
    },
  };
}
