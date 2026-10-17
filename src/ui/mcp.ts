// `gate mcp` — list the MCP servers registered in this project / for the user, and
// optionally register the Gatewright server here (safe merge + history).

import * as p from "@clack/prompts";
import pc from "picocolors";
import { homedir } from "node:os";
import { join } from "node:path";
import { listMcpServers } from "../core/project/mcp.js";
import { planMcp } from "../core/init/config-writers.js";
import { ConfigHistory, applyWithHistory } from "../core/history/config-history.js";

const tilde = (path: string): string => path.replace(homedir(), "~");

export async function runMcp(): Promise<number> {
  const cwd = process.cwd();
  p.intro(pc.bold(pc.cyan(" gatewright · mcp ")));

  const servers = listMcpServers({ cwd });
  if (servers.length === 0) {
    p.note(pc.dim("none found in .mcp.json or ~/.claude.json"), "MCP servers");
  } else {
    p.note(servers.map((s) => `${pc.bold(s.name)} ${pc.dim(`${s.command} ${s.args.join(" ")}`)}\n  ${pc.dim(tilde(s.source))}`).join("\n\n"), "MCP servers");
  }

  const hasGatewright = servers.some((s) => s.name === "gatewright");
  if (hasGatewright) {
    p.outro(`${servers.length} server(s) · gatewright registered`);
    return 0;
  }

  const add = await p.confirm({ message: "Register the gatewright MCP server in this project?", initialValue: true });
  if (p.isCancel(add) || !add) {
    p.outro(`${servers.length} server(s)`);
    return 0;
  }

  const plan = planMcp(join(cwd, ".mcp.json"));
  const revision = applyWithHistory([plan], { history: new ConfigHistory(), project: cwd, kind: "fix", backup: true });
  p.outro(revision ? `${pc.green("✓")} registered · revision ${pc.bold(revision.id)}` : pc.dim("nothing changed"));
  return 0;
}
