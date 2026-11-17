// src/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("discordOss", {
  state: () => import_electron.ipcRenderer.invoke("discord-oss:state"),
  discover: (input) => import_electron.ipcRenderer.invoke("discord-oss:discover", input),
  switchTo: (instance) => import_electron.ipcRenderer.invoke("discord-oss:switch", instance),
  forget: (url) => import_electron.ipcRenderer.invoke("discord-oss:forget", url),
  close: () => import_electron.ipcRenderer.send("discord-oss:close")
});
