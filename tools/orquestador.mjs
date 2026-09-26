// La consola maestra, por debajo (la llama el puente; también a mano): cuentas de los proveedores
// de IA, estado git de todos los repos de la carpeta de proyectos, acciones en masa y agentes.
// Siempre contesta una línea de JSON por la salida estándar.
//
//   node tools/orquestador.mjs estado
//   node tools/orquestador.mjs accion <pull|fetch> <repo> [repo ...]
//   node tools/orquestador.mjs lanzar <claude|codex|gemini> <tarea en base64> <repo> [repo ...]
//   node tools/orquestador.mjs descartar <id>     (borra su worktree y su rama)
//   node tools/orquestador.mjs abrir <id>         (su worktree en una ventana nueva de VS Code)
//
// Los repos se nombran por su carpeta y tienen que estar en la carpeta de proyectos: quien llama
// no elige rutas. Los agentes, uno por repo, con tools/agente.mjs en segundo plano.
import { execFile, spawn } from "node:child_process";
import { existsSync, lstatSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PROVEEDORES, esProveedor, estadoDeGit, nombreDeAgente, usoPorProveedor } from "../src/orquesta.js";
import { carpetaDeProyectos, reposEn } from "./proyectos.mjs";
import { ENLAZADAS, WORKTREES, fichaDeAgente, leerAgentes } from "./orquestador-datos.mjs";

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

async function estado() {
  const todos = [...repos()];
  const lista = await Promise.all(todos.map(async ([nombre, ruta]) => {
    const [st, log] = await Promise.all([
      correr("git", ["status", "--porcelain=v2", "--branch"], { cwd: ruta }),
      correr("git", ["log", "-1", "--format=%ct"], { cwd: ruta }),
    ]);
    return { nombre, ...estadoDeGit(st.salida), ultimoCommit: Number(log.salida.trim()) || null };
  }));
  const agentes = leerAgentes();
  return {
    carpeta: carpetaDeProyectos(),
    cuentas: await cuentas(),
    proveedores: PROVEEDORES,
    repos: lista.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    agentes: agentes.slice(0, 50).map(({ pid, ...a }) => a),
    uso: usoPorProveedor(agentes, new Date()),
  };
}

/** @param {string} op @param {string[]} nombres */
async function accion(op, nombres) {
  const ARGS = /** @type {Record<string, string[]>} */ ({ pull: ["pull", "--ff-only"], fetch: ["fetch", "--prune"] });
  if (!ARGS[op]) throw new Error(`unknown action: ${op}`);
  return Promise.all(elegidos(nombres).map(async ([nombre, ruta]) => {
    const r = await correr("git", ARGS[op], { cwd: ruta, ms: 60000 });
    return { repo: nombre, ok: r.ok, salida: r.salida.trim().split("\n").slice(-2).join(" ").slice(0, 200) };
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
    : (() => { throw new Error(`unknown order: ${orden ?? "(none)"}`); })();
  process.stdout.write(`${JSON.stringify({ ok: true, r })}\n`);
} catch (e) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: String(/** @type {Error} */ (e).message) })}\n`);
}
