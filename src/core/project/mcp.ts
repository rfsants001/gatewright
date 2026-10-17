// MCP discovery — read the MCP servers registered in the known config files
// (.mcp.json in the project, ~/.claude.json for the user). Pure and defensive.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  /** Config file this server was found in. */
  source: string;
}

function readServers(path: string): McpServerEntry[] {
  try {
    if (!existsSync(path)) return [];
    const json = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, { command?: unknown; args?: unknown }> };
    return Object.entries(json.mcpServers ?? {}).map(([name, s]) => ({
      name,
      command: typeof s.command === "string" ? s.command : "",
      args: Array.isArray(s.args) ? s.args.map(String) : [],
      source: path,
    }));
  } catch {
    return [];
  }
}

export interface ListMcpOptions {
  cwd?: string;
  home?: string;
}

/** All registered MCP servers, de-duped by name (project wins over user), name-sorted. */
export function listMcpServers(opts: ListMcpOptions = {}): McpServerEntry[] {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const seen = new Set<string>();
  const out: McpServerEntry[] = [];
  for (const src of [join(cwd, ".mcp.json"), join(home, ".claude.json")]) {
    for (const entry of readServers(src)) {
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      out.push(entry);
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
