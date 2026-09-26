// La consola maestra, por debajo (la llama el puente; también a mano): cuentas de los proveedores
// de IA, estado git de todos los repos de la carpeta de proyectos, acciones en masa y agentes.
// Siempre contesta una línea de JSON por la salida estándar.
//
//   node tools/orquestador.mjs estado
//   node tools/orquestador.mjs accion <pull|fetch> <repo> [repo ...]
//   node tools/orquestador.mjs lanzar <claude|codex|gemini> <tarea en base64> <repo> [repo ...]
//   node tools/orquestador.mjs descartar <id>     (borra su worktree y su rama)
//   node tools/orquestador.mjs abrir <id>         (su worktree en una ventana nueva de VS Code)
//   node tools/orquestador.mjs traza <id>         (la traza legible de un fallo capturado por gb)
//   node tools/orquestador.mjs instalarGb         (galaxy-brain con pip: de tu carpeta o de GitHub)
//   node tools/orquestador.mjs hablar <turnos en base64>    (el espíritu de la zona zen contesta)
//   node tools/orquestador.mjs recordar <turnos en base64>  (al acabar: lo que merece recordar)
//   node tools/orquestador.mjs recuerdos | olvidar <id|todo>  (lo que recuerda, a la vista y borrable)
//
// Los repos se nombran por su carpeta y tienen que estar en la carpeta de proyectos: quien llama
// no elige rutas. Los agentes, uno por repo, con tools/agente.mjs en segundo plano.
import { execFile, spawn } from "node:child_process";
import { existsSync, lstatSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PROVEEDORES, esProveedor, estadoDeGit, nombreDeAgente, usoPorProveedor } from "../src/orquesta.js";
import { claveDeFallo, estadoDeFallo, fallosDeRepos, trazaLegible } from "../src/fallos.js";
import { FORMATO_LOG, commitsDeLog, fallosNuevos } from "../src/actividad.js";
import { carpetaDeProyectos, reposEn } from "./proyectos.mjs";
import { buscarGb } from "./gb.mjs";
import { hablar, leerRecuerdos, olvidar, recordar } from "./espiritu.mjs";
import { ENLAZADAS, WORKTREES, anotar, fichaDeAgente, guardarArreglados, guardarVistos, leerActividad, leerAgentes, leerArreglados, leerVistos } from "./orquestador-datos.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === "win32";
const correrArchivo = promisify(execFile);

/**
 * Un programa, con límite de tiempo; nunca lanza: {ok, salida}. En Windows, los de npm (.cmd)
 * por cmd.exe, con argumentos fijos.
 * @param {string} programa @param {string[]} args @param {{cwd?: string, npm?: boolean, ms?: number}} [op]
 */
