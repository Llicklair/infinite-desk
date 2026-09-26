// El espíritu de la zona zen, por fuera: habla con Claude (`claude -p`, la cuenta del usuario, sin
// herramientas: solo conversa) y guarda lo que recuerda en el equipo, en DATOS/espiritu/recuerdos.json.
// La conversación no se guarda. Lo llama tools/orquestador.mjs (órdenes hablar, recordar, recuerdos
// y olvidar), que es lo que el puente deja correr al mundo. La forma de ser y los recuerdos, en
// src/apoyo.js.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { conversacion, fusionar, instrucciones, leerCambios, pedirRecuerdos, primerVideo, separarAcciones } from "../src/apoyo.js";
import { DATOS } from "./orquestador-datos.mjs";

const CASA = join(DATOS, "espiritu");
const RECUERDOS = join(CASA, "recuerdos.json");
const WIN = process.platform === "win32";

/** @returns {import("../src/apoyo.js").Recuerdo[]} */
export function leerRecuerdos() {
  try { return JSON.parse(readFileSync(RECUERDOS, "utf8")).recuerdos ?? []; } catch { return []; }
}

/** @param {import("../src/apoyo.js").Recuerdo[]} recuerdos */
function guardar(recuerdos) {
  mkdirSync(CASA, { recursive: true });
  const tmp = `${RECUERDOS}.tmp`;
  writeFileSync(tmp, JSON.stringify({ recuerdos }, null, 2));
  renameSync(tmp, RECUERDOS);
}

/**
 * Dónde está claude: en Windows, el claude.exe que hay detrás del claude.cmd de npm (así se lanza
 * sin cmd.exe, que no deja pasar argumentos vacíos como `--tools ""`); si no, el del PATH.
 */
function ejecutable() {
  if (!WIN) return "claude";
  for (const dir of (process.env.PATH ?? "").split(";")) {
    if (!dir || !existsSync(join(dir, "claude.cmd"))) continue;
    const exe = join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(exe)) return exe;
  }
  for (const dir of (process.env.PATH ?? "").split(";")) if (dir && existsSync(join(dir, "claude.exe"))) return join(dir, "claude.exe");
  throw new Error("Claude Code is not installed (claude not found)");
}

/**
 * `claude -p` sin ajustes ni CLAUDE.md de nadie (corre en su carpeta de datos), sin sesión
 * guardada; sin herramientas, o solo las de leer que se le den, en las carpetas que se le den (Atlas
 * lee el código de los repos). El prompt de sistema va en un fichero y la charla por la entrada estándar.
 * @param {string} sistema @param {string} texto
 * @param {{casa?: string, leer?: string[]}} [op] `leer`: carpetas que puede leer (con Read, Grep y Glob)
 * @returns {Promise<string>}
 */
export function claude(sistema, texto, op = {}) {
  const casa = op.casa ?? CASA;
  mkdirSync(casa, { recursive: true });
  const fichero = join(casa, `sistema-${process.pid}.txt`);
  writeFileSync(fichero, sistema);
  const herramientas = op.leer?.length ? ["--tools", "Read,Grep,Glob", "--allowedTools", "Read", "Grep", "Glob", ...op.leer.flatMap((d) => ["--add-dir", d])] : ["--tools", ""];
  const args = ["-p", ...herramientas, "--system-prompt-file", fichero, "--no-session-persistence", "--setting-sources", "", "--strict-mcp-config", "--output-format", "text"];
  return new Promise((resolver, fallar) => {
    const p = spawn(ejecutable(), args, { cwd: casa, windowsHide: true });
    let salida = "", error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    const reloj = setTimeout(() => p.kill(), 150000);
    const fin = () => { clearTimeout(reloj); try { rmSync(fichero, { force: true }); } catch { /* ya no está */ } };
    p.on("error", (e) => { fin(); fallar(e); });
    p.on("close", (codigo) => {
      fin();
      if (codigo === 0 && salida.trim()) resolver(salida.trim());
      else fallar(new Error((error || salida).trim().split("\n").at(-1) || `claude exited with ${codigo}`));
    });
    p.stdin.end(texto);
  });
}

/** Qué día es, para que el espíritu lo sepa (y fecha los recuerdos). */
const hoy = () => new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fecha = () => new Date().toISOString().slice(0, 10);

/**
 * Un turno: lo que contesta el espíritu a la conversación hasta ahora.
 * @param {import("../src/apoyo.js").Turno[]} turnos
 */
export async function hablar(turnos) {
  if (!Array.isArray(turnos) || !turnos.length) throw new Error("nothing to answer");
  // Lo que dice, sin las líneas de acción (esas las hace el mundo: música, un vídeo, el cielo).
  return separarAcciones(await claude(instrucciones(leerRecuerdos(), hoy()), conversacion(turnos)));
}

/**
 * Al acabar una charla: lo que merece recordar se añade (y lo que cambió, se cambia).
 * @param {import("../src/apoyo.js").Turno[]} turnos
 */
export async function recordar(turnos) {
  const antes = leerRecuerdos();
  if (!turnos?.some((t) => t.quien === "yo")) return { recuerdos: antes };
  const salida = await claude("Eres quien decide qué recordar de una charla. Contestas solo con JSON.", pedirRecuerdos(turnos, antes));
  const despues = fusionar(antes, leerCambios(salida), fecha(), () => randomUUID().slice(0, 8));
  guardar(despues);
  return { recuerdos: despues };
}

/**
 * Un vídeo de YouTube para una búsqueda (el primero de los resultados, solo vídeos): su enlace y
 * su título. Sin clave de API: la página de resultados trae los datos. Si no se entiende, la
 * búsqueda misma.
 * @param {string} busqueda
 */
export async function buscarVideo(busqueda) {
  const q = encodeURIComponent(busqueda.slice(0, 100));
  const resultados = `https://www.youtube.com/results?search_query=${q}`;
  try {
    const r = await fetch(`${resultados}&sp=EgIQAQ%253D%253D`, {
      headers: { "Accept-Language": "es-ES,es;q=0.9,en;q=0.8", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    const v = primerVideo(await r.text());
    if (v) return { url: `https://www.youtube.com/watch?v=${v.id}`, titulo: v.titulo };
  } catch { /* sin red o YouTube cambió: la búsqueda */ }
  return { url: resultados, titulo: `YouTube: ${busqueda}` };
}

/** Olvidar uno (por id) o todo ("todo"). @param {string} id */
export function olvidar(id) {
  const quedan = id === "todo" ? [] : leerRecuerdos().filter((r) => r.id !== id);
  if (id === "todo" || existsSync(RECUERDOS)) guardar(quedan);
  return { recuerdos: quedan };
}
