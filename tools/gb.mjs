// Dónde está galaxy-brain (`gb`) en ESTA máquina. En una limpia, `pip install` deja gb.exe en una
// carpeta Scripts de Python que no suele estar en el PATH (la del usuario, o la de un Python de la
// Store), y llamar a "gb" a secas fallaba con ENOENT: islas de carpetas sin saber por qué (uso real:
// "en una máquina limpia galaxy brain no tendrá la ruta que has puesto"). Por orden:
//   1. la variable GB (una ruta a gb, para forzarlo);
//   2. el PATH;
//   3. las carpetas Scripts / bin de cada Python que haya (la del sistema y la del usuario) y las de
//      siempre (pipx, ~/.local/bin, Homebrew);
//   4. sin ejecutable pero con el paquete instalado: `python -c` con su main.
// Lo encontrado se apunta en infinite-desk.local.json ("gb": la orden como lista), que lee también
// el puente (`gb who`); si deja de existir, se vuelve a buscar.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FICHERO } from "./proyectos.mjs";

const WIN = process.platform === "win32";

/**
 * Las rutas donde puede estar el ejecutable de gb, en orden. Puro: todo lo de la máquina entra
 * por `entorno` (así se prueba sin tocarla).
 * @param {{win: boolean, path: string, pathext?: string, scripts: string[], home: string, appdata?: string, localappdata?: string, pythons?: string[]}} entorno
 *   `scripts`: las carpetas de scripts que dicen los Python instalados (sysconfig); `pythons`: los
 *   nombres de las carpetas de Python de %APPDATA%\Python y %LOCALAPPDATA%\Programs\Python (Python312…)
 * @returns {string[]}
 */
