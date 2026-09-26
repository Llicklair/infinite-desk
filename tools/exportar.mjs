// Uso: node tools/exportar.mjs [repo ...]
// Sin argumentos, cada carpeta con `.git` de la carpeta de proyectos (tools/proyectos.mjs:
// `npm run carpeta` la elige; si no, la que contiene a infinite-desk).
// Pide el grafo a gb (ARCHITECTURE 2), lo dispone en 3D y lo deja en wallpaper/grafos.js
// como script clásico (ARCHITECTURE 3). Si gb no está instalado, falla o no ve módulos en un
// repo, la isla es su árbol de carpetas (ADR 0003): quien no tenga gb también tiene mundo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { desdeCarpetas, desdeGbGraph } from "../src/datos.js";
import { disponer } from "../src/disposicion.js";
import { resumenDeReadme } from "../src/noticias.js";
import { carpetaDeProyectos, reposEn } from "./proyectos.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const proyecto = resolve(aqui, "..");
const destino = join(proyecto, "wallpaper", "grafos.js");

const repos = process.argv.length > 2 ? process.argv.slice(2).map((r) => resolve(r)) : reposEn(carpetaDeProyectos());
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
function deGb(repo) {
  try {
    const salida = execFileSync("gb", ["graph", "--json", repo], {
      encoding: "utf8",
      env: { ...process.env, PYTHONUTF8: "1" },
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
    const grafo = desdeGbGraph(JSON.parse(salida.replace(/^﻿/, "")));
    return grafo.nodos.length >= 2 ? { grafo } : { porque: `gb ve ${grafo.nodos.length} módulo(s)` };
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e);
    return { porque: err.code === "ENOENT" ? "galaxy-brain no está instalado" : `gb falló (${err.message.split("\n")[0]})` };
  }
}

for (const repo of repos) {
  const nombre = basename(repo);
  const t0 = Date.now();
  const gb = deGb(repo);
  let grafo = gb.grafo;
  if (!grafo) {
    grafo = desdeCarpetas(repo, ficherosDe(repo));
    if (grafo.nodos.length < 2) {
      console.log(`  salto  ${nombre}: ${gb.porque} y no tiene ficheros que dibujar`);
      continue;
    }
  }
  const posiciones = disponer(grafo);
  // Con gb, también el árbol de carpetas: la tecla T alterna entre los dos en el mundo.
  const carpetas = grafo.fuente === "gb" ? desdeCarpetas(repo, ficherosDe(repo)) : null;
  const alt = carpetas && carpetas.nodos.length >= 2 ? { ...carpetas, posiciones: disponer(carpetas) } : undefined;
  grafos.push({ nombre, ...grafo, posiciones, alt, ultimoCommit: ultimoCommit(repo), resumen: resumen(repo) });
  const que = grafo.fuente === "carpetas"
    ? `${grafo.nodos.length} carpetas y ficheros (sin gb: ${gb.porque})`
    : `${grafo.nodos.length} módulos, ${grafo.aristas.length} aristas, ${grafo.ciclos} ciclos`;
  console.log(`  isla   ${nombre}: ${que} (${Date.now() - t0} ms)`);
}

if (grafos.length === 0) {
  console.error("Ningún repo con módulos ni ficheros: nada que pintar.");
  process.exit(1);
}
// De golpe (temporal + renombrar): el mundo lo relee mientras se regenera (R, puente) y no
// debe ver nunca un fichero a medio escribir.
writeFileSync(`${destino}.tmp`, `window.GB_GRAFOS = ${JSON.stringify(grafos)};\n`);
renameSync(`${destino}.tmp`, destino);
console.log(`${grafos.length} islas -> ${destino}`);
