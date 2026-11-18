import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("librecord", {
    state: () => ipcRenderer.invoke("librecord:state"),
    discover: (input: string) => ipcRenderer.invoke("librecord:discover", input),
    switchTo: (instance: { url: string; name: string } | null) => ipcRenderer.invoke("librecord:switch", instance),
    forget: (url: string) => ipcRenderer.invoke("librecord:forget", url),
    close: () => ipcRenderer.send("librecord:close"),
});
