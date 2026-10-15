// verify-on-edit — fast per-file check right after an edit: merge-conflict markers,
// a stray `debugger;`, and a test-reminder when editing source with no co-located test.
// Advisory only (never blocks). Clean-room reimplementation.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { Gate, GateContext, GateDecision } from "../core/gate/types.js";

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const MERGE_MARKER_RE = /^(<{7}|={7}|>{7})(\s|$)/m;
const DEBUGGER_RE = /(^|\s)debugger\s*;/m;
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

function scan(content: string): string[] {
  const issues: string[] = [];
  if (MERGE_MARKER_RE.test(content)) issues.push("merge-conflict markers (<<<<<<< / ======= / >>>>>>>) left in the file");
  if (DEBUGGER_RE.test(content)) issues.push("a stray `debugger;` statement");
  return issues;
}

// True when the edited file is production source that ought to have a co-located test but doesn't.
function needsTest(filePath: string): boolean {
  const full = basename(filePath);
  if (TEST_RE.test(full) || full.endsWith(".d.ts")) return false;
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  if (base === "index") return false; // barrel re-export
  if (/(^|\/)(__tests__|tests?)(\/|$)/.test(filePath)) return false; // test infra
  const dir = dirname(filePath);
  for (const e of new Set([ext, ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"])) {
    if (existsSync(join(dir, `${base}.test${e}`)) || existsSync(join(dir, `${base}.spec${e}`))) return false;
    if (existsSync(join(dir, "__tests__", `${base}.test${e}`)) || existsSync(join(dir, "__tests__", `${base}.spec${e}`))) return false;
  }
  return true;
}

export function verifyOnEdit(): Gate {
  return {
    name: "verify-on-edit",
    description: "Flags merge markers, stray debuggers, and missing co-located tests after an edit.",
    events: ["post-edit"],
    appliesTo: (ctx) => ctx.event === "post-edit",
    check: (ctx: GateContext): GateDecision => {
      const ti = ctx.toolInput ?? {};
      const filePath = (ti["file_path"] ?? ti["filePath"] ?? ti["path"]) as string | undefined;
      if (!filePath || !SOURCE_EXT.has(extname(filePath)) || !existsSync(filePath)) return { kind: "allow" };

      const messages: string[] = [];
      const issues = scan(readFileSync(filePath, "utf8"));
      if (issues.length) {
        messages.push(`[verify-on-edit] Issues in the just-edited file (${filePath}):\n- ${issues.join("\n- ")}\nFix before continuing — don't leave the file broken.`);
      }
      if (needsTest(filePath)) {
        messages.push(`[test-reminder] Edited source with no co-located test (${filePath}). The Definition of Done asks for tests green in scope — add/update the matching test.`);
      }
      return messages.length ? { kind: "advise", message: messages.join("\n\n") } : { kind: "allow" };
    },
  };
}
