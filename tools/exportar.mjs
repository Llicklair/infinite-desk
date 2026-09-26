// Uso: node tools/exportar.mjs [repo ...]
// Sin argumentos, cada carpeta con `.git` de la carpeta de proyectos (tools/proyectos.mjs:
// `npm run carpeta` la elige; si no, la que contiene a infinite-desk).
// Pide el grafo a gb (ARCHITECTURE 2), lo dispone en 3D y lo deja en wallpaper/grafos.js
// como script clásico (ARCHITECTURE 3). Si gb no está instalado, falla o no ve módulos en un
// repo, la isla es su árbol de carpetas (ADR 0003): quien no tenga gb también tiene mundo.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { desdeCarpetas, desdeGbGraph, fusionarGrafos, queHay } from "../src/datos.js";
import { disponer } from "../src/disposicion.js";
import { resumenDeReadme } from "../src/noticias.js";
import { carpetaDeProyectos, reposEn } from "./proyectos.mjs";
import { buscarGb } from "./gb.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const proyecto = resolve(aqui, "..");
const destino = join(proyecto, "wallpaper", "grafos.js");

// Sin argumentos, todos los repos de la carpeta de proyectos. Con argumentos (rutas o nombres de
// repo: `npm run grafo -- galaxy-brain "TTS pro"`), solo esos, y las demás islas se quedan como
// estaban en grafos.js (R sobre una isla, "Rebuild maps" de la consola maestra).
const todosLosRepos = reposEn(carpetaDeProyectos());
const pedidos = process.argv.slice(2);
const parcial = pedidos.length > 0;
const repos = parcial
  ? pedidos.map((r) => (existsSync(resolve(r)) ? resolve(r) : todosLosRepos.find((x) => basename(x) === r))).filter((r) => {
    if (!r) console.log("  salto  un repo pedido que no está en la carpeta de proyectos");
    return Boolean(r);
  }).map((r) => /** @type {string} */ (r))
  : todosLosRepos;
// Varios a la vez: gb graph de un repo grande tarda (TTS pro, ~30 s) y los demás no tienen por qué esperar.
const A_LA_VEZ = Math.max(1, Number(process.env.GRAFOS_A_LA_VEZ) || 4);
const correrGb = promisify(execFile);
// Dónde está gb en esta máquina (tools/gb.mjs): en una limpia no suele estar en el PATH.
const GB = buscarGb().orden;
/** @type {any[]} */
const grafos = [];

/** Carpetas que no son del proyecto aunque estén dentro (cuando no hay git que lo diga). */
const IGNORAR = new Set([".git", "node_modules", "dist", "build", "out", "bin", "obj", ".venv", "venv", "__pycache__", "target", ".next"]);

/** Los ficheros del repo: los de git si puede (respeta .gitignore), si no, recorriendo. @param {string} repo */
function ficherosDe(repo) {
  try {
    const salida = execFileSync("git", ["-C", repo, "ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const lista = salida.split("\n").filter(Boolean);
    if (lista.length) return lista;
  } catch { /* sin git o sin commits: se recorre */ }
  /** @type {string[]} */
  const lista = [];
  const recorrer = (/** @type {string} */ dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORAR.has(d.name)) continue;
      const ruta = join(dir, d.name);
      if (d.isDirectory()) recorrer(ruta);
      else lista.push(relative(repo, ruta).replace(/\\/g, "/"));
    }
  };
  recorrer(repo);
  return lista;
}

