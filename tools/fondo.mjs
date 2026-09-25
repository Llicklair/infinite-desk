// Pone el mundo como fondo animado y deja a mano "Entrar en infinite-desk" (ADR 0004: sin Lively,
// sin más programas que el navegador).
//
// Windows: el fondo es `infinite-desk-bridge --fondo` (puente/Fondo.cs), un Chrome por monitor
// detrás de los iconos. Corre desde una COPIA del puente en %LOCALAPPDATA%\infinite-desk\fondo:
// si corriera desde puente/bin, el .exe quedaría bloqueado y `npm run puente` (y `terminado`)
// fallaría mientras el fondo esté puesto. Arranca solo al iniciar sesión (HKCU\...\Run).
// "Entrar" va en el clic derecho del escritorio (tools/entrar.ps1), con Edge: viene con Windows y
// con él se midió todo el puente (ADR 0002). Si no hay Edge, Chrome.
//
// macOS: "Entrar" es una app en ~/Applications (tools/entrar.sh) que se puede dejar en el Dock.
// El fondo animado de macOS aún no está (pendiente en docs/evidencia.md).
//
// Quitarlo todo: npm run fondo -- --quitar
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAC = process.platform === "darwin";
if (!MAC && process.platform !== "win32") {
  console.error("npm run fondo is for Windows and macOS.");
  process.exit(1);
}
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const carpeta = join(raiz, "wallpaper");
const datos = MAC ? join(homedir(), "Library", "Application Support", "infinite-desk") : join(process.env.LOCALAPPDATA ?? "", "infinite-desk");
const quitar = process.argv.includes("--quitar");
const url = pathToFileURL(join(carpeta, "index.html")).href + "?vista=dentro";

if (MAC) mac();
else windows();

function windows() {
  const MENU = "HKCU\\Software\\Classes\\DesktopBackground\\Shell\\infinite-desk";
  const ARRANQUE = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const compilado = join(raiz, "puente", "bin", "Release", "net10.0-windows");
  const copia = join(datos, "fondo");
  const exe = join(copia, "infinite-desk-bridge.exe");
  const reg = (/** @type {string[]} */ ...args) => execFileSync("reg", args, { stdio: "ignore" });

  // Parar el fondo que haya (el de esta copia o uno anterior): si no, la copia está bloqueada.
  if (existsSync(exe)) execFileSync(exe, ["--fondo", "--parar"], { stdio: "ignore" });
  else if (existsSync(join(compilado, "infinite-desk-bridge.exe"))) execFileSync(join(compilado, "infinite-desk-bridge.exe"), ["--fondo", "--parar"], { stdio: "ignore" });
  esperar(4000); // cierra sus Chrome por las buenas y repone el fondo de Windows

  if (quitar) {
    for (const args of [[MENU, "/f"], [ARRANQUE, "/v", "infinite-desk-fondo", "/f"]]) {
      try { reg("delete", ...args); } catch { /* ya no estaba */ }
    }
    console.log("removed: animated wallpaper, its autostart and the desktop right-click entry");
    return;
  }

  if (!existsSync(join(compilado, "infinite-desk-bridge.exe"))) {
    console.error("The bridge isn't built yet: run npm run terminado (or npm run puente) first.");
    process.exit(1);
  }
  rmSync(copia, { recursive: true, force: true });
  cpSync(compilado, copia, { recursive: true });
  const orden = `"${exe}" --fondo "${carpeta}"`;
  reg("add", ARRANQUE, "/v", "infinite-desk-fondo", "/d", orden, "/f");
  spawn(exe, ["--fondo", carpeta], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  console.log("animated wallpaper: on (and at every sign-in)");

  const navegador = [
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].find((c) => existsSync(c));
  if (!navegador) {
    console.error("No Edge or Chrome found for Enter infinite-desk.");
    process.exit(1);
  }
  // Perfil propio: --start-fullscreen solo se respeta al arrancar un proceso nuevo del navegador, y
  // así el permiso de abrir vscode:// se recuerda aparte del navegador de siempre.
  const perfil = join(datos, navegador.endsWith("msedge.exe") ? "edge" : "chrome");
  // Pasa por tools/entrar.ps1: antes de abrir, restaura las ventanas minimizadas (el navegador no
  // las puede capturar) y arranca el puente si no escucha.
  const entrar = join(raiz, "tools", "entrar.ps1");
  reg("add", MENU, "/ve", "/d", "Enter infinite-desk", "/f");
  reg("add", MENU, "/v", "Icon", "/d", `"${navegador}",0`, "/f");
  reg("add", `${MENU}\\command`, "/ve", "/d",
    `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${entrar}" -Navegador "${navegador}" -Perfil "${perfil}" -Url "${url}"`, "/f");
  console.log("right-click the desktop -> Enter infinite-desk (Esc twice to come back)");
}

function mac() {
  const APP = join(homedir(), "Applications", "Enter infinite-desk.app");
  if (quitar) {
    rmSync(APP, { recursive: true, force: true });
    console.log(`removed ${APP}`);
    return;
  }
  const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", join(homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")]
    .find((c) => existsSync(c));
  if (!chrome) {
    console.error("No Google Chrome found in /Applications or ~/Applications.");
    process.exit(1);
  }
  const perfil = join(datos, "chrome");
  mkdirSync(datos, { recursive: true });
  const entrar = join(raiz, "tools", "entrar.sh");
  const orden = [entrar, chrome, perfil, url].map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(" ");
  mkdirSync(dirname(APP), { recursive: true });
  rmSync(APP, { recursive: true, force: true });
  // osacompile viene con macOS: una app de AppleScript que solo lanza entrar.sh.
  execFileSync("osacompile", ["-o", APP, "-e", `do shell script ${JSON.stringify(`/bin/bash ${orden} > /dev/null 2>&1 &`)}`]);
  console.log(`${APP}: open it from Spotlight or drag it to the Dock (Esc twice to come back)`);
  console.log("The animated wallpaper isn't available on macOS yet.");
}

/** @param {number} ms */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
