// MCP server — exposes the gate catalog and gate checks as read-only MCP tools,
// and (R1) the gate's skills as MCP prompts + gate://usage + gate://config resources.
// R2 adds integrate_tool (two-phase propose/confirm) and set_module_enabled.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "node:path";
import { z } from "zod";
import type { GateContext, GateDecision } from "../core/gate/types.js";
import type { GateRegistry } from "../core/gate/registry.js";
import { defaultRegistry } from "../host/run-hook.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore } from "../core/config/config-store.js";
import { JevConfigStore } from "../core/jev/config-store.js";
import { ModuleRegistry } from "../core/integrations/modules.js";
import { integrationSpec } from "../core/integrations/spec.js";
import { proposeIntegration, applyIntegration } from "../core/integrations/configure.js";
import type { CompleteFn, ProposeSuccess } from "../core/integrations/configure.js";
import { providers } from "../app/providers.js";
import { complete as defaultComplete } from "../app/providers.js";
import { loadGateSkills } from "../core/skills/gate-catalog.js";
import { composeAgent, projectAgents } from "../core/skills/agents.js";
import { VERSION } from "../core/version.js";
import { registerSkillPrompts } from "./prompts.js";
import { registerUsageResource, registerConfigResource } from "./resources.js";

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

// In-memory proposal cache (per server instance); cleared when size ≥ 20.
type CachedProposal = Pick<ProposeSuccess, "change" | "revision">;

export function createMcpServer(
  registry: GateRegistry = defaultRegistry(),
  jevConfig: JevConfigStore = new JevConfigStore(new FileArtifactStore()),
  cwd: string = process.cwd(),
  complete: CompleteFn = defaultComplete,
): McpServer {
  const server = new McpServer({ name: "gatewright", version: VERSION });

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

  // R2: integrate_tool — two-phase propose/confirm (fail-safe: human must confirm before apply).
  const proposals = new Map<string, CachedProposal>();

  server.registerTool(
    "integrate_tool",
    {
      description: "Propose or confirm an AI-driven integration change. Phase 1: supply spec + providerId → returns revision + plan. Phase 2: supply confirm=<revision> → applies the cached proposal.",
      inputSchema: {
        providerId: z.string().optional(),
        spec: integrationSpec.optional(),
        model: z.string().optional(),
        reference: z.string().optional(),
        confirm: z.string().optional(),
      },
    },
    async ({ providerId, spec, model, reference, confirm }) => {
      // Phase 2: apply a previously proposed change.
      if (confirm !== undefined) {
        const cached = proposals.get(confirm);
        if (!cached) return { ...text({ error: "proposal expired or unknown revision" }), isError: true };
        try {
          await applyIntegration({ cwd, change: cached.change, revision: cached.revision });
          proposals.delete(confirm);
          return text({ applied: true, revision: confirm });
        } catch (error) {
          proposals.delete(confirm);
          return { ...text({ error: error instanceof Error ? error.message : String(error) }), isError: true };
        }
      }

      // Phase 1: build a proposal.
      if (!providerId || !spec) {
        return { ...text({ error: "supply either { providerId, spec } to propose or { confirm } to apply" }), isError: true };
      }
      const allProviders = providers(cwd);
      const provider = allProviders.find((p) => p.id === providerId);
      if (!provider) return { ...text({ error: `unknown provider '${providerId}'` }), isError: true };

      const proposeOpts: Parameters<typeof proposeIntegration>[0] = {
        cwd,
        spec,
        provider,
        complete,
        ...(model !== undefined ? { model } : {}),
        ...(reference !== undefined ? { reference } : {}),
      };
      const result = await proposeIntegration(proposeOpts);

      if ("message" in result) return text({ message: result.message });

      if (proposals.size >= 20) proposals.clear();
      proposals.set(result.revision, { change: result.change, revision: result.revision });
      return text({ revision: result.revision, change: result.change, plan: result.plan });
    },
  );

  // R2: set_module_enabled — toggle a pluggable module; jev upsert when absent.
  server.registerTool(
    "set_module_enabled",
    {
      description: "Enable or disable a pluggable module by id. Use id='jev' to disable the built-in Jev advisor without prior configuration.",
      inputSchema: { id: z.string().min(1), enabled: z.boolean() },
    },
    ({ id, enabled }) => {
      const moduleRegistry = new ModuleRegistry(new ConfigStore(new FileArtifactStore()), "project");
      const existing = moduleRegistry.get(id, cwd);
      if (existing) {
        moduleRegistry.setEnabled(id, enabled, cwd);
        return text({ ...existing, enabled });
      }
      if (id === "jev") {
        const module = { id: "jev", kind: "jev" as const, provider: "internal" as const, enabled };
        moduleRegistry.upsert(module, cwd);
        return text(module);
      }
      return { ...text({ error: `unknown module '${id}'` }), isError: true };
    },
  );

  // R1: Skills as MCP prompts (gate.<name>) — zero-argument, body = skill markdown.
  const catalog = loadGateSkills();
  registerSkillPrompts(server, catalog, loadGateSkills(join(cwd, ".gatewright", "skills")));

  for (const agent of projectAgents(cwd)) {
    server.registerPrompt(`gate.agent.${agent.id}`, { description: agent.name }, () => ({
      messages: [{ role: "user", content: { type: "text", text: composeAgent(cwd, agent) } }],
    }));
  }

  // R1: gate://usage and gate://config resources (read-only, secrets redacted).
  registerUsageResource(server, cwd);
  registerConfigResource(server, cwd);

  return server;
}

export async function serveStdio(registry?: GateRegistry, jevConfig?: JevConfigStore, cwd?: string, complete?: CompleteFn): Promise<McpServer> {
  const server = createMcpServer(registry, jevConfig, cwd, complete);
  await server.connect(new StdioServerTransport());
  return server;
}
