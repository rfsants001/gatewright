import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyPlan, planHooks, planMcp, type WritePlan } from "../core/init/config-writers.js";
import { gateHookCommand, gateScript, gateServeInvocation } from "../core/init/gate-bin.js";

export const terminalHosts = ["claude-code", "codex", "gemini", "opencode"] as const;
export type TerminalHost = typeof terminalHosts[number];

function readObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Expected a JSON object in ${path}`);
  return data as Record<string, unknown>;
}

function mergeEntry(value: unknown, entry: Record<string, unknown>): Record<string, unknown> {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) {
    throw new Error("Existing configuration has an unexpected format.");
  }
  return { ...value as Record<string, unknown>, ...entry };
}

function writePlan(path: string, nextContent: string, summary: string): WritePlan {
  const exists = existsSync(path);
  const action = !exists ? "create" : readFileSync(path, "utf8") === nextContent ? "noop" : "merge";
  return { path, nextContent, action, summary, preview: [summary] };
}

// OpenCode has no shell-command hook block (hooks are JS/TS plugins that block by throwing).
// So we ship a managed plugin that shells out to `gate hook opencode` and throws on a deny.
// Auto-loaded from `.opencode/plugin/`; fully owned by us → re-running is idempotent by content.
function opencodePluginSource(): string {
  const gate = JSON.stringify([process.execPath, gateScript(), "hook", "opencode"]);
  return `// BEGIN GATEWRIGHT — managed plugin. Do not edit; re-run the Gatewright config to update.
// Bridges OpenCode tool events to the Gatewright gates via \`gate hook opencode\`.
import { spawnSync } from "node:child_process";

const GATE = ${gate};

function decide(hook_event_name, tool_name, payload) {
  let decision;
  try {
    const res = spawnSync(GATE[0], GATE.slice(1), {
      input: JSON.stringify({ hook_event_name, tool_name, cwd: process.cwd(), ...payload }),
      encoding: "utf8",
    });
    const out = (res.stdout || "").trim();
    decision = out ? JSON.parse(out) : null;
  } catch {
    return; // spawn/parse failure → fail-open (allow), never break the host
  }
  if (decision && decision.decision === "deny") {
    throw new Error(decision.reason || "Gatewright bloqueou esta ação.");
  }
}

export const gatewright = async () => ({
  "tool.execute.before": async (input, output) => {
    decide("execute.before", input?.tool, { tool_input: output?.args ?? null });
  },
  "tool.execute.after": async (input, output) => {
    decide("execute.after", input?.tool, { tool_response: output?.output ?? output?.metadata ?? null });
  },
});
// END GATEWRIGHT
`;
}

export function planTerminal(cwd: string, host: TerminalHost): WritePlan[] {
  const invocation = gateServeInvocation(cwd);
  if (host === "claude-code") {
    return [planHooks(join(cwd, ".claude", "settings.json")), planMcp(join(cwd, ".mcp.json"), false, cwd)];
  }
  if (host === "codex") {
    const path = join(cwd, ".codex", "config.toml");
    const source = existsSync(path) ? readFileSync(path, "utf8") : "";
    const start = "# BEGIN GATEWRIGHT MCP";
    const end = "# END GATEWRIGHT MCP";
    const hook = JSON.stringify(gateHookCommand());
    const hookTables = ["PreToolUse", "PostToolUse", "Stop", "SubagentStop"].map((event) =>
      `[[hooks.${event}]]\n[[hooks.${event}.hooks]]\ntype = "command"\ncommand = ${hook}\n`).join("\n");
    const managed = `${start}\n[mcp_servers.gatewright]\ncommand = ${JSON.stringify(invocation.command)}\nargs = ${JSON.stringify(invocation.args)}\n\n${hookTables}${end}\n`;
    const block = /# BEGIN GATEWRIGHT MCP\n[\s\S]*?\n# END GATEWRIGHT MCP\n?/;
    const unmanaged = source.replace(block, "");
    if (/^\s*\[+\s*mcp_servers\s*\.\s*["']?gatewright\b/m.test(unmanaged) ||
        /\bgatewright\b\s*=/.test(unmanaged) || /^\s*mcp_servers\s*=/m.test(unmanaged)) {
      throw new Error("Codex já tem uma definição MCP que precisa ser revisada manualmente.");
    }
    const next = block.test(source) ? source.replace(block, managed) : `${source.trimEnd()}${source.trim() ? "\n\n" : ""}${managed}`;
    return [writePlan(path, next, "Registrar MCP e hooks no Codex. Revise a confiança do projeto e dos hooks no Codex.")];
  }
  if (host === "opencode") {
    const path = join(cwd, "opencode.json");
    if (existsSync(join(cwd, "opencode.jsonc"))) throw new Error("O projeto usa opencode.jsonc. Revise a configuração MCP existente no OpenCode.");
    const config = readObject(path);
    const mcp = mergeEntry(config.mcp, { gatewright: { type: "local", command: [invocation.command, ...invocation.args], enabled: true } });
    return [
      writePlan(path, JSON.stringify({ ...config, mcp }, null, 2) + "\n", "Registrar o MCP no OpenCode."),
      writePlan(join(cwd, ".opencode", "plugin", "gatewright.js"), opencodePluginSource(),
        "Instalar o plugin de hooks do OpenCode (governa eventos de ferramenta via gate)."),
    ];
  }
  const path = join(cwd, ".gemini", "settings.json");
  const config = readObject(path);
  const mcpServers = mergeEntry(config.mcpServers, { gatewright: invocation });
  const hooks = mergeEntry(config.hooks, {});
  const command = gateHookCommand("gemini");
  for (const event of ["BeforeTool", "AfterTool", "AfterAgent"]) {
    const groups = hooks[event] ?? [];
    if (!Array.isArray(groups)) throw new Error(`Invalid Gemini hook groups for ${event}`);
    const retained = groups.flatMap((group: { hooks?: Array<{ name?: string }> }) => {
      if (!Array.isArray(group?.hooks)) return [group];
      const entries = group.hooks.filter((hook) => hook?.name !== "gatewright");
      return entries.length ? [{ ...group, hooks: entries }] : [];
    });
    hooks[event] = [...retained, { hooks: [{ type: "command", name: "gatewright", command }] }];
  }
  return [writePlan(path, JSON.stringify({ ...config, mcpServers, hooks }, null, 2) + "\n", "Registrar MCP e hooks no Gemini CLI.")];
}

export function planRevision(plans: WritePlan[]): string {
  return createHash("sha256").update(JSON.stringify(plans.map((plan) => ({
    ...plan, before: existsSync(plan.path) ? readFileSync(plan.path, "utf8") : null,
  })))).digest("hex");
}

export function applyTerminal(cwd: string, host: TerminalHost, revision: string): void {
  const plans = planTerminal(cwd, host);
  if (planRevision(plans) !== revision) throw new Error("A configuração mudou. Revise a nova proposta antes de aplicar.");
  for (const plan of plans) applyPlan(plan);
}
