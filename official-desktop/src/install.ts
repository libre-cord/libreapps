import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import preloadSource from "../dist/preload-js.txt";
import switcherSource from "../dist/switcher-js.txt";
import switcherPage from "../dist/switcher-html.txt";
import { backendSettings, discoverInstance } from "./instances";

export const LOADER_LINE = 'try { require("./librecord_switcher/switcher.js"); } catch (error) { console.error("[librecord] switcher failed to load", error); }';
const LEGACY_LOADER_LINE = 'try { require("./discord_oss_switcher/switcher.js"); } catch (error) { console.error("[discord-oss] switcher failed to load", error); }';
const MODULE_FOLDER = "librecord_switcher";
const LEGACY_MODULE_FOLDER = "discord_oss_switcher";

export interface Channel {
    name: string;
    label: string;
    profile: string;
    windowsFolder: string;
}

export const CHANNELS: Channel[] = [
    { name: "stable", label: "Discord", profile: "discord", windowsFolder: "Discord" },
    { name: "ptb", label: "Discord PTB", profile: "discordptb", windowsFolder: "DiscordPTB" },
    { name: "canary", label: "Discord Canary", profile: "discordcanary", windowsFolder: "DiscordCanary" },
    { name: "development", label: "Discord Development", profile: "discorddevelopment", windowsFolder: "DiscordDevelopment" },
];

const list = (folder: string) => {
    try {
        return readdirSync(folder).sort();
    } catch {
        return [];
    }
};

export function profileFolder(channel: Channel, platform = process.platform, env = process.env, home = homedir()) {
    if (platform === "darwin") return join(home, "Library", "Application Support", channel.profile);
    if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), channel.profile);
    return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), channel.profile);
}

export function coreFolders(channel: Channel, platform = process.platform, env = process.env, home = homedir()) {
    const roots = platform === "win32" ? [join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), channel.windowsFolder)] : [profileFolder(channel, platform, env, home)];
    const found: string[] = [];
    for (const root of roots)
        for (const version of list(root)) {
            const modules = join(root, version, "modules");
            for (const entry of list(modules)) {
                if (!entry.startsWith("discord_desktop_core")) continue;
                for (const folder of [join(modules, entry, "discord_desktop_core"), join(modules, entry)])
                    if (existsSync(join(folder, "index.js")) && existsSync(join(folder, "core.asar"))) found.push(folder);
            }
        }
    return [...new Set(found)];
}

const withoutLines = (text: string, lines: string[]) =>
    text
        .split("\n")
        .filter((line) => !lines.some((each) => line.trim() === each))
        .join("\n");

export function patchedLoader(text: string) {
    const current = withoutLines(text, [LEGACY_LOADER_LINE]);
    if (current.includes(LOADER_LINE)) return current;
    return `${LOADER_LINE}\n${current}`;
}

export function unpatchedLoader(text: string) {
    return withoutLines(text, [LOADER_LINE, LEGACY_LOADER_LINE]);
}

const writeAtomically = (file: string, text: string) => {
    writeFileSync(`${file}.librecord-tmp`, text);
    renameSync(`${file}.librecord-tmp`, file);
};

export function install(folder: string) {
    const target = join(folder, MODULE_FOLDER);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "switcher.js"), switcherSource);
    writeFileSync(join(target, "preload.js"), preloadSource);
    writeFileSync(join(target, "switcher.html"), switcherPage);
    rmSync(join(folder, LEGACY_MODULE_FOLDER), { recursive: true, force: true });
    const loader = join(folder, "index.js");
    writeAtomically(loader, patchedLoader(readFileSync(loader, "utf8")));
}

export function uninstall(folder: string) {
    const loader = join(folder, "index.js");
    writeAtomically(loader, unpatchedLoader(readFileSync(loader, "utf8")));
    rmSync(join(folder, MODULE_FOLDER), { recursive: true, force: true });
    rmSync(join(folder, LEGACY_MODULE_FOLDER), { recursive: true, force: true });
}

export const isInstalled = (folder: string) => {
    const loader = readFileSync(join(folder, "index.js"), "utf8");
    return loader.includes(LOADER_LINE) || loader.includes(LEGACY_LOADER_LINE);
};

function setInstance(channel: Channel, origin: string | null) {
    const file = join(profileFolder(channel), "settings.json");
    let settings: Record<string, unknown> = {};
    try {
        settings = JSON.parse(readFileSync(file, "utf8"));
    } catch {}
    mkdirSync(profileFolder(channel), { recursive: true });
    writeAtomically(file, JSON.stringify(backendSettings(settings, origin), null, 2));
}

const usage = `Usage: librecord-switcher <install|uninstall|status> [--channel stable|ptb|canary|development] [--instance <address>|--discord]

  install     Add the Switch instance menu item and Cmd/Ctrl+Shift+O shortcut to the official Discord apps.
  uninstall   Remove it again.
  status      Show which apps were found and whether the switcher is installed.
  --channel   Only touch one app. Without it every installed app is changed.
  --instance  Also point the app at this Librecord instance, for example discord.lifestyle.
  --discord   Also point the app back at discord.com.

Restart Discord afterwards. A Discord update replaces the files, so run install again after one.`;

async function main(args: string[]) {
    const command = args[0];
    const flag = (name: string) => {
        const index = args.indexOf(`--${name}`);
        return index === -1 ? undefined : args[index + 1];
    };
    if (!command || !["install", "uninstall", "status"].includes(command)) {
        console.log(usage);
        return command ? 1 : 0;
    }
    const only = flag("channel");
    const channels = CHANNELS.filter((channel) => !only || channel.name === only.toLowerCase());
    if (!channels.length) {
        console.error(`Unknown channel ${only}. Use stable, ptb, canary or development.`);
        return 1;
    }
    const instanceInput = flag("instance");
    const instance = instanceInput ? await discoverInstance(instanceInput, (url) => fetch(url, { headers: { accept: "application/json" } })) : null;
    let touched = 0;
    for (const channel of channels) {
        const folders = coreFolders(channel);
        if (!folders.length) {
            if (command === "status" || only) console.log(`${channel.label}: not installed`);
            continue;
        }
        for (const folder of folders) {
            if (command === "status") {
                const loader = readFileSync(join(folder, "index.js"), "utf8");
                const state = loader.includes(LOADER_LINE)
                    ? "switcher installed"
                    : loader.includes(LEGACY_LOADER_LINE)
                      ? "old discord-oss switcher installed, run install to upgrade or uninstall to remove"
                      : "switcher not installed";
                console.log(`${channel.label}: ${state} (${folder})`);
            }
            if (command === "install") install(folder);
            if (command === "uninstall") uninstall(folder);
        }
        if (command === "install" && (instance || args.includes("--discord"))) setInstance(channel, instance?.url ?? null);
        if (command !== "status") {
            touched++;
            const target =
                command === "install" && instance ? `, connecting to ${instance.name}` : command === "install" && args.includes("--discord") ? ", connecting to Discord" : "";
            console.log(`${channel.label}: switcher ${command === "install" ? "installed" : "removed"}${target}. Restart it to apply.`);
        }
    }
    if (command !== "status" && !touched) {
        console.error("No official Discord desktop app was found on this computer.");
        return 1;
    }
    return 0;
}

if (import.meta.main)
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        },
    );
