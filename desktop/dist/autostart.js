"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startedHidden = exports.HIDDEN_FLAG = void 0;
exports.setOpenAtLogin = setOpenAtLogin;
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
exports.HIDDEN_FLAG = "--hidden";
const linuxAutostartFile = () => (0, node_path_1.join)(process.env.XDG_CONFIG_HOME || (0, node_path_1.join)((0, node_os_1.homedir)(), ".config"), "autostart", "discord-oss.desktop");
const linuxExecutable = () => process.env.APPIMAGE || process.execPath;
function setOpenAtLogin(enabled) {
    if (process.platform === "linux") {
        const file = linuxAutostartFile();
        if (!enabled)
            return (0, node_fs_1.rmSync)(file, { force: true });
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(file, ".."), { recursive: true });
        (0, node_fs_1.writeFileSync)(file, [
            "[Desktop Entry]",
            "Type=Application",
            "Name=Discord OSS",
            `Exec="${linuxExecutable()}" ${exports.HIDDEN_FLAG}`,
            "Icon=discord-oss",
            "X-GNOME-Autostart-enabled=true",
            "",
        ].join("\n"));
        return;
    }
    electron_1.app.setLoginItemSettings({ openAtLogin: enabled, args: [exports.HIDDEN_FLAG] });
}
const startedHidden = () => process.argv.includes(exports.HIDDEN_FLAG) || (process.platform === "darwin" && electron_1.app.getLoginItemSettings().wasOpenedAtLogin);
exports.startedHidden = startedHidden;
