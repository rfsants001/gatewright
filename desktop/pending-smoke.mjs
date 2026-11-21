import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { openRunJournal } from "../dist/core/engine/run-journal.js";
import { ControlStateMachine } from "../dist/core/control/control-state-machine.js";
import { startOperation, finishOperation } from "../dist/core/integrations/operations.js";
import { openFlowJournal, appendStart, appendRun } from "../dist/core/flow/flow-journal.js";
import { buildSddFlow } from "../dist/core/flow/sdd-flow.js";

const root = await mkdtemp(join(tmpdir(), "gatewright-pending-smoke-"));
const project = join(root, "projeto de teste");
const screenshotDir = process.argv[2] ? resolve(process.argv[2]) : null;
const cli = fileURLToPath(new URL("../dist/cli/gate.js", import.meta.url));
const windows = process.platform === "win32";
let current;

async function launch() {
  const userData = await mkdtemp(join(root, "electron-"));
  const child = spawn(process.execPath, [cli, "desktop", project,
    `--user-data-dir=${userData}`, "--remote-debugging-port=0"], {
    detached: !windows,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GATEWRIGHT_HOME: root, GATEWRIGHT_PROJECTS: join(root, "projects.json") },
  });
  const state = { child, output: "", requests: new Map(), socket: null };
  current = state;
  child.on("error", (error) => { state.output += error.message; });
  const collect = (chunk) => { state.output = (state.output + chunk).slice(-32768); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const deadline = Date.now() + 20000;
  let address;
  while (!address && Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) throw new Error(state.output);
    address = /DevTools listening on (ws:\/\/[^\s]+)/.exec(state.output)?.[1];
    if (!address) await delay(50);
  }
  assert(address, "Electron não publicou a conexão de diagnóstico.");
  const socket = new WebSocket(address);
  state.socket = socket;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const pending = state.requests.get(message.id);
    if (!pending) return;
    state.requests.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        state.requests.delete(id);
        reject(new Error(`Timeout no comando ${method}`));
      }, 12000);
      state.requests.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  let target;
  while (!target && Date.now() < deadline) {
    const targets = await call("Target.getTargets");
    target = targets.targetInfos.find((item) => item.type === "page" && item.url.startsWith("file:"));
    if (!target) await delay(50);
  }
  assert(target, "A janela do Gatewright não foi encontrada.");
  const { sessionId } = await call("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  state.call = (method, params) => call(method, params, sessionId);
  state.evaluate = async (expression) => {
    const result = await state.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  state.waitFor = async (expression) => {
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      if (await state.evaluate(expression)) return;
      await delay(50);
    }
    throw new Error(`Condição não observada: ${expression}`);
  };
  state.click = async (label, selector = "button") => {
    const found = await state.evaluate(`(() => {
      const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    assert(found, `Ação indisponível: ${label}`);
    await delay(50);
  };
  await state.call("Runtime.enable");
  await state.waitFor("document.querySelector('.project-path') !== null");
  return state;
}

async function close() {
  if (!current) return;
  const state = current;
  current = null;
  for (const pending of state.requests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Validação encerrada."));
  }
  state.socket?.close();
  if (state.child.exitCode === null && !state.child.signalCode) {
    const exited = new Promise((resolve) => state.child.once("exit", resolve));
    if (windows) execFileSync("taskkill.exe", ["/pid", String(state.child.pid), "/t", "/f"], { stdio: "ignore" });
    else process.kill(-state.child.pid, "SIGTERM");
    await exited;
  }
}

try {
  await mkdir(project);
  const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
  git("init");
  git("config", "user.name", "Gatewright Fixture");
  git("config", "user.email", "fixture@gatewright.test");
  await writeFile(join(project, "catalog.txt"), "Initial catalog\n");
  git("add", "catalog.txt");
  git("commit", "-m", "fixture");
  await writeFile(join(project, "catalog.txt"), "Changed catalog\n");
  const runId = `run-${randomUUID()}`;
  const journal = openRunJournal(project, runId).journal;
  journal.append({ type: "ENGINE_EVENT", at: new Date().toISOString(), payload: { kind: "assistant", text: "Fixture output" } });
  const control = new ControlStateMachine(journal);
  control.transition("RUNNING");
  control.transition("PASSED");
  const operationId = randomUUID();
  startOperation(project, { id: operationId, revision: "fixture", recipeKind: "graphify", steps: [{ id: "install", label: "Instalar o pacote" }] });
  finishOperation(project, operationId, "failed");

  let app = await launch();
  await app.click("Pendências", ".project-sections button");
  await app.waitFor("document.querySelectorAll('.pending-list li').length === 2");
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    const shot = await app.call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(screenshotDir, "pending-overview.png"), Buffer.from(shot.data, "base64"));
  }
  await app.click("Aprovações1", ".pending-filters button");
  assert.equal(await app.evaluate("document.querySelectorAll('.pending-list li').length"), 1);
  await app.click("Abrir revisão");
  await app.waitFor("document.querySelector('dialog[open]') !== null");
  await writeFile(join(project, "catalog.txt"), "Updated after review opened\n");
  await app.click("Aprovar revisão");
  await app.waitFor("document.querySelector('dialog .form-error') !== null");
  await app.click("Reabrir diff");
  await app.click("Aprovar revisão");
  await app.waitFor("document.querySelector('dialog[open]') === null");
  await app.waitFor("document.querySelector('.pending-empty') !== null");
  await app.click("Conexões1", ".pending-filters button");
  await app.click("Ver diagnóstico");
  await app.waitFor("document.querySelector('.operation-details') !== null");
  assert(await app.evaluate(`document.querySelector('.operation-details').textContent.includes(${JSON.stringify(operationId)})`));
  await app.click("Projeto", ".app-nav button");
  await app.click("Todas1", ".pending-filters button");
  await app.call("Emulation.setDeviceMetricsOverride", { width: 780, height: 580, deviceScaleFactor: 1, mobile: false });
  assert(await app.evaluate("document.documentElement.scrollWidth <= innerWidth"));
  assert(await app.evaluate("(() => { const main = document.querySelector('main'); main.scrollTop = main.scrollHeight; return main.scrollTop + main.clientHeight >= main.scrollHeight - 2; })()"));
  await app.call("Emulation.setDeviceMetricsOverride", { width: 1240, height: 820, deviceScaleFactor: 1, mobile: false });
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    const shot = await app.call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(screenshotDir, "pending-electron.png"), Buffer.from(shot.data, "base64"));
  }
  await close();

  const flowJournal = openFlowJournal(project);
  appendStart(flowJournal, { goal: "Verify the catalog", flowKind: "sdd", engineId: "claude-code" });
  const plan = buildSddFlow().find((step) => step.kind === "run");
  appendRun(flowJournal, { stepId: plan.id, runId, output: '<gate-ask>[{"id":"approve","type":"confirm","prompt":"Aprovar plano?"}]</gate-ask>' });
  app = await launch();
  await app.waitFor("document.querySelector('dialog[open] #flow-title') !== null");
  assert(await app.evaluate("document.querySelector('dialog[open]').textContent.includes('Aprovar plano?')"));
  await app.click("Encerrar fluxo");
  await app.waitFor("document.querySelector('dialog[open]') === null");
  await close();

  appendStart(flowJournal, { goal: "Verify interrupted execution", flowKind: "sdd", engineId: "claude-code" });
  app = await launch();
  await app.waitFor("document.querySelector('dialog[open] #resumed-run-title') !== null");
  const before = JSON.parse(await readFile(join(project, ".gatewright", "flow-state.json"), "utf8"));
  await delay(300);
  const after = JSON.parse(await readFile(join(project, ".gatewright", "flow-state.json"), "utf8"));
  assert.equal(after.length, before.length, "Abrir a janela não deve executar uma etapa recuperada.");
  await app.click("Encerrar");
  await app.waitFor("document.querySelector('dialog[open]') === null");
  console.log("Electron: pendências, revisão vencida, diagnóstico, janela compacta e recuperação de Flow verificados.");
} catch (error) {
  if (current?.output) process.stderr.write(current.output);
  throw error;
} finally {
  await close();
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
