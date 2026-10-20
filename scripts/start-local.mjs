import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { request } from "node:http";
import { appendFile, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { superviseServer } from "./local-supervisor.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const runtimeDir = path.join(project, ".local-server");
const logPath = path.join(runtimeDir, "server.log");
const statePath = path.join(runtimeDir, "server.json");
const lockPath = path.join(runtimeDir, "launch.lock");
const stopPath = path.join(runtimeDir, "stop.json");
const launcherScript = fileURLToPath(import.meta.url);
const serverScript = path.join(project, "scripts", "run-framework.mjs");
const url = "http://localhost:5173/";
const noBrowser = process.argv.includes("--no-browser");
const token = randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (file) => {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
};

async function saveState(state) {
  // Readers never see a partially written record. No application data is here.
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2));
  await rename(temporary, statePath);
}

function probeSite() {
  return new Promise((resolve) => {
    const req = request(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; if (body.length > 2_000_000) response.destroy(); });
      response.on("end", () => resolve(response.statusCode === 200 && /<title[^>]*>[^<]*知数实验室/.test(body)));
      response.on("error", () => resolve(false));
      response.on("close", () => resolve(false));
    });
    // Hard deadline, not socket inactivity: slow responses cannot stall recovery.
    const timer = setTimeout(() => req.destroy(), 4000);
    req.once("close", () => clearTimeout(timer));
    req.on("error", () => resolve(false));
    req.end();
  });
}

function portOccupied() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "localhost", port: 5173 });
    socket.setTimeout(1500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(true); });
  });
}

function execute(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: project, windowsHide: true, ...options });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}
async function run(program, args, options) {
  const code = await execute(program, args, options);
  if (code !== 0) throw new Error(`${path.basename(program)} exited with code ${code}.`);
}
async function event(message) {
  await appendFile(path.join(runtimeDir, "launcher.log"), `${new Date().toISOString()} ${message}\n`);
}

async function openBrowser() {
  console.log(`READY ${url}`);
  if (!noBrowser) {
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:MATHLAB_SITE_URL -WindowStyle Normal"],
    { env: { ...process.env, MATHLAB_SITE_URL: url }, stdio: "ignore" });
  }
  await event(`READY ${noBrowser ? "no-browser" : "browser-open-requested"} ${url}`);
}

async function acquireLock() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const lock = await open(lockPath, "wx");
      await lock.writeFile(JSON.stringify({ pid: process.pid, project, token }));
      return lock;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const old = await readJson(lockPath);
      if (old?.project !== project || !Number.isSafeInteger(old.pid) || old.pid <= 0) return null;
      try { process.kill(old.pid, 0); return null; }
      catch (probeError) {
        if (probeError.code !== "ESRCH") return null;
        const current = await readJson(lockPath);
        if (current?.pid === old.pid && current?.token === old.token) {
          await unlink(lockPath).catch((e) => { if (e.code !== "ENOENT") throw e; });
        }
      }
    }
  }
  return null;
}

