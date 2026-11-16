import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { ModuleRegistry } from "./modules.js";

export const integrationName = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/)
  .refine((name) => name !== "gatewright" && name !== "constructor", "Nome de integração reservado.");
export const httpsEndpoint = z.url().max(1024).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
});
export const mcpEndpoint = z.union([
  httpsEndpoint,
  z.url().max(1024).regex(/^http:\/\/127\.0\.0\.1:\d{1,5}(?:\/[A-Za-z0-9._~/-]*)?$/),
]);
const serverSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("http"), url: mcpEndpoint }).strict(),
  z.object({ type: z.literal("stdio"), command: z.string().refine(isAbsolute), args: z.array(z.string()) }).strict(),
]);
export type ManagedMcpServer = z.infer<typeof serverSchema>;

const configs = new ConfigStore(new FileArtifactStore());

export function managedMcpServers(cwd: string, readyOnly = true): Record<string, ManagedMcpServer> {
  return Object.fromEntries((configs.read("project", cwd).modules ?? []).flatMap((module) => {
    if (module.kind !== "mcp" || !module.enabled || !module.id.startsWith("mcp-")) return [];
    const name = integrationName.safeParse(module.id.slice(4));
    const server = serverSchema.safeParse(module.config);
    if (!name.success || !server.success || (readyOnly && !managedMcpReady(cwd, name.data, server.data))) return [];
    return [[name.data, server.data] as const];
  }));
}

export function managedMcpReady(cwd: string, name: string, server: ManagedMcpServer): boolean {
  if (name !== "graphify" || server.type !== "stdio") return true;
  try {
    const graph = join(realpathSync(cwd), "graphify-out", "graph.json");
    return server.args.at(-1) === graph && realpathSync(graph) === graph && statSync(graph).isFile();
  } catch {
    return false;
  }
}

export function mcpEntry(server: ManagedMcpServer) {
  return server.type === "http" ? server : { command: server.command, args: server.args };
}

export function newManagedMcpModule(cwd: string, name: string, server: ManagedMcpServer) {
  const id = "mcp-" + integrationName.parse(name);
  const registry = new ModuleRegistry(configs);
  if (registry.get(id, cwd)) throw new Error("Já existe uma integração MCP com esse nome.");
  return { id, kind: "mcp" as const, provider: "external" as const, enabled: true, config: serverSchema.parse(server) };
}

export function registerManagedMcp(cwd: string, name: string, server: ManagedMcpServer): void {
  configs.write("project", { modules: [newManagedMcpModule(cwd, name, server)] }, cwd);
}
