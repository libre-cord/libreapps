import { app } from "electron";
import { basename } from "node:path";

// venmic is a PipeWire-only native addon, so it is loaded lazily and only on Linux.
// A failed load (missing prebuild, no PipeWire) just means "no desktop audio".
interface PatchBayLike {
    link(data: {
        include?: Record<string, string>[];
        exclude?: Record<string, string>[];
        ignore_devices?: boolean;
        only_speakers?: boolean;
        only_default_speakers?: boolean;
    }): boolean;
    unlink(): void;
}

let bay: PatchBayLike | null | undefined;

function patchbay(): PatchBayLike | null {
    if (bay !== undefined) return bay;
    bay = null;
    if (process.platform !== "linux") return bay;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const venmic = require("@vencord/venmic") as { PatchBay: { new (): PatchBayLike; hasPipeWire(): boolean } };
        if (venmic.PatchBay.hasPipeWire()) bay = new venmic.PatchBay();
    } catch (error) {
        console.error("venmic unavailable, screenshare audio is off:", error);
    }
    return bay;
}

export const linuxAudioSupported = () => patchbay() !== null;

// Routes everything the desktop plays to the virtual microphone "vencord-screen-share",
// except this app itself, so the call you are in does not echo back to your viewers.
export function linkDesktopAudio(): boolean {
    const patch = patchbay();
    if (!patch) return false;
    try {
        return patch.link({
            exclude: [{ "application.process.binary": basename(process.execPath) }, { "application.name": app.getName() }],
            ignore_devices: true,
            only_speakers: true,
            only_default_speakers: true,
        });
    } catch (error) {
        console.error("venmic link failed:", error);
        return false;
    }
}

export function unlinkDesktopAudio() {
    try {
        bay?.unlink();
    } catch {}
}

app.on("before-quit", unlinkDesktopAudio);
