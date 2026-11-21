import { createDesktopDriver } from "./test-driver.mjs";
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
const driver = createDesktopDriver({ root, project, cli });
const { launch, close } = driver;

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
  if (driver.output) process.stderr.write(driver.output);
  throw error;
} finally {
  await close();
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
