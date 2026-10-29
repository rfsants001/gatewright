// Environment probes — each returns a Check and never throws. File reads are
// defensive; network probes have a short timeout and degrade to `missing`.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "./types.js";
import { isGateHookCommand } from "../init/gate-bin.js";

export type CommandProbe = (bin: string, args?: string[]) => string | null;

/** Default command probe: returns trimmed stdout, or null when the binary is absent. */
export const defaultCommandProbe: CommandProbe = (bin, args = []) => {
  try {
    return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).trim();
  } catch {
    return null;
  }
};

export interface ProbeContext {
  home: string;
  cwd: string;
  now: number;
  fetchImpl: typeof fetch;
  commandProbe: CommandProbe;
  ollamaEndpoint: string;
  lmStudioEndpoint: string;
  skillsDir: string;
  jevConfigPath: string;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function probeHttpJson(fetchImpl: typeof fetch, url: string, timeoutMs = 2000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "Stop", "SubagentStop"] as const;

// ── Environment ─────────────────────────────────────────────────────────────

export function nodeCheck(): Check {
  const version = process.versions.node;
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  return major >= 22
    ? { label: "Node", status: "ok", detail: `v${version}`, required: true }
    : { label: "Node", status: "warn", detail: `v${version} (need ≥22)`, fix: "upgrade Node to 22+", required: true };
}

export function gitCheck(ctx: ProbeContext): Check {
  const out = ctx.commandProbe("git", ["--version"]);
  return out
    ? { label: "git", status: "ok", detail: out.replace(/^git version /, ""), required: true }
    : { label: "git", status: "warn", detail: "not found", fix: "install git (worktrees/proportion need it)", required: true };
}

// ── Hosts ───────────────────────────────────────────────────────────────────

function claudeSettingsPath(ctx: ProbeContext): string | null {
  const candidates = [join(ctx.cwd, ".claude", "settings.json"), join(ctx.home, ".claude", "settings.json")];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function claudeCodeCheck(ctx: ProbeContext): Check {
  const path = claudeSettingsPath(ctx);
  if (!path) return { label: "Claude Code", status: "missing", detail: "no settings.json found", fix: "gate init", required: true };
  return { label: "Claude Code", status: "ok", detail: path, required: true };
}

export function hooksCheck(ctx: ProbeContext): Check {
  const path = claudeSettingsPath(ctx);
  const settings = path ? readJson(path) : null;
  const hooks = (settings?.["hooks"] ?? {}) as Record<string, unknown>;
  const wired = HOOK_EVENTS.filter((event) => {
    const groups = hooks[event];
    if (!Array.isArray(groups)) return false;
    return groups.some((g) => Array.isArray((g as { hooks?: unknown }).hooks)
      && (g as { hooks: { command?: unknown }[] }).hooks.some((h) => isGateHookCommand(h.command)));
  });
  if (wired.length === HOOK_EVENTS.length) return { label: "hooks wired", status: "ok", detail: "Pre/Post/Stop/SubagentStop" };
  if (wired.length > 0) return { label: "hooks wired", status: "warn", detail: `only ${wired.join(", ")}`, fix: "gate init" };
  return { label: "hooks wired", status: "missing", detail: "no gate hook", fix: "gate init" };
}

export function mcpCheck(ctx: ProbeContext): Check {
  const sources = [join(ctx.cwd, ".mcp.json"), join(ctx.home, ".claude.json")];
  for (const src of sources) {
    const json = readJson(src);
    const servers = (json?.["mcpServers"] ?? {}) as Record<string, { command?: unknown; args?: unknown }>;
    for (const [name, server] of Object.entries(servers)) {
      const cmd = typeof server.command === "string" ? server.command : "";
      const args = Array.isArray(server.args) ? server.args.join(" ") : "";
      if (name === "gatewright" || (cmd.includes("gate") && args.includes("serve"))) {
        return { label: "MCP server", status: "ok", detail: `registered in ${src}` };
      }
    }
  }
  return { label: "MCP server", status: "missing", detail: "not registered", fix: "gate init" };
}

export function codexCheck(ctx: ProbeContext): Check {
  const out = ctx.commandProbe("codex", ["--version"]);
  return out
    ? { label: "Codex CLI", status: "ok", detail: out }
    : { label: "Codex CLI", status: "warn", detail: "not found (optional)" };
}

// ── Local AI ────────────────────────────────────────────────────────────────

export async function ollamaCheck(ctx: ProbeContext): Promise<Check> {
  const body = (await probeHttpJson(ctx.fetchImpl, `${ctx.ollamaEndpoint}/api/tags`)) as { models?: { name?: string }[] } | null;
  if (!body || !Array.isArray(body.models)) {
    return { label: "Ollama", status: "missing", detail: `not reachable @ ${ctx.ollamaEndpoint}`, fix: "start Ollama, then gate init" };
  }
  const names = body.models.map((m) => m.name).filter((n): n is string => typeof n === "string");
  return { label: "Ollama", status: "ok", detail: `${names.length} models: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}` };
}

export async function lmStudioCheck(ctx: ProbeContext): Promise<Check> {
  const body = (await probeHttpJson(ctx.fetchImpl, `${ctx.lmStudioEndpoint}/v1/models`)) as { data?: unknown[] } | null;
  return body && Array.isArray(body.data)
    ? { label: "LM Studio", status: "ok", detail: `${body.data.length} models` }
    : { label: "LM Studio", status: "warn", detail: "not running (optional)" };
}

// ── Jev / Skills ──────────────────────────────────────────────────────────────

export function jevCheck(ctx: ProbeContext): Check {
  const cfg = readJson(ctx.jevConfigPath);
  if (!cfg) return { label: "Jev", status: "missing", detail: "not configured", fix: "gate init (local-AI advisory)" };
  return cfg["enabled"] === true
    ? { label: "Jev", status: "ok", detail: `enabled · ${String(cfg["model"] ?? "?")} @ ${String(cfg["endpoint"] ?? "?")}` }
    : { label: "Jev", status: "warn", detail: "configured but disabled", fix: "gate init to enable" };
}

export function skillsCheck(ctx: ProbeContext): Check {
  if (!existsSync(ctx.skillsDir)) return { label: "Skills", status: "missing", detail: `no ${ctx.skillsDir}`, fix: "gate skill new <name>" };
  let count = 0;
  try {
    for (const entry of readdirSync(ctx.skillsDir)) {
      if (statSync(join(ctx.skillsDir, entry)).isDirectory() && existsSync(join(ctx.skillsDir, entry, "SKILL.md"))) count += 1;
    }
  } catch {
    // unreadable dir → treat as empty
  }
  return { label: "Skills", status: "ok", detail: `${ctx.skillsDir} (${count})` };
}
