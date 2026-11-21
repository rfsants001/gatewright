import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep, win32 } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { managedMcpServers } from "../integrations/managed-mcp.js";
import { finishOperation, listOperations, recordStep, startOperation } from "../integrations/operations.js";
import { defaultExecutor } from "../provision/provisioner.js";
import type { Executor } from "../provision/types.js";

const MAX_BYTES = 20 * 1024 * 1024,
  MAX_NODES = 4000,
  MAX_LINKS = 12000;
export interface MapNode {
  id: string;
  name: string;
  kind: string;
  path?: string;
  changed?: string;
}
export interface MapLink {
  source: string;
  target: string;
  relation: string;
}
export interface CodeMap {
  schemaVersion: 1;
  nodes: MapNode[];
  links: MapLink[];
  indexedAt: string;
  revision: string;
  graphifyVersion?: string;
  builtAtCommit?: string;
  stale: boolean;
  truncated: boolean;
  totalNodes: number;
  totalLinks: number;
  warning?: string;
  artifact: string;
}
const text = (value: unknown) =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

export function normalizeMapPath(cwd: string, path: string): string | undefined {
  if (!path || path.includes("\0")) return undefined;
  let portable = path.replaceAll("\\", "/");
  const root = cwd.replaceAll("\\", "/").replace(/\/$/, "");
  if (
    /^[A-Za-z]:/.test(root)
      ? portable.toLowerCase().startsWith(`${root.toLowerCase()}/`)
      : portable.startsWith(`${root}/`)
  )
    portable = portable.slice(root.length + 1);
  if (isAbsolute(portable) || win32.isAbsolute(portable)) return undefined;
  const segments = portable.split("/").filter((part) => part && part !== ".");
  if (!segments.length || segments.includes("..") || segments[0] === ".gatewright") return undefined;
  return segments.join("/");
}

/** Canonical containment is checked on use, including symlinks; graph labels are never commands. */
export function mapFile(cwd: string, path: string): string {
  const root = realpathSync(cwd),
    normalized = normalizeMapPath(root, path);
  if (!normalized) throw new Error("Escolha um arquivo dentro do projeto.");
  const file = realpathSync(join(root, normalized)),
    rel = relative(root, file);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(file).isFile())
    throw new Error("O arquivo está fora do projeto.");
  return file;
}

function changes(cwd: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const entries = raw.split("\0");
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (!entry) continue;
      const status = entry.slice(0, 2).trim();
      result.set(entry.slice(3), status);
      if (/[RC]/.test(status)) {
        const from = entries[++index];
        if (from) result.set(from, `R → ${entry.slice(3)}`);
      }
    }
  } catch {
    /* A non-git project can still have a map. */
  }
  return result;
}

export function parseCodeMap(cwd: string, raw: string, indexedAt = new Date().toISOString()): CodeMap {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("O mapa excede 20 MB. Gere um escopo menor.");
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (!data || !Array.isArray(data.nodes) || (!Array.isArray(data.links) && !Array.isArray(data.edges)))
    throw new Error("Formato de mapa inválido.");
  const graph = data.graph as Record<string, unknown> | undefined;
  if (graph?.schema_version !== undefined && graph.schema_version !== 1)
    throw new Error("Versão de mapa incompatível. Use o schema 1 do Graphify.");
  const rawLinks = (data.links ?? data.edges) as unknown[];
  const ids = new Set<string>(),
    nodes: MapNode[] = [];
  for (const value of data.nodes.slice(0, MAX_NODES)) {
    if (!value || typeof value !== "object") throw new Error("Nó inválido no mapa.");
    const node = value as Record<string, unknown>,
      id = text(node.id);
    if (!id || id.length > 300 || ids.has(id))
      throw new Error("O mapa contém IDs ausentes, extensos ou duplicados.");
    ids.add(id);
    const path = normalizeMapPath(cwd, text(node.source_file ?? node.path ?? node.file));
    nodes.push({
      id,
      name: text(node.label ?? node.name ?? node.id).slice(0, 180),
      kind:
        text(node.type ?? node.kind ?? (node._callable ? "function" : node.file_type)).slice(0, 80) ||
        "symbol",
      ...(path ? { path } : {}),
    });
  }
  const links: MapLink[] = [];
  for (const value of rawLinks.slice(0, MAX_LINKS)) {
    if (!value || typeof value !== "object") continue;
    const link = value as Record<string, unknown>,
      source = text(link.source),
      target = text(link.target);
    if (ids.has(source) && ids.has(target))
      links.push({
        source,
        target,
        relation: text(link.relation ?? link.type ?? link.label).slice(0, 120) || "relaciona",
      });
  }
  return {
    schemaVersion: 1,
    nodes,
    links,
    indexedAt,
    revision: createHash("sha256").update(raw).digest("hex"),
    ...(text(graph?.graphify_version) ? { graphifyVersion: text(graph?.graphify_version) } : {}),
    ...(text(data.built_at_commit) ? { builtAtCommit: text(data.built_at_commit) } : {}),
    stale: false,
    truncated: data.nodes.length > MAX_NODES || rawLinks.length > MAX_LINKS,
    totalNodes: data.nodes.length,
    totalLinks: rawLinks.length,
    artifact: "graphify-out/graph.json",
  };
}

