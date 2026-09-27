// Instalar.cmd (el zip de npm run empaquetar): instala infinite-desk para este usuario, sin
// permisos de administrador ni más programas, o lo actualiza a esta versión. Pasos:
//   1. se copia a %LOCALAPPDATA%\Programs\infinite-desk (el zip se puede borrar después); al
//      actualizar, antes se para lo que esté en marcha y se conserva lo de esta máquina (la carpeta
//      de proyectos, las islas, las noticias y la marca);
//   2. desde la copia: la carpeta de proyectos (cada repo dentro es una isla), si aún no la hay;
//   3. las islas (tools/exportar.mjs; con galaxy-brain si lo encuentra, si no, árboles de carpetas);
//   4. el fondo animado, "Entrar en infinite-desk" (clic derecho del escritorio y menú Inicio) y la
//      entrada de Configuración → Aplicaciones para desinstalarlo (tools/fondo.mjs).
// Lo que sigue en %LOCALAPPDATA%\infinite-desk (recuerdos de Kiri y Atlas, registros) no se toca.
//
// Sin preguntar la carpeta de proyectos: --carpeta <ruta>. Para probarlo sin tocar la instalación
// de verdad: --destino <carpeta> --sin-fondo.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("This installer is for Windows.");
  process.exit(1);
}
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const opcion = (/** @type {string} */ n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const destino = resolve(opcion("--destino") ?? join(process.env.LOCALAPPDATA ?? "", "Programs", "infinite-desk"));
const sinFondo = process.argv.includes("--sin-fondo");
const { version } = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
/** Lo de cada máquina: se conserva al actualizar. */
const PROPIO = ["infinite-desk.local.json", "wallpaper/grafos.js", "wallpaper/noticias.js", "wallpaper/marca.js"];

if (raiz.toLowerCase() !== destino.toLowerCase()) copiar();
else instalarAqui();

function copiar() {
  console.log(`infinite-desk ${version}\n`);
  const actualizar = existsSync(join(destino, "tools", "instalar.mjs"));
  if (actualizar) {
    // Lo que corre (el puente y el fondo, desde sus copias de %LOCALAPPDATA%\infinite-desk, las de
    // cualquier instalación) tiene los ficheros cogidos. Con --destino (probar) no se toca: pararía
    // lo de verdad, no lo de la prueba (pasó: paró el puente y el fondo del equipo de desarrollo).
    if (!opcion("--destino")) {
      console.log("Updating: stopping infinite-desk first (the space, the bridge and the wallpaper)…");
      try {
        execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(raiz, "tools", "parar.ps1")], { stdio: "ignore" });
      } catch { /* nada en marcha */ }
    } else console.log("Updating (--destino: nothing running is stopped)…");
    for (const d of readdirSync(destino)) {
      if (d === "infinite-desk.local.json") continue;
      if (d === "wallpaper") {
        for (const f of readdirSync(join(destino, d))) if (!PROPIO.includes(`wallpaper/${f}`)) rmSync(join(destino, d, f), { recursive: true, force: true });
        continue;
      }
      rmSync(join(destino, d), { recursive: true, force: true });
    }
  }
  console.log(`Copying to ${destino}…`);
  mkdirSync(destino, { recursive: true });
  cpSync(raiz, destino, { recursive: true, force: true });
  // El resto, desde la copia: sus rutas son las que quedan puestas en el registro.
  const r = spawnSync(join(destino, "node", "node.exe"), [join(destino, "tools", "instalar.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
  if (r.status === 0) console.log("\nYou can delete the downloaded zip and its folder now.");
  process.exit(r.status ?? 1);
}

function instalarAqui() {
  const node = process.execPath;
  const correr = (/** @type {string} */ script, /** @type {string[]} */ args = []) =>
    spawnSync(node, [join(raiz, "tools", script), ...args], { cwd: raiz, stdio: "inherit" }).status === 0;

  // La carpeta de proyectos: la que ya hubiera (al actualizar), o se elige ahora.
  /** @type {unknown} */
  let yaElegida = null;
  try { yaElegida = JSON.parse(readFileSync(join(raiz, "infinite-desk.local.json"), "utf8")).proyectos; } catch { /* primera vez */ }
  const dada = opcion("--carpeta");
  if (dada) correr("proyectos.mjs", [dada]);
  else if (typeof yaElegida === "string" && existsSync(yaElegida)) console.log(`\nProjects folder: ${yaElegida} (P inside the space changes it)`);
  else {
    console.log("\nPick the folder with your projects: every git repo inside becomes an island.");
    correr("proyectos.mjs");
  }

  console.log("\nBuilding the islands (with galaxy-brain if it's installed; if not, folder trees)…");
  if (!correr("exportar.mjs")) console.log("The islands couldn't be built now: the bridge tries again when you step in (or press R inside).");

  if (sinFondo) {
    console.log("\n(--sin-fondo: no wallpaper, no Enter entries, no Settings entry)");
    return;
  }
  console.log("\nAnimated wallpaper and Enter infinite-desk…");
  if (!correr("fondo.mjs")) process.exit(1);
  desinstalable();

  console.log(`
Done. To step in: right-click the desktop → Enter infinite-desk, or Start → infinite-desk.
Click to enter, and press N to bring your first window in (H shows all the keys).

Optional, all of it (the space works without them):
  - Google Chrome: better voice recognition for Kiri and Atlas (V).
  - Claude Code (claude): to talk to Kiri and Atlas and to send agents.
  - galaxy-brain: code maps on the islands; install it inside the space: O → Accounts.
To turn the animated wallpaper off or on: tools\\alternar-fondo.cmd. To stop everything: Parar.cmd.
To uninstall: Settings → Apps → infinite-desk, or Desinstalar.cmd in ${raiz}.`);
}

/** La entrada de Configuración → Aplicaciones (por usuario, sin administrador). */
function desinstalable() {
  const CLAVE = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\infinite-desk";
  const poner = (/** @type {string} */ nombre, /** @type {string} */ tipo, /** @type {string} */ valor) =>
    execFileSync("reg", ["add", CLAVE, "/v", nombre, "/t", tipo, "/d", valor, "/f"], { stdio: "ignore" });
  poner("DisplayName", "REG_SZ", "infinite-desk");
  poner("DisplayVersion", "REG_SZ", version);
  poner("Publisher", "REG_SZ", "Marcos Recio (Llicklair)");
  poner("InstallLocation", "REG_SZ", raiz);
  poner("DisplayIcon", "REG_SZ", join(raiz, "puente", "bin", "Release", "net10.0-windows10.0.19041.0", "infinite-desk-bridge.exe"));
  poner("UninstallString", "REG_SZ", `"${join(raiz, "Desinstalar.cmd")}"`);
  poner("NoModify", "REG_DWORD", "1");
  poner("NoRepair", "REG_DWORD", "1");
}
