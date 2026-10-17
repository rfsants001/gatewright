// Gate-only MCP config for headless runs. We point the engine at THIS file via
// --strict-mcp-config so the run sees exactly one MCP server — the gate — and
// none of the engine's own MCPs. That's what forces every tool call through the
// gates + Jev. The invocation is absolute (reused from gate-bin), so it works
// without `gate` on PATH.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gateServeInvocation } from "../init/gate-bin.js";

export const GATE_MCP_CONFIG_RELPATH = join(".gatewright", "gate.mcp.json");

/** The canonical gate-only MCP config content. */
export function gateMcpConfig(): { mcpServers: { gatewright: { command: string; args: string[] } } } {
  return { mcpServers: { gatewright: gateServeInvocation() } };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Ensure `<cwd>/.gatewright/gate.mcp.json` holds exactly the gate server and
 * return its absolute path. Idempotent: rewrites only when content differs.
 */
export function ensureGateMcpConfig(cwd: string): string {
  const path = join(cwd, GATE_MCP_CONFIG_RELPATH);
  const next = serialize(gateMcpConfig());
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current !== next) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
  }
  return path;
}
