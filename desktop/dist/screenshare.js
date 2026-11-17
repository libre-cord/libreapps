"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenshareFeatureFlags = exports.systemAudioSupported = void 0;
exports.registerScreenshare = registerScreenshare;
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const venmic_1 = require("./venmic");
const macMajorVersion = () => (process.platform === "darwin" ? Number(process.getSystemVersion().split(".")[0]) : 0);
const systemAudioSupported = () => process.platform === "win32" || macMajorVersion() >= 13;
exports.systemAudioSupported = systemAudioSupported;
const screenshareFeatureFlags = () => (process.platform === "darwin" ? ["MacLoopbackAudioForScreenShare", "MacSckSystemAudioLoopbackOverride"] : []);
exports.screenshareFeatureFlags = screenshareFeatureFlags;
let sources = [];
let picker = null;
let settle = null;
let linuxAudioGrants = 0;
let linkedShares = 0;
const fromPicker = (url) => !!url && url.startsWith("file:") && url.includes("/static/picker.html");
function finish(choice) {
    const done = settle;
    settle = null;
    done?.(choice);
    if (picker && !picker.isDestroyed())
        picker.close();
    picker = null;
}
function choose(parent, preload, appRoot, audioRequested) {
    finish(null);
    return new Promise((resolve) => {
        settle = resolve;
        picker = new electron_1.BrowserWindow({
            parent,
            modal: process.platform !== "linux",
            width: 760,
            height: 560,
            minWidth: 520,
            minHeight: 400,
            title: "Share your screen",
            backgroundColor: "#1a1a1e",
            autoHideMenuBar: true,
            show: false,
            webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        picker.once("ready-to-show", () => picker?.show());
        picker.on("closed", () => {
            picker = null;
            if (settle)
                finish(null);
        });
        picker.loadFile((0, node_path_1.join)(appRoot, "static", "picker.html"), { query: { audio: audioRequested && ((0, exports.systemAudioSupported)() || (0, venmic_1.linuxAudioSupported)()) ? "1" : "0" } });
    });
}
function registerScreenshare(session, options) {
    electron_1.ipcMain.handle("linuxaudio:start", (event) => {
        if (!options.allowed(event.senderFrame?.url ?? "") || linuxAudioGrants === 0)
            return false;
        linuxAudioGrants--;
        if (linkedShares > 0 || (0, venmic_1.linkDesktopAudio)()) {
            linkedShares++;
            return true;
        }
        return false;
    });
    electron_1.ipcMain.on("linuxaudio:stop", (event) => {
        if (!options.allowed(event.senderFrame?.url ?? ""))
            return;
        if (linkedShares > 0 && --linkedShares === 0)
            (0, venmic_1.unlinkDesktopAudio)();
    });
    electron_1.ipcMain.handle("picker:sources", async (event) => {
        if (!fromPicker(event.senderFrame?.url))
            return [];
        sources = await electron_1.desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
        return sources.map((source) => ({
            id: source.id,
            name: source.name,
            kind: source.id.startsWith("screen:") ? "screen" : "window",
            thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
            icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
        }));
    });
    electron_1.ipcMain.on("picker:choose", (event, id, audio) => {
        if (!fromPicker(event.senderFrame?.url))
            return;
        finish(typeof id === "string" ? { id, audio: audio === true } : null);
    });
    session.setDisplayMediaRequestHandler((request, callback) => {
        const parent = options.parent();
        if (!parent || !options.allowed(request.securityOrigin))
            return callback({});
        choose(parent, options.preload, options.appRoot, request.audioRequested)
            .then((choice) => {
            linuxAudioGrants = 0;
            if (!!choice?.audio && !(0, exports.systemAudioSupported)() && (0, venmic_1.linuxAudioSupported)())
                linuxAudioGrants++;
            const source = choice && sources.find((candidate) => candidate.id === choice.id);
            if (!choice || !source)
                return callback({});
            callback(choice.audio && (0, exports.systemAudioSupported)() ? { video: source, audio: "loopback" } : { video: source });
        })
            .catch(() => callback({}));
    }, { useSystemPicker: macMajorVersion() >= 15 });
}
