import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { gateServeInvocation } from "../core/init/gate-bin.js";
import { managedMcpReady, managedMcpServers, type ManagedMcpServer } from "../core/integrations/managed-mcp.js";

export async function testManagedMcp(cwd: string, name: string) {
  const servers = managedMcpServers(cwd, false);
  const server = Object.hasOwn(servers, name) ? servers[name] : undefined;
  if (!server) throw new Error("O MCP não está registrado neste projeto.");
  if (!managedMcpReady(cwd, name, server)) throw new Error("Gere o grafo do projeto antes de testar a conexão.");
  return testMcp(cwd, server);
}

export function testGatewrightMcp(cwd: string) {
  return testMcp(cwd, { type: "stdio", ...gateServeInvocation(cwd) });
}

async function testMcp(cwd: string, server: ManagedMcpServer) {
  const client = new Client({ name: "gatewright-diagnostics", version: "1.0.0" });
  const timeout = AbortSignal.timeout(8_000);
  const transport = server.type === "http"
    ? new StreamableHTTPClientTransport(new URL(server.url), {
      fetch: (input, options) => fetch(input, {
        ...options,
        redirect: "error",
        signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      }),
    })
    : new StdioClientTransport({ command: server.command, args: server.args, cwd, stderr: "ignore" });
  try {
    // The SDK's HTTP class has sessionId: string | undefined while Transport marks it optional.
    await client.connect(transport as Transport, { signal: timeout });
    const version = client.getServerVersion();
    if (!version) throw new Error("O servidor não identificou a sessão MCP.");
    return { name: version.name, version: version.version };
  } catch {
    throw new Error("O servidor não concluiu a inicialização MCP. Confira se está ativo, se a origem é acessível e se exige autenticação no host.");
  } finally {
    await client.close().catch(() => undefined);
  }
}
