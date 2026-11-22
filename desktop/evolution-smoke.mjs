import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopDriver } from "./test-driver.mjs";
import { writeCodexFixture } from "./codex-fixture.mjs";
import { startOperation, finishOperation } from "../dist/core/integrations/operations.js";
import { appendEngineEvent, openRunJournal } from "../dist/core/engine/run-journal.js";

const root = await mkdtemp(join(tmpdir(), "gatewright-evolution-")),
  project = join(root, "projeto com espaços");
const screenshotDir = process.argv[2] ? resolve(process.argv[2]) : null;
const cli = fileURLToPath(new URL("../dist/cli/gate.js", import.meta.url));
const driver = createDesktopDriver({ root, project, cli });
const originalPath = process.env.PATH;
let app, completion;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  completion = JSON.parse(body);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      model: "gpt-4o",
      choices: [{ message: { content: "Revisão concluída no provedor local de teste." } }],
      usage: { prompt_tokens: 1200, completion_tokens: 400 },
    }),
  );
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
async function rpc(method, params = {}) {
  const reply = await app.evaluate(
    `window.gatewright.request(${JSON.stringify(method)}, ${JSON.stringify({ cwd: project, ...params })})`,
  );
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}
async function input(selector, value) {
  await app.evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); if (!field) throw new Error('Missing field');
    const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
}
async function screenshot(name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await app.evaluate("document.fonts.ready");
  await app.evaluate("document.activeElement?.blur(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await app.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  const shot = await app.call("Page.captureScreenshot", { format: "png" });
  await writeFile(join(screenshotDir, `${name}.png`), Buffer.from(shot.data, "base64"));
}
try {
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "src", "api.ts"), "export function request() { return 1; }\n");
  const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
  git("init");
  git("config", "user.name", "Gatewright Fixture");
  git("config", "user.email", "fixture@gatewright.test");
  git("add", ".");
  git("commit", "-m", "fixture");
  app = await driver.launch();
  await app.call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await rpc("provider.save", {
    provider: {
      id: "local-fixture",
      endpoint: `http://127.0.0.1:${server.address().port}/v1`,
      model: "gpt-4o",
    },
  });
  await rpc("skill.save", {
    skill: {
      kind: "skill",
      name: "review-contracts",
      description: "Review public API contracts",
      instructions: "Validate public contracts and explain breaking changes.",
    },
  });
  await rpc("agent.save", {
    agent: {
      id: "api-reviewer",
      name: "Revisor de API",
      goal: "Revisar contratos públicos",
      skills: ["review-contracts"],
      responsibilities: "Conferir compatibilidade e apresentar evidências.",
    },
  });
  await app.evaluate("document.querySelector('[aria-label=\"Atualizar projeto\"]').click()");
  await app.click("Memória", ".project-sections button");
  await app.waitFor("document.querySelector('.memory-layout') !== null");
  await app.click("Nova memória");
  await app.waitFor("document.querySelector('dialog[open] input[name=title]') !== null");
  await input("dialog input[name=title]", "Contratos públicos");
  await input("dialog textarea[name=body]", "Manter compatibilidade com a API v1 e registrar mudanças.");
  await app.click("Salvar memória");
  await app.waitFor("document.querySelectorAll('.memory-row').length === 1");
  const memory = (await rpc("memory.list"))[0];
  await screenshot("memory");
  await app.click("Tarefas", ".app-nav button");
  await input(".form-grid select", "provider:local-fixture");
  await app.evaluate(
    "(() => { const select = [...document.querySelectorAll('select')].find((field) => field.parentElement.textContent.startsWith('Agente')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'api-reviewer'); select.dispatchEvent(new Event('change',{bubbles:true})); })()",
  );
  await app.evaluate("document.querySelector('.context-picker summary').click()");
  await app.waitFor("document.querySelectorAll('.context-picker .check-line').length === 2");
  await app.evaluate("document.querySelectorAll('.context-picker input[type=checkbox]')[1].click()");
  await input(".form-panel > label textarea", "Revisar a compatibilidade da API.");
  await app.click("Executar tarefa");
  await app.waitFor("document.querySelector('.execution-log').textContent.includes('Concluída')");
  await app.waitFor("document.querySelector('main').textContent.includes('Ver tarefa')");
  assert(
    completion.messages[0].content.includes(memory.body),
    "O contexto selecionado deve chegar ao provedor.",
  );
  assert(
    completion.messages[0].content.includes("Validate public contracts"),
    "As skills do agente devem chegar ao mesmo contexto.",
  );
  await screenshot("tasks");
  await app.click("Ver tarefa");
  await app.waitFor("document.querySelector('dialog[open]').textContent.includes('Memórias recebidas')");
  assert(
    await app.evaluate(
      `document.querySelector('dialog[open]').textContent.includes(${JSON.stringify(memory.body)})`,
    ),
  );
  await app.evaluate("document.querySelector('dialog button[aria-label=\"Fechar painel\"]').click()");
  const usage = await rpc("usage.get", { days: 7 });
  const runId = usage.byRun[0].runSlug;
  const detail = await rpc("run.detail", { runId });
  assert.equal(detail.context.memorySnapshot.items[0].version, 1);
  await rpc("memory.upsert", {
    record: {
      ...memory,
      schemaVersion: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      projectId: undefined,
      body: "Nova orientação para a API v2.",
    },
  });
  assert.equal((await rpc("run.detail", { runId })).context.memorySnapshot.items[0].body, memory.body);
  // Explicit historical usage fixtures exercise populated charts alongside the
  // real local-provider run whose unknown model price must stay unknown.
  for (let day = 1; day <= 6; day++) {
    const at = new Date(Date.now() - day * 86400000).toISOString();
    const historical = openRunJournal(project, `demo-cost-${day}`).journal;
    historical.append({
      type: "RUN_CONTEXT",
      at,
      payload: {
        prompt: `Dado demonstrativo de consumo ${day}`,
        engineId: "fixture-history",
        providerId: "fixture-history",
        agentId: "api-reviewer",
        integrationIds: ["jev", "graphify"],
        attributionSource: "run-start",
        integrationMeaning: "enabled-context",
      },
    });
    appendEngineEvent(
      historical,
      {
        kind: "usage",
        usage: {
          tokensIn: 1000 + day * 200,
          tokensOut: 300 + day * 20,
          cacheRead: day * 50,
          costUsd: 0.02 + day * 0.007,
          model: "fixture-reported-model",
        },
      },
      at,
    );
  }
  await app.click("Custos", ".app-nav button");
  await app.waitFor("document.querySelector('.attribution-bars button') !== null");
  await input('[aria-label="Agrupar custos por"]', "provider");
  assert(
    await app.evaluate("document.querySelector('.attribution-bars').textContent.includes('local-fixture')"),
  );
  assert(await app.evaluate("document.querySelectorAll('.chart-bar').length === 7"));
  await screenshot("costs");
  await app.evaluate("document.querySelector('.link-button').click()");
  await app.waitFor("document.querySelector('dialog[open]') !== null");
  assert(
    await app.evaluate(
      `document.querySelector('dialog').textContent.includes(${JSON.stringify(memory.body)})`,
    ),
  );
  await app.click("Abrir tarefa");
  await app.waitFor("document.querySelector('.execution-log') !== null");
  await app.click("Projeto", ".app-nav button");
  await app.click("Mapa", ".project-sections button");
  await app.waitFor("document.querySelector('main').textContent.includes('Veja como o projeto se conecta')");
  await mkdir(join(project, "graphify-out"));
  await writeFile(
    join(project, "graphify-out", "graph.json"),
    JSON.stringify({
      graph: { schema_version: 1, graphify_version: "0.9.114" },
      nodes: [
        { id: "api", label: "API pública", type: "module", source_file: "src/api.ts" },
        { id: "request", label: "request()", type: "function", source_file: "src/api.ts" },
        { id: "validation", label: "Validação", type: "boundary", source_file: "src/api.ts" },
        { id: "contract", label: "Contrato v1", type: "interface", source_file: "src/api.ts" },
      ],
      links: [
        { source: "api", target: "request", relation: "contains" },
        { source: "request", target: "validation", relation: "calls" },
        { source: "contract", target: "api", relation: "describes" },
      ],
    }),
  );
  await writeFile(join(project, "src", "api.ts"), "export function request() { return 2; }\n");
  await app.click("Atualizar");
  await app.waitFor("document.querySelectorAll('.map-node').length === 4");
  await app.evaluate("document.querySelector('.map-node').click()");
  await screenshot("map");
  await app.click("Ver arquivo e diff");
  await app.waitFor("document.querySelector('dialog[open] .file-preview') !== null");
  assert(
    await app.evaluate(
      "document.querySelector('dialog').textContent.includes('+export function request() { return 2; }')",
    ),
  );
  await app
    .click("Fechar painel", "button[aria-label='Fechar painel']")
    .catch(async () =>
      app.evaluate("document.querySelector('dialog button[aria-label=\"Fechar painel\"]').click()"),
    );
  await app.click("Lista", ".map-panel button");
  await app.waitFor("document.querySelectorAll('.map-list > button').length === 4");
  await app.evaluate("document.querySelectorAll('.map-list > button')[1].click()");
  assert(await app.evaluate("document.querySelector('.map-detail h2').textContent === 'request()'"));
  const outside = await app.evaluate(
    `window.gatewright.request('projectMap.openFile', {cwd:${JSON.stringify(project)},path:'../outside.txt'})`,
  );
  assert(outside.error);
  for (const [width, height] of [
    [1440, 960],
    [1120, 860],
    [780, 580],
  ]) {
    await app.call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert(
      await app.evaluate("document.documentElement.scrollWidth <= innerWidth"),
      `Overflow global em ${width}`,
    );
    assert(
      await app.evaluate(
        "(() => {const main=document.querySelector('main'); main.scrollTop=main.scrollHeight; return main.scrollTop+main.clientHeight >= main.scrollHeight-2})()",
      ),
    );
  }
  await app.evaluate(
    "document.querySelector('.header-actions button[aria-label=\"Ajuda desta tela\"]').focus(); document.activeElement.click()",
  );
  await app.waitFor("document.querySelector('dialog[open]') !== null");
  for (let index = 0; index < 4; index++)
    await app.call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
  assert(await app.evaluate("document.querySelector('dialog').contains(document.activeElement)"));
  await app.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await app.waitFor("document.querySelector('dialog[open]') === null");
  assert(await app.evaluate("document.activeElement.getAttribute('aria-label') === 'Ajuda desta tela'"));
  await app.call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const operationId = "owned-interrupted",
    owned = join(project, ".gatewright", "integrations", "example");
  startOperation(project, {
    id: operationId,
    revision: "fixture",
    recipeKind: "git-project",
    recipe: {
      kind: "git-project",
      name: "example",
      url: "https://example.com/project.git",
      commit: "a".repeat(40),
    },
    steps: [],
  });
  finishOperation(project, operationId, "partial");
  await mkdir(owned, { recursive: true });
  await writeFile(
    join(owned, ".gatewright-owner.json"),
    JSON.stringify({ cwd: project, name: "example", operationId }),
  );
  await app.click("Integrações", ".app-nav button");
  await app.evaluate("document.querySelector('[aria-label=\"Atualizar projeto\"]').click()");
  await app.waitFor("document.querySelector('main').textContent.includes('Ver operação')");
  await app.click("Ver operação");
  await app.click("Conferir recursos reais");
  await app.waitFor(
    "document.querySelector('.operation-details').textContent.includes('Diretório identificado')",
  );
  await app.click("Remover recursos desta operação");
  await app.click("Confirmar remoção");
  await app.waitFor(
    "document.querySelector('.operation-details').textContent.includes('Remover recursos pertencentes')",
  );
  await app.click("Fechar detalhes");
  if (screenshotDir) {
    await app.evaluate("document.querySelector('[aria-label=\"Atualizar projeto\"]').click()");
    await app.waitFor("document.querySelector('main').textContent.includes('Recursos removidos')");
  }
  await screenshot("integrations");
  await app.click("Agentes", ".app-nav button");
  await app.waitFor("document.querySelector('main').textContent.includes('Revisor de API')");
  await screenshot("agents");
  await app.click("Skills", ".app-nav button");
  await app.waitFor("document.querySelector('main').textContent.includes('review-contracts')");
  await screenshot("skills");
  await app.click("Projeto", ".app-nav button");
  await app.click("Resumo", ".project-sections button");
  await screenshot("project");
  await driver.close();
  app = await driver.launch();
  assert.equal((await rpc("memory.list"))[0].version, 2);
  assert.equal((await rpc("run.detail", { runId })).context.memorySnapshot.items[0].version, 1);
  await driver.close();
  const fixtureBin = await writeCodexFixture(root);
  process.env.PATH = `${fixtureBin}${delimiter}${originalPath ?? ""}`;
  app = await driver.launch();
  const plan = await rpc("terminal.preview", { host: "codex" });
  await rpc("terminal.apply", { host: "codex", revision: plan.revision });
  assert.equal((await rpc("terminal.test", { host: "codex" })).ready, false);
  await writeFile(join(project, ".gatewright", "fixture-trusted"), "reviewed in controlled fixture");
  assert.equal((await rpc("terminal.test", { host: "codex" })).ready, true);
  if (screenshotDir) {
    await app.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await app.click("Integrações", ".app-nav button");
    await app.evaluate("document.querySelector('[aria-label=\"Atualizar projeto\"]').click()");
    await app.waitFor("Array.from(document.querySelectorAll('tr')).some(row => row.textContent.includes('codex-cli fixture') && row.textContent.includes('Aplicada'))");
    await app.click("Verificar hooks");
    await app.waitFor("document.querySelector('.host-readiness')?.textContent.includes('confiáveis')");
    await app.evaluate("document.querySelector('.host-readiness').closest('section').scrollIntoView({block:'start'})");
    await screenshot("codex-connections");
  }
  await app.click("Tarefas", ".app-nav button");
  await input(".form-grid select", "codex");
  await input(".form-grid input", "codex-fixture-model");
  await input(".form-panel > label textarea", "Implementar e verificar a mudança do Codex.");
  await app.click("Executar tarefa");
  await app.waitFor("document.querySelector('.execution-log').textContent.includes('Concluída')");
  assert.equal((await readFile(join(project, "codex-implementation.txt"), "utf8")).startsWith("Codex fixture implementation"), true);
  const request = JSON.parse(await readFile(join(project, ".gatewright", "codex-request.json"), "utf8"));
  assert.equal(request.checkedGate, true);
  assert.equal(request.args[request.args.indexOf("--sandbox") + 1], "workspace-write");
  await screenshot("codex-tasks");
  if (screenshotDir) {
    await app.call("Emulation.setDeviceMetricsOverride", { width: 780, height: 860, deviceScaleFactor: 1, mobile: false });
    await screenshot("compact-tasks");
    await app.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  }
  await app.click("Abrir diff");
  await app.waitFor("document.querySelector('dialog[open]')?.textContent.includes('codex-implementation.txt')");
  await screenshot("codex-review");
  await app.click("Aprovar revisão");
  await app.waitFor("document.querySelector('dialog[open]') === null");
  const codexUsage = await rpc("usage.get", { days: 7 });
  assert(codexUsage.byRun.some((run) => run.model === "codex-fixture-model" && run.totalTokensIn === 60 && run.totalCacheRead === 40));
  await input(".form-panel > label textarea", "FLOW_CODEX_FIXTURE");
  await app.click("Iniciar fluxo SDD");
  await app.waitFor("document.querySelector('dialog[open]')?.textContent.includes('Aprovar etapa do Codex?')");
  await screenshot("codex-flow");
  await app.click("Encerrar fluxo");
  await app.waitFor("document.querySelector('dialog[open]') === null");
  await input(".form-panel > label textarea", "CANCEL_CODEX_FIXTURE");
  await app.click("Executar tarefa");
  await app.waitFor("document.querySelector('.transcript').textContent.includes('fixture waiting')");
  await app.click("Cancelar execução");
  await app.waitFor("document.querySelector('.execution-log').textContent.includes('Cancelada')");
  console.log("Electron Codex: confiança verificada, escrita + MCP, testes, diff aprovado, cache contado uma vez, Flow e cancelamento verificados com CLI controlada.");
  console.log(
    "Electron: memória criada e selecionada → agente + contexto recebidos no provedor → snapshot imutável → custos por atribuição → mapa e diff → recuperação de recurso → teclado, scroll e reinício verificados.",
  );
} catch (error) {
  if (driver.output) process.stderr.write(driver.output);
  throw error;
} finally {
  if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
  await driver.close();
  await new Promise((done) => server.close(done));
  await rm(root, { force: true, recursive: true, maxRetries: 8, retryDelay: 150 });
}