async function verifiedAlive(pid, script, node) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || typeof node !== "string") throw new Error("服务记录不匹配，已取消停止操作。");
  // Never trust a recycled PID alone: verify executable and project script.
  // No global node/workerd termination and no termination of foreign listeners.
  const code = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference = 'Stop'; $p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if (!$p) { exit 3 }; if (!$p.CommandLine -or !$p.CommandLine.Contains($env:MATHLAB_EXPECTED_SCRIPT) -or $p.ExecutablePath -ne $env:MATHLAB_EXPECTED_NODE) { exit 4 }`],
  { stdio: "ignore", env: { ...process.env, MATHLAB_EXPECTED_SCRIPT: script, MATHLAB_EXPECTED_NODE: node } });
  if (code === 3) return false;
  if (code !== 0) throw new Error("进程身份无法核实；不会停止其他程序。");
  return true;
}

async function stopProcess(pid, script, node) {
  if (await verifiedAlive(pid, script, node)) {
    await run("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  }
}

function validState(state) {
  if (!state || state.script !== serverScript || !Number.isSafeInteger(state.pid) || state.pid <= 0) {
    throw new Error("没有匹配本项目的服务记录；不会停止其他程序。");
  }
  return state;
}

async function stopOwnedServer() {
  const state = validState(await readJson(statePath));
  if (state.version === 2 && typeof state.token === "string"
      && await verifiedAlive(state.supervisorPid, launcherScript, state.node)) {
    // A stale stop command cannot stop a new session with a different token.
    await writeFile(stopPath, JSON.stringify({ token: state.token }));
    for (let attempt = 0; attempt < 20; attempt++) {
      await pause(1000);
      const current = await readJson(statePath);
      if (current?.token !== state.token) throw new Error("服务会话已变化，已取消停止操作。");
      if (current.status === "stopped") { console.log("STOPPED the owned server and supervisor."); return; }
    }
    // Fallback for a hung supervisor, still identity-checked and project-scoped.
    await stopProcess(state.supervisorPid, launcherScript, state.node);
  }
  await stopProcess(state.pid, serverScript, state.node);
  await saveState({ ...state, status: "stopped", stoppedAt: new Date().toISOString() });
  console.log("STOPPED the server owned by this launcher.");
}

async function main() {
  if (process.platform !== "win32") throw new Error("此快捷启动工具仅用于 Windows。");
  await mkdir(runtimeDir, { recursive: true });
  if (process.argv.includes("--stop")) { await stopOwnedServer(); return; }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error("请安装 Node.js 22.13 或更新版本，再启动网站。");
  if (await probeSite()) { console.log("REUSED existing Math Visual Lab server."); await openBrowser(); return; }
  const lock = await acquireLock();
  if (!lock) {
    const deadline = Date.now() + 100000;
    while (Date.now() < deadline) {
      if (await probeSite()) { await openBrowser(); return; }
      await pause(1000);
    }
    throw new Error(`后台服务正在启动或恢复，但未能就绪。请查看日志：${logPath}`);
  }
  let state;
  let failed = false;
  try {
    if (await portOccupied()) {
      const old = validState(await readJson(statePath));
      await stopProcess(old.pid, serverScript, old.node);
      if (await portOccupied()) throw new Error("5173 被其他程序占用；未抢占端口或停止该程序。");
    }
    try { await readFile(path.join(project, "node_modules", "vinext", "package.json"), "utf8"); }
    catch { throw new Error("项目依赖缺失。请先在 math-lab 文件夹执行 npm install；不会自动下载安装软件。"); }
    const log = await open(logPath, "a");
    try { await run(process.execPath, [path.join(project, "scripts", "prepare-pdf-worker.mjs")], { stdio: ["ignore", log.fd, log.fd] }); }
    finally { await log.close(); }
    let stopping = false;
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
    await superviseServer({
      async start() {
        if (await portOccupied()) throw new Error("5173 端口已被占用，已暂停恢复；不会终止其他程序。");
        await appendFile(logPath, `\n--- Supervised local start ${new Date().toISOString()} ---\n`);
        await event("STARTING web runtime; optional RAG loads in background; waiting for rendered homepage (90s deadline)");
        const output = await open(logPath, "a");
        let child;
        try {
          child = spawn(process.execPath, [serverScript, "dev", "--hostname", "localhost"], {
            cwd: project, windowsHide: true, stdio: ["ignore", output.fd, output.fd],
            env: { ...process.env, MATHLAB_LAUNCHER: "1" },
          });
          await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
          state = { version: 2, token, supervisorPid: process.pid, pid: child.pid,
            node: process.execPath, script: serverScript, url, status: "starting", startedAt: new Date().toISOString() };
          await saveState(state);
        } catch (error) {
          if (child?.pid) await stopProcess(child.pid, serverScript, process.execPath);
          throw error;
        } finally { await output.close(); }
        return child;
      },
      isRunning: (child) => child.exitCode === null && child.signalCode === null,
      isHealthy: probeSite,
      shouldStop: async () => stopping || (await readJson(stopPath))?.token === token,
      async stop(child) { await stopProcess(child.pid, serverScript, process.execPath); },
      async onReady(child, first) {
        state = { ...state, status: "ready", readyAt: new Date().toISOString() };
        await saveState(state);
        if (first) await openBrowser();
        else await event(`RECOVERED pid=${child.pid}`);
      },
      async onRecover(child, attempt) {
        state = { ...state, status: "recovering" };
        await saveState(state);
        await event(`RECOVERING pid=${child.pid} attempt=${attempt}`);
      },
    });
  } catch (error) { failed = true; throw error; }
  finally {
    if (state) await saveState({ ...state, status: failed ? "failed" : "stopped", stoppedAt: new Date().toISOString() });
    await lock.close();
    if ((await readJson(lockPath))?.token === token) await unlink(lockPath);
    if ((await readJson(stopPath))?.token === token) await unlink(stopPath);
  }
}

main().catch(async (error) => {
  const message = `${error.message}\n\n项目：${project}\n日志：${logPath}`;
  console.error(message);
  await mkdir(runtimeDir, { recursive: true });
  await event(message);
  if (!noBrowser) {
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:MATHLAB_ERROR, 'Math Visual Lab', 'OK', 'Error')"],
    { env: { ...process.env, MATHLAB_ERROR: message }, stdio: "ignore" }).catch(() => {});
  }
  process.exitCode = 1;
});
