// src/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("librecord", {
  state: () => import_electron.ipcRenderer.invoke("librecord:state"),
  discover: (input) => import_electron.ipcRenderer.invoke("librecord:discover", input),
  switchTo: (instance) => import_electron.ipcRenderer.invoke("librecord:switch", instance),
  forget: (url) => import_electron.ipcRenderer.invoke("librecord:forget", url),
  close: () => import_electron.ipcRenderer.send("librecord:close")
});
