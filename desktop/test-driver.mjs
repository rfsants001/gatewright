import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export function createDesktopDriver({ root, project, cli }) {
  const windows = process.platform === "win32";
  let current;

  async function launch() {
    const userData = await mkdtemp(join(root, "electron-"));
    const child = spawn(
      process.execPath,
      [cli, "desktop", project, `--user-data-dir=${userData}`, "--remote-debugging-port=0"],
      {
        detached: !windows,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GATEWRIGHT_HOME: root, GATEWRIGHT_PROJECTS: join(root, "projects.json") },
      },
    );
    const state = { child, output: "", requests: new Map(), socket: null };
    current = state;
    child.on("error", (error) => {
      state.output += error.message;
    });
    const collect = (chunk) => {
      state.output = (state.output + chunk).slice(-32768);
    };
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
      const result = await state.call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
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
      if (windows)
        execFileSync("taskkill.exe", ["/pid", String(state.child.pid), "/t", "/f"], { stdio: "ignore" });
      else process.kill(-state.child.pid, "SIGTERM");
      await exited;
    }
  }

  return {
    launch,
    close,
    get output() {
      return current?.output;
    },
  };
}
