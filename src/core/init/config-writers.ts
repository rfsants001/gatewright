// Config writers — compute a WritePlan (pure, no disk) then apply it safely.
// Merges never clobber unrelated keys; an unparseable existing file becomes a noop
// (so we never destroy a file we can't understand); apply backs up before writing.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type WriteAction = "create" | "merge" | "noop";

export interface WritePlan {
  path: string;
  action: WriteAction;
  /** One-line human summary of the change. */
  summary: string;
  /** Lines describing what changes (for the preview). */
  preview: string[];
  /** Content to write when action !== "noop". */
  nextContent: string;
}

type Json = Record<string, unknown>;

function readJson(path: string): { ok: true; value: Json } | { ok: false } | { absent: true } {
  if (!existsSync(path)) return { absent: true };
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) as Json };
  } catch {
    return { ok: false };
  }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function unparseableNoop(path: string, what: string): WritePlan {
  return { path, action: "noop", summary: `${what}: existing file is not valid JSON — skipped`, preview: [`! ${path} left untouched (unparseable)`], nextContent: "" };
}

const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "Stop", "SubagentStop"] as const;

interface HookGroup {
  matcher?: string;
  hooks?: { type?: string; command?: string }[];
}

function hasGateHook(groups: unknown): boolean {
  return Array.isArray(groups)
    && groups.some((g: HookGroup) => Array.isArray(g.hooks) && g.hooks.some((h) => typeof h.command === "string" && h.command.includes("gate hook")));
}

/** Ensure `gate hook` is wired for all four lifecycle events in Claude Code settings. */
export function planHooks(settingsPath: string): WritePlan {
  const read = readJson(settingsPath);
  if ("ok" in read && !read.ok) return unparseableNoop(settingsPath, "hooks");

  const base: Json = "value" in read ? read.value : {};
  const hooks = { ...((base["hooks"] as Record<string, unknown>) ?? {}) };
  const missing = HOOK_EVENTS.filter((e) => !hasGateHook(hooks[e]));
  if (missing.length === 0) {
    return { path: settingsPath, action: "noop", summary: "hooks already wired", preview: ["✓ all 4 events already call gate hook"], nextContent: "" };
  }
  for (const event of missing) {
    const groups = Array.isArray(hooks[event]) ? [...(hooks[event] as HookGroup[])] : [];
    groups.push({ hooks: [{ type: "command", command: "gate hook" }] });
    hooks[event] = groups;
  }
  const next = { ...base, hooks };
  const action: WriteAction = "absent" in read ? "create" : "merge";
  return {
    path: settingsPath,
    action,
    summary: `${action === "create" ? "create settings and wire" : "wire"} ${missing.length} hook event(s)`,
    preview: missing.map((e) => `+ hooks.${e} → gate hook`),
    nextContent: serialize(next),
  };
}

/** Ensure a `gatewright` MCP server (`gate serve`) exists in .mcp.json. */
export function planMcp(mcpPath: string): WritePlan {
  const read = readJson(mcpPath);
  if ("ok" in read && !read.ok) return unparseableNoop(mcpPath, "mcp");

  const base: Json = "value" in read ? read.value : {};
  const servers = { ...((base["mcpServers"] as Record<string, unknown>) ?? {}) };
  if (servers["gatewright"]) {
    return { path: mcpPath, action: "noop", summary: "MCP server already registered", preview: ["✓ mcpServers.gatewright present"], nextContent: "" };
  }
  servers["gatewright"] = { command: "gate", args: ["serve"] };
  const next = { ...base, mcpServers: servers };
  const action: WriteAction = "absent" in read ? "create" : "merge";
  return {
    path: mcpPath,
    action,
    summary: `${action === "create" ? "create .mcp.json and register" : "register"} gatewright MCP server`,
    preview: ["+ mcpServers.gatewright → gate serve"],
    nextContent: serialize(next),
  };
}

export interface JevSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
  budget: Record<string, number>;
}

/** Set Jev config (merge over existing / defaults). */
export function planJev(jevPath: string, cfg: JevSettings): WritePlan {
  const read = readJson(jevPath);
  if ("ok" in read && !read.ok) return unparseableNoop(jevPath, "jev");

  const base: Json = "value" in read ? read.value : {};
  const next = { ...base, ...cfg, budget: { ...((base["budget"] as Record<string, number>) ?? {}), ...cfg.budget } };
  const action: WriteAction = "absent" in read ? "create" : "merge";
  return {
    path: jevPath,
    action,
    summary: `${cfg.enabled ? "enable" : "configure"} Jev (${cfg.model} @ ${cfg.endpoint})`,
    preview: [`+ jev.enabled = ${cfg.enabled}`, `+ jev.model = ${cfg.model}`, `+ jev.endpoint = ${cfg.endpoint}`],
    nextContent: serialize(next),
  };
}

export interface ApplyResult {
  written: boolean;
  backupPath?: string;
}

/** Apply a plan: back up an existing file (when requested) then write. Noop → nothing. */
export function applyPlan(plan: WritePlan, opts: { backup?: boolean } = {}): ApplyResult {
  if (plan.action === "noop") return { written: false };
  mkdirSync(dirname(plan.path), { recursive: true });

  let backupPath: string | undefined;
  if ((opts.backup ?? true) && existsSync(plan.path)) {
    backupPath = `${plan.path}.bak`;
    copyFileSync(plan.path, backupPath);
  }
  writeFileSync(plan.path, plan.nextContent, "utf8");
  return backupPath ? { written: true, backupPath } : { written: true };
}
