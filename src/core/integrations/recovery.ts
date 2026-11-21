import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { configPath, ConfigStore } from "../config/config-store.js";
import { parseChange } from "../../app/customize.js";
import { defaultExecutor } from "../provision/provisioner.js";
import type { Executor } from "../provision/types.js";
import { finishOperation, operationSnapshot, recordStep } from "./operations.js";
import { acquireInstallationLock } from "./install-lock.js";

function assertNotInstalling(cwd: string, operationId: string) {
  const mutex = join(cwd, ".gatewright", "integration-apply.lock");
  if (!existsSync(mutex)) return;
  let owner: { pid: number; operationId?: string };
  try {
    owner = JSON.parse(readFileSync(join(mutex, "owner.json"), "utf8")) as typeof owner;
  } catch {
    throw new Error(
      "A instalação foi interrompida antes de registrar o processo. Preserve os recursos e confira integration-apply.lock.",
    );
  }
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1)
    throw new Error("O registro do instalador está inválido.");
  try {
    process.kill(owner.pid, 0);
    throw new Error("O processo instalador ainda está ativo. Aguarde antes de reconciliar.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  if (owner.operationId !== operationId)
    throw new Error("Reconcilie primeiro a operação que possui o bloqueio de instalação.");
  rmSync(mutex, { recursive: true });
}

export async function inspectOperation(
  cwd: string,
  operationId: string,
  executor: Executor = defaultExecutor,
) {
  const operation = operationSnapshot(cwd, operationId);
  if (!operation?.recipe)
    throw new Error("A operação antiga não tem prova de propriedade suficiente para remoção automática.");
  const recipe = parseChange(JSON.stringify(operation.recipe));
  if (!["npm-mcp", "container", "git-project", "graphify"].includes(recipe.kind))
    throw new Error("Esta operação não cria recursos removíveis.");
  const name = recipe.kind === "graphify" ? "graphify" : "name" in recipe ? recipe.name : "";
  const root = realpathSync(cwd),
    path = join(root, ".gatewright", "integrations", name);
  const configs = new ConfigStore(new FileArtifactStore()),
    config = configs.read("project", root);
  const pkg = config.packages?.find((entry) => entry.id === name);
  const registered = !!pkg;
  const expectedVersion =
    "version" in recipe
      ? recipe.version
      : recipe.kind === "git-project"
        ? recipe.commit
        : recipe.kind === "container"
          ? recipe.image
          : recipe.kind === "npm-mcp"
            ? recipe.package.slice(recipe.package.lastIndexOf("@") + 1)
            : "";
  const matches =
    !!pkg && (recipe.kind === "container" ? pkg.via === expectedVersion : pkg.version === expectedVersion);
  let exists = false,
    owned = false,
    containerId: string | undefined,
    verified = false,
    detail = "";
  if (recipe.kind === "container") {
    const result = await executor({
      label: "Verificar contêiner da operação",
      command: "docker",
      args: ["ps", "-aq", "--filter", `label=gatewright.operation=${operationId}`],
    });
    if (!result.ok) throw new Error("Não foi possível consultar o Docker. Nenhum recurso foi removido.");
    const ids = (result.stdout ?? result.output).trim().split(/\s+/).filter(Boolean);
    if (ids.length > 1 || ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id)))
      throw new Error("Propriedade do contêiner ambígua.");
    containerId = ids[0];
    exists = !!containerId;
    if (containerId) {
      const inspect = await executor({
        label: "Conferir propriedade do contêiner",
        command: "docker",
        args: ["inspect", containerId],
      });
      if (!inspect.ok) throw new Error("Não foi possível conferir a propriedade do contêiner.");
      const item = (
        JSON.parse(inspect.stdout ?? inspect.output) as {
          Id: string;
          Config?: { Image?: string; Labels?: Record<string, string> };
          State?: { Running?: boolean };
        }[]
      )[0];
      owned =
        item?.Config?.Labels?.["gatewright.operation"] === operationId && item.Config.Image === recipe.image;
      verified = owned && item?.State?.Running === true && pkg?.containerId === item?.Id;
      containerId = item?.Id ?? containerId;
    }
    detail = exists
      ? "Contêiner localizado pela etiqueta da operação."
      : "Nenhum contêiner desta operação encontrado.";
  } else {
    exists = existsSync(path);
    if (exists) {
      // Refuse symlinks in every parent and in the ownership marker.
      const marker = join(path, ".gatewright-owner.json");
      if (
        realpathSync(path) !== path ||
        !lstatSync(path).isDirectory() ||
        !existsSync(marker) ||
        !lstatSync(marker).isFile()
      )
        throw new Error(
          "O recurso não tem prova de propriedade local. Nenhuma remoção automática foi feita.",
        );
      const owner = JSON.parse(readFileSync(marker, "utf8")) as {
        operationId?: string;
        cwd?: string;
        name?: string;
      };
      owned = owner.operationId === operationId && owner.cwd === root && owner.name === name;
      if (owned && recipe.kind === "git-project") {
        const head = await executor({
          label: "Conferir revisão do checkout",
          command: "git",
          args: ["-C", path, "rev-parse", "HEAD"],
        });
        verified =
          head.ok &&
          (head.stdout ?? head.output).trim() === recipe.commit &&
          !!config.linkedProjects?.includes(path);
      } else if (owned && recipe.kind === "npm-mcp") {
        const packageName = recipe.package.slice(0, recipe.package.lastIndexOf("@"));
        const manifest = join(path, "node_modules", ...packageName.split("/"), "package.json");
        if (existsSync(manifest) && realpathSync(manifest).startsWith(`${path}${sep}`)) {
          const info = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string; version?: string };
          verified = info.name === packageName && info.version === expectedVersion;
        }
      } else if (owned && recipe.kind === "graphify") {
        const python =
          process.platform === "win32" ? join(path, "Scripts", "python.exe") : join(path, "bin", "python");
        if (existsSync(python)) {
          const version = await executor({
            label: "Conferir versão do Graphify",
            command: python,
            args: ["-c", "from importlib.metadata import version; print(version('graphifyy'))"],
          });
          verified = version.ok && (version.stdout ?? version.output).trim() === recipe.version;
        }
      }
    }
    detail = !exists
      ? "Diretório já ausente."
      : owned
        ? "Diretório identificado pela operação."
        : "Diretório pertencente a outra operação.";
  }
  const module = config.modules?.find((entry) => entry.id === `mcp-${name}`);
  let moduleMatches = !module;
  if (module?.kind === "mcp") {
    const server = module.config;
    if (recipe.kind === "git-project") moduleMatches = server?.url === recipe.mcpUrl;
    else if (recipe.kind === "container")
      moduleMatches = server?.url === `http://127.0.0.1:${recipe.hostPort}${recipe.mcpPath}`;
    else if (recipe.kind === "graphify")
      moduleMatches =
        String(server?.command).startsWith(`${path}${sep}`) &&
        Array.isArray(server?.args) &&
        server.args[0] === "-m" &&
        server.args[1] === "graphify.serve";
    else if (recipe.kind === "npm-mcp")
      moduleMatches = Array.isArray(server?.args) && String(server.args[0]).startsWith(`${path}${sep}`);
  }
  const registeredMcp = recipe.kind !== "git-project" || !!recipe.mcpUrl;
  if (registeredMcp) verified &&= module?.enabled === true && module.kind === "mcp" && moduleMatches;
  const resource = {
    name,
    path,
    ...(containerId ? { containerId } : {}),
    exists,
    owned,
    registered,
    verified: verified && matches,
    detail,
  };
  const configRaw = existsSync(configPath("project", root))
    ? readFileSync(configPath("project", root), "utf8")
    : "";
  const revision = createHash("sha256")
    .update(JSON.stringify([operation, resource, configRaw]))
    .digest("hex");
  return {
    operation,
    resource,
    revision,
    canCleanup: (!exists || owned) && (!registered || matches) && moduleMatches,
    config,
  };
}

