// plan-gate — a Gate that blocks in-workspace mutations outside the approved plan scope.

import type { Gate, GateContext, GateDecision } from "../gate/types.js";
import type { Plan } from "./plan.js";
import { evaluatePlanScope } from "./plan.js";

function dropQuotes(s: string): string {
  return s.replace(/^['"]|['"]$/g, "");
}

function bashWriteTargets(command: string): string[] {
  const targets: string[] = [];
  for (const m of command.matchAll(/(?:^|\s)\d?>>?\s*([^\s;&|>]+)/g)) if (m[1]) targets.push(m[1]);
  for (const m of command.matchAll(/\btee\b(?:\s+-a)?\s+([^\s;&|]+)/g)) if (m[1]) targets.push(m[1]);
  for (const seg of command.split(/[;&|]+/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    if (/^(cp|mv)$/.test(toks[0] ?? "")) {
      const dest = toks.filter((t) => !t.startsWith("-")).at(-1);
      if (dest && dest !== toks[0]) targets.push(dest);
    }
  }
  return targets.map(dropQuotes);
}

function mutationPaths(ctx: GateContext): string[] {
  const ti = ctx.toolInput ?? {};
  const paths = new Set<string>();
  for (const key of ["file_path", "filePath", "path"]) {
    const v = ti[key];
    if (typeof v === "string" && v.trim()) paths.add(v.trim());
  }
  for (const key of ["edits", "files", "replacements"]) {
    const arr = ti[key];
    if (!Array.isArray(arr)) continue;
    for (const edit of arr) {
      if (edit && typeof edit === "object") {
        const p = (edit as Record<string, unknown>)["file_path"] ?? (edit as Record<string, unknown>)["path"];
        if (typeof p === "string" && p.trim()) paths.add(p.trim());
      }
    }
  }
  if (ctx.event === "pre-bash") for (const t of bashWriteTargets(String(ti["command"] ?? ""))) paths.add(t);
  return [...paths];
}

export interface PlanGateOptions {
  getPlan: (ctx: GateContext) => Plan | null;
  getActiveNodeId: (ctx: GateContext) => string | null;
  /** When true, a missing approved plan blocks (fail-closed). Default false (advisory absence). */
  enforce?: boolean;
}

export function planGate(options: PlanGateOptions): Gate {
  const enforce = options.enforce ?? false;
  return {
    name: "plan-gate",
    description: "Blocks in-workspace mutations outside the approved plan's node scope.",
    events: ["pre-edit", "pre-bash"],
    appliesTo: (ctx) => ctx.event === "pre-edit" || ctx.event === "pre-bash",
    check: (ctx: GateContext): GateDecision => {
      const plan = options.getPlan(ctx);
      const nodeId = options.getActiveNodeId(ctx);
      if (!plan || !nodeId) {
        return enforce ? { kind: "deny", reason: "plan-gate: no active approved plan (fail-closed)" } : { kind: "allow" };
      }
      for (const filePath of mutationPaths(ctx)) {
        const result = evaluatePlanScope({ cwd: ctx.cwd, filePath, plan, activeNodeId: nodeId });
        if (result.decision === "deny") return { kind: "deny", reason: `plan-gate: ${result.reason ?? "out of scope"}` };
      }
      return { kind: "allow" };
    },
  };
}
