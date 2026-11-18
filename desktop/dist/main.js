"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const autostart_1 = require("./autostart");
const context_menu_1 = require("./context-menu");
const discovery_1 = require("./discovery");
const games_1 = require("./games");
const music_1 = require("./music");
const screenshare_1 = require("./screenshare");
const store_1 = require("./store");
const rpc_1 = require("./rpc");
const PROTOCOL = "librecord";
const APP_ID = "org.librecord.app";
const APP_NAME = "Librecord";
const appRoot = (0, node_path_1.join)(__dirname, "..");
const resource = (name) => (0, node_path_1.join)(appRoot, "resources", name);
const preload = (0, node_path_1.join)(__dirname, "preload.js");
const grantedPermissions = new Set([
    "media",
    "notifications",
    "clipboard-read",
    "clipboard-sanitized-write",
    "fullscreen",
    "display-capture",
    "pointerLock",
    "speaker-selection",
    "idle-detection",
]);
let mainWindow = null;
let tray = null;
let quitting = false;
let pendingDeepLink = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
let lastMentionCount = 0;
let stopMusic = () => { };
let stopGames = () => { };
let stopRpc = () => { };
electron_1.app.setName(APP_NAME);
if (process.platform === "win32")
    electron_1.app.setAppUserModelId(APP_ID);
