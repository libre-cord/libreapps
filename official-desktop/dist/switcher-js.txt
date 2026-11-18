var librecordFolder = __dirname;

// src/switcher.ts
var import_electron = require("electron");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/instances.ts
var LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local|[^.]+\.localhost)(:\d+)?$/i;
function normalizeInstanceUrl(input) {
  const text = input.trim();
  if (!text)
    throw new Error("Enter the address of a Librecord instance.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `${LOCAL_HOST.test(text.split("/")[0]) ? "http" : "https"}://${text}`;
  const url = new URL(withScheme);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http and https addresses work.");
  return url.origin;
}
function backendSettings(settings, origin) {
  const next = { ...settings };
  if (origin) {
    next.WEBAPP_ENDPOINT = origin;
    next.API_ENDPOINT = `${origin}/api`;
  } else {
    delete next.WEBAPP_ENDPOINT;
    delete next.API_ENDPOINT;
  }
  return next;
}
function currentInstance(settings) {
  const endpoint = settings.WEBAPP_ENDPOINT;
  if (typeof endpoint !== "string" || !endpoint)
    return null;
  try {
    return normalizeInstanceUrl(endpoint);
  } catch {
    return null;
  }
}
function rememberInstance(list, instance) {
  return [instance, ...list.filter((saved) => saved.url !== instance.url)].slice(0, 20);
}
async function discoverInstance(input, fetcher) {
  const origin = normalizeInstanceUrl(input);
  const host = new URL(origin).host;
  let response;
  try {
    response = await fetcher(`${origin}/.well-known/librecord`);
  } catch {
    throw new Error(`Couldn't reach ${host}. Check the address and your connection.`);
  }
  if (!response.ok)
    throw new Error(`${host} isn't a Librecord instance (HTTP ${response.status}).`);
  const body = await response.json().catch(() => null);
  if (body?.software?.name !== "librecord")
    throw new Error(`${host} isn't a Librecord instance.`);
  const url = body.instance?.url ? new URL(body.instance.url).origin : origin;
  return { url, name: body.instance?.name?.trim() || new URL(url).host };
}

// src/switcher.ts
var ITEM_ID = "librecord-switch-instance";
var moduleFolder = librecordFolder;
var settingsFile = () => import_node_path.join(import_electron.app.getPath("userData"), "settings.json");
var instancesFile = () => import_node_path.join(import_electron.app.getPath("userData"), "librecord-instances.json");
var switcher = null;
function readJson(file, fallback) {
  try {
    return import_node_fs.existsSync(file) ? JSON.parse(import_node_fs.readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(file, value) {
  import_node_fs.writeFileSync(`${file}.librecord-tmp`, JSON.stringify(value, null, 2));
  import_node_fs.renameSync(`${file}.librecord-tmp`, file);
}
function savedInstances() {
  const list = readJson(instancesFile(), []);
  return Array.isArray(list) ? list.filter((item) => typeof item?.url === "string" && typeof item?.name === "string") : [];
}
function switchTo(instance) {
  writeJson(settingsFile(), backendSettings(readJson(settingsFile(), {}), instance?.url ?? null));
  if (instance)
    writeJson(instancesFile(), rememberInstance(savedInstances(), instance));
  import_electron.app.relaunch();
  import_electron.app.exit(0);
}
function openSwitcher() {
  if (switcher && !switcher.isDestroyed())
    return switcher.focus();
  switcher = new import_electron.BrowserWindow({
    width: 460,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Switch instance",
    backgroundColor: "#1a1a1e",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: import_node_path.join(moduleFolder, "preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  switcher.setMenu(null);
  switcher.once("ready-to-show", () => switcher?.show());
  switcher.on("closed", () => {
    switcher = null;
  });
  switcher.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  switcher.webContents.on("will-navigate", (event) => event.preventDefault());
  switcher.loadFile(import_node_path.join(moduleFolder, "switcher.html"));
}
var fromSwitcher = (sender) => !!switcher && !switcher.isDestroyed() && sender === switcher.webContents;
import_electron.ipcMain.handle("librecord:state", (event) => {
  if (!fromSwitcher(event.sender))
    return null;
  return { current: currentInstance(readJson(settingsFile(), {})), instances: savedInstances(), channel: import_electron.app.getName() };
});
import_electron.ipcMain.handle("librecord:discover", async (event, input) => {
  if (!fromSwitcher(event.sender))
    throw new Error("Not allowed.");
  return discoverInstance(String(input), (url) => import_electron.net.fetch(url, { headers: { accept: "application/json" } }));
});
import_electron.ipcMain.handle("librecord:switch", (event, instance) => {
  if (!fromSwitcher(event.sender))
    return;
  switchTo(instance && typeof instance.url === "string" ? { url: instance.url, name: String(instance.name ?? instance.url) } : null);
});
import_electron.ipcMain.handle("librecord:forget", (event, url) => {
  if (!fromSwitcher(event.sender))
    return [];
  const list = savedInstances().filter((item) => item.url !== url);
  writeJson(instancesFile(), list);
  return list;
});
import_electron.ipcMain.on("librecord:close", (event) => {
  if (fromSwitcher(event.sender))
    switcher?.close();
});
var switchItem = () => new import_electron.MenuItem({ id: ITEM_ID, label: "Switch instance…", accelerator: "CmdOrCtrl+Shift+O", click: openSwitcher });
function withSwitchItem(menu, prepend) {
  if (!menu || menu.getMenuItemById(ITEM_ID))
    return menu;
  if (prepend) {
    menu.insert(0, new import_electron.MenuItem({ type: "separator" }));
    menu.insert(0, switchItem());
  } else {
    menu.append(new import_electron.MenuItem({ type: "separator" }));
    menu.append(switchItem());
  }
  return menu;
}
var setContextMenu = import_electron.Tray.prototype.setContextMenu;
import_electron.Tray.prototype.setContextMenu = function(menu) {
  return setContextMenu.call(this, withSwitchItem(menu, false));
};
var setApplicationMenu = import_electron.Menu.setApplicationMenu;
import_electron.Menu.setApplicationMenu = (menu) => {
  const appMenu = process.platform === "darwin" ? menu?.items[0]?.submenu : null;
  if (appMenu && !appMenu.getMenuItemById(ITEM_ID)) {
    appMenu.insert(1, new import_electron.MenuItem({ type: "separator" }));
    appMenu.insert(1, switchItem());
  }
  return setApplicationMenu.call(import_electron.Menu, menu);
};
import_electron.app.on("browser-window-created", (_event, window) => {
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.shift || input.alt || input.key.toLowerCase() !== "o")
      return;
    if (!(process.platform === "darwin" ? input.meta : input.control))
      return;
    event.preventDefault();
    openSwitcher();
  });
});
