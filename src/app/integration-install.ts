import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore } from "../core/config/config-store.js";
import { integrationName, newManagedMcpModule } from "../core/integrations/managed-mcp.js";
import { defaultExecutor } from "../core/provision/provisioner.js";
import type { Executor } from "../core/provision/types.js";

const configs = new ConfigStore(new FileArtifactStore());

function managedDirectory(cwd: string, name: string): string {
  integrationName.parse(name);
  let base = realpathSync(cwd);
  for (const segment of [".gatewright", "integrations"]) {
    base = join(base, segment);
    mkdirSync(base, { recursive: true });
    if (!lstatSync(base).isDirectory()) throw new Error("A pasta de integrações precisa ser um diretório local do projeto.");
  }
  const target = join(base, name);
  mkdirSync(target);
  return target;
}

async function step(executor: Executor, label: string, command: string, args: string[], cwd?: string): Promise<string> {
  const result = await executor({ label, command, args, ...(cwd ? { cwd } : {}) });
  if (!result.ok) throw new Error(`${label} falhou. Confira a instalação de ${command} e a origem aprovada.`);
  return result.stdout ?? result.output.trim();
}

export const npmPackage = z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/).max(214);
const mcpArgs = z.array(z.string().max(500).regex(/^[^\u0000\r\n]*$/)).max(20);
export const npmMcpRecipe = z.object({
  kind: z.literal("npm-mcp"), name: integrationName, package: npmPackage,
  bin: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),
  args: mcpArgs.optional(),
}).strict();
export const containerRecipe = z.object({
  kind: z.literal("container"), name: integrationName,
  image: z.string().regex(/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/).max(260),
  port: z.int().min(1).max(65535),
  hostPort: z.int().min(1024).max(65535),
  mcpPath: z.string().regex(/^\/[a-zA-Z0-9_/-]+$/).max(150),
}).strict();

type NpmRecipe = z.infer<typeof npmMcpRecipe>;
type ContainerRecipe = z.infer<typeof containerRecipe>;

function npmEntrypoint(): string {
  const fromPath = (process.env.PATH ?? "").split(delimiter).filter(isAbsolute).flatMap((dir) =>
    process.platform === "win32" ? [join(dir, "node_modules", "npm", "bin", "npm-cli.js")] : [join(dir, "npm")]);
  for (const candidate of [process.env.npm_execpath, ...fromPath]) {
    if (!candidate || !isAbsolute(candidate) || !existsSync(candidate)) continue;
    const real = realpathSync(candidate);
    if (real.endsWith(`${sep}npm-cli.js`) && statSync(real).isFile()) return real;
  }
  throw new Error("Instale o npm junto ao Node e inclua o diretório no PATH do Gatewright.");
}

