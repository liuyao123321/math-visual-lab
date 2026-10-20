import { spawn, spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { monitorRagStartup } from "./rag-startup.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const endpoint = "http://127.0.0.1:8765";

async function health(index) {
  try {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1500) });
    const payload = await response.json();
    return response.ok && payload.service === "mathlab-embedding" && payload.ready
      && payload.model === index.model && payload.dimensions === index.dimensions
      && payload.revision === index.revision && payload.sourceHash === index.sourceHash;
  } catch { return false; }
}

function portOccupied() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 8765 });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(true); });
  });
}

export async function startRagRuntime({ waitForReady = true } = {}) {
  // An explicitly configured remote service is owned by its operator.
  if (process.env.RAG_EMBEDDING_URL) return;
  let index;
  try {
    index = JSON.parse(await readFile(path.join(root, "data/rag-index/vectors.json"), "utf8"));
    if (!index.ready) return;
  } catch { return; }
  if (await health(index)) { process.env.RAG_EMBEDDING_URL = endpoint; return; }
  if (await portOccupied()) { console.warn("RAG：8765被其他服务占用，使用文本检索。"); return; }
  const python = path.join(root, ".rag-runtime", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  try { await access(python); } catch { console.warn("RAG：尚未安装本地编码环境，使用文本检索。"); return; }
  const child = spawn(python, [path.join(root, "services/embedding/service.py")], {
    cwd: root, windowsHide: true, stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1" },
  });
  let failed = false;
  let ready = false;
  child.once("error", () => { failed = true; });
  child.once("exit", () => { failed = true; });
  const stop = () => {
    if (failed || child.exitCode !== null || child.signalCode !== null) return;
    // Windows venv python can have a redirector child. Terminate only the tree
    // rooted at this exact child handle; never search/kill all Python processes.
    if (process.platform === "win32") spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
    else child.kill();
  };
  process.once("exit", stop);
  // Configure the endpoint before Vite captures its server environment. The
  // existing retrieval client safely falls back to BM25 until it can respond.
  process.env.RAG_EMBEDDING_URL = endpoint;
  console.log(`RAG：编码服务后台加载中（pid=${child.pid}），网页无需等待。`);
  const readiness = monitorRagStartup({
    isRunning: () => !failed && child.exitCode === null && child.signalCode === null,
    isReady: () => ready,
    isHealthy: () => health(index),
    stop,
    onReady(elapsed) {
      ready = true;
      console.log(`RAG：语义检索已就绪（${(elapsed / 1000).toFixed(1)}秒）。`);
    },
    onUnavailable(reason, elapsed) {
      console.warn(`RAG：编码服务${reason === "timeout" ? "加载超时" : reason === "exited" ? "已退出" : "检查失败"}（${(elapsed / 1000).toFixed(1)}秒），继续使用文本检索；网页保持运行。`);
    },
  });
  if (waitForReady) await readiness;
  else void readiness.catch((error) => console.warn(`RAG：后台检查失败，继续使用文本检索（${error.message}）。`));
}