/** Cuándo fue el último commit (segundos desde 1970), o nada si no hay git o commits. @param {string} repo */
function ultimoCommit(repo) {
  try {
    const s = execFileSync("git", ["-C", repo, "log", "-1", "--format=%ct"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return s ? Number(s) : undefined;
  } catch { return undefined; }
}

/** Lo que cuenta su README, en corto (la ficha de la isla: clic en su base). @param {string} repo */
function resumen(repo) {
  const readme = ["README.md", "readme.md", "Readme.md", "README.markdown"].map((n) => join(repo, n)).find((f) => existsSync(f));
  try { return readme ? resumenDeReadme(readFileSync(readme, "utf8")) || undefined : undefined; } catch { return undefined; }
}

/** El grafo de gb, o por qué no lo hay. @param {string} repo */
async function deGb(repo) {
  if (!GB) return { porque: "galaxy-brain isn't installed" };
  try {
    const { stdout: salida } = await correrGb(GB[0], [...GB.slice(1), "graph", "--json", repo], {
      encoding: "utf8",
      env: { ...process.env, PYTHONUTF8: "1" },
      maxBuffer: 256 * 1024 * 1024,
      timeout: 120000,
      windowsHide: true,
    });
    const grafo = desdeGbGraph(JSON.parse(salida.replace(/^﻿/, "")));
    // Ninguno: el repo no tiene código que gb lea (HTML, Markdown…); se dice qué tiene, más abajo.
    return grafo.nodos.length >= 2 ? { grafo }
      : grafo.nodos.length === 0 ? { porque: "", sinCodigo: true }
      : { porque: "just 1 module: too small for a dependency graph" };
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e);
    const e2 = /** @type {any} */ (err);
    const motivo = String(e2.stderr ?? "").trim().split("\n").pop() || err.message.split("\n")[0];
    return { porque: err.code === "ENOENT" ? "galaxy-brain isn't installed" : e2.killed ? "gb took over 2 minutes" : `gb failed: ${motivo.slice(0, 200)}` };
  }
}

/** Una isla: el grafo de gb, o si no, su árbol de carpetas. @param {string} repo */
async function isla(repo) {
  const nombre = basename(repo);
  const t0 = Date.now();
  const gb = await deGb(repo);
  let grafo = gb.grafo;
  /** @type {string | undefined} */
  let porque = gb.porque;
  if (!grafo) {
    const ficheros = ficherosDe(repo);
    // Que la consola maestra lo diga claro: no es un fallo, es que no hay código que mapear.
    if (gb.sinCodigo) porque = `no code for galaxy-brain here (${queHay(ficheros) || "no files"}): its map is the folder tree`;
    grafo = desdeCarpetas(repo, ficheros);
    if (grafo.nodos.length < 2) {
      console.log(`  salto  ${nombre}: ${porque} y no tiene ficheros que dibujar`);
      return;
    }
  }
  const posiciones = disponer(grafo);
  // Con gb, también el árbol de carpetas: la tecla T alterna entre los dos en el mundo.
  const carpetas = grafo.fuente === "gb" ? desdeCarpetas(repo, ficherosDe(repo)) : null;
  const alt = carpetas && carpetas.nodos.length >= 2 ? { ...carpetas, posiciones: disponer(carpetas) } : undefined;
  // `generado` y `porque` (por qué es árbol de carpetas): la pestaña Maps de la consola maestra.
  grafos.push({ nombre, ...grafo, posiciones, alt, ultimoCommit: ultimoCommit(repo), resumen: resumen(repo),
    generado: Math.floor(Date.now() / 1000), ...(grafo.fuente === "carpetas" ? { porque, ...(gb.sinCodigo ? { sinCodigo: true } : {}) } : {}) });
  const que = grafo.fuente === "carpetas"
    ? `${grafo.nodos.length} carpetas y ficheros (sin gb: ${porque})`
    : `${grafo.nodos.length} módulos, ${grafo.aristas.length} aristas, ${grafo.ciclos} ciclos`;
  console.log(`  isla   ${nombre}: ${que} (${Date.now() - t0} ms)`);
}

const t0 = Date.now();
const cola = [...repos];
await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, cola.length) }, async () => {
  for (let r = cola.shift(); r; r = cola.shift()) await isla(r);
}));
const hechas = grafos.map((g) => g.nombre);
const orden = todosLosRepos.map((r) => basename(r));
// Parcial: las demás islas, tal como estaban.
let viejas = [];
if (parcial) {
  try {
    const texto = readFileSync(destino, "utf8");
    viejas = JSON.parse(texto.slice(texto.indexOf("["), texto.lastIndexOf("]") + 1));
  } catch { /* no había grafos.js: solo estas */ }
}
const todas = fusionarGrafos(viejas, grafos, orden);

if (todas.length === 0) {
  console.error("Ningún repo con módulos ni ficheros: nada que pintar.");
  process.exit(1);
}
// De golpe (temporal + renombrar): el mundo lo relee mientras se regenera (R, puente) y no
// debe ver nunca un fichero a medio escribir.
writeFileSync(`${destino}.tmp`, `window.GB_GRAFOS = ${JSON.stringify(todas)};\n`);
renameSync(`${destino}.tmp`, destino);
console.log(`${todas.length} islas -> ${destino}${parcial ? ` (rehechas: ${hechas.join(", ") || "ninguna"})` : ""} en ${((Date.now() - t0) / 1000).toFixed(1)} s, ${A_LA_VEZ} a la vez`);
