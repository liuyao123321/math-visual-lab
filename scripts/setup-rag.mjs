import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const envDir = path.join(root, ".rag-runtime");
const python = path.join(envDir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const run = (program, args) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, HF_HUB_DISABLE_TELEMETRY: "1", HF_HUB_DISABLE_XET: "1", HF_HUB_DOWNLOAD_TIMEOUT: "30", PIP_CACHE_DIR: path.join(envDir, "pip-cache") } });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`RAG setup stopped with exit code ${code}.`)));
});
try {
  await mkdir(envDir, { recursive: true });
  try { await access(python); } catch { await run(process.env.RAG_PYTHON || "python", ["-m", "venv", envDir]); }
  const offline = process.argv.includes("--offline");
  if (!offline) {
    const lock = await readFile(path.join(root, "services/embedding/requirements.lock.txt"), "utf8").catch(() => null);
    const torchVersion = lock?.match(/^torch==([^\r\n]+)$/m)?.[1];
    await run(python, ["-m", "pip", "install", "--no-deps", "--no-compile", torchVersion ? `torch==${torchVersion}` : "torch", "--index-url", "https://download.pytorch.org/whl/cpu"]);
    await run(python, ["-m", "pip", "install", "--no-compile", "-r", lock ? "services/embedding/requirements.lock.txt" : "services/embedding/requirements.txt",
      ...(process.argv.includes("--mirror") ? ["--index-url", "https://pypi.tuna.tsinghua.edu.cn/simple"] : [])]);
  }
  await run(python, ["scripts/build-rag-index.py", ...(offline ? ["--offline"] : [])]);
  console.log("RAG准备完成。下次启动网站时将自动启动本地语义检索。");
} catch (error) { console.error(error.message); process.exitCode = 1; }
