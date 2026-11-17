// rpc.ts
import { ipcMain, type WebContents } from "electron";

export async function registerRpc({ allowed }: { allowed(url: string | undefined): boolean }) {
    const watchers = new Set<WebContents>();
    // arRPC: npm i arrpc (or vendor its src/). Check the export name in the version you install.
    const { default: RPCServer } = await import("arrpc");
    const server = await new RPCServer();

    server.on("activity", (data: unknown) => {
        for (const contents of watchers) {
            if (contents.isDestroyed()) watchers.delete(contents);
            else contents.send("rpc:activity", data);
        }
    });

    ipcMain.on("rpc:watch", (event) => {
        if (!allowed(event.senderFrame?.url)) return;
        const contents = event.sender;
        watchers.add(contents);
        contents.once("destroyed", () => watchers.delete(contents));
        contents.on("did-start-navigation", (d) => {
            if (d.isMainFrame && !d.isSameDocument) watchers.delete(contents);
        });
    });

    return { stop: () => (server as any).close?.() };
}