electron_1.app.userAgentFallback = electron_1.app.userAgentFallback.replace(/\s?Electron\/\S+/, "").replace(/\s?(Librecord|librecord-desktop)\/\S+/i, "");
electron_1.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
electron_1.app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling,MediaSessionService");
electron_1.app.commandLine.appendSwitch("enable-features", ["WebRTCPipeWireCapturer", ...(0, screenshare_1.screenshareFeatureFlags)()].join(","));
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.quit();
}
else {
    electron_1.app.on("second-instance", (_event, argv) => {
        const link = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
        if (link)
            openDeepLink(link);
        else
            showWindow();
    });
    electron_1.app.on("open-url", (event, url) => {
        event.preventDefault();
        if (electron_1.app.isReady())
            openDeepLink(url);
        else
            pendingDeepLink = url;
    });
    if (process.defaultApp && process.argv[1])
        electron_1.app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [(0, node_path_1.join)(process.argv[1])]);
    else
        electron_1.app.setAsDefaultProtocolClient(PROTOCOL);
    electron_1.app.whenReady().then(start);
}
function instanceOrigins() {
    return new Set((0, store_1.settings)().instances.map((instance) => instance.url));
}
function isInstanceUrl(url) {
    if (!url)
        return false;
    try {
        return instanceOrigins().has(new URL(url).origin);
    }
    catch {
        return false;
    }
}
const isAppPage = (url) => !!url && url.startsWith("file:") && url.includes("/static/");
const connectionPopups = new WeakSet();
function isConnectionPage(url) {
    if (!isInstanceUrl(url))
        return false;
    return new URL(url).pathname.startsWith("/connections/");
}
function isWebUrl(url) {
    try {
        const protocol = new URL(url).protocol;
        return protocol === "https:" || protocol === "http:";
    }
    catch {
        return false;
    }
}
function openExternal(url) {
    try {
        const protocol = new URL(url).protocol;
        if (protocol === "https:" || protocol === "http:" || protocol === "mailto:")
            electron_1.shell.openExternal(url);
    }
    catch { }
}
function showWindow() {
    if (!mainWindow)
        return createWindow();
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}
function openSwitcher(prefill) {
    if (!mainWindow)
        createWindow();
    mainWindow?.loadFile((0, node_path_1.join)(appRoot, "static", "switcher.html"), prefill ? { query: { prefill } } : undefined);
    showWindow();
}
function openInstance(url, path = "/channels/@me") {
    if (!mainWindow)
        createWindow();
    mainWindow?.loadURL(new URL(path, url).toString());
    updateTrayMenu();
}
function openCurrent() {
    const current = (0, store_1.settings)().current;
    if (current && instanceOrigins().has(current))
        openInstance(current);
    else
        openSwitcher();
}
function openDeepLink(link) {
    showWindow();
    let url;
    try {
        url = new URL(link);
    }
    catch {
        return;
    }
    const requested = url.searchParams.get("instance");
    const path = url.host === "open" || url.host === "" ? url.searchParams.get("path") || "/channels/@me" : `/${url.host}${url.pathname}`;
    // a backslash counts as a slash in an http URL: "/\host" would leave the instance
    const safePath = path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/channels/@me";
    if (requested) {
        let origin;
        try {
            origin = (0, discovery_1.normalizeInstanceUrl)(requested);
        }
        catch {
            return openSwitcher();
        }
        if (!instanceOrigins().has(origin))
            return openSwitcher(origin);
        const saved = (0, store_1.settings)().instances.find((instance) => instance.url === origin);
        if (saved)
            (0, store_1.rememberInstance)(saved);
        return openInstance(origin, safePath);
    }
    const current = (0, store_1.settings)().current;
    if (current)
        openInstance(current, safePath);
    else
        openSwitcher();
}
function restoredBounds(state) {
    const bounds = { width: Math.max(state.width, 940), height: Math.max(state.height, 560), x: state.x, y: state.y };
    if (bounds.x === undefined || bounds.y === undefined)
        return bounds;
    const visible = electron_1.screen
        .getAllDisplays()
        .some(({ workArea }) => bounds.x < workArea.x + workArea.width - 100 &&
        bounds.x + bounds.width > workArea.x + 100 &&
        bounds.y >= workArea.y - 20 &&
        bounds.y < workArea.y + workArea.height - 100);
    return visible ? bounds : { width: bounds.width, height: bounds.height };
}
function trackWindowState(window) {
    let timer;
    const save = () => {
        if (window.isDestroyed() || window.isMinimized() || window.isFullScreen())
            return;
        const maximized = window.isMaximized();
        (0, store_1.saveSettings)({ window: maximized ? { ...(0, store_1.settings)().window, maximized } : { ...window.getNormalBounds(), maximized } });
    };
    const later = () => {
        clearTimeout(timer);
        timer = setTimeout(save, 500);
    };
    window.on("resize", later);
    window.on("move", later);
    window.on("close", save);
}
function createWindow() {
    const state = (0, store_1.settings)().window;
    mainWindow = new electron_1.BrowserWindow({
        ...restoredBounds(state),
        minWidth: 940,
        minHeight: 560,
        title: APP_NAME,
        icon: resource("icon.png"),
        backgroundColor: "#1a1a1e",
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            spellcheck: true,
            backgroundThrottling: false,
        },
    });
    if (state.maximized)
        mainWindow.maximize();
    trackWindowState(mainWindow);
    secureContents(mainWindow.webContents);
    mainWindow.once("ready-to-show", () => {
        if (!(0, autostart_1.startedHidden)())
            showWindow();
    });
    mainWindow.on("close", (event) => {
        if (quitting || !(0, store_1.settings)().closeToTray)
            return;
        event.preventDefault();
        mainWindow?.hide();
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    mainWindow.on("focus", () => mainWindow?.flashFrame(false));
    mainWindow.webContents.on("page-title-updated", (event, title) => {
        event.preventDefault();
        mainWindow?.setTitle(title.replace(/^\(\d+\)\s*|^•\s*/, "") || APP_NAME);
        updateBadge(title);
    });
    mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
        if (!isMainFrame || code === -3 || !isInstanceUrl(url))
            return;
        openSwitcher();
        mainWindow?.webContents.once("did-finish-load", () => mainWindow?.webContents.send("switcher:error", `Couldn't load ${new URL(url).host}: ${description}.`));
    });
    openCurrent();
}
function secureContents(contents) {
    contents.on("will-navigate", (event, url) => {
        if (isAppPage(url) || isInstanceUrl(url))
            return;
        if (connectionPopups.has(contents) && isWebUrl(url))
            return;
        event.preventDefault();
        openExternal(url);
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("did-create-window", (window, { url }) => {
        if (isConnectionPage(url))
            connectionPopups.add(window.webContents);
    });
    contents.setWindowOpenHandler(({ url }) => {
        if (isConnectionPage(url))
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    autoHideMenuBar: true,
                    backgroundColor: "#1a1a1e",
                    icon: resource("icon.png"),
                    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true },
                },
            };
        if (url === "about:blank" || isInstanceUrl(url))
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    autoHideMenuBar: true,
                    backgroundColor: "#1a1a1e",
                    icon: resource("icon.png"),
                    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true },
                },
            };
        openExternal(url);
        return { action: "deny" };
    });
    contents.on("context-menu", (_event, params) => (0, context_menu_1.buildContextMenu)(contents, params)?.popup());
}
function updateBadge(title) {
    const mentions = Number(/^\((\d+)\)/.exec(title)?.[1] ?? 0);
    const unread = mentions > 0 || title.startsWith("•");
    if (process.platform === "darwin")
        electron_1.app.dock?.setBadge(mentions > 0 ? String(mentions) : unread ? "•" : "");
    else if (process.platform === "linux")
        electron_1.app.setBadgeCount(mentions);
    else
        mainWindow?.setOverlayIcon(mentions > 0 ? electron_1.nativeImage.createFromPath(resource("badge.png")) : null, mentions > 0 ? `${mentions} unread mentions` : "");
    if (mentions > lastMentionCount && mainWindow && !mainWindow.isFocused())
        mainWindow.flashFrame(true);
    lastMentionCount = mentions;
    tray?.setToolTip(mentions > 0 ? `${APP_NAME} (${mentions})` : APP_NAME);
}
function trayImage() {
    if (process.platform === "darwin") {
        const image = electron_1.nativeImage.createFromPath(resource("trayTemplate.png"));
        image.setTemplateImage(true);
        return image;
    }
    return electron_1.nativeImage.createFromPath(resource("tray.png"));
}
function switchTo(url) {
    const saved = (0, store_1.settings)().instances.find((instance) => instance.url === url);
    if (!saved)
        return;
    (0, store_1.rememberInstance)(saved);
    openInstance(saved.url);
    showWindow();
}
function instanceMenuItems() {
    const { instances, current } = (0, store_1.settings)();
    return [
        ...instances.map((instance) => ({
            label: `${instance.name} (${new URL(instance.url).host})`,
            type: "radio",
            checked: instance.url === current,
            click: () => switchTo(instance.url),
        })),
        ...(instances.length ? [{ type: "separator" }] : []),
        { label: "Add or Manage Instances…", accelerator: "CmdOrCtrl+Shift+O", click: () => openSwitcher() },
    ];
}
function updateTrayMenu() {
    if (!tray)
        return;
    tray.setContextMenu(electron_1.Menu.buildFromTemplate([
        { label: `Open ${APP_NAME}`, click: showWindow },
        { type: "separator" },
        { label: "Switch Instance", submenu: instanceMenuItems() },
        { type: "separator" },
        {
            label: "Start at Login",
            type: "checkbox",
            checked: (0, store_1.settings)().openAtLogin,
            click: (item) => {
                (0, store_1.saveSettings)({ openAtLogin: item.checked });
                (0, autostart_1.setOpenAtLogin)(item.checked);
            },
        },
        {
            label: "Keep Running in the Tray",
            type: "checkbox",
            checked: (0, store_1.settings)().closeToTray,
            click: (item) => (0, store_1.saveSettings)({ closeToTray: item.checked }),
        },
        { type: "separator" },
        { label: `Quit ${APP_NAME}`, click: () => electron_1.app.quit() },
    ]));
    updateAppMenu();
}
function updateAppMenu() {
    const mac = process.platform === "darwin";
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate([
        ...(mac ? [{ role: "appMenu" }] : []),
        {
            label: "File",
            submenu: [
                { label: "Switch Instance", submenu: instanceMenuItems() },
                { type: "separator" },
                mac ? { role: "close" } : { label: `Quit ${APP_NAME}`, click: () => electron_1.app.quit() },
            ],
        },
        { role: "editMenu" },
        {
            label: "View",
            submenu: [
                { role: "reload" },
                { role: "forceReload" },
                { role: "toggleDevTools" },
                { type: "separator" },
                { role: "resetZoom" },
                { role: "zoomIn" },
                { role: "zoomOut" },
                { type: "separator" },
                { role: "togglefullscreen" },
            ],
        },
        { role: "windowMenu" },
        {
            role: "help",
            submenu: [
                {
                    label: "Open in Browser",
                    click: () => {
                        const current = (0, store_1.settings)().current;
                        if (current)
                            electron_1.shell.openExternal(current);
                    },
                },
            ],
        },
    ]));
}
function registerIpc() {
    const fromAppPage = (event) => isAppPage(event.senderFrame?.url);
    const fromInstance = (event) => isInstanceUrl(event.senderFrame?.url);
    electron_1.ipcMain.handle("switcher:list", (event) => (fromAppPage(event) ? { instances: (0, store_1.settings)().instances, current: (0, store_1.settings)().current } : null));
    electron_1.ipcMain.handle("switcher:discover", async (event, input) => {
        if (!fromAppPage(event) || typeof input !== "string")
            return { error: "Not allowed." };
        try {
            return { instance: await (0, discovery_1.discoverInstance)(input) };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    });
    electron_1.ipcMain.handle("switcher:open", async (event, input) => {
        if (!fromAppPage(event) || typeof input !== "string")
            return { error: "Not allowed." };
        try {
            const instance = await (0, discovery_1.discoverInstance)(input);
            (0, store_1.rememberInstance)(instance);
            openInstance(instance.url);
            return { instance };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    });
    electron_1.ipcMain.handle("switcher:remove", (event, url) => {
        if (!fromAppPage(event) || typeof url !== "string")
            return null;
        (0, store_1.forgetInstance)(url);
        updateTrayMenu();
        return { instances: (0, store_1.settings)().instances, current: (0, store_1.settings)().current };
    });
    electron_1.ipcMain.on("app:focus", (event) => {
        if (fromInstance(event))
            showWindow();
    });
    electron_1.ipcMain.on("app:switcher", (event) => {
        if (fromInstance(event))
            openSwitcher();
    });
}
function registerPermissions() {
    const defaultSession = electron_1.session.defaultSession;
    defaultSession.setPermissionRequestHandler(async (_contents, permission, callback, details) => {
        if (!isInstanceUrl(details.requestingUrl) || !grantedPermissions.has(permission))
            return callback(false);
        if (permission === "media" && process.platform === "darwin") {
            const types = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
            if (types.includes("audio"))
                await electron_1.systemPreferences.askForMediaAccess("microphone");
            if (types.includes("video"))
                await electron_1.systemPreferences.askForMediaAccess("camera");
        }
        callback(true);
    });
    defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => isInstanceUrl(requestingOrigin) && grantedPermissions.has(permission));
    if (process.platform !== "darwin")
        defaultSession.setSpellCheckerLanguages([electron_1.app.getLocale(), "en-US"].filter((language, index, all) => all.indexOf(language) === index && defaultSession.availableSpellCheckerLanguages.includes(language)));
    (0, screenshare_1.registerScreenshare)(defaultSession, { allowed: isInstanceUrl, parent: () => mainWindow, preload, appRoot });
}
async function start() {
    registerIpc();
    registerPermissions();
    stopMusic = (0, music_1.registerMusic)({ allowed: isInstanceUrl }).stop;
    stopGames = (0, games_1.registerGames)({ allowed: isInstanceUrl }).stop;
    try {
        stopRpc = (await (0, rpc_1.registerRpc)({ allowed: isInstanceUrl })).stop;
    }
    catch (error) {
        console.error("RPC server failed to start:", error);
    }
    if ((0, store_1.settings)().openAtLogin)
        (0, autostart_1.setOpenAtLogin)(true);
    tray = new electron_1.Tray(trayImage());
    tray.setToolTip(APP_NAME);
    tray.on("click", showWindow);
    updateTrayMenu();
    createWindow();
    if (pendingDeepLink) {
        const link = pendingDeepLink;
        pendingDeepLink = null;
        mainWindow?.webContents.once("did-finish-load", () => openDeepLink(link));
    }
    electron_1.app.on("activate", showWindow);
    electron_1.app.on("web-contents-created", (_event, contents) => {
        if (contents.getType() === "window" && contents !== mainWindow?.webContents)
            secureContents(contents);
    });
}
electron_1.app.on("before-quit", () => {
    quitting = true;
    stopMusic();
    stopGames();
    stopRpc();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
