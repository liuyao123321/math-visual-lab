import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("Desktop shortcut creation requires Windows.");
const launcher = fileURLToPath(new URL("./launch-hidden.vbs", import.meta.url));
const nodeLauncher = fileURLToPath(new URL("./start-local.mjs", import.meta.url));
const project = fileURLToPath(new URL("../", import.meta.url));
// The shortcut is a binary .lnk, created using Windows' own supported COM API.
// Encoding avoids PowerShell 5's UTF-8/source-file issues with Chinese paths.
const script = `
$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $desktop '知数实验室（一键启动）.lnk'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $target) {
  $old = $shell.CreateShortcut($target)
  if ($old.Arguments -ne ('"' + $env:MATHLAB_OLD_LAUNCH_SCRIPT + '"') -and !$old.Arguments.Contains($env:MATHLAB_LAUNCH_SCRIPT)) { throw 'Different shortcut already exists; not overwriting it.' }
}
$shortcut = $shell.CreateShortcut($target)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\\wscript.exe'
$shortcut.Arguments = '"' + $env:MATHLAB_LAUNCH_SCRIPT + '" "' + $env:MATHLAB_NODE + '"'
$shortcut.WorkingDirectory = $env:MATHLAB_PROJECT
$shortcut.Description = '启动本地知数实验室并打开网页；已有服务时直接打开。'
$shortcut.IconLocation = Join-Path $env:SystemRoot 'System32\\shell32.dll,13'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output $target
`;
const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
  windowsHide: true, stdio: "inherit",
  env: { ...process.env, MATHLAB_NODE: process.execPath, MATHLAB_LAUNCH_SCRIPT: launcher, MATHLAB_OLD_LAUNCH_SCRIPT: nodeLauncher, MATHLAB_PROJECT: project },
});
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
