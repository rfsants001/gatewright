// Config writers — compute a WritePlan (pure, no disk) then apply it safely.
// Merges never clobber unrelated keys; an unparseable existing file becomes a noop
// (so we never destroy a file we can't understand); apply backs up before writing.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gateHookCommand, gateServeInvocation, isGateHookCommand } from "./gate-bin.js";

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

function groupHasGateHook(group: HookGroup): boolean {
  return Array.isArray(group.hooks) && group.hooks.some((h) => isGateHookCommand(h.command));
}

/**
 * Ensure every lifecycle event runs our hook, using an absolute invocation that works
 * without `gate` on PATH. Normalizes: any existing gate-hook entry (bare or absolute)
 * is replaced with the current correct command, so a stale `gate hook` gets upgraded.
 */
export function planHooks(settingsPath: string, force = false): WritePlan {
  const read = readJson(settingsPath);
  if ("ok" in read && !read.ok) return unparseableNoop(settingsPath, "hooks");

  const base: Json = "value" in read ? read.value : {};
  const hooks = { ...((base["hooks"] as Record<string, unknown>) ?? {}) };
  const command = gateHookCommand();
  const changed: string[] = [];

  for (const event of HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : [];
    const kept = groups.filter((g) => !groupHasGateHook(g));
    const next = [...kept, { hooks: [{ type: "command", command }] }];
    if (JSON.stringify(groups) !== JSON.stringify(next)) changed.push(event);
    hooks[event] = next;
  }

  const next = { ...base, hooks };
  if (changed.length === 0 && "value" in read) {
    if (!force) return { path: settingsPath, action: "noop", summary: "hooks already wired", preview: ["✓ all 4 events already call gate hook"], nextContent: "" };
    return { path: settingsPath, action: "merge", summary: "re-apply hooks (reset to correct)", preview: ["↻ re-wrote all 4 gate hook events"], nextContent: serialize(next) };
  }
  const action: WriteAction = "absent" in read ? "create" : "merge";
  return {
    path: settingsPath,
    action,
    summary: `${action === "create" ? "create settings and wire" : "wire"} ${changed.length} hook event(s)`,
    preview: changed.map((e) => `+ hooks.${e} → ${command}`),
    nextContent: serialize(next),
  };
}

/** Ensure a `gatewright` MCP server (`gate serve`) exists in .mcp.json. */
export function planMcp(mcpPath: string, force = false): WritePlan {
  const read = readJson(mcpPath);
  if ("ok" in read && !read.ok) return unparseableNoop(mcpPath, "mcp");

  const base: Json = "value" in read ? read.value : {};
  const servers = { ...((base["mcpServers"] as Record<string, unknown>) ?? {}) };
  const invocation = gateServeInvocation();
  const existing = servers["gatewright"] as { command?: unknown } | undefined;
  if (existing && existing.command === invocation.command && !force) {
    return { path: mcpPath, action: "noop", summary: "MCP server already registered", preview: ["✓ mcpServers.gatewright present"], nextContent: "" };
  }
  servers["gatewright"] = invocation;
  const next = { ...base, mcpServers: servers };
  if (existing && existing.command === invocation.command && force) {
    return { path: mcpPath, action: "merge", summary: "re-apply MCP (reset to correct)", preview: ["↻ re-registered gatewright MCP server"], nextContent: serialize(next) };
  }
  const action: WriteAction = "absent" in read ? "create" : "merge";
  return {
    path: mcpPath,
    action,
    summary: `${action === "create" ? "create .mcp.json and register" : "register"} gatewright MCP server`,
    preview: [`+ mcpServers.gatewright → ${invocation.command} … serve`],
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
