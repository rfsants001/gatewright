import { z } from "zod";
import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { providerSchema, saveProvider } from "./providers.js";
import { ConfigStore } from "../core/config/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { serializeSkill } from "../core/skills/skill-doc.js";

const store = new FileArtifactStore();
const configs = new ConfigStore(store);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
export const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("provider"), provider: providerSchema }).strict(),
  z.object({ kind: z.literal("link-project"), path: z.string().min(1).max(1024) }).strict(),
  z.object({ kind: z.literal("skill"), name: id, description: z.string().min(1).max(200), instructions: z.string().min(1).max(16_000) }).strict(),
  z.object({ kind: z.literal("opencode-plugin"), package: z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/) }).strict(),
  z.object({ kind: z.literal("mcp-plugin"), name: id, url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }) }).strict(),
]);
export type Change = z.infer<typeof changeSchema>;

export const customizationPrompt = `Return a single JSON object and no Markdown. You only propose one Gatewright change:
{"kind":"provider","provider":{"id":"name","endpoint":"https://example.com/v1","model":"id","keyEnv":"OPTIONAL_ENV_NAME"}}
{"kind":"link-project","path":"/absolute/path"}
{"kind":"skill","name":"slug","description":"when to use it","instructions":"Markdown instructions"}
{"kind":"mcp-plugin","name":"slug","url":"https://example.com/mcp"}
{"kind":"opencode-plugin","package":"package-name@1.2.3"}
Use exactly the supplied URL or path. Use only environment variable names for credentials. Do not claim changes have been applied. If the request lacks required information, ask for it in plain text.`;

export function parseChange(output: string): Change {
  return changeSchema.parse(JSON.parse(output.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")));
}

function affectedFile(cwd: string, change: Change): string {
  if (change.kind === "skill") return join(cwd, ".gatewright", "skills", change.name, "SKILL.md");
  if (change.kind === "mcp-plugin") return join(cwd, ".mcp.json");
  if (change.kind === "opencode-plugin") return join(cwd, "opencode.json");
  return join(cwd, ".gatewright", "config.json");
}

export function changeRevision(cwd: string, change: Change): string {
  const path = affectedFile(cwd, change);
  return createHash("sha256").update(JSON.stringify([cwd, change, existsSync(path) ? readFileSync(path, "utf8") : null])).digest("hex");
}

export function applyChange(cwd: string, change: Change, revision: string): void {
  if (changeRevision(cwd, change) !== revision) throw new Error("O destino mudou. Gere e revise uma nova proposta.");
  switch (change.kind) {
    case "provider": saveProvider(cwd, change.provider); return;
    case "link-project": {
      if (!change.path.startsWith("/")) throw new Error("Informe o caminho absoluto de uma pasta.");
      const path = realpathSync(change.path);
      if (!statSync(path).isDirectory()) throw new Error("O projeto vinculado precisa ser uma pasta.");
      const current = configs.read("project", cwd).linkedProjects ?? [];
      configs.write("project", { linkedProjects: [...new Set([...current, path])] }, cwd);
      return;
    }
    case "skill": {
      const target = affectedFile(cwd, change);
      if (existsSync(target)) throw new Error("Já existe uma skill com esse nome.");
      store.write(target, serializeSkill({
        frontmatter: { name: change.name, description: change.description, triggers: [], skillKind: "general", metadata: {} },
        body: change.instructions,
      }));
      return;
    }
    case "opencode-plugin": {
      if (existsSync(join(cwd, "opencode.jsonc"))) throw new Error("O projeto usa opencode.jsonc. Revise e registre o pacote no OpenCode.");
      const path = affectedFile(cwd, change);
      const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("opencode.json precisa conter um objeto.");
      const plugins: unknown = config.plugins ?? [];
      if (!Array.isArray(plugins)) throw new Error("A lista de plugins do OpenCode tem formato inválido.");
      if (!plugins.includes(change.package)) {
        store.write(path, JSON.stringify({ ...config, plugins: [...plugins, change.package] }, null, 2) + "\n");
      }
      return;
    }
    case "mcp-plugin": {
      if (change.name === "gatewright") throw new Error("O nome gatewright é reservado.");
      const path = affectedFile(cwd, change);
      const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("O arquivo .mcp.json precisa conter um objeto.");
      const servers = config.mcpServers ?? {};
      if (typeof servers !== "object" || Array.isArray(servers)) throw new Error("mcpServers precisa conter um objeto.");
      if (Object.hasOwn(servers, change.name)) throw new Error("Já existe um servidor MCP com esse nome.");
      store.write(path, JSON.stringify({ ...config, mcpServers: { ...servers, [change.name]: { type: "http", url: change.url } } }, null, 2) + "\n");
    }
  }
}
