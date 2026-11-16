// Project-scoped MCP config for headless runs. We point the engine at THIS file via
// --strict-mcp-config so the run sees Gatewright and reviewed project integrations. Enforcement is provided by the host hooks. The invocation is absolute (reused from gate-bin), so it works
// without `gate` on PATH.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { managedMcpServers, mcpEntry } from "../integrations/managed-mcp.js";
import { gateServeInvocation } from "../init/gate-bin.js";

export const GATE_MCP_CONFIG_RELPATH = join(".gatewright", "gate.mcp.json");

/** The canonical gate-only MCP config content. */
export function gateMcpConfig(cwd?: string) {
  const entries = cwd ? Object.entries(managedMcpServers(cwd)).map(([name, server]) => [name, mcpEntry(server)]) : [];
  return { mcpServers: { ...Object.fromEntries(entries), gatewright: gateServeInvocation(cwd) } };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Ensure `<cwd>/.gatewright/gate.mcp.json` holds Gatewright and managed project servers and
 * return its absolute path. Idempotent: rewrites only when content differs.
 */
export function ensureGateMcpConfig(cwd: string): string {
  const path = join(cwd, GATE_MCP_CONFIG_RELPATH);
  const next = serialize(gateMcpConfig(cwd));
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current !== next) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
  }
  return path;
}
