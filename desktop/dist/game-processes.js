"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowsScript = exports.SCAN_MS = void 0;
exports.createProcessWatcher = createProcessWatcher;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const game_match_1 = require("./game-match");
exports.SCAN_MS = 15_000;
const run = (file, args, timeout = 5000) => new Promise((resolve) => {
    (0, node_child_process_1.execFile)(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
});
class IntervalWatcher {
    timer = null;
    scanning = false;
    argumentNames = new Set();
    onProcesses = () => { };
    start(argumentNames, onProcesses) {
        this.argumentNames = argumentNames;
        this.onProcesses = onProcesses;
        if (this.timer)
            return;
        this.timer = setInterval(() => this.scanNow(), exports.SCAN_MS);
        this.scanNow();
    }
    scanNow() {
        if (this.scanning || !this.timer)
            return;
        this.scanning = true;
        this.list()
            .then((processes) => {
            if (processes && this.timer)
                this.onProcesses(processes);
        })
            .catch(() => { })
            .finally(() => {
            this.scanning = false;
        });
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
}
class MacWatcher extends IntervalWatcher {
    async list() {
        const output = await run("ps", ["-x", "-ww", "-o", "pid=,comm="]);
        if (output === null)
            return null;
        const processes = (0, game_match_1.parsePsList)(output);
        const needArgs = processes.filter((process) => this.argumentNames.has((process.path.split("/").pop() ?? "").toLowerCase()));
        if (needArgs.length) {
            const args = (0, game_match_1.parsePsArguments)((await run("ps", ["-ww", "-o", "pid=,args=", "-p", needArgs.map((process) => process.pid).join(",")])) ?? "");
            for (const process of needArgs)
                process.cmdLine = args.get(process.pid);
        }
        return processes;
    }
}
class LinuxWatcher extends IntervalWatcher {
    async list() {
        const entries = await (0, promises_1.readdir)("/proc").catch(() => null);
        if (!entries)
            return null;
        const processes = await Promise.all(entries
            .filter((entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid)
            .map(async (entry) => {
            const exe = await (0, promises_1.readlink)(`/proc/${entry}/exe`).catch(() => null);
            if (!exe)
                return null;
            const cmdline = await (0, promises_1.readFile)(`/proc/${entry}/cmdline`, "utf8").catch(() => "");
            return (0, game_match_1.linuxProcess)(Number(entry), exe, cmdline);
        }));
        return processes.filter((process) => !!process);
    }
}
const WINDOWS_SCRIPT = `$ErrorActionPreference = "SilentlyContinue"
$argNames = @(ARGUMENT_NAMES)
while ($true) {
    if (-not (Get-Process -Id PARENT_PID -ErrorAction SilentlyContinue)) { exit }
    $windowed = @{}
    foreach ($p in [System.Diagnostics.Process]::GetProcesses()) { if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $windowed[$p.Id] = 1 } }
    $items = foreach ($p in Get-CimInstance -ClassName Win32_Process -Property ProcessId,Name,ExecutablePath,CommandLine) {
        if (-not $p.ExecutablePath) { continue }
        $item = @{ i = [int]$p.ProcessId; p = [string]$p.ExecutablePath; w = [int]$windowed.ContainsKey([int]$p.ProcessId) }
        if ($argNames -contains ([string]$p.Name).ToLowerInvariant()) { $item.c = [string]$p.CommandLine }
        $item
    }
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 2 -InputObject @($items)))
    [Console]::Out.Flush()
    Start-Sleep -Seconds SCAN_SECONDS
}`;
// The names come from the instance's game list, so they are untrusted. PowerShell
// closes a single-quoted string on ' and on the typographic quotes U+2018-201B
// alike, so only characters known to be inert inside one are let through.
const SAFE_PROCESS_NAME = /^[\p{L}\p{N} ._+\-()[\]&!@#%,=~]{1,128}$/u;
const windowsScript = (argumentNames, parentPid) => WINDOWS_SCRIPT.replace("ARGUMENT_NAMES", () => [...argumentNames]
    .filter((name) => SAFE_PROCESS_NAME.test(name))
    .map((name) => `'${name}'`)
    .join(","))
    .replace("PARENT_PID", String(parentPid))
    .replace("SCAN_SECONDS", String(exports.SCAN_MS / 1000));
exports.windowsScript = windowsScript;
class WindowsWatcher {
    child = null;
    stopped = true;
    names = "";
    start(argumentNames, onProcesses) {
        const names = [...argumentNames].sort().join("\n");
        if (this.child && names === this.names)
            return;
        this.child?.kill();
        this.names = names;
        this.stopped = false;
        const child = (0, node_child_process_1.spawn)("powershell.exe", [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            Buffer.from((0, exports.windowsScript)(argumentNames, process.pid), "utf16le").toString("base64"),
        ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        this.child = child;
        let buffer = "";
        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            const last = lines.filter(Boolean).at(-1);
            const processes = last ? (0, game_match_1.parseWindowsProcesses)(last) : null;
            if (processes)
                onProcesses(processes);
        });
        child.on("exit", () => {
            if (this.child !== child)
                return;
            this.child = null;
            if (!this.stopped)
                setTimeout(() => !this.stopped && !this.child && this.start(argumentNames, onProcesses), 30_000).unref();
        });
    }
    scanNow() { }
    stop() {
        this.stopped = true;
        this.child?.kill();
        this.child = null;
    }
}
function createProcessWatcher() {
    if (process.platform === "darwin")
        return new MacWatcher();
    if (process.platform === "linux")
        return new LinuxWatcher();
    if (process.platform === "win32")
        return new WindowsWatcher();
    return null;
}