/** Reconciliation never re-executes installation commands. Cleanup requires a fresh inspected revision. */
export async function recoverOperation(
  cwd: string,
  operationId: string,
  action: "reconcile" | "cleanup",
  revision: string,
  executor: Executor = defaultExecutor,
) {
  assertNotInstalling(cwd, operationId);
  const release = acquireInstallationLock(cwd, `recovery-${operationId}`);
  try {
    const inspection = await inspectOperation(cwd, operationId, executor);
    if (inspection.revision !== revision)
      throw new Error("O recurso mudou. Confira a operação novamente antes de decidir.");
    const { resource, operation, config } = inspection;
    if (action === "cleanup" && !inspection.canCleanup)
      throw new Error("O recurso ou registro já não pertence a esta operação.");
    for (const step of operation.steps.filter((entry) => entry.status === "running")) {
      recordStep(cwd, operationId, {
        stepId: step.id,
        status: action === "cleanup" ? "skipped" : "unknown",
        errorCode: "INTERRUPTED_STEP_RECONCILED",
      });
    }
    if (action === "cleanup") {
      if (resource.exists) {
        if (resource.containerId) {
          const result = await executor({
            label: "Remover contêiner da operação",
            command: "docker",
            args: ["rm", "--force", resource.containerId],
          });
          if (!result.ok) throw new Error("O Docker não removeu o contêiner. O registro foi preservado.");
        } else rmSync(resource.path, { recursive: true });
      }
      if (resource.registered) {
        const next = {
          ...config,
          packages: config.packages?.filter((entry) => entry.id !== resource.name),
          modules: config.modules?.filter((entry) => entry.id !== `mcp-${resource.name}`),
          linkedProjects: config.linkedProjects?.filter((entry) => entry !== resource.path),
        };
        new FileArtifactStore().write(configPath("project", cwd), JSON.stringify(next, null, 2));
      }
      recordStep(cwd, operationId, {
        stepId: "compensation",
        label: "Remover recursos pertencentes à operação",
        status: "succeeded",
        evidence: { name: resource.name, result: "removed" },
      });
      finishOperation(cwd, operationId, "reverted");
    } else {
      recordStep(cwd, operationId, {
        stepId: "reconcile",
        label: "Conferir recurso e registro reais",
        status: resource.verified ? "succeeded" : resource.exists ? "unknown" : "skipped",
        evidence: {
          name: resource.name,
          exists: String(resource.exists),
          registered: String(resource.registered),
          verified: String(resource.verified),
        },
      });
      finishOperation(
        cwd,
        operationId,
        resource.verified ? "succeeded" : resource.exists || resource.registered ? "partial" : "reverted",
      );
    }
    return operationSnapshot(cwd, operationId);
  } finally {
    release();
  }
}
