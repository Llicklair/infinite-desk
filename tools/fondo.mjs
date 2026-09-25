// Pone el mundo como fondo de escritorio en Lively (ADR 0001) y añade "Entrar en infinitas" al
// clic derecho del escritorio.
//
// `Lively setwp` solo acepta fondos de su biblioteca, y importar COPIA la carpeta: cada build
// obligaría a reimportar. Se enlaza en su lugar una entrada con IsAbsolutePath que apunta a
// wallpaper/fondo.html de este repo, así que `npm run build` basta para actualizar el fondo.
//
// El fondo no recibe teclado ni pointer lock (vive detrás de los iconos), así que "meterse" no
// es cambiarlo: es abrir el mismo mundo a pantalla completa encima (?vista=dentro, vía
// tools/entrar.ps1). Esc lo cierra y el fondo sigue ahí. Quitar el menú: npm run fondo -- --quitar
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIVELY = join(process.env.ProgramFiles ?? "C:\\Program Files", "Lively Wallpaper", "Lively.exe");
const EDGE = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const MENU = "HKCU\\Software\\Classes\\DesktopBackground\\Shell\\infinitas";
const carpeta = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper");
const biblioteca = join(process.env.LOCALAPPDATA ?? "", "Lively Wallpaper", "Library", "wallpapers", "infinitas");

const reg = (/** @type {string[]} */ ...args) => execFileSync("reg", args, { stdio: "ignore" });

if (process.argv.includes("--quitar")) {
  try { reg("delete", MENU, "/f"); } catch { /* ya no estaba */ }
  console.log("menú del escritorio quitado (el fondo de Lively se cambia desde Lively)");
  process.exit(0);
}

for (const [nombre, ruta, como] of [["Lively", LIVELY, "winget install rocksdanister.LivelyWallpaper"], ["Edge", EDGE, "viene con Windows"]]) {
  try { statSync(ruta); } catch {
    console.error(`No está ${nombre} en ${ruta} (${como}).`);
    process.exit(1);
  }
}

// --- fondo --------------------------------------------------------------------------------
const pagina = join(carpeta, "fondo.html");
const info = JSON.parse(readFileSync(join(carpeta, "LivelyInfo.json"), "utf8"));
mkdirSync(biblioteca, { recursive: true });
writeFileSync(join(biblioteca, "LivelyInfo.json"), JSON.stringify({ ...info, FileName: pagina, IsAbsolutePath: true }, null, 2));
// setwp arranca Lively si no está abierto, pero en su primer arranque el encargo se pierde
// (aún copia sus fondos de serie): de ahí el aviso de repetir.
execFileSync(LIVELY, ["setwp", "--file", biblioteca]);

// --- clic derecho: entrar -----------------------------------------------------------------
// Perfil propio: --start-fullscreen solo se respeta al arrancar un proceso de Edge nuevo, y
// así el permiso de abrir vscode:// se recuerda aparte del navegador de siempre.
const perfil = join(process.env.LOCALAPPDATA ?? "", "infinitas", "edge");
const url = pathToFileURL(join(carpeta, "index.html")).href + "?vista=dentro";
// Pasa por tools/entrar.ps1: antes de abrir, restaura las ventanas minimizadas (Edge no las
// puede capturar, y para llegar al escritorio se minimiza todo).
const entrar = join(dirname(fileURLToPath(import.meta.url)), "entrar.ps1");
const orden = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${entrar}" -Edge "${EDGE}" -Perfil "${perfil}" -Url "${url}"`;
reg("add", MENU, "/ve", "/d", "Entrar en infinitas", "/f");
reg("add", MENU, "/v", "Icon", "/d", `"${EDGE}",0`, "/f");
reg("add", `${MENU}\\command`, "/ve", "/d", orden, "/f");

console.log(`fondo: ${pagina}\n  (si Lively no estaba abierto y no cambia, repite npm run fondo)`);
console.log("clic derecho en el escritorio -> Entrar en infinitas (Esc dos veces para volver)");
