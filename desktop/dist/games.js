"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGames = registerGames;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const electron_1 = require("electron");
const game_list_1 = require("./game-list");
const game_match_1 = require("./game-match");
const game_processes_1 = require("./game-processes");
const PLATFORMS = ["darwin", "win32", "linux"];
function ownInstallPath() {
    const exe = electron_1.app.getPath("exe");
    if (process.platform !== "darwin")
        return (0, node_path_1.dirname)(exe);
    const bundle = exe.indexOf(".app/");
    return bundle >= 0 ? exe.slice(0, bundle + 4) : (0, node_path_1.dirname)(exe);
}
function registerGames({ allowed }) {
    const platform = PLATFORMS.includes(process.platform) ? process.platform : null;
    const processWatcher = platform ? (0, game_processes_1.createProcessWatcher)() : null;
    const loader = platform ? (0, game_list_1.createGameListLoader)(platform) : null;
    const watchers = new Map();
    const hooked = new WeakSet();
    const indexes = new Map();
    let processes = [];
    let running = false;
    const publish = () => {
        if (!platform)
            return;
        for (const [contents, watcher] of watchers) {
            if (contents.isDestroyed()) {
                forget(contents);
                continue;
            }
            const index = indexes.get(watcher.origin);
            if (!index)
                continue;
            const games = (0, game_match_1.matchGames)(processes, index, platform, watcher.overrides);
            const candidates = watcher.candidates ? (0, game_match_1.listCandidates)(processes, games, platform, { home: (0, node_os_1.homedir)(), ignore: [ownInstallPath()], index }) : [];
            if (watcher.sent && (0, game_match_1.sameGames)(watcher.sent.games, games) && (0, game_match_1.sameGames)(watcher.sent.candidates, candidates))
                continue;
            watcher.sent = { games, candidates };
            contents.send("games:update", watcher.sent);
        }
    };
    const update = () => {
        if (!processWatcher)
            return;
        const ready = [...watchers.values()].map((watcher) => indexes.get(watcher.origin)).filter((index) => !!index);
        if (ready.length) {
            running = true;
            processWatcher.start(new Set(ready.flatMap((index) => [...index.argumentNames])), (next) => {
                processes = next;
                publish();
            });
        }
        else if (running) {
            running = false;
            processWatcher.stop();
            processes = [];
        }
    };
    const forget = (contents) => {
        watchers.delete(contents);
        update();
    };
    const hook = (contents) => {
        if (hooked.has(contents))
            return;
        hooked.add(contents);
        contents.once("destroyed", () => forget(contents));
        contents.on("did-start-navigation", (details) => {
            if (details.isMainFrame && !details.isSameDocument)
                forget(contents);
        });
    };
    const loadIndex = (origin) => {
        loader?.load(origin).then((index) => {
            if (!index || indexes.get(origin) === index)
                return;
            indexes.set(origin, index);
            update();
            publish();
        });
    };
    electron_1.ipcMain.on("games:watch", (event, input) => {
        const url = event.senderFrame?.url;
        if (!platform || !allowed(url))
            return;
        const contents = event.sender;
        if (!input || typeof input !== "object") {
            forget(contents);
            return;
        }
        const request = input;
        const origin = new URL(url).origin;
        const previous = watchers.get(contents);
        const candidates = request.candidates === true;
        watchers.set(contents, { origin, overrides: (0, game_match_1.cleanOverrides)(request.overrides), candidates, sent: previous?.origin === origin ? previous.sent : undefined });
        hook(contents);
        loadIndex(origin);
        update();
        if (candidates && !previous?.candidates)
            processWatcher?.scanNow();
        publish();
    });
    return {
        stop() {
            processWatcher?.stop();
            running = false;
        },
    };
}
