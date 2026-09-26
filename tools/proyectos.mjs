// La carpeta de proyectos: cada repo que hay dentro es una isla. Cada máquina tiene la suya, así
// que va en infinite-desk.local.json (sin versionar), que leen también el puente y el export.
// Sin ese fichero, la carpeta que contiene a infinite-desk (lo de siempre: clonarlo junto a tus
// proyectos). Uso real: "en una máquina limpia la ruta puede ser distinta".
//
// npm run carpeta              abre el selector de carpetas del sistema
// npm run carpeta -- <ruta>    la fija sin preguntar
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FICHERO = join(raiz, "infinite-desk.local.json");

/** La carpeta de proyectos elegida, o la que contiene a infinite-desk si no se eligió ninguna. */
export function carpetaDeProyectos() {
  try {
    const { proyectos } = JSON.parse(readFileSync(FICHERO, "utf8"));
    if (typeof proyectos === "string" && existsSync(proyectos)) return resolve(proyectos);
  } catch { /* sin fichero, o roto: lo de siempre */ }
  return dirname(raiz);
}

/** Los repos (carpetas con `.git`) justo dentro de una carpeta. @param {string} carpeta */
export function reposEn(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(carpeta, d.name, ".git")))
    .map((d) => join(carpeta, d.name));
}

/** El selector de carpetas del sistema (el de Windows, o `choose folder` en macOS), o null si se cancela. */
function elegir() {
  const actual = carpetaDeProyectos();
  if (process.platform === "darwin") {
    try {
      return execFileSync("osascript", ["-e", `POSIX path of (choose folder with prompt "Folder with your projects (each repo inside becomes an island)" default location POSIX file ${JSON.stringify(actual)})`], { encoding: "utf8" }).trim() || null;
    } catch { return null; } // cancelado
  }
  const orden = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$d.Description = 'Folder with your projects (each repo inside becomes an island)'",
    `$d.SelectedPath = '${actual.replaceAll("'", "''")}'`,
    "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }",
  ].join("; ");
  return execFileSync("powershell", ["-NoProfile", "-STA", "-Command", orden], { encoding: "utf8" }).trim() || null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dada = process.argv[2];
  const elegida = dada ? resolve(dada) : elegir();
  if (!elegida) {
    console.log("Nothing chosen: the projects folder stays as it was.");
    process.exit(0);
  }
  if (!existsSync(elegida) || !statSync(elegida).isDirectory()) {
    console.error(`${elegida} is not a folder.`);
    process.exit(1);
  }
  /** @type {Record<string, unknown>} */
  let datos = {};
  try { datos = JSON.parse(readFileSync(FICHERO, "utf8")); } catch { /* sin fichero todavía */ }
  // Sin borrar lo demás (la ruta de gb que apunta tools/gb.mjs).
  writeFileSync(FICHERO, JSON.stringify({ ...datos, proyectos: elegida }, null, 2) + "\n");
  const repos = reposEn(elegida);
  console.log(`Projects folder: ${elegida} (${repos.length} repo${repos.length === 1 ? "" : "s"} with git)`);
  console.log(repos.length ? "Now run npm run grafo to rebuild the islands (the bridge does it on its own when you step in)."
    : "No repos with git in there: the islands would come out empty.");
}
