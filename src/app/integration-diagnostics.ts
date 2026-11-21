import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { gateServeInvocation } from "../core/init/gate-bin.js";
import { managedMcpReady, managedMcpServers, type ManagedMcpServer } from "../core/integrations/managed-mcp.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiagnosticErrorCode = "timeout" | "transport" | "handshake";

export interface DiagnosticSuccess {
  name: string;
  version: string;
  latencyMs: number;
}

export interface DiagnosticFailure {
  errorCode: DiagnosticErrorCode;
  message: string;
}

export type DiagnosticResult = DiagnosticSuccess | DiagnosticFailure;

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function testManagedMcp(cwd: string, name: string): Promise<DiagnosticResult> {
  const servers = managedMcpServers(cwd, false);
  const server = Object.hasOwn(servers, name) ? servers[name] : undefined;
  if (!server) throw new Error("O MCP não está registrado neste projeto.");
  if (!managedMcpReady(cwd, name, server)) throw new Error("Gere o grafo do projeto antes de testar a conexão.");
  return testMcp(cwd, server);
}

export function testGatewrightMcp(cwd: string): Promise<DiagnosticResult> {
  return testMcp(cwd, { type: "stdio", ...gateServeInvocation(cwd) });
}

// ---------------------------------------------------------------------------
// Core handshake (latency measured around connect + getServerVersion)
// ---------------------------------------------------------------------------

async function testMcp(cwd: string, server: ManagedMcpServer): Promise<DiagnosticResult> {
  const client = new Client({ name: "gatewright-diagnostics", version: "1.0.0" });
  const timeout = AbortSignal.timeout(8_000);
  const transport: Transport = server.type === "http"
    ? new StreamableHTTPClientTransport(new URL(server.url), {
      fetch: (input, options) => fetch(input, {
        ...options,
        redirect: "error",
        signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      }),
    }) as unknown as Transport
    : new StdioClientTransport({ command: server.command, args: server.args, cwd, stderr: "ignore" });

  const t0 = performance.now();
  try {
    await client.connect(transport, { signal: timeout });
    const latencyMs = Math.round(performance.now() - t0);
    const version = client.getServerVersion();
    if (!version) {
      return { errorCode: "handshake", message: "O servidor não identificou a sessão MCP." };
    }
    return { name: version.name, version: version.version, latencyMs };
  } catch (err) {
    const isTimeout =
      (err instanceof Error && err.name === "TimeoutError") ||
      (err instanceof DOMException && err.name === "TimeoutError") ||
      timeout.aborted;
    const errorCode: DiagnosticErrorCode = isTimeout ? "timeout" : "transport";
    return {
      errorCode,
      message: "O servidor não concluiu a inicialização MCP. Confira se está ativo, se a origem é acessível e se exige autenticação no host.",
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}
