// Dónde guarda la consola maestra lo suyo, fuera del repo y de la carpeta de proyectos (si los
// worktrees de los agentes estuvieran dentro, saldrían como islas): %LOCALAPPDATA%\infinite-desk en
// Windows, ~/Library/Application Support/infinite-desk en macOS.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** @typedef {import("../src/orquesta.js").Agente} Agente */

export const DATOS = process.platform === "darwin"
  ? join(homedir(), "Library", "Application Support", "infinite-desk")
  : join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "infinite-desk");
/** Las fichas de los agentes (<id>.json). */
export const FICHAS = join(DATOS, "agentes");
/** Los worktrees de los agentes, por repo: <WORKTREES>/<repo>/<nombre>. */
export const WORKTREES = join(DATOS, "worktrees");

/**
 * Las carpetas de dependencias que el agente ENLAZA desde el repo principal en su worktree (en
 * Windows, uniones de directorio). Al descartarlo se quitan primero y sin seguirlas: un borrado
 * recursivo que entrase por el enlace vaciaría las del repo de verdad.
 */
export const ENLAZADAS = ["node_modules", ".venv", "venv"];

/** @param {string} id */
export function fichaDeAgente(id) {
  mkdirSync(FICHAS, { recursive: true });
  return join(FICHAS, `${id}.json`);
}

/** Todas las fichas, la más reciente primero. @returns {Agente[]} */
export function leerAgentes() {
  /** @type {Agente[]} */
  const agentes = [];
  try {
    for (const f of readdirSync(FICHAS)) {
      if (!f.endsWith(".json")) continue;
      try { agentes.push(JSON.parse(readFileSync(join(FICHAS, f), "utf8"))); } catch { /* a medio escribir: la próxima vez */ }
    }
  } catch { /* aún no hay ninguna */ }
  return agentes.sort((a, b) => b.inicio.localeCompare(a.inicio));
}
