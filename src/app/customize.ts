import { z } from "zod";
import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { providerSchema, saveProvider } from "./providers.js";
import { ConfigStore } from "../core/config/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { parseSkill, serializeSkill } from "../core/skills/skill-doc.js";
import { bundledGateSkillsRoot } from "../core/skills/gate-catalog.js";
import { httpsEndpoint, integrationName, mcpEndpoint, registerManagedMcp } from "../core/integrations/managed-mcp.js";
import {
  containerMcpUrl, containerRecipe, installContainer, installGitProject, installGraphify, installNpmMcp, npmMcpRecipe,
} from "./integration-install.js";
import type { Executor } from "../core/provision/types.js";

const store = new FileArtifactStore();
const configs = new ConfigStore(store);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
export const skillChangeSchema = z.object({
  kind: z.literal("skill"), name: id,
  description: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),
  instructions: z.string().trim().min(1).max(16_000),
}).strict();

export const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("provider"), provider: providerSchema }).strict(),
  z.object({ kind: z.literal("link-project"), path: z.string().min(1).max(1024) }).strict(),
  skillChangeSchema,
  z.object({ kind: z.literal("mcp-http"), name: integrationName, url: mcpEndpoint }).strict(),
  npmMcpRecipe,
  containerRecipe,
  z.object({ kind: z.literal("git-project"), name: integrationName, url: httpsEndpoint, commit: z.string().regex(/^[a-f0-9]{40}$/), mcpUrl: httpsEndpoint.optional() }).strict(),
  z.object({ kind: z.literal("graphify"), version: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict(),
  z.object({ kind: z.literal("jev"), endpoint: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  }), model: z.string().trim().min(1).max(150) }).strict(),
  z.object({ kind: z.literal("opencode-plugin"), package: z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/) }).strict(),
  z.object({ kind: z.literal("mcp-plugin"), name: id, url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }) }).strict(),
  z.object({ kind: z.literal("advisor"), name: id, endpoint: z.url().refine((value) => {
    const url = new URL(value);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    return !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === "https:" || (loopback && url.protocol === "http:"));
  }), model: z.string().trim().min(1).max(150).optional() }).strict(),
]);
export type Change = z.infer<typeof changeSchema>;

export function customizationPrompt(): string {
  const skill = parseSkill(readFileSync(join(bundledGateSkillsRoot(), "_system", "configure-integration", "SKILL.md"), "utf8"));
  return `${skill.body}

Return a single JSON object and no Markdown. You only propose one Gatewright change:
{"kind":"provider","provider":{"id":"name","endpoint":"https://example.com/v1","model":"id","keyEnv":"OPTIONAL_ENV_NAME"}}
{"kind":"link-project","path":"/absolute/path"}
{"kind":"skill","name":"slug","description":"when to use it","instructions":"Markdown instructions"}
{"kind":"mcp-http","name":"slug","url":"https://example.com/mcp"}
{"kind":"npm-mcp","name":"slug","package":"package-name@1.2.3","bin":"declared-node-bin","args":["optional-argument"]}
{"kind":"container","name":"slug","image":"registry/name@sha256:64-lowercase-hex","port":3000,"hostPort":8300,"mcpPath":"/mcp"}
{"kind":"git-project","name":"slug","url":"https://example.com/owner/repo.git","commit":"40 lowercase hex characters","mcpUrl":"optional: existing HTTPS MCP endpoint"}
{"kind":"graphify","version":"1.2.3"}
{"kind":"jev","endpoint":"http://127.0.0.1:11434","model":"model-id"}
{"kind":"mcp-plugin","name":"slug","url":"https://example.com/mcp"} (Claude-specific legacy format)
{"kind":"opencode-plugin","package":"package-name@1.2.3"}
{"kind":"advisor","name":"slug","endpoint":"https://example.com/advise","model":"optional"}
Use exactly the supplied URL or path. Use only environment variable names for credentials. Do not claim changes have been applied. If the request lacks required information, ask for it in plain text.`;
}

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

