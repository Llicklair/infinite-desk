// Dónde guarda la consola maestra lo suyo, fuera del repo y de la carpeta de proyectos (si los
// worktrees de los agentes estuvieran dentro, saldrían como islas): %LOCALAPPDATA%\infinite-desk en
// Windows, ~/Library/Application Support/infinite-desk en macOS.
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

// --- el registro de actividad (src/actividad.js) -----------------------------------------------
/** Una línea JSON por evento; se recorta a los últimos MAX_EVENTOS de vez en cuando. */
export const ACTIVIDAD = join(DATOS, "actividad.jsonl");
/** Lo ya visto (el último commit de cada repo, las capturas de fallos): para apuntar solo lo nuevo. */
const VISTOS = join(DATOS, "actividad-vistos.json");
const MAX_EVENTOS = 3000;

/** @typedef {import("../src/actividad.js").Evento} Evento */

/** Apunta eventos al final del registro (una línea cada uno: varios procesos pueden escribir a la vez). @param {Evento[]} eventos */
export function anotar(eventos) {
  if (!eventos.length) return;
  mkdirSync(DATOS, { recursive: true });
  appendFileSync(ACTIVIDAD, eventos.map((e) => `${JSON.stringify(e)}\n`).join(""));
}

/** Los últimos `n` eventos, el más reciente primero; y si el fichero ha crecido mucho, lo recorta. @param {number} n */
export function leerActividad(n) {
  let lineas = [];
  try { lineas = readFileSync(ACTIVIDAD, "utf8").split("\n").filter(Boolean); } catch { return []; }
  if (lineas.length > MAX_EVENTOS * 1.5) {
    lineas = lineas.slice(-MAX_EVENTOS);
    try { writeFileSync(ACTIVIDAD, `${lineas.join("\n")}\n`); } catch { /* otro proceso escribiendo: la próxima vez */ }
  }
  /** @type {Evento[]} */
  const r = [];
  for (const l of lineas.slice(-n)) { try { r.push(JSON.parse(l)); } catch { /* línea a medias */ } }
  return r.reverse();
}

/** @returns {{heads?: Record<string, string>, fallos?: string[]}} */
export function leerVistos() {
  try { return JSON.parse(readFileSync(VISTOS, "utf8")); } catch { return {}; }
}
/** @param {{heads?: Record<string, string>, fallos?: string[]}} v */
export function guardarVistos(v) {
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(VISTOS, JSON.stringify(v));
}
