// MCP server — exposes the gate catalog and gate checks as read-only MCP tools.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { GateContext, GateDecision } from "../core/gate/types.js";
import type { GateRegistry } from "../core/gate/registry.js";
import { defaultRegistry } from "../host/run-hook.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { JevConfigStore } from "../core/jev/config-store.js";

const contextShape = {
  event: z.string(),
  cwd: z.string(),
  toolName: z.string().optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  toolResponse: z.unknown().optional(),
  sessionKey: z.string().optional(),
  lastMessage: z.string().optional(),
};

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

export function createMcpServer(
  registry: GateRegistry = defaultRegistry(),
  jevConfig: JevConfigStore = new JevConfigStore(new FileArtifactStore()),
): McpServer {
  const server = new McpServer({ name: "gatewright", version: "0.0.0" });

  server.registerTool(
    "list_gates",
    { description: "List the registered gates (name, description, lifecycle events).", inputSchema: {} },
    () => text(registry.list().map((g) => ({ name: g.name, description: g.description, events: g.events }))),
  );

  server.registerTool(
    "check_gate",
    { description: "Run one named gate against a context and return its decision.", inputSchema: { name: z.string(), context: z.object(contextShape) } },
    ({ name, context }) => {
      const gate = registry.list().find((g) => g.name === name);
      if (!gate) return { ...text({ error: `unknown gate '${name}'` }), isError: true };
      const ctx = context as GateContext;
      const decision: GateDecision = gate.appliesTo(ctx) ? gate.check(ctx) : { kind: "allow" };
      return text(decision);
    },
  );

  server.registerTool(
    "configure_jev",
    {
      description: "Configure the local Jev decision engine (endpoint, model, budget, enabled). The server owns config; nothing is installed.",
      inputSchema: {
        enabled: z.boolean().optional(),
        endpoint: z.string().optional(),
        model: z.string().optional(),
        budget: z.record(z.string(), z.number()).optional(),
      },
    },
    (patch) => text(jevConfig.write(patch)),
  );

  server.registerTool(
    "get_jev_config",
    { description: "Read the current Jev configuration (merged over defaults).", inputSchema: {} },
    () => text(jevConfig.read()),
  );

  return server;
}

export async function serveStdio(registry?: GateRegistry, jevConfig?: JevConfigStore): Promise<McpServer> {
  const server = createMcpServer(registry, jevConfig);
  await server.connect(new StdioServerTransport());
  return server;
}
