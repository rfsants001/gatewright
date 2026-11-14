const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gatewright", {
  request: (method, params) => ipcRenderer.invoke("gate:request", method, params),
  chooseFolder: () => ipcRenderer.invoke("gate:folder"),
  initialProject: () => ipcRenderer.invoke("gate:initial-project"),
  onEvent(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("gate:state", listener);
    return () => ipcRenderer.removeListener("gate:state", listener);
  },
});
