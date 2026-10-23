// Canonical tool names + per-type input summaries for the run cockpit.
// Pure: no I/O, no React. Drives grouping (grouping.ts) and display (ui/run/).
// Architecture mirrors OpenCode's tool-display (clean-room, MIT); impl is ours.

import { basename, relative } from "node:path";

/**
 * Normalize an engine tool name to a lowercase canonical form. Different engines
 * (and Claude's PascalCase) name the same action differently; grouping and
 * display key off the canonical name. Unknown tools lowercase through unchanged.
 */
export function canonicalToolName(name: string): string {
  const key = name.trim().toLowerCase();
  const remap: Record<string, string> = {
    bash: "shell",
    run_in_terminal: "shell",
    task: "subagent",
    agent: "subagent",
    apply_patch: "patch",
    multiedit: "edit",
  };
  return remap[key] ?? key;
}

/** Tools that only read/observe — grouped as "exploration" and colored blue. */
export const EXPLORATION_TOOLS: ReadonlySet<string> = new Set(["read", "glob", "grep", "webfetch", "websearch"]);

type Input = Record<string, unknown>;

function asRecord(input: unknown): Input {
  return typeof input === "object" && input !== null ? (input as Input) : {};
}

function str(rec: Input, key: string): string {
  return typeof rec[key] === "string" ? (rec[key] as string) : "";
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Count lines a string contributes (empty string = 0). */
function lineCount(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

function relPath(path: string, cwd?: string): string {
  if (!path) return "";
  if (!cwd) return path;
  const rel = relative(cwd, path);
  // Keep absolute paths outside cwd readable rather than "../../.." noise.
  return rel && !rel.startsWith("..") ? rel : path;
}

/** Added/removed line delta from a patch/diff body (lines starting +/-, not ++/--). */
function patchDelta(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

/** `[k=value, ...]` of an input's primitive fields; "" when none. */
function primitiveSummary(rec: Input, omit: readonly string[] = []): string {
  const entries = Object.entries(rec).filter(
    ([k, v]) => !omit.includes(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"),
  );
  if (entries.length === 0) return "";
  return `[${entries.map(([k, v]) => `${k}=${oneLine(String(v), 40)}`).join(", ")}]`;
}

/**
 * A concise "what" for a tool call, derived from its input, keyed by canonical
 * name. `cwd` relativizes file paths when known. Falls back to a `[k=v]` dump.
 */
export function toolInputSummary(canonicalName: string, input: unknown, cwd?: string): string {
  const rec = asRecord(input);
  switch (canonicalName) {
    case "shell":
      return oneLine(str(rec, "command"), 60);
    case "read":
      return relPath(str(rec, "file_path") || str(rec, "path"), cwd);
    case "write": {
      const path = relPath(str(rec, "file_path") || str(rec, "path"), cwd);
      const added = lineCount(str(rec, "content") || str(rec, "file_text"));
      return added ? `${path} +${added}` : path;
    }
    case "edit": {
      const path = relPath(str(rec, "file_path") || str(rec, "path"), cwd);
      const added = lineCount(str(rec, "new_string"));
      const removed = lineCount(str(rec, "old_string"));
      return added || removed ? `${path} +${added} -${removed}` : path;
    }
    case "patch": {
      const { added, removed } = patchDelta(str(rec, "patch") || str(rec, "input") || str(rec, "diff"));
      return added || removed ? `+${added} -${removed}` : primitiveSummary(rec);
    }
    case "glob":
    case "grep": {
      const pattern = str(rec, "pattern") || str(rec, "query");
      const base = relPath(str(rec, "path") || str(rec, "glob"), cwd);
      return base ? `${oneLine(pattern, 40)}  ${base}` : oneLine(pattern, 60);
    }
    case "subagent":
      return oneLine(str(rec, "description") || str(rec, "prompt") || str(rec, "task"), 60);
    case "webfetch": {
      const url = str(rec, "url");
      try {
        return url ? new URL(url).hostname : "";
      } catch {
        return oneLine(url, 60);
      }
    }
    case "websearch":
      return oneLine(str(rec, "query"), 60);
    case "skill":
      return str(rec, "name") || str(rec, "skill") || oneLine(primitiveSummary(rec), 60);
    default:
      return primitiveSummary(rec);
  }
}

/** Short display basename for a path (used by renderers needing a compact label). */
export function pathLabel(path: string): string {
  return path ? basename(path) : "";
}
