"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMusic = registerMusic;
const electron_1 = require("electron");
const media_session_1 = require("./media-session");
const music_tracks_1 = require("./music-tracks");
const SOURCES = ["spotify"];
function registerMusic({ allowed }) {
    const watchers = new Map();
    const sent = new Map();
    const hooked = new WeakSet();
    const reader = (0, media_session_1.createMediaSessionReader)();
    let readerRunning = false;
    let systemTracks = [];
    const wants = (source) => [...watchers.values()].some((watch) => watch[source]);
    const current = () => ({
        spotify: systemTracks.find((track) => track.source === "spotify"),
    });
    const publish = (force = false) => {
        const tracks = current();
        for (const [contents, watch] of watchers) {
            if (contents.isDestroyed()) {
                forget(contents);
                continue;
            }
            const previous = sent.get(contents) ?? {};
            const next = Object.fromEntries(SOURCES.filter((source) => watch[source] && tracks[source]).map((source) => [source, tracks[source]]));
            if (!force && !SOURCES.some((source) => (0, music_tracks_1.trackChanged)(previous[source], next[source])))
                continue;
            sent.set(contents, next);
            contents.send("music:tracks", Object.values(next));
        }
    };
    const updateReader = () => {
        if (!reader)
            return;
        const needed = wants("spotify");
        if (needed && !readerRunning) {
            readerRunning = true;
            reader.start((tracks) => {
                systemTracks = tracks;
                publish();
            });
        }
        else if (!needed && readerRunning) {
            readerRunning = false;
            reader.stop();
            systemTracks = [];
        }
    };
    const forget = (contents) => {
        watchers.delete(contents);
        sent.delete(contents);
        updateReader();
    };
    electron_1.ipcMain.on("music:watch", (event, input) => {
        if (!allowed(event.senderFrame?.url))
            return;
        const contents = event.sender;
        const request = (input && typeof input === "object" ? input : {});
        const watch = { spotify: request.spotify === true };
        if (!watch.spotify) {
            forget(contents);
            return;
        }
        if (!hooked.has(contents)) {
            hooked.add(contents);
            contents.once("destroyed", () => forget(contents));
            contents.on("did-start-navigation", (details) => {
                if (details.isMainFrame && !details.isSameDocument)
                    forget(contents);
            });
        }
        watchers.set(contents, watch);
        sent.delete(contents);
        updateReader();
        publish(true);
    });
    return {
        stop() {
            reader?.stop();
            readerRunning = false;
        },
    };
}
