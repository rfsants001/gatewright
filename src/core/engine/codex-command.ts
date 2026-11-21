import { gateMcpConfig } from "./gate-mcp-config.js";
import type { EngineCommand, EngineRunOptions } from "./types.js";

function toml(value: unknown): string {
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toml).join(", ")}]`;
  if (value && typeof value === "object")
    return `{ ${Object.entries(value)
      .map(([key, entry]) => `${JSON.stringify(key)} = ${toml(entry)}`)
      .join(", ")} }`;
  throw new Error("Valor de configuração Codex inválido.");
}

/** Invocation-scoped policy; never changes the user's login, model provider or trust store. */
export function codexCommand(opts: EngineRunOptions): EngineCommand {
  const args = [
    "exec",
    "--json",
    "--cd",
    opts.cwd,
    "--sandbox",
    "workspace-write",
    "-c",
    'approval_policy="never"',
    "-c",
    "sandbox_workspace_write.network_access=false",
    "-c",
    "sandbox_workspace_write.writable_roots=[]",
  ];
  for (const [name, server] of Object.entries(gateMcpConfig(opts.cwd).mcpServers)) {
    if (!server || typeof server !== "object") throw new Error("Configuração MCP inválida.");
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Nome de MCP inválido para o Codex.");
    // Read-only Gatewright tools can run headlessly. Mutating tools retain native approval.
    const readTools = Object.fromEntries(
      ["list_gates", "check_gate", "get_jev_config", "memory_list", "memory_resolve"].map((tool) => [
        tool,
        { approval_mode: "approve" },
      ]),
    );
    args.push(
      "-c",
      `mcp_servers.${name}=${toml({ ...server, enabled: true, ...(name === "gatewright" ? { required: true, tools: readTools } : {}) })}`,
    );
  }
  if (opts.model) args.push("--model", opts.model);
  const prompt = [opts.systemPrompt, opts.prompt].filter(Boolean).join("\n\n");
  args.push("--", prompt);
  return { bin: "codex", args };
}