export function candidatosGb(entorno) {
  const sep = entorno.win ? ";" : ":";
  const unir = (/** @type {string} */ a, /** @type {string} */ b) => `${a.replace(/[\\/]+$/, "")}${entorno.win ? "\\" : "/"}${b}`;
  const exts = entorno.win ? (entorno.pathext ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean).map((e) => e.toLowerCase()) : [""];
  const carpetas = [
    ...entorno.path.split(sep).map((c) => c.replace(/^"|"$/g, "")),
    ...entorno.scripts,
    ...(entorno.win
      ? (entorno.pythons ?? []).flatMap((p) => [
        entorno.appdata ? unir(unir(unir(entorno.appdata, "Python"), p), "Scripts") : "",
        entorno.localappdata ? unir(unir(unir(unir(entorno.localappdata, "Programs"), "Python"), p), "Scripts") : "",
      ])
      : [unir(entorno.home, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin"]),
  ].filter(Boolean);
  const vistas = new Set();
  /** @type {string[]} */
  const rutas = [];
  for (const c of carpetas) {
    const sinBarra = c.replace(/[\\/]+$/, "");
    const clave = entorno.win ? sinBarra.toLowerCase() : sinBarra;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    for (const e of exts) rutas.push(unir(c, `gb${e}`));
  }
  return rutas;
}

/** Los Python que hay, como orden (el lanzador `py` en Windows, `python3` en macOS/Linux). */
function pythons() {
  /** @type {string[][]} */
  const candidatos = WIN ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  return candidatos.filter(([cmd, ...pre]) => {
    try { execFileSync(cmd, [...pre, "-c", "0"], { stdio: "ignore", timeout: 10000, windowsHide: true }); return true; } catch { return false; }
  });
}

/** Las carpetas de scripts de un Python: la de su instalación y la del usuario. @param {string[]} py */
function scriptsDe(py) {
  try {
    const salida = execFileSync(py[0], [...py.slice(1), "-c",
      "import os, sysconfig\nfor s in (None, os.name + '_user', 'osx_framework_user'):\n  try: print(sysconfig.get_path('scripts', s) if s else sysconfig.get_path('scripts'))\n  except Exception: pass"],
    { encoding: "utf8", timeout: 10000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return salida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

/** Los nombres de las carpetas de Python de usuario en Windows (Python312, Python313…). */
function carpetasPythonWin() {
  const nombres = new Set();
  for (const base of [process.env.APPDATA && join(process.env.APPDATA, "Python"), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Python")]) {
    if (!base || !existsSync(base)) continue;
    try { for (const d of /** @type {string[]} */ (execFileSync("cmd.exe", ["/c", "dir", "/b", "/ad", base], { encoding: "utf8", windowsHide: true }).split(/\r?\n/))) if (/^Python\d+/.test(d.trim())) nombres.add(d.trim()); } catch { /* vacía */ }
  }
  return [...nombres];
}

/** ¿Responde esta orden como galaxy-brain? @param {string[]} orden */
function responde(orden) {
  try {
    const salida = execFileSync(orden[0], [...orden.slice(1), "--version"], { encoding: "utf8", timeout: 20000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUTF8: "1" } });
    return /galaxy-brain/i.test(salida);
  } catch { return false; }
}

/** Lo apuntado en infinite-desk.local.json, si sigue ahí. @returns {string[] | null} */
function apuntada() {
  try {
    const { gb } = JSON.parse(readFileSync(FICHERO, "utf8"));
    return Array.isArray(gb) && gb.length && gb.every((x) => typeof x === "string") && existsSync(gb[0]) ? gb : null;
  } catch { return null; }
}

/** @param {string[] | null} orden */
function apuntar(orden) {
  /** @type {Record<string, unknown>} */
  let datos = {};
  try { datos = JSON.parse(readFileSync(FICHERO, "utf8")); } catch { /* sin fichero todavía */ }
  if (JSON.stringify(datos.gb ?? null) === JSON.stringify(orden)) return;
  if (orden) datos.gb = orden; else delete datos.gb;
  try { writeFileSync(FICHERO, JSON.stringify(datos, null, 2) + "\n"); } catch { /* solo es una caché */ }
}

/** @type {{orden: string[] | null, como: string} | undefined} */
let hallada;

/**
 * La orden para correr gb (ejecutable y argumentos previos), o null si no está en esta máquina.
 * Se busca una vez por proceso; `otraVez` fuerza a buscar (tras instalarlo).
 * @param {{otraVez?: boolean}} [op]
 * @returns {{orden: string[] | null, como: string}} `como`: dónde se encontró, para enseñarlo
 */
export function buscarGb(op = {}) {
  if (hallada && !op.otraVez) return hallada;
  const forzada = process.env.GB;
  if (forzada) return (hallada = { orden: existsSync(forzada) ? [forzada] : null, como: `GB=${forzada}` });
  if (!op.otraVez) {
    const guardada = apuntada();
    if (guardada) return (hallada = { orden: guardada, como: guardada.length > 1 ? "python -c (no gb executable)" : guardada[0] });
  }
  const pys = pythons();
  const rutas = candidatosGb({
    win: WIN, path: process.env.PATH ?? process.env.Path ?? "", pathext: process.env.PATHEXT, home: homedir(),
    appdata: process.env.APPDATA, localappdata: process.env.LOCALAPPDATA,
    scripts: pys.flatMap(scriptsDe), pythons: WIN ? carpetasPythonWin() : [],
  });
  for (const r of rutas) {
    if (existsSync(r) && responde([r])) {
      apuntar([r]);
      return (hallada = { orden: [r], como: r });
    }
  }
  // Sin ejecutable: el paquete, con el Python que lo tenga.
  for (const py of pys) {
    let exe = "";
    try { exe = execFileSync(py[0], [...py.slice(1), "-c", "import sys, galaxybrain.cli; print(sys.executable)"], { encoding: "utf8", timeout: 20000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { continue; }
    const orden = [exe || py[0], "-c", "import sys; from galaxybrain.cli import main; sys.exit(main())"];
    if (responde(orden)) {
      apuntar(orden);
      return (hallada = { orden, como: "python -c (no gb executable)" });
    }
  }
  apuntar(null);
  return (hallada = { orden: null, como: "not found" });
}

// `node tools/gb.mjs`: dónde está (o por qué no).
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/gb.mjs")) {
  const { orden, como } = buscarGb({ otraVez: true });
  console.log(orden ? `galaxy-brain: ${como}` : `galaxy-brain not found (PATH, Python's Scripts folders, pipx): install it from the master console (O → Accounts) or with pip`);
  process.exit(orden ? 0 : 1);
}
