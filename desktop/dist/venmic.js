"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linuxAudioSupported = void 0;
exports.linkDesktopAudio = linkDesktopAudio;
exports.unlinkDesktopAudio = unlinkDesktopAudio;
const electron_1 = require("electron");
const node_path_1 = require("node:path");
let bay;
function patchbay() {
    if (bay !== undefined)
        return bay;
    bay = null;
    if (process.platform !== "linux")
        return bay;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const venmic = require("@vencord/venmic");
        if (venmic.PatchBay.hasPipeWire())
            bay = new venmic.PatchBay();
    }
    catch (error) {
        console.error("venmic unavailable, screenshare audio is off:", error);
    }
    return bay;
}
const linuxAudioSupported = () => patchbay() !== null;
exports.linuxAudioSupported = linuxAudioSupported;
// Routes everything the desktop plays to the virtual microphone "vencord-screen-share",
// except this app itself, so the call you are in does not echo back to your viewers.
function linkDesktopAudio() {
    const patch = patchbay();
    if (!patch)
        return false;
    try {
        return patch.link({
            exclude: [{ "application.process.binary": (0, node_path_1.basename)(process.execPath) }, { "application.name": electron_1.app.getName() }],
            ignore_devices: true,
            only_speakers: true,
            only_default_speakers: true,
        });
    }
    catch (error) {
        console.error("venmic link failed:", error);
        return false;
    }
}
function unlinkDesktopAudio() {
    try {
        bay?.unlink();
    }
    catch { }
}
electron_1.app.on("before-quit", unlinkDesktopAudio);
