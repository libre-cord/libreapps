"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGameListLoader = createGameListLoader;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const electron_1 = require("electron");
const game_match_1 = require("./game-match");
const REFRESH_MS = 12 * 3_600_000;
const RETRY_MS = 10 * 60_000;
async function listUrl(origin, platform) {
    const response = await electron_1.net.fetch(`${origin}/.well-known/discord-oss`, { headers: { accept: "application/json" } });
    const body = response.ok ? (await response.json().catch(() => null)) : null;
    const api = body?.api?.url ? new URL(body.api.url) : new URL("/api", origin);
    const version = /^\d+$/.test(body?.api?.default_version ?? "") ? body?.api?.default_version : "9";
    return `${api.origin}${api.pathname.replace(/\/$/, "")}/v${version}/games/detectable/executables?os=${platform}`;
}
async function readCache(file) {
    try {
        const cached = JSON.parse(await (0, promises_1.readFile)(file, "utf8"));
        return Array.isArray(cached?.list) && typeof cached.fetchedAt === "number" ? cached : null;
    }
    catch {
        return null;
    }
}
function createGameListLoader(platform) {
    const indexes = new Map();
    async function load(origin) {
        const folder = (0, node_path_1.join)(electron_1.app.getPath("userData"), "games");
        const file = (0, node_path_1.join)(folder, `${(0, node_crypto_1.createHash)("sha1").update(origin).digest("hex").slice(0, 16)}-${platform}.json`);
        const cached = await readCache(file);
        if (cached && Date.now() - cached.fetchedAt < REFRESH_MS)
            return (0, game_match_1.buildGameIndex)(cached.list, platform);
        try {
            const response = await electron_1.net.fetch(await listUrl(origin, platform), { headers: cached?.etag ? { "if-none-match": cached.etag } : {} });
            if (response.status === 304 && cached) {
                await (0, promises_1.writeFile)(file, JSON.stringify({ ...cached, fetchedAt: Date.now() })).catch(() => { });
                return (0, game_match_1.buildGameIndex)(cached.list, platform);
            }
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const list = (await response.json());
            if (!Array.isArray(list))
                throw new Error("not a list");
            await (0, promises_1.mkdir)(folder, { recursive: true });
            await (0, promises_1.writeFile)(file, JSON.stringify({ etag: response.headers.get("etag"), fetchedAt: Date.now(), list })).catch(() => { });
            return (0, game_match_1.buildGameIndex)(list, platform);
        }
        catch {
            return cached ? (0, game_match_1.buildGameIndex)(cached.list, platform) : null;
        }
    }
    return {
        load(origin) {
            const current = indexes.get(origin);
            if (current && current.expires > Date.now())
                return current.index;
            const index = load(origin);
            const entry = { index, expires: Date.now() + REFRESH_MS };
            indexes.set(origin, entry);
            index.then((result) => {
                if (!result)
                    entry.expires = Date.now() + RETRY_MS;
            });
            return index;
        },
    };
}
