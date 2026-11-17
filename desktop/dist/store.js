"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settings = settings;
exports.saveSettings = saveSettings;
exports.rememberInstance = rememberInstance;
exports.forgetInstance = forgetInstance;
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const defaults = {
    current: null,
    instances: [],
    window: { width: 1280, height: 800, maximized: false },
    openAtLogin: false,
    closeToTray: true,
};
let cache = null;
const settingsFile = () => (0, node_path_1.join)(electron_1.app.getPath("userData"), "settings.json");
function settings() {
    if (cache)
        return cache;
    try {
        const stored = JSON.parse((0, node_fs_1.readFileSync)(settingsFile(), "utf8"));
        cache = { ...defaults, ...stored, window: { ...defaults.window, ...stored.window }, instances: Array.isArray(stored.instances) ? stored.instances : [] };
    }
    catch {
        cache = structuredClone(defaults);
    }
    return cache;
}
function saveSettings(patch) {
    cache = { ...settings(), ...patch };
    const file = settingsFile();
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(file), { recursive: true });
    (0, node_fs_1.writeFileSync)(`${file}.tmp`, JSON.stringify(cache, null, 4));
    (0, node_fs_1.renameSync)(`${file}.tmp`, file);
}
function rememberInstance(instance) {
    const others = settings().instances.filter((saved) => saved.url !== instance.url);
    saveSettings({ current: instance.url, instances: [{ ...instance, lastUsed: Date.now() }, ...others] });
}
function forgetInstance(url) {
    const instances = settings().instances.filter((saved) => saved.url !== url);
    saveSettings({ instances, current: settings().current === url ? null : settings().current });
}