async function correr(programa, args, op = {}) {
  const [cmd, argv] = WIN && op.npm ? ["cmd.exe", ["/c", programa, ...args]] : [programa, args];
  try {
    const { stdout, stderr } = await correrArchivo(cmd, argv, { cwd: op.cwd, timeout: op.ms ?? 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, salida: `${stdout}${stderr}` };
  } catch (e) {
    const err = /** @type {any} */ (e);
    return { ok: false, salida: `${err.stdout ?? ""}${err.stderr ?? ""}${err.code === "ENOENT" ? "not installed" : ""}` || String(err.message) };
  }
}

/**
 * gb, esté donde esté (tools/gb.mjs: en una máquina limpia no suele estar en el PATH).
 * @param {string[]} args @param {{cwd?: string, ms?: number}} [op]
 */
async function correrGb(args, op = {}) {
  const gb = buscarGb().orden;
  return gb ? correr(gb[0], [...gb.slice(1), ...args], op) : { ok: false, salida: "not installed" };
}

/** Los repos de la carpeta de proyectos, por nombre. */
function repos() {
  return new Map(reposEn(carpetaDeProyectos()).map((r) => [basename(r), r]));
}

/** @param {string[]} nombres */
function elegidos(nombres) {
  const todos = repos();
  const fuera = nombres.filter((n) => !todos.has(n));
  if (fuera.length) throw new Error(`not in the projects folder: ${fuera.join(", ")}`);
  return nombres.map((n) => /** @type {[string, string]} */ ([n, /** @type {string} */ (todos.get(n))]));
}

/** ¿Hay sesión en cada proveedor (y en GitHub)? Lo que cada CLI deja consultar. */
async function cuentas() {
  const [claude, codex, gemini, gh] = await Promise.all([
    correr("claude", ["auth", "status"], { npm: true }),
    correr("codex", ["login", "status"], { npm: true }),
    correr("gemini", ["--version"], { npm: true }),
    correr("gh", ["auth", "status"]),
  ]);
  /** @type {Record<string, {instalado: boolean, sesion: boolean, cuenta?: string, plan?: string, detalle?: string}>} */
  const r = {};
  try {
    const j = JSON.parse(claude.salida.slice(claude.salida.indexOf("{")));
    r.claude = { instalado: true, sesion: Boolean(j.loggedIn), cuenta: j.email, plan: j.subscriptionType };
  } catch { r.claude = { instalado: !/not installed/.test(claude.salida), sesion: false, detalle: claude.salida.trim().split("\n")[0] }; }
  const codexDice = codex.salida.trim().split("\n")[0] ?? "";
  r.codex = { instalado: !/not installed|not recognized/i.test(codex.salida), sesion: /logged in/i.test(codexDice) && !/not logged/i.test(codexDice), detalle: codexDice };
  const geminiInstalado = gemini.ok;
  const geminiSesion = geminiInstalado && (existsSync(join(homedir(), ".gemini", "oauth_creds.json")) || Boolean(process.env.GEMINI_API_KEY));
  r.gemini = { instalado: geminiInstalado, sesion: geminiSesion, detalle: geminiInstalado ? gemini.salida.trim().split("\n")[0] : "not installed" };
  const cuentaGh = /account (\S+)/.exec(gh.salida)?.[1];
  r.github = { instalado: !/not installed/.test(gh.salida), sesion: /Logged in/.test(gh.salida), cuenta: cuentaGh };
  return r;
}

/** Los fallos que galaxy-brain ha capturado en tus repos (sin gb, ninguno). */
async function fallos() {
  const r = await correrGb(["list", "--json", "--all", "-n", "200"], { ms: 30000 });
  if (!r.ok) return [];
  try {
    const todos = repos();
    const lista = fallosDeRepos(JSON.parse(r.salida.slice(r.salida.indexOf("["))), [...todos].map(([nombre, ruta]) => ({ nombre, ruta })));
    // Cuándo cambió por última vez el fichero de cada uno: su último commit, o si git no lo sigue (un
    // .scratch/, el worktree de un agente) cuándo se guardó; si ya no existe, desaparecido. Cambiado
    // después de la última vez que saltó: "quizás arreglado". Lo marcado a mano, arreglado hasta que vuelva a saltar.
    const marcados = leerArreglados();
    await Promise.all(lista.map(async (f) => {
      const ruta = todos.get(f.repo);
      if (f.fichero && ruta) {
        const log = await correr("git", ["log", "-1", "--format=%cI", "--", f.fichero], { cwd: ruta });
        if (log.ok && log.salida.trim()) f.tocado = log.salida.trim();
        else if (!existsSync(join(ruta, f.fichero))) f.desaparecido = true;
        else f.tocado = statSync(join(ruta, f.fichero)).mtime.toISOString();
      }
      f.estado = estadoDeFallo(f, marcados);
    }));
    return lista;
  } catch { return []; }
}

/** La traza de un fallo (`gb show`), legible y sin variables locales. @param {string} id */
async function traza(id) {
  if (!/^[\w.-]+$/.test(id ?? "")) throw new Error("bad id");
  const r = await correrGb(["show", id, "--json", "--all"], { ms: 30000 });
  if (!r.ok) throw new Error(r.salida.trim().split("\n")[0] || "gb show failed");
  return { id, traza: trazaLegible(JSON.parse(r.salida.slice(r.salida.indexOf("{")))) };
}

// --- galaxy-brain: el que convierte cada repo en su grafo de dependencias (16 lenguajes) --------
// Sin él las islas son árboles de carpetas (ADR 0003). Se instala con pip (está escrito en Python,
// aunque analiza muchos más lenguajes): desde tu carpeta si está en la de proyectos (editable: se
// queda al día con tu `git pull`), y si no, desde GitHub (el repo es público).
const GB_GITHUB = "git+https://github.com/Llicklair/galaxy-brain";

/** El Python con el que instalar: el lanzador `py` en Windows, `python3` en macOS/Linux. */
async function python() {
  /** @type {[string, string[]][]} */
  const candidatos = WIN ? [["py", ["-3"]], ["python", []]] : [["python3", []], ["python", []]];
  for (const [cmd, pre] of candidatos) {
    const r = await correr(cmd, [...pre, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"]);
    const v = r.salida.trim().split("\n").pop() ?? "";
    if (r.ok && /^\d+\.\d+$/.test(v)) return { cmd, pre, version: v };
  }
  return null;
}

/** ¿Está galaxy-brain? Su versión, desde dónde (tu carpeta o pip) y con qué Python. */
async function galaxyBrain() {
  const [gb, py] = await Promise.all([correrGb(["--version"]), python()]);
  const version = /galaxy-brain\s+(\S+)/.exec(gb.salida)?.[1];
  let origen;
  if (py) {
    const show = await correr(py.cmd, [...py.pre, "-m", "pip", "show", "galaxy-brain"]);
    origen = /Editable project location:\s*(.+)/.exec(show.salida)?.[1]?.trim() ?? (/^Location:/m.test(show.salida) ? "pip" : undefined);
  }
  const [mayor, menor] = (py?.version ?? "0.0").split(".").map(Number);
  return {
    instalado: gb.ok && Boolean(version), version, origen, python: py?.version ?? null, ruta: buscarGb().como,
    // Con Python < 3.12, gb no lee la sintaxis nueva de Python (def f[T], medido en invest-ll).
    avisoPython: py && (mayor < 3 || (mayor === 3 && menor < 12)) ? `Python ${py.version}: repos using Python 3.12+ syntax may not parse` : null,
    local: repos().get("galaxy-brain") ?? null,
  };
}

/** Instala (o reinstala) galaxy-brain: editable desde tu carpeta si está, si no desde GitHub. */
async function instalarGb() {
  const py = await python();
  if (!py) throw new Error(WIN ? "no Python found: install it from python.org (with the py launcher)" : "no python3 found");
  const local = repos().get("galaxy-brain");
  const desde = local && existsSync(join(local, "pyproject.toml")) ? ["-e", local] : [GB_GITHUB];
  // En macOS/Linux, en el usuario: el Python del sistema no deja instalar fuera de él.
  const args = [...py.pre, "-m", "pip", "install", "--upgrade", ...(WIN ? [] : ["--user"]), ...desde];
  const r = await correr(py.cmd, args, { ms: 10 * 60000 });
  if (!r.ok) throw new Error(`pip failed: ${r.salida.trim().split("\n").slice(-2).join(" ").slice(0, 300)}`);
  buscarGb({ otraVez: true }); // recién instalado: no hace falta que esté en el PATH, se busca donde lo dejó pip
  const gb = await galaxyBrain();
  if (!gb.instalado) throw new Error(`pip says it installed, but gb doesn't answer (${buscarGb().como})`);
  anotar([{ ts: new Date().toISOString(), tipo: "instalacion", repo: "galaxy-brain", texto: `galaxy-brain ${gb.version} installed (${desde[0] === "-e" ? "editable, from your folder" : "from GitHub"})` }]);
  return gb;
}

/**
 * Marca un fallo como arreglado (o lo reabre). Se guarda con la fecha de su última captura: si
 * vuelve a saltar después, está abierto otra vez.
 * @param {string} b64 su clave (claveDeFallo), en base64 @param {boolean} si
 */
async function marcarArreglado(b64, si) {
  const clave = Buffer.from(String(b64 ?? ""), "base64").toString("utf8");
  const f = (await fallos()).find((x) => claveDeFallo(x) === clave);
  if (!f) throw new Error("that error isn't in galaxy-brain's list any more");
  const marcados = leerArreglados();
  if (si) marcados[clave] = f.ultimo; else delete marcados[clave];
  guardarArreglados(marcados);
  anotar([{ ts: new Date().toISOString(), tipo: si ? "arreglado" : "fallo", repo: f.repo, texto: `${si ? "marked as fixed" : "reopened"}: ${f.tipo} (${f.fichero ?? "?"}${f.linea ? `:${f.linea}` : ""})`, ref: f.id }]);
  return { clave, estado: si ? "arreglado" : estadoDeFallo(f, marcados) };
}

async function estado() {
  const todos = [...repos()];
  const lista = await Promise.all(todos.map(async ([nombre, ruta]) => {
    const [st, log] = await Promise.all([
      correr("git", ["status", "--porcelain=v2", "--branch"], { cwd: ruta }),
      correr("git", ["log", "-1", "--format=%H %ct"], { cwd: ruta }),
    ]);
    const [head, ct] = log.salida.trim().split(" ");
    return { nombre, ruta, head: log.ok ? head : null, ...estadoDeGit(st.salida), ultimoCommit: Number(ct) || null };
  }));
  const listaFallos = await fallos();
  await apuntarLoNuevo(lista, listaFallos);
  const agentes = leerAgentes();
  return {
    carpeta: carpetaDeProyectos(),
    cuentas: await cuentas(),
    galaxyBrain: await galaxyBrain(),
    fallos: listaFallos,
    actividad: leerActividad(300),
    proveedores: PROVEEDORES,
    repos: lista.map(({ ruta, head, ...r }) => r).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    agentes: agentes.slice(0, 50).map(({ pid, ...a }) => a),
    uso: usoPorProveedor(agentes, new Date()),
  };
}

/**
 * El registro de actividad, desde la última vez: los commits nuevos de cada repo (desde el último
 * visto; la primera vez solo se apunta dónde está) y los fallos con capturas nuevas.
 * @param {{nombre: string, ruta: string, head: string | null}[]} lista
 * @param {import("../src/fallos.js").Fallo[]} listaFallos
 */
async function apuntarLoNuevo(lista, listaFallos) {
  const vistos = leerVistos();
  const heads = vistos.heads ?? {};
  /** @type {import("../src/actividad.js").Evento[]} */
  const eventos = [];
  await Promise.all(lista.map(async ({ nombre, ruta, head }) => {
    const antes = heads[nombre];
    if (head && antes && antes !== head) {
      const r = await correr("git", ["log", `--format=${FORMATO_LOG}`, "-n", "20", `${antes}..${head}`], { cwd: ruta });
      // Si el anterior ya no existe (rebase, otra rama), git falla: se apunta solo el último.
      const nuevos = r.ok ? commitsDeLog(r.salida, nombre)
        : commitsDeLog((await correr("git", ["log", `--format=${FORMATO_LOG}`, "-n", "1"], { cwd: ruta })).salida, nombre);
      eventos.push(...nuevos);
    }
    if (head) heads[nombre] = head;
  }));
  const f = fallosNuevos(listaFallos, vistos.fallos);
  eventos.push(...f.eventos);
  anotar(eventos.sort((a, b) => a.ts.localeCompare(b.ts)));
  guardarVistos({ heads, fallos: f.vistos });
}

/** @param {string} op @param {string[]} nombres */
async function accion(op, nombres) {
  const ARGS = /** @type {Record<string, string[]>} */ ({ pull: ["pull", "--ff-only"], fetch: ["fetch", "--prune"] });
  if (!ARGS[op]) throw new Error(`unknown action: ${op}`);
  return Promise.all(elegidos(nombres).map(async ([nombre, ruta]) => {
    const r = await correr("git", ARGS[op], { cwd: ruta, ms: 60000 });
    const salida = r.salida.trim().split("\n").slice(-2).join(" ").slice(0, 200);
    if (op === "pull") anotar([{ ts: new Date().toISOString(), tipo: "pull", repo: nombre, texto: r.ok ? salida || "up to date" : `failed: ${salida}` }]);
    return { repo: nombre, ok: r.ok, salida };
  }));
}

/** @param {string} proveedor @param {string} tareaB64 @param {string[]} nombres */
function lanzar(proveedor, tareaB64, nombres) {
  if (!esProveedor(proveedor)) throw new Error(`unknown provider: ${proveedor}`);
  const tarea = Buffer.from(tareaB64, "base64").toString("utf8").trim();
  if (!tarea) throw new Error("empty task");
  const ahora = new Date();
  return elegidos(nombres).map(([repo, repoRuta]) => {
    const nombre = nombreDeAgente(tarea, ahora);
    const id = `${repo}-${nombre}`.replace(/[^\w.-]/g, "_");
    const encargo = {
      id, repo, repoRuta, proveedor, tarea, rama: `agente/${nombre}`,
      worktree: join(WORKTREES, repo, nombre), inicio: ahora.toISOString(), estado: "trabajando",
    };
    const { repoRuta: _, ...publico } = encargo;
    writeFileSync(fichaDeAgente(id), JSON.stringify(publico, null, 2));
    spawn(process.execPath, [join(aqui, "agente.mjs"), Buffer.from(JSON.stringify(encargo)).toString("base64")], {
      detached: true, stdio: "ignore", windowsHide: true,
    }).unref();
    return { id, repo, rama: encargo.rama };
  });
}

/** @param {string} id */
async function descartar(id) {
  const a = leerAgentes().find((x) => x.id === id);
  if (!a) throw new Error(`no agent ${id}`);
  const ruta = repos().get(a.repo);
  // Primero los enlaces a las dependencias del repo, SIN seguirlos (rmdir de una unión quita la
  // unión, no lo de dentro). git los deja atrás al quitar el worktree, y un borrado recursivo que
  // entrase por ellos vaciaría las dependencias de verdad (medido: el enlace sobrevivía a git).
  for (const d of ENLAZADAS) {
    const p = join(a.worktree, d);
    try { if (lstatSync(p).isSymbolicLink()) rmdirSync(p); } catch { /* no estaba */ }
  }
  if (ruta) {
    await correr("git", ["worktree", "remove", "--force", a.worktree], { cwd: ruta });
    await correr("git", ["branch", "-D", a.rama], { cwd: ruta });
  }
  // Lo que quede, solo si está vacío (nunca recursivo).
  try { rmdirSync(a.worktree); } catch { /* ya no estaba, o git dejó algo: se deja */ }
  rmSync(`${a.worktree}.consola.log`, { force: true });
  writeFileSync(fichaDeAgente(id), JSON.stringify({ ...a, estado: "descartado", fin: a.fin ?? new Date().toISOString() }, null, 2));
  anotar([{ ts: new Date().toISOString(), tipo: "agente-descartado", repo: a.repo, texto: `Discarded ${a.rama}`, ref: id }]);
  return { id, descartado: true };
}

/** @param {string} id */
function abrir(id) {
  const a = leerAgentes().find((x) => x.id === id);
  if (!a || !existsSync(a.worktree)) throw new Error(`no worktree for ${id}`);
  spawn(WIN ? "cmd.exe" : "code", WIN ? ["/c", "code", "--new-window", a.worktree] : ["--new-window", a.worktree], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  return { id, abierto: a.worktree };
}

const [orden, ...resto] = process.argv.slice(2);
try {
  const r = orden === "estado" ? await estado()
    : orden === "accion" ? await accion(resto[0], resto.slice(1))
    : orden === "lanzar" ? lanzar(resto[0], resto[1], resto.slice(2))
    : orden === "descartar" ? await descartar(resto[0])
    : orden === "abrir" ? abrir(resto[0])
    : orden === "traza" ? await traza(resto[0])
    : orden === "instalarGb" ? await instalarGb()
    : orden === "arreglado" ? await marcarArreglado(resto[0], true)
    : orden === "reabrir" ? await marcarArreglado(resto[0], false)
    // El espíritu de la zona zen (tools/espiritu.mjs): la charla va en base64 (JSON de turnos).
    : orden === "hablar" ? await hablar(JSON.parse(Buffer.from(resto[0] ?? "", "base64").toString("utf8")))
    : orden === "recordar" ? await recordar(JSON.parse(Buffer.from(resto[0] ?? "", "base64").toString("utf8")))
    : orden === "recuerdos" ? { recuerdos: leerRecuerdos() }
    : orden === "olvidar" ? olvidar(resto[0] ?? "")
    : (() => { throw new Error(`unknown order: ${orden ?? "(none)"}`); })();
  process.stdout.write(`${JSON.stringify({ ok: true, r })}\n`);
} catch (e) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: String(/** @type {Error} */ (e).message) })}\n`);
}
