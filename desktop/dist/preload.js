"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
if (location.protocol === "file:") {
    electron_1.contextBridge.exposeInMainWorld("discordOss", {
        platform: process.platform,
        listInstances: () => electron_1.ipcRenderer.invoke("switcher:list"),
        discoverInstance: (url) => electron_1.ipcRenderer.invoke("switcher:discover", url),
        openInstance: (url) => electron_1.ipcRenderer.invoke("switcher:open", url),
        removeInstance: (url) => electron_1.ipcRenderer.invoke("switcher:remove", url),
        onError: (listener) => electron_1.ipcRenderer.on("switcher:error", (_event, message) => listener(message)),
        screenSources: () => electron_1.ipcRenderer.invoke("picker:sources"),
        chooseScreenSource: (id, audio) => electron_1.ipcRenderer.send("picker:choose", id, audio),
    });
}
else {
    let linuxAudioUses = 0;
    electron_1.contextBridge.exposeInMainWorld("DiscordOSS", {
        platform: process.platform,
        focusWindow: () => electron_1.ipcRenderer.send("app:focus"),
        openInstanceSwitcher: () => electron_1.ipcRenderer.send("app:switcher"),
        music: {
            sources: ["spotify"],
            watch: (sources) => electron_1.ipcRenderer.send("music:watch", { spotify: sources?.spotify === true }),
            onTracks: (listener) => {
                const handler = (_event, tracks) => listener(tracks);
                electron_1.ipcRenderer.on("music:tracks", handler);
                return () => {
                    electron_1.ipcRenderer.off("music:tracks", handler);
                };
            },
        },
        games: {
            watch: (options) => electron_1.ipcRenderer.send("games:watch", options ? { overrides: Array.isArray(options.overrides) ? options.overrides : [], candidates: options.candidates === true } : null),
            onUpdate: (listener) => {
                const handler = (_event, update) => listener(update);
                electron_1.ipcRenderer.on("games:update", handler);
                return () => {
                    electron_1.ipcRenderer.off("games:update", handler);
                };
            },
        },
        rpc: {
            watch: () => electron_1.ipcRenderer.send("rpc:watch"),
            onActivity: (listener) => {
                const handler = (_e, data) => listener(data);
                electron_1.ipcRenderer.on("rpc:activity", handler);
                return () => {
                    electron_1.ipcRenderer.off("rpc:activity", handler);
                };
            },
        },
        linuxAudio: {
            start: async () => {
                const started = await electron_1.ipcRenderer.invoke("linuxaudio:start");
                if (started)
                    linuxAudioUses++;
                return started;
            },
            stop: () => {
                if (linuxAudioUses > 0) {
                    linuxAudioUses--;
                    electron_1.ipcRenderer.send("linuxaudio:stop");
                }
            },
        },
    });
    window.addEventListener("beforeunload", () => {
        while (linuxAudioUses > 0) {
            linuxAudioUses--;
            electron_1.ipcRenderer.send("linuxaudio:stop");
        }
    });
    electron_1.webFrame.executeJavaScript(`(() => {
            const Native = window.Notification;
            if (!Native) return;
            class AppNotification extends Native {
                constructor(title, options) {
                    super(title, options);
                    this.addEventListener("click", () => window.DiscordOSS.focusWindow());
                }
            }
            Object.defineProperty(AppNotification, "permission", { get: () => Native.permission });
            AppNotification.requestPermission = Native.requestPermission.bind(Native);
            window.Notification = AppNotification;
        })();`);
}
