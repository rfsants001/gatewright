import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from "electron";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [node, gate, initialProject] = process.argv.slice(2);
const renderer = fileURLToPath(new URL("./renderer/index.html", import.meta.url));
const rendererUrl = pathToFileURL(renderer).href;
const methods = new Set([
  "projects", "open", "snapshot", "terminal.preview", "terminal.apply", "provider.save",
  "skill.save", "agent.preview", "agent.save", "agent.update", "agent.delete",
  "skills.list", "skills.detail", "integration.test", "integration.operation.get",
  "customize.propose", "customize.apply", "run", "cancel", "review", "review.decide",
  "flow.start", "flow.answer", "flow.stop", "flow.resume",
]);

class Bridge {
  #child;
  #pending = new Map();
  #nextId = 0;
  #busy = false;
  #flow = false;
  #closed = false;

  constructor(window) {
    this.#child = spawn(node, [gate, "bridge"], {
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
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
    return [...this.#pending.values()].some(({ method }) => method === "customize.apply");
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

if (!node || !gate) throw new Error("Inicie o aplicativo com gate desktop.");

app.setName("Gatewright");
nativeTheme.themeSource = "dark";

let window;
let bridge;
let closeDialog = false;

function trustedSender(event) {
  return window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === rendererUrl;
}

ipcMain.handle("gate:request", (event, method, params) => {
  if (!trustedSender(event) || !methods.has(method)) return { error: "Ação indisponível." };
  return bridge.request(method, params);
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
  bridge = new Bridge(window);
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
