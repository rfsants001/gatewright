import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopDriver } from "./test-driver.mjs";
import { openRunJournal, appendEngineEvent } from "../dist/core/engine/run-journal.js";
import { ControlStateMachine } from "../dist/core/control/control-state-machine.js";
import { startOperation, finishOperation } from "../dist/core/integrations/operations.js";

const root = await mkdtemp(join(tmpdir(), "gatewright-responsive-"));
const project = join(root, "plataforma de contratos e integracoes com nome de projeto extenso");
const cli = fileURLToPath(new URL("../dist/cli/gate.js", import.meta.url));
const driver = createDesktopDriver({ root, project, cli });
const sizes = [
  [1440, 960],
  [1120, 860],
  [1024, 768],
  [920, 700],
  [780, 580],
  [600, 480],
  [480, 640],
];
const screenshotArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const screenshotDir = screenshotArg ? resolve(screenshotArg) : null;
let app;
const failures = [];
let checks = 0;

// Local table, graph and code scrolling is intentional. The shell, forms,
// navigation and dialogs must fit without clipping or page-wide scrolling.
function layoutProblems() {
  const problems = [];
  const dialog = document.querySelector('dialog[open], .aside-overlay [role="dialog"]');
  const scope = dialog ?? document.querySelector("main");
  const name = (el) =>
    `${el.tagName.toLowerCase()}.${String(el.className).replaceAll(" ", ".").slice(0, 90)}`;
  const allowed = ".table-wrap,.map-viewport,.map-list,pre,.skill-picker,.transcript";
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push("document overflows horizontally");
  if (scope.scrollWidth > scope.clientWidth + 1) problems.push(`${name(scope)} overflows horizontally`);
  const elements = scope.querySelectorAll(
    ".surface,.form-grid,.panel-heading,.lib-toolbar,.memory-row,.attribution-bars,button,input,select,textarea",
  );
  for (const el of elements) {
    if (el.closest(allowed)) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const bounds = scope.getBoundingClientRect();
    if (rect.left < Math.max(0, bounds.left) - 1 || rect.right > Math.min(innerWidth, bounds.right) + 1)
      problems.push(`${name(el)} leaves content bounds`);
  }
  if (!dialog) {
    const header = document.querySelector(".app-header").getBoundingClientRect();
    for (const el of document.querySelectorAll(".brand,.app-nav button,.header-actions button")) {
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1 || r.bottom > header.bottom + 1)
        problems.push(`${name(el)} leaves header bounds`);
      if (el.matches(".app-nav button") && el.scrollWidth > el.clientWidth + 1)
        problems.push(`navigation label clipped: ${el.textContent}`);
    }
    if (document.querySelectorAll(".app-nav button").length !== 6)
      problems.push("navigation areas are missing");
    const main = document.querySelector("main");
    if (main.clientHeight < 180) problems.push("header/footer leave too little working space");
    main.scrollTop = main.scrollHeight;
    if (main.scrollTop + main.clientHeight < main.scrollHeight - 2)
      problems.push("cannot reach the bottom vertically");
    main.scrollTop = 0;
  } else {
    const r = dialog.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1)
      problems.push("dialog leaves viewport bounds");
    const scroller = dialog.querySelector(".drawer-content") ?? dialog;
    scroller.scrollTop = scroller.scrollHeight;
    if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2)
      problems.push("cannot reach dialog actions vertically");
    scroller.scrollTop = 0;
  }
  return [...new Set(problems)];
}
async function rpc(method, params) {
  const reply = await app.evaluate(
    `window.gatewright.request(${JSON.stringify(method)},${JSON.stringify({ cwd: project, ...params })})`,
  );
  if (reply.error) throw Error(reply.error);
  return reply.result;
}
async function check(name, width, height) {
  await app.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await app.evaluate(
    "document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))",
  );
  const issues = await app.evaluate(`(${layoutProblems.toString()})()`);
  const scrollAreas = await app.evaluate(
    `Array.from(document.querySelectorAll('.table-wrap,.map-viewport')).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => { el.scrollLeft = el.scrollWidth; const moved = el.scrollLeft > 0; el.scrollLeft = 0; return moved; })`,
  );
  if (scrollAreas.some((moved) => !moved)) issues.push("a local table/map cannot be scrolled");
  checks++;
  if (issues.length) failures.push({ name, width, height, issues });
  if (
    screenshotDir &&
    width === 780 &&
    ["tasks", "costs", "agents", "connections", "memory-editor"].includes(name)
  ) {
    await mkdir(screenshotDir, { recursive: true });
    const shot = await app.call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(screenshotDir, `${name}-780.png`), Buffer.from(shot.data, "base64"));
  }
}
try {
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "src", "contracts.ts"), "export const contract = 1;\n");
  const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
  git("init");
  git("config", "user.name", "Gatewright Fixture");
  git("config", "user.email", "fixture@gatewright.test");
  git("add", ".");
  git("commit", "-m", "fixture");
  await mkdir(join(project, "graphify-out"));
  await writeFile(
    join(project, "graphify-out", "graph.json"),
    JSON.stringify({
      graph: { schema_version: 1 },
      nodes: [
        {
          id: "contracts",
          label: "ContratosPublicosComNomeExtensoParaValidarOLayout",
          type: "module",
          source_file: "src/contracts.ts",
        },
      ],
      links: [],
    }),
  );
  const runId = `run-${randomUUID()}`,
    journal = openRunJournal(project, runId).journal;
  journal.append({
    type: "RUN_CONTEXT",
    at: new Date().toISOString(),
    payload: {
      prompt: "Revisar compatibilidade da plataforma e registrar evidencias verificaveis",
      engineId: "codex",
      model: "modelo-com-identificador-extenso-para-validacao",
      agentId: "reviewer",
      attributionSource: "run-start",
    },
  });
  appendEngineEvent(journal, { kind: "assistant", text: "Dados controlados do teste de layout." });
  appendEngineEvent(journal, {
    kind: "usage",
    usage: { tokensIn: 1200, tokensOut: 400, cacheRead: 200, costUsd: 0.04 },
  });
  const control = new ControlStateMachine(journal);
  control.transition("RUNNING");
  control.transition("PASSED");
  startOperation(project, {
    id: "layout-operation",
    revision: "fixture",
    recipeKind: "graphify",
    steps: [{ id: "install", label: "Conferir instalacao interrompida" }],
  });
  finishOperation(project, "layout-operation", "failed");
  app = await driver.launch();
  await rpc("skill.save", {
    skill: {
      kind: "skill",
      name: "revisao-de-contratos-e-compatibilidade-publica",
      description: "Revisar contratos publicos e suas dependencias",
      instructions: "Conferir compatibilidade e registrar as evidencias.",
    },
  });
  await rpc("agent.save", {
    agent: {
      id: "reviewer",
      name: "Equipe de revisao de compatibilidade e contratos publicos",
      goal: "Revisar contratos publicos e documentar as evidencias.",
      skills: ["revisao-de-contratos-e-compatibilidade-publica"],
      responsibilities: "https://example.com/" + "documentacao".repeat(20),
    },
  });
  await rpc("memory.upsert", {
    record: {
      version: 0,
      scope: "project",
      title: "Compatibilidade dos contratos publicos e integracoes",
      body: "Documentacao: https://example.com/" + "contratos".repeat(30),
      type: "decision",
      origin: "human",
      recipients: [],
    },
  });
  await app.evaluate("document.querySelector('[aria-label=\"Atualizar projeto\"]').click()");
  for (const [name, page, section, ready] of [
    ["project", "Projeto", "Resumo", ".host-table"],
    ["pending", "Projeto", "Pendências", ".pending-list"],
    ["memory", "Projeto", "Memória", ".memory-row"],
    ["map", "Projeto", "Mapa", ".map-node"],
    ["tasks", "Tarefas", null, ".execution-grid"],
    ["costs", "Custos", null, ".attribution-bars"],
    ["connections", "Integrações", null, ".settings-grid"],
    ["agents", "Agentes", null, ".agent-split"],
    ["skills", "Skills", null, ".lib-split"],
  ]) {
    await app.click(page, ".app-nav button");
    if (section) await app.click(section, ".project-sections button");
    await app.waitFor(`document.querySelector(${JSON.stringify(ready)}) !== null`);
    for (const [width, height] of sizes) await check(name, width, height);
  }
  for (const [name, page, section, action] of [
    ["memory-editor", "Projeto", "Memória", "Nova memória"],
    ["agent-editor", "Agentes", null, "Novo perfil"],
    ["task-detail", "Tarefas", null, "Ver tarefa"],
  ]) {
    await app.click(page, ".app-nav button");
    if (section) await app.click(section, ".project-sections button");
    await app.waitFor(
      `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(action)})`,
    );
    await app.click(action);
    await app.waitFor("document.querySelector('dialog[open],.aside-overlay [role=dialog]') !== null");
    for (const [width, height] of sizes) await check(name, width, height);
    await app.call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await app.waitFor("document.querySelector('dialog[open],.aside-overlay [role=dialog]') === null");
  }
  if (screenshotDir)
    await writeFile(join(screenshotDir, "report.json"), JSON.stringify({ checks, sizes, failures }, null, 2));
  console.log(JSON.stringify({ checks, failures }, null, 2));
  if (!process.argv.includes("--report-only"))
    assert.equal(
      failures.length,
      0,
      "Responsive layouts must fit while preserving local table/map scrolling.",
    );
} catch (error) {
  if (driver.output) process.stderr.write(driver.output);
  throw error;
} finally {
  await driver.close();
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
