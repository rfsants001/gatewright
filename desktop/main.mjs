import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// In dev (not packaged): launched by `gate desktop` → process.argv = [node, gate, initialProject?]
// In packaged app: resolve node/gate from the app bundle; initialProject comes from a future launcher integration.
const renderer = fileURLToPath(new URL("./renderer/index.html", import.meta.url));
const rendererUrl = pathToFileURL(renderer).href;
const methods = new Set([
  "projects", "open", "snapshot", "terminal.preview", "terminal.apply", "terminal.test", "provider.save",
  "skill.save", "agent.preview", "agent.save", "agent.update", "agent.delete",
  "skills.list", "skills.detail", "integration.test", "integration.operation.get", "integration.operation.inspect", "integration.operation.recover",
  "customize.propose", "customize.apply", "run", "cancel", "review", "review.decide",
  "flow.start", "flow.answer", "flow.stop", "flow.resume",
  "usage.get", "projectMap.get", "projectMap.refresh", "projectMap.openFile", "pending.list", "pending.open", "memory.list", "memory.upsert", "memory.delete", "memory.resolve", "run.detail", "run.list",
]);

class Bridge {
  #child;
  #pending = new Map();
  #nextId = 0;
  #busy = false;
  #flow = false;
  #closed = false;

  constructor(window, node, gate) {
    this.#child = spawn(node, [gate, "bridge"], {
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
      env: app.isPackaged ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" } : process.env,
    });
    this.#child.stdin.on("error", () => this.#disconnect(window));
    this.#child.on("error", () => this.#disconnect(window));
    this.#child.on("close", () => this.#disconnect(window));
    const input = createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    input.on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if ("id" in message) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (pending.method === "flow.start" && message.error) this.#flow = false;
        // P3-001: treat a restored flow as live work so busy() and close guard protect it.
        if (pending.method === "open" && message.result?.resumableFlow) this.#flow = true;
        pending.resolve(message);
        return;
      }
      if (message.event === "run.state") this.#busy = message.data === "RUNNING";
      if (message.event === "flow.done" || message.event === "flow.error") this.#flow = false;
      if (!window.isDestroyed()) window.webContents.send("gate:state", message);
    });
  }

  #disconnect(window) {
    if (this.#closed) return;
    this.#closed = true;
    this.#busy = this.#flow = false;
    for (const { resolve: reply } of this.#pending.values()) reply({ error: "O serviço local foi encerrado. Abra o Gatewright novamente." });
    this.#pending.clear();
    if (!window.isDestroyed()) window.webContents.send("gate:state", { event: "bridge.closed" });
  }

  get busy() {
    return this.#busy || this.#flow || this.installing
      || [...this.#pending.values()].some(({ method }) => method === "run" || method === "flow.start");
  }

  get installing() {
    return [...this.#pending.values()].some(({ method }) => method === "customize.apply" || method === "projectMap.refresh" || method === "integration.operation.recover");
  }

  request(method, params) {
    if (this.#closed) return Promise.resolve({ error: "O serviço local está indisponível." });
    if (method === "flow.start") this.#flow = true;
    const id = ++this.#nextId;
    return new Promise((reply) => {
      this.#pending.set(id, { resolve: reply, method });
      this.#child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  close() {
    this.#child.stdin.end();
  }
}

// Resolve node/gate depending on whether we're running packaged or in dev.
let node, gate, initialProject;
if (app.isPackaged) {
  // Packaged: use the Electron binary as node (via ELECTRON_RUN_AS_NODE) and the bundled gate.js.
  node = process.execPath;
  gate = fileURLToPath(new URL("../cli/gate.js", import.meta.url));
} else {
  // Dev (launched via `gate desktop`): argv = [execPath, gate.js, initialProject?]
  [node, gate, initialProject] = process.argv.slice(2);
  if (!node || !gate) throw new Error("Inicie o aplicativo com gate desktop.");
}

app.setName("Gatewright");
nativeTheme.themeSource = "dark";

let window;
let bridge;
let closeDialog = false;

function trustedSender(event) {
  return window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === rendererUrl;
}

ipcMain.handle("gate:request", async (event, method, params) => {
  if (!trustedSender(event) || !methods.has(method)) return { error: "Ação indisponível." };
  const reply = await bridge.request(method, params);
  if (method === "projectMap.openFile" && params?.reveal === true && reply?.result?.file) shell.showItemInFolder(reply.result.file);
  return reply;
});
ipcMain.handle("gate:folder", async (event) => {
  if (!trustedSender(event)) return null;
  const result = await dialog.showOpenDialog(window, { title: "Abrir pasta de projeto", properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle("gate:initial-project", (event) => trustedSender(event) && initialProject ? resolve(initialProject) : null);

function createWindow() {
  window = new BrowserWindow({
    title: "Gatewright",
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 570,
    backgroundColor: "#101014",
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  bridge = new Bridge(window, node, gate);
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.on("close", (event) => {
    if (!bridge.busy) return;
    event.preventDefault();
    if (closeDialog) return;
    closeDialog = true;
    void dialog.showMessageBox(window, bridge.installing ? {
      type: "info", title: "Integração em andamento", message: "Aguarde o fim da aplicação antes de fechar.",
      buttons: ["Voltar à integração"],
    } : {
      type: "info", title: "Execução em andamento", message: "Aguarde ou cancele a execução antes de fechar.",
      buttons: ["Voltar à execução"],
    }).finally(() => { closeDialog = false; });
  });
  window.on("closed", () => { bridge.close(); window = undefined; });
  window.once("ready-to-show", () => window.show());
  void window.loadFile(renderer).catch((error) => {
    console.error(error.message);
    app.exit(1);
  });
}

// Let the ESM entrypoint finish evaluating before Electron emits ready.
void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!window) createWindow(); });
