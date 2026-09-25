// Última pieza de `npm run terminado`: el fondo construido está completo y es cargable.
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper");
/** @type {string[]} */
const fallos = [];
const falla = (/** @type {string} */ m) => fallos.push(m);

const info = JSON.parse(readFileSync(join(dir, "LivelyInfo.json"), "utf8"));
if (info.Type !== 1) falla("LivelyInfo.Type debe ser 1 (web)");
try { statSync(join(dir, info.FileName)); } catch { falla(`falta ${info.FileName}`); }

// index.html es el mundo en el navegador; fondo.html, el mismo mundo como fondo en Lively.
for (const pagina of ["index.html", "fondo.html"]) {
  const html = readFileSync(join(dir, pagina), "utf8");
  if (/type=["']module["']/.test(html)) falla(`${pagina} usa type=module: no carga en file:// (ARCHITECTURE 3)`);
  for (const s of ["grafos.js", "infinitas.js"]) if (!html.includes(`src="${s}"`)) falla(`${pagina} no carga ${s}`);
  if (!html.includes('href="estilo.css"')) falla(`${pagina} no carga estilo.css`);
  if (/https?:\/\//.test(html)) falla(`${pagina} pide algo a la red (ARCHITECTURE 5)`);
}
if (!readFileSync(join(dir, "fondo.html"), "utf8").includes('data-vista="fondo"')) falla("fondo.html sin data-vista=\"fondo\": Lively no tiene teclado ni pointer lock");

if (statSync(join(dir, "infinitas.js")).size < 1000) falla("infinitas.js vacío: ¿se ha construido?");

/** @type {{GB_GRAFOS?: Window["GB_GRAFOS"]}} */
const ventana = {};
vm.runInNewContext(readFileSync(join(dir, "grafos.js"), "utf8"), { window: ventana });
const grafos = ventana.GB_GRAFOS ?? [];
if (grafos.length === 0) falla("grafos.js sin ningún repo");
for (const g of grafos) {
  if (!g.nombre) falla(`un grafo sin nombre (${g.raiz})`);
  if (!g.raiz) falla(`${g.nombre} sin ruta: Enter no podría abrirlo en VS Code`);
  if (!g.nodos?.length) falla(`${g.nombre} sin nodos`);
  else if (g.posiciones.length !== g.nodos.length * 3 || !g.posiciones.every(Number.isFinite))
    falla(`${g.nombre}: posiciones incompletas o no finitas`);
}
if (new Set(grafos.map((g) => g.nombre)).size !== grafos.length) falla("dos islas con el mismo nombre");

if (fallos.length) {
  console.error("NO terminado:\n  - " + fallos.join("\n  - "));
  process.exit(1);
}
const modulos = grafos.reduce((s, g) => s + g.nodos.length, 0);
console.log(`terminado: ${grafos.length} islas, ${modulos} módulos, listo en wallpaper/`);
