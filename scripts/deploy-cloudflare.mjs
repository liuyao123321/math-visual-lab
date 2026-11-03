import "./sites-env.mjs";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!["--skip-build", "--dry-run"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
}
async function run(script, args = []) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, script), ...args], {
      cwd: root, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`${script} failed (${code}); publication stopped.`);
}

if (!flags.has("--skip-build")) {
  await run("scripts/prepare-pdf-worker.mjs");
  await run("scripts/run-framework.mjs", ["build"]);
}
const builtConfigPath = path.join(root, "dist/server/wrangler.json");
const config = JSON.parse(await readFile(builtConfigPath, "utf8"));
if (!config.main || !config.assets?.directory) throw new Error("Missing Worker entry or static assets; rebuild first.");
if (config.d1_databases?.some((db) => db.database_id === "00000000-0000-4000-8000-000000000000")) {
  throw new Error("A placeholder D1 binding cannot be published. Configure the real database first.");
}
// Retain the framework's generated module rules and asset paths. Write beside
// the generated config so relative paths still resolve, without changing Sites.
const publicConfig = path.join(root, "dist/server/wrangler.public.json");
await writeFile(publicConfig, JSON.stringify({ ...config, name: "math-visual-lab", workers_dev: true }, null, 2));
await run("node_modules/wrangler/bin/wrangler.js", ["deploy", "--config", publicConfig,
  ...(flags.has("--dry-run") ? ["--dry-run"] : [])]);
