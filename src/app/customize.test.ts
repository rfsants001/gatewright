import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore } from "../core/config/config-store.js";
import { gateMcpConfig } from "../core/engine/gate-mcp-config.js";
import { managedMcpServers } from "../core/integrations/managed-mcp.js";
import { resolveAdvisor } from "../core/jev/advisor.js";
import type { ProvisionStep } from "../core/provision/types.js";
import { composeAgent, projectAgents, projectSkills, saveAgent } from "../core/skills/agents.js";
import { createMcpServer } from "../mcp/server.js";
import { applyChange, changeRevision, checkProposalSources, customizationPrompt, parseChange, recipeSchema, type Change } from "./customize.js";
import { applyTerminal, planRevision, planTerminal, terminalConfigStatus } from "./terminal.js";
import { testManagedMcp } from "./integration-diagnostics.js";

const configs = new ConfigStore(new FileArtifactStore());
const commit = "cafebabe".repeat(5);
let cwd: string;

beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "gatewright-customize-")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(cwd, { recursive: true, force: true });
});

function apply(change: Change, executor?: Parameters<typeof applyChange>[3]) {
  return applyChange(cwd, change, changeRevision(cwd, change), executor);
}

describe("configuração assistida do projeto", () => {
  it("carrega o prompt interno independentemente do catálogo escolhido e exige origens explícitas", () => {
    vi.stubEnv("GATEWRIGHT_SKILLS_DIR", cwd);
    expect(customizationPrompt()).toContain("Never invent an endpoint");
    expect(projectSkills(cwd).size).toBe(0);
    const requested = parseChange(JSON.stringify({ kind: "git-project", name: "docs", url: "https://example.com/repo.git", commit, mcpUrl: "https://example.com/mcp" }));
    expect(() => checkProposalSources(requested, `https://example.com/repo.git ${commit}`)).toThrow("origem");
    expect(() => checkProposalSources(requested, `https://example.com/repo.git ${commit} https://example.com/mcp`)).not.toThrow();
    expect(() => parseChange(JSON.stringify({ kind: "git-project", name: "docs", url: "https://example.com/repo.git", commit, command: "anything" }))).toThrow();
  });

  it("extrai o JSON mesmo com fences markdown e prosa ao redor (saída de CLI agêntica)", () => {
    const reply = 'Claro! Segue a proposta:\n```json\n{"kind":"mcp-http","name":"exemplo","url":"https://example.com/mcp"}\n```\nÉ um MCP HTTP. Quer que eu ajuste o slug?';
    expect(parseChange(reply)).toEqual({ kind: "mcp-http", name: "exemplo", url: "https://example.com/mcp" });
  });

  it("registra um MCP ao lado do Gatewright nos quatro planos sem substituir configurações existentes", async () => {
    const url = "https://example.com/mcp";
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "existing" } } }));
    await apply({ kind: "mcp-http", name: "external-docs", url });
    const claude = planTerminal(cwd, "claude-code").find(({ path }) => path.endsWith(".mcp.json"))!;
    expect(JSON.parse(claude.nextContent).mcpServers).toMatchObject({ existing: { command: "existing" }, gatewright: {}, "external-docs": { type: "http", url } });
    expect(planTerminal(cwd, "codex")[0]?.nextContent).toContain(`[mcp_servers.external-docs]\nurl = "${url}"`);
    const gemini = JSON.parse(planTerminal(cwd, "gemini")[0]!.nextContent);
    expect(gemini.mcpServers).toMatchObject({ gatewright: {}, "external-docs": { httpUrl: url } });
    const opencode = JSON.parse(planTerminal(cwd, "opencode")[0]!.nextContent);
    expect(opencode.mcp).toMatchObject({ gatewright: { type: "local" }, "external-docs": { type: "remote", url, enabled: true } });
    expect(gateMcpConfig(cwd).mcpServers).toMatchObject({ gatewright: {}, "external-docs": { type: "http", url } });
    await expect(apply({ kind: "mcp-http", name: "external-docs", url: "https://different.example/mcp" })).rejects.toThrow("Já existe");
    expect(terminalConfigStatus(cwd, "claude-code")).toBe("pending");
    applyTerminal(cwd, "claude-code", planRevision(planTerminal(cwd, "claude-code")));
    expect(terminalConfigStatus(cwd, "claude-code")).toBe("configured");
    writeFileSync(join(cwd, ".mcp.json"), "{malformed}");
    expect(terminalConfigStatus(cwd, "claude-code")).toBe("review");
  });

  it("instala pacote Node fixado sem scripts e registra o bin do manifesto para os hosts", async () => {
    const npm = join(cwd, "npm-cli.js");
    writeFileSync(npm, "");
    vi.stubEnv("npm_execpath", npm);
    const npmName = "@example/server";
    const request = { kind: "npm-mcp", name: "docs", package: `${npmName}@1.2.3`, bin: "mcp-docs", args: ["--stdio"] } as const;
    const target = join(cwd, ".gatewright", "integrations", "docs");
    const installedPkg = join(target, "node_modules", "@example", "server");
    const launcher = join(installedPkg, "index.mjs");
    const executor = vi.fn(async (step: ProvisionStep) => {
      expect(step.cwd).toBe(target);
      mkdirSync(installedPkg, { recursive: true });
      writeFileSync(launcher, "");
      writeFileSync(join(installedPkg, "package.json"), JSON.stringify({ name: npmName, version: "1.2.3", bin: { "mcp-docs": "index.mjs" } }));
      return { ok: true, output: "" };
    });
    const change = parseChange(JSON.stringify(request));
    await apply(change, executor);
    expect(executor.mock.calls[0]?.[0].args).toEqual(expect.arrayContaining(["--ignore-scripts", "--save-exact", request.package]));
    expect(managedMcpServers(cwd).docs).toEqual({ type: "stdio", command: process.execPath, args: [launcher, "--stdio"] });
    expect(configs.read("project", cwd).packages?.[0]).toMatchObject({ via: request.package, version: "1.2.3" });
    expect(() => checkProposalSources(change, `${request.package} mcp-docs`)).toThrow("origem");
  });

  it("publica um contêiner em loopback e registra o MCP depois que Docker confirma a inicialização", async () => {
    const image = `registry.example/docs@sha256:${"abcdef12".repeat(8)}`;
    const id = "01234567".repeat(8);
    const change = { kind: "container", name: "docs", image, port: 3000, hostPort: 8300, mcpPath: "/mcp" } as const;
    const executor = vi.fn(async (step: ProvisionStep) => ({
      ok: true, output: "downloaded image", stdout: step.args[0] === "create" ? id : "",
    }));
    await apply(change, executor);
    expect(executor.mock.calls[0]?.[0].args).toEqual(expect.arrayContaining(["--publish", "127.0.0.1:8300:3000", image]));
    expect(executor.mock.calls[1]?.[0].args).toEqual(["start", id]);
    expect(gateMcpConfig(cwd).mcpServers).toMatchObject({ docs: { url: "http://127.0.0.1:8300/mcp" }, gatewright: {} });
    expect(configs.read("project", cwd).packages?.[0]).toMatchObject({ via: image, containerId: id });
  });

  it("remove somente o contêiner que a receita criou se a inicialização falha", async () => {
    const id = "01234567".repeat(8);
    const change = { kind: "container", name: "docs", image: `registry.example/docs@sha256:${id}`, port: 3000, hostPort: 8300, mcpPath: "/mcp" } as const;
    const executor = vi.fn(async ({ args }: ProvisionStep) => ({ ok: args[0] !== "start", output: id }));
    await expect(apply(change, executor)).rejects.toThrow("Iniciar contêiner");
    expect(executor.mock.calls[2]?.[0].args).toEqual(["rm", "--force", id]);
    expect(managedMcpServers(cwd)).toEqual({});
  });

  it("só informa sucesso após receber a resposta initialize MCP", async () => {
    const url = "http://127.0.0.1:8300/mcp";
    const serverInfo = { name: "docs-server", version: "1.2.3" };
    const fetch = vi.fn(async (_input: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (body.method === "initialize") return Response.json({
        jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo },
      });
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", fetch);
    await apply({ kind: "mcp-http", name: "docs", url });
    await expect(testManagedMcp(cwd, "docs")).resolves.toMatchObject(serverInfo);
    expect(fetch.mock.calls[0]?.[0]?.toString()).toBe(url);
    fetch.mockImplementationOnce(async () => new Response(null, { status: 401 }));
    const failure = await testManagedMcp(cwd, "docs");
    expect("errorCode" in failure).toBe(true);
  });

  it("vincula um checkout fixado e seu MCP existente apenas quando todas as etapas terminam", async () => {
    const url = "https://example.com/repo.git";
    const executor = vi.fn(async (_step: ProvisionStep) => ({ ok: true, output: "" }));
    const change = { kind: "git-project", name: "reference", url, commit, mcpUrl: "https://example.com/mcp" } as const;
    await apply(change, executor);
    expect(executor.mock.calls.map(([{ command, args }]) => [command, args.at(-2), args.at(-1)])).toEqual([
      ["git", "--", join(cwd, ".gatewright", "integrations", "reference")],
      ["git", url, commit],
      ["git", commit, "--"],
    ]);
    expect(configs.read("project", cwd)).toMatchObject({ linkedProjects: [join(cwd, ".gatewright", "integrations", "reference")], packages: [{ id: "reference", version: commit }] });
    expect(managedMcpServers(cwd).reference).toEqual({ type: "http", url: change.mcpUrl });
  });

  it("deixa Graphify registrado enquanto aguarda o grafo e passa a incluí-lo quando o arquivo existe", async () => {
    const executor = vi.fn(async (_step: ProvisionStep) => ({ ok: true, output: "" }));
    await apply({ kind: "graphify", version: "1.2.3" }, executor);
    expect(executor.mock.calls.map(([{ command, args }]) => [command, args[0]])).toEqual([["uv", "venv"], ["uv", "pip"]]);
    expect(executor.mock.calls[1]?.[0].args.at(-1)).toBe("graphifyy[mcp]==1.2.3");
    expect(managedMcpServers(cwd, false).graphify?.type).toBe("stdio");
    expect(managedMcpServers(cwd).graphify).toBeUndefined();
    mkdirSync(join(cwd, "graphify-out"));
    writeFileSync(join(cwd, "graphify-out", "graph.json"), "{}");
    expect(managedMcpServers(cwd).graphify).toMatchObject({ args: ["-m", "graphify.serve", join(cwd, "graphify-out", "graph.json")] });
  });

  it("limpa a instalação falha e rejeita a proposta se outro processo mudou o destino", async () => {
    const change = { kind: "graphify", version: "1.2.3" } as const;
    const target = join(cwd, ".gatewright", "integrations", "graphify");
    const rejected = vi.fn(async (_step: ProvisionStep) => ({ ok: false, output: "failure" }));
    await expect(apply(change, rejected)).rejects.toThrow("falhou");
    expect(existsSync(target)).toBe(false);
    expect(managedMcpServers(cwd, false)).toEqual({});
    const stale = vi.fn(async (_step: ProvisionStep) => {
      configs.write("project", { linkedProjects: [cwd] }, cwd);
      return { ok: true, output: "" };
    });
    await expect(apply(change, stale)).rejects.toThrow("destino mudou");
    expect(existsSync(target)).toBe(false);
    expect(configs.read("project", cwd)).toEqual({ linkedProjects: [cwd] });
  });

  it("registra um advisor externo com merge-by-id sem clobber", async () => {
    // Pre-seed a disabled jev module so we can verify it survives the advisor apply.
    configs.write("project", { modules: [{ id: "jev", kind: "jev", provider: "internal", enabled: false }] }, cwd);
    const change = parseChange(JSON.stringify({ kind: "advisor", name: "my-advisor", endpoint: "https://ext.example.com/advise", model: "gpt-4o" }));
    expect(change.kind).toBe("advisor");
    expect(() => checkProposalSources(change, "https://ext.example.com/advise gpt-4o")).not.toThrow();
    expect(() => checkProposalSources(change, "https://ext.example.com/advise")).toThrow("origem");
    await apply(change);
    const modules = configs.read("project", cwd).modules ?? [];
    const advisor = modules.find((m) => m.id === "my-advisor");
    expect(advisor?.kind).toBe("advisor");
    expect(advisor?.provider).toBe("external");
    expect(advisor?.enabled).toBe(true);
    expect((advisor?.config as Record<string, unknown>)?.["endpoint"]).toBe("https://ext.example.com/advise");
    expect((advisor?.config as Record<string, unknown>)?.["model"]).toBe("gpt-4o");
    // jev module must still be present and unchanged (never clobber)
    const jev = modules.find((m) => m.id === "jev");
    expect(jev?.enabled).toBe(false);
  });

  it("registra um advisor externo sem model quando model não é fornecido", async () => {
    const change = parseChange(JSON.stringify({ kind: "advisor", name: "bare-advisor", endpoint: "https://bare.example.com/advise" }));
    if (change.kind !== "advisor") throw new Error("narrow");
    expect(change.model).toBeUndefined();
    await apply(change);
    const module = configs.read("project", cwd).modules?.find((m) => m.id === "bare-advisor");
    expect(module).toBeDefined();
    expect(Object.hasOwn(module?.config ?? {}, "model")).toBe(false);
  });

  it("usa a configuração Jev do projeto quando o hook resolve o advisor", async () => {
    vi.stubEnv("HOME", cwd);
    vi.stubEnv("USERPROFILE", cwd);
    vi.stubEnv("GATEWRIGHT_HOME", cwd);
    vi.stubEnv("GATEWRIGHT_JEV_CONFIG", join(cwd, "jev.json"));
    const endpoint = "http://127.0.0.1:11435";
    const result = { verdict: "approve", rationale: "Checked", confidence: 0.9 };
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ response: JSON.stringify(result) }));
    vi.stubGlobal("fetch", fetch);
    await apply({ kind: "jev", endpoint, model: "project-model" });
    await expect(resolveAdvisor(cwd, configs)?.advise("proportion-gate", "Check the scope.")).resolves.toEqual(result);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${endpoint}/api/generate`);
    expect(JSON.parse(String(init.body)).model).toBe("project-model");
  });

  it("expõe skills de projeto e o agente como um único prompt MCP na ordem escolhida", async () => {
    for (const [name, instructions] of [["discovery", "Entenda o pedido."], ["quality", "Valide a entrega."]] as const) {
      await apply({ kind: "skill", name, description: "Quando usar", instructions });
    }
    const agent = { id: "reviewer", name: "Revisor", goal: "Revisar o incremento", skills: ["quality", "discovery"] };
    saveAgent(cwd, agent);
    expect(projectAgents(cwd)).toEqual([agent]);
    const prompt = composeAgent(cwd, agent);
    expect(prompt).toContain("## quality\nValide a entrega.\n\n## discovery\nEntenda o pedido.");
    expect(() => saveAgent(cwd, { ...agent, id: "missing", skills: ["unknown"] })).toThrow("não está disponível");
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(undefined, undefined, cwd);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const names = (await client.listPrompts()).prompts.map(({ name }) => name);
      expect(names).toContain("gate.quality");
      expect(names.some((name) => name.startsWith("gate._system/"))).toBe(false);
      expect((await client.getPrompt({ name: "gate.agent.reviewer" })).messages[0]?.content).toMatchObject({ type: "text", text: prompt });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("recipeSchema — entrada estruturada", () => {
  it("aceita os três kinds determinísticos", () => {
    expect(recipeSchema.parse({ kind: "link-project", path: "/abs/path" })).toMatchObject({ kind: "link-project", path: "/abs/path" });
    expect(recipeSchema.parse({ kind: "graphify", version: "1.2.3" })).toMatchObject({ kind: "graphify", version: "1.2.3" });
    expect(recipeSchema.parse({ kind: "jev", endpoint: "http://127.0.0.1:11434/", model: "qwen" })).toMatchObject({ kind: "jev", model: "qwen" });
  });

  it("rejeita kind fora do subconjunto estruturado", () => {
    expect(recipeSchema.safeParse({ kind: "provider", provider: { id: "x", endpoint: "https://e.com/v1", model: "m" } }).success).toBe(false);
    expect(recipeSchema.safeParse({ kind: "mcp-http", name: "x", url: "https://e.com/mcp" }).success).toBe(false);
  });

  it("rejeita campos inválidos por kind", () => {
    expect(recipeSchema.safeParse({ kind: "graphify", version: "1.2" }).success).toBe(false);
    expect(recipeSchema.safeParse({ kind: "jev", endpoint: "https://remote.example.com/", model: "m" }).success).toBe(false);
    expect(recipeSchema.safeParse({ kind: "link-project", path: "" }).success).toBe(false);
  });
});
