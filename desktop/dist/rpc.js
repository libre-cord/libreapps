"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRpc = registerRpc;
// rpc.ts
const electron_1 = require("electron");
async function registerRpc({ allowed }) {
    const watchers = new Set();
    // arRPC: npm i arrpc (or vendor its src/). Check the export name in the version you install.
    const { default: RPCServer } = await import("arrpc");
    const server = await new RPCServer();
    server.on("activity", (data) => {
        for (const contents of watchers) {
            if (contents.isDestroyed())
                watchers.delete(contents);
            else
                contents.send("rpc:activity", data);
        }
    });
    electron_1.ipcMain.on("rpc:watch", (event) => {
        if (!allowed(event.senderFrame?.url))
            return;
        const contents = event.sender;
        watchers.add(contents);
        contents.once("destroyed", () => watchers.delete(contents));
        contents.on("did-start-navigation", (d) => {
            if (d.isMainFrame && !d.isSameDocument)
                watchers.delete(contents);
        });
    });
    return { stop: () => server.close?.() };
}