export function getCodeMap(cwd: string): CodeMap | null {
  const artifact = join(cwd, "graphify-out", "graph.json"),
    cache = join(cwd, ".gatewright", "codemap", "last-valid.json");
  const store = new FileArtifactStore();
  let snapshot: CodeMap;
  try {
    if (!existsSync(artifact)) throw new Error("Nenhum graphify-out/graph.json disponível.");
    const source = mapFile(cwd, "graphify-out/graph.json");
    if (statSync(source).size > MAX_BYTES) throw new Error("O mapa excede 20 MB.");
    snapshot = parseCodeMap(cwd, readFileSync(source, "utf8"), statSync(source).mtime.toISOString());
    store.write(cache, JSON.stringify(snapshot));
  } catch (error) {
    if (!existsSync(cache)) {
      if (!existsSync(artifact)) return null;
      throw error;
    }
    if (statSync(cache).size > MAX_BYTES) throw new Error("Cache do mapa inválido.");
    snapshot = JSON.parse(readFileSync(cache, "utf8")) as CodeMap;
    snapshot = {
      ...snapshot,
      stale: true,
      warning: `Exibindo a última versão válida. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const changed = changes(cwd);
  snapshot.nodes = snapshot.nodes.map((node) => ({
    ...node,
    ...(node.path && changed.has(node.path) ? { changed: changed.get(node.path)! } : {}),
  }));
  if (snapshot.builtAtCommit) {
    try {
      snapshot.stale ||=
        execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 5000 }).trim() !==
        snapshot.builtAtCommit;
    } catch {
      snapshot.stale = true;
    }
  }
  // A dirty Git file may already be indexed. Compare freshness with the artifact,
  // while still showing its Git change marker independently.
  snapshot.stale ||= snapshot.nodes.some((node) => {
    if (!node.path) return false;
    try {
      return statSync(mapFile(cwd, node.path)).mtimeMs > Date.parse(snapshot.indexedAt);
    } catch {
      return true;
    }
  });
  return snapshot;
}

export function readMapFile(cwd: string, path: string) {
  const file = mapFile(cwd, path),
    normalized = relative(realpathSync(cwd), file).split(sep).join("/");
  if (statSync(file).size > 512 * 1024) throw new Error("O arquivo excede 512 KB. Abra-o no editor.");
  const bytes = readFileSync(file);
  if (bytes.includes(0)) throw new Error("Este arquivo é binário. Escolha um arquivo de texto.");
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", normalized], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    /* New/non-git files still display content. */
  }
  return { path: normalized, file, content: bytes.toString("utf8"), diff };
}

export async function generateCodeMap(
  cwd: string,
  progress: (data: unknown) => void = () => {},
  executor: Executor = defaultExecutor,
) {
  const server = managedMcpServers(cwd, false)["graphify"];
  if (server?.type !== "stdio" || !server.args.includes("graphify.serve"))
    throw new Error("Instale o Graphify em Integrações antes de gerar o mapa.");
  const operationId = randomUUID();
  startOperation(cwd, {
    id: operationId,
    revision: createHash("sha256").update(JSON.stringify(server)).digest("hex"),
    recipeKind: "codemap",
    steps: [{ id: "extract", label: "Indexar código local com Graphify" }],
  });
  const report = (status: "running" | "succeeded" | "failed") => {
    const seq = recordStep(cwd, operationId, {
      stepId: "extract",
      status,
      evidence: { artifact: "graphify-out/graph.json", mode: "code-only" },
    });
    progress({ operationId, seq, step: { id: "extract", status } });
  };
  report("running");
  try {
    if (process.env["GRAPHIFY_OUT"] && process.env["GRAPHIFY_OUT"] !== "graphify-out")
      throw new Error("Defina GRAPHIFY_OUT=graphify-out antes de gerar o mapa neste projeto.");
    if (
      existsSync(join(cwd, "graphify-out")) &&
      realpathSync(join(cwd, "graphify-out")) !== join(realpathSync(cwd), "graphify-out")
    )
      throw new Error("A saída do Graphify precisa ser uma pasta local do projeto.");
    const result = await executor({
      label: "Indexar código local",
      command: server.command,
      args: ["-m", "graphify", "extract", ".", "--code-only", "--no-cluster", "--out", "."],
      cwd,
    });
    if (!result.ok)
      throw new Error("O Graphify não concluiu a indexação. Confira a instalação e gere novamente.");
    const map = getCodeMap(cwd);
    if (!map || map.warning) throw new Error("O Graphify não produziu um mapa válido.");
    report("succeeded");
    finishOperation(cwd, operationId, "succeeded");
    for (const previous of listOperations(cwd).filter(
      (entry) =>
        entry.id !== operationId &&
        entry.recipeKind === "codemap" &&
        entry.status !== "succeeded" &&
        entry.status !== "reverted",
    )) {
      try {
        recordStep(cwd, previous.id, {
          stepId: "superseded",
          label: "Mapa válido gerado posteriormente",
          status: "succeeded",
          evidence: { operationId, revision: map.revision },
        });
        finishOperation(cwd, previous.id, "reverted");
      } catch {
        map.warning =
          "O mapa foi gerado, mas uma operação anterior não pôde ser encerrada no histórico. Confira seu armazenamento antes de atualizar o registro.";
      }
    }
    return { operationId, map };
  } catch (error) {
    report("failed");
    finishOperation(cwd, operationId, "failed");
    throw error;
  }
}
