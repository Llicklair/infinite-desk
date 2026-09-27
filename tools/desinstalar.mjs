// Desinstalar.cmd (o Configuración → Aplicaciones → infinite-desk): lo quita todo lo que puso
// Instalar.cmd. Para lo que esté en marcha, quita el fondo animado, "Entrar" (clic derecho y menú
// Inicio) y la entrada de Aplicaciones, y borra la carpeta del programa. Lo de
// %LOCALAPPDATA%\infinite-desk (los recuerdos de Kiri y Atlas, el espacio de trabajo, los registros)
// se queda, salvo con --todo: son tuyos, y si vuelves a instalarlo siguen ahí.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("This uninstaller is for Windows.");
  process.exit(1);
}
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const todo = process.argv.includes("--todo");
const datos = join(process.env.LOCALAPPDATA ?? "", "infinite-desk");

console.log("Stopping infinite-desk…");
try {
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(raiz, "tools", "parar.ps1")], { stdio: "ignore" });
} catch { /* nada en marcha */ }
console.log("Removing the wallpaper and the Enter entries…");
execFileSync(process.execPath, [join(raiz, "tools", "fondo.mjs"), "--quitar"], { stdio: "inherit" });
try {
  execFileSync("reg", ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\infinite-desk", "/f"], { stdio: "ignore" });
} catch { /* ya no estaba */ }
if (todo && existsSync(datos)) {
  rmSync(datos, { recursive: true, force: true });
  console.log(`Removed your data in ${datos}.`);
} else if (existsSync(datos)) {
  console.log(`Your data stays in ${datos} (Kiri's and Atlas's memories, your workspace, logs): delete that folder too to remove it.`);
}

// La carpeta del programa no se puede borrar mientras corren este node.exe y el Desinstalar.cmd que
// espera una tecla: la borra aparte un PowerShell que lo reintenta cada segundo (un minuto como mucho).
// Con `start` de cmd, que lo deja vivo al acabar este: lanzado con `detached` de node, powershell ni
// arrancaba (medido). La orden, codificada: sin comillas que escapar en la ruta.
if (existsSync(join(raiz, "node", "node.exe"))) {
  const ruta = raiz.replaceAll("'", "''");
  const orden = `for ($i = 0; $i -lt 60; $i++) { Remove-Item -LiteralPath '${ruta}' -Recurse -Force -ErrorAction SilentlyContinue; if (-not (Test-Path -LiteralPath '${ruta}')) { break }; Start-Sleep 1 }`;
  spawn("cmd.exe", ["/c", "start", '""', "/min", "powershell", "-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(orden, "utf16le").toString("base64")], {
    cwd: process.env.TEMP ?? dirname(raiz), stdio: "ignore", windowsHide: true,
  });
  console.log(`infinite-desk is uninstalled (${raiz} goes away in a few seconds).`);
} else {
  console.log("infinite-desk is uninstalled. (This is a development copy: its folder stays.)");
}