export function checkProposalSources(change: Change, input: string): void {
  const required = change.kind === "npm-mcp" ? [change.package, change.bin, ...(change.args ?? [])]
    : change.kind === "container" ? [change.image, String(change.port), String(change.hostPort), change.mcpPath]
    : change.kind === "git-project" ? [change.url, change.commit, ...(change.mcpUrl ? [change.mcpUrl] : [])]
    : change.kind === "graphify" ? [change.version]
    : change.kind === "jev" ? [change.endpoint, change.model]
    : change.kind === "advisor" ? [change.endpoint, ...(change.model ? [change.model] : [])]
    : change.kind === "provider" ? [change.provider.endpoint, ...(change.provider.keyEnv ? [change.provider.keyEnv] : [])]
    : change.kind === "link-project" ? [change.path]
    : change.kind === "opencode-plugin" ? [change.package]
    : change.kind === "skill" ? [] : [change.url];
  if (!required.every((source) => input.includes(source))) {
    throw new Error("Inclua a origem, versão e configuração exatas no pedido para gerar a proposta.");
  }
}

export function describeChange(cwd: string, change: Change) {
  const target = affectedFile(cwd, change);
  switch (change.kind) {
    case "git-project": return { target, steps: [`Baixar o commit ${change.commit} de ${change.url}.`, `Vincular .gatewright/integrations/${change.name} ao projeto.`, ...(change.mcpUrl ? [`Registrar o MCP em ${change.mcpUrl}.`] : [])] };
    case "graphify": return { target, steps: [`Instalar graphifyy[mcp] ${change.version} em ambiente local com uv.`, "Registrar o servidor. Ele entra na configuração quando graphify-out/graph.json estiver disponível."] };
    case "jev": return { target, steps: [`Habilitar Jev neste projeto usando ${change.model} em ${change.endpoint}.`] };
    case "advisor": return { target, steps: [
      `Registrar o advisor externo "${change.name}" em ${change.endpoint}.`,
      ...(change.model ? [`Usar o modelo "${change.model}" nas chamadas ao advisor.`] : []),
      "Habilitar como módulo advisor com provider externo no projeto.",
    ] };
    case "mcp-http": return { target, steps: [`Registrar ${change.name} em ${change.url}. Reaplique a configuração aos hosts de terminal que deseja usar.`] };
    case "npm-mcp": return { target, steps: [
      `Instalar ${change.package} em .gatewright/integrations/${change.name}, com scripts de instalação desativados.`,
      `Registrar ${change.bin} como servidor MCP stdio. O host executará o pacote quando abrir a conexão.`,
    ] };
    case "container": return { target, steps: [
      `Criar e iniciar um contêiner da imagem ${change.image}.`,
      `Publicar a porta ${change.port} em 127.0.0.1:${change.hostPort} e registrar ${containerMcpUrl(change)} como MCP.`,
    ] };
    default: return { target, steps: [] };
  }
}

export async function applyChange(cwd: string, change: Change, revision: string, executor?: Executor, reporter?: import("../core/integrations/install-report.js").InstallReporter): Promise<void> {
  const checkRevision = () => {
    if (changeRevision(cwd, change) !== revision) throw new Error("O destino mudou. Gere e revise uma nova proposta.");
  };
  checkRevision();
  switch (change.kind) {
    case "git-project": return installGitProject(cwd, change, checkRevision, executor, reporter);
    case "graphify": return installGraphify(cwd, change.version, checkRevision, executor, reporter);
    case "npm-mcp": return installNpmMcp(cwd, change, checkRevision, executor, reporter);
    case "container": return installContainer(cwd, change, checkRevision, executor, reporter);
    case "mcp-http": registerManagedMcp(cwd, change.name, { type: "http", url: change.url }); return;
    case "jev":
      configs.write("project", {
        jev: { enabled: true, endpoint: change.endpoint, model: change.model },
        modules: [{ id: "jev", kind: "jev", provider: "internal", enabled: true }],
      }, cwd);
      return;
    case "advisor":
      configs.write("project", {
        modules: [{ id: change.name, kind: "advisor", provider: "external", enabled: true, config: { endpoint: change.endpoint, ...(change.model ? { model: change.model } : {}) } }],
      }, cwd);
      return;
    case "provider": saveProvider(cwd, change.provider); return;
    case "link-project": {
      if (!isAbsolute(change.path)) throw new Error("Informe o caminho absoluto de uma pasta.");
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