export async function installNpmMcp(cwd: string, request: NpmRecipe, checkRevision: () => void, executor = defaultExecutor): Promise<void> {
  const npm = npmEntrypoint();
  const target = managedDirectory(cwd, request.name);
  try {
    await step(executor, "Instalar pacote MCP", process.execPath, [
      npm, "install", "--prefix", target, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "--", request.package,
    ], target);
    const split = request.package.lastIndexOf("@");
    const packageName = request.package.slice(0, split);
    const version = request.package.slice(split + 1);
    const packageRoot = join(target, "node_modules", ...packageName.split("/"));
    if (realpathSync(packageRoot) !== packageRoot) throw new Error("O pacote precisa estar no diretório da instalação.");
    const manifest = z.object({
      name: z.literal(packageName), version: z.literal(version),
      bin: z.union([z.string(), z.record(z.string(), z.string())]),
    }).parse(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")));
    const standardName = packageName.split("/").at(-1);
    const entry = typeof manifest.bin === "string" ? (request.bin === standardName ? manifest.bin : undefined) : manifest.bin[request.bin];
    if (typeof entry !== "string" || isAbsolute(entry)) throw new Error("O binário solicitado não existe no manifesto do pacote.");
    const script = realpathSync(join(packageRoot, entry));
    const withinPackage = relative(packageRoot, script);
    if (!withinPackage || isAbsolute(withinPackage) || withinPackage === ".." || withinPackage.startsWith(`..${sep}`) || !statSync(script).isFile()) {
      throw new Error("O binário precisa ser um arquivo da instalação.");
    }
    checkRevision();
    const module = newManagedMcpModule(cwd, request.name, { type: "stdio", command: process.execPath, args: [script, ...(request.args ?? [])] });
    configs.write("project", {
      modules: [module], packages: [{ id: request.name, installedAt: new Date().toISOString(), version, via: request.package }],
    }, cwd);
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

export function containerMcpUrl(request: ContainerRecipe): string {
  return `http://127.0.0.1:${request.hostPort}${request.mcpPath}`;
}

export async function installContainer(cwd: string, request: ContainerRecipe, checkRevision: () => void, executor = defaultExecutor): Promise<void> {
  const module = newManagedMcpModule(cwd, request.name, { type: "http", url: containerMcpUrl(request) });
  const suffix = createHash("sha256").update(realpathSync(cwd)).digest("hex").slice(0, 12);
  const name = `gatewright-${request.name}-${suffix}`;
  const id = await step(executor, "Criar contêiner", "docker", [
    "create", "--name", name, "--publish", `127.0.0.1:${request.hostPort}:${request.port}`, request.image,
  ]);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error(`O Docker não retornou o ID esperado para ${name}. Confira o contêiner no Docker.`);
  try {
    await step(executor, "Iniciar contêiner", "docker", ["start", id]);
    checkRevision();
    configs.write("project", {
      modules: [module], packages: [{ id: request.name, installedAt: new Date().toISOString(), via: request.image, containerId: id }],
    }, cwd);
  } catch (error) {
    const cleanup = await executor({ label: "Limpar contêiner criado", command: "docker", args: ["rm", "--force", id] });
    if (!cleanup.ok) throw new Error(`A instalação falhou e o Docker não conseguiu remover o contêiner ${name}.`, { cause: error });
    throw error;
  }
}

export async function installGitProject(
  cwd: string, request: { name: string; url: string; commit: string; mcpUrl?: string | undefined }, checkRevision: () => void,
  executor = defaultExecutor,
): Promise<void> {
  const modules = request.mcpUrl ? [newManagedMcpModule(cwd, request.name, { type: "http", url: request.mcpUrl })] : [];
  const target = managedDirectory(cwd, request.name);
  try {
    await step(executor, "Preparar checkout", "git", ["init", "--template=", "--", target]);
    await step(executor, "Baixar revisão", "git", ["-C", target, "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "fetch", "--no-tags", "--depth=1", "--", request.url, request.commit]);
    await step(executor, "Materializar revisão", "git", ["-C", target, "-c", "core.hooksPath=.git/no-hooks", "checkout", "--detach", request.commit, "--"]);
    checkRevision();
    const current = configs.read("project", cwd);
    configs.write("project", {
      linkedProjects: [...new Set([...(current.linkedProjects ?? []), target])],
      packages: [{ id: request.name, installedAt: new Date().toISOString(), version: request.commit, via: request.url }],
      ...(modules.length ? { modules } : {}),
    }, cwd);
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

export async function installGraphify(
  cwd: string, version: string, checkRevision: () => void, executor = defaultExecutor,
): Promise<void> {
  const graph = join(realpathSync(cwd), "graphify-out", "graph.json");
  const environment = managedDirectory(cwd, "graphify");
  try {
    const interpreter = process.platform === "win32"
      ? join(environment, "Scripts", "python.exe") : join(environment, "bin", "python");
    const module = newManagedMcpModule(cwd, "graphify", { type: "stdio", command: interpreter, args: ["-m", "graphify.serve", graph] });
    await step(executor, "Criar ambiente do Graphify", "uv", ["venv", environment]);
    await step(executor, "Instalar Graphify", "uv", ["pip", "install", "--python", interpreter, `graphifyy[mcp]==${version}`]);
    checkRevision();
    configs.write("project", {
      modules: [module], packages: [{ id: "graphify", installedAt: new Date().toISOString(), version, via: "graphifyy[mcp]" }],
    }, cwd);
  } catch (error) {
    rmSync(environment, { recursive: true, force: true });
    throw error;
  }
}
