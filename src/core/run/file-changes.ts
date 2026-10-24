// PURE: derive changed files from engine events. Looks at tool_use + tool_result
// pairs for Write, Edit, Patch tools and extracts the file path from detail.

import type { EngineEvent } from "../engine/types.js";

export interface FileChange {
  path: string;
  /** 'write' = created/overwritten, 'edit' = patched, 'unknown' = other mutating tool */
  op: "write" | "edit" | "unknown";
  /** Lines added/removed if derivable from result text (e.g. "+3 -1"). */
  delta?: string;
}

const WRITE_TOOLS = new Set(["write", "Write", "create", "Create"]);
const EDIT_TOOLS = new Set(["edit", "Edit", "str_replace", "str_replace_editor", "Patch", "patch"]);

function opFor(tool: string): "write" | "edit" | "unknown" {
  if (WRITE_TOOLS.has(tool)) return "write";
  if (EDIT_TOOLS.has(tool)) return "edit";
  return "unknown";
}

/** Extract a file path from the detail string (first path-like token). */
function extractPath(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const match = detail.match(/^([^\s]+)/);
  return match?.[1];
}

/** Derive the set of changed files from a flat event list (order preserved, last op wins). */
export function deriveFileChanges(events: readonly EngineEvent[]): FileChange[] {
  const byPath = new Map<string, FileChange>();

  for (const ev of events) {
    if (ev.kind !== "tool_use" && ev.kind !== "tool_result") continue;
    const tool = ev.tool;
    if (!tool) continue;
    const op = opFor(tool);
    if (op === "unknown" && ev.kind === "tool_use") continue; // skip non-file tools

    const path = extractPath(ev.detail);
    if (!path) continue;

    if (ev.kind === "tool_result") {
      // Update existing entry with delta if present
      const existing = byPath.get(path);
      if (existing) {
        const delta = parseDelta(ev.detail);
        if (delta) byPath.set(path, { ...existing, delta });
      }
    } else {
      byPath.set(path, { path, op });
    }
  }

  return [...byPath.values()];
}

function parseDelta(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const m = detail.match(/([+-]\d+)/g);
  if (m && m.length >= 1) return m.join(" ");
  return undefined;
}
