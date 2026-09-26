// Un agente de la consola maestra (lo lanza tools/orquestador.mjs, uno por repo, en segundo plano):
// 1. un worktree del repo en su propia rama (`agente/<nombre>`), fuera de la carpeta de proyectos;
// 2. Claude Code, Codex o Gemini CLI trabajando ahí con la tarea (la tarea va por la ENTRADA
//    estándar, nunca en la línea de órdenes: un texto raro no puede colarse como parámetro);
// 3. su consola en `<worktree>.consola.log` (convención de galaxy-brain: `gb who` la enseña y el
//    mundo la pinta como la terminal flotante del agente en su isla);
// 4. al acabar, lo que haya cambiado se commitea EN SU RAMA. Nunca hace push: se revisa y se
//    fusiona a mano (decisión del uso real: "adelante" a ramas aparte y sin push).
// Su ficha (estado, rama, cambios) va a <datos>/agentes/<id>.json.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PROVEEDORES, lineaDeClaude } from "../src/orquesta.js";
import { ENLAZADAS, anotar, fichaDeAgente } from "./orquestador-datos.mjs";

/** @typedef {import("../src/orquesta.js").Agente} Agente */

const LIMITE_MS = 30 * 60 * 1000; // media hora como mucho: un agente atascado no se queda para siempre

/** @type {Agente & {repoRuta: string}} */
const encargo = JSON.parse(Buffer.from(process.argv[2] ?? "", "base64").toString("utf8"));
const ficha = fichaDeAgente(encargo.id);
const consola = `${encargo.worktree}.consola.log`;
const WIN = process.platform === "win32";

/** @param {Partial<Agente>} cambios */
function apuntar(cambios) {
  Object.assign(encargo, cambios);
  const { repoRuta, ...publico } = encargo;
  writeFileSync(ficha, JSON.stringify(publico, null, 2));
}
/** Una o varias líneas a la consola, con la hora, como las escribe galaxy-brain. @param {string} texto */
function decir(texto) {
  const hora = new Date().toTimeString().slice(0, 8);
  for (const l of texto.split("\n")) if (l.trim()) appendFileSync(consola, `[${hora}] ${l}\n`);
}
/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd = encargo.repoRuta) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

mkdirSync(dirname(encargo.worktree), { recursive: true });
apuntar({ estado: "trabajando", pid: process.pid });
try {
  git(["worktree", "add", "-b", encargo.rama, encargo.worktree, "HEAD"]);
} catch (e) {
  mkdirSync(dirname(consola), { recursive: true });
  decir(`= Failed: couldn't create the worktree (${String(/** @type {Error} */ (e).message).split("\n")[0]})`);
  apuntar({ estado: "fallo", fin: new Date().toISOString() });
  process.exit(1);
}
// Las dependencias del repo principal, ENLAZADAS en el worktree (no copiadas): un worktree nuevo no
// las tiene, y sin ellas ni el agente puede pasar los tests ni el hook de pre-commit deja
// commitear (medido: "tsc no se reconoce" en infinite-desk). Van en .gitignore: no se commitean.
// Al descartar, orquestador.mjs quita el enlace SIN seguirlo (ENLAZADAS, en orquestador-datos.mjs).
for (const d of ENLAZADAS) {
  const origen = join(encargo.repoRuta, d);
  const destino = join(encargo.worktree, d);
  if (existsSync(origen) && !existsSync(destino)) {
    try { symlinkSync(origen, destino, "junction"); } catch { /* sin permiso para enlazar: sigue sin ellas */ }
  }
}
decir(`$ agent ${encargo.proveedor} (${PROVEEDORES[encargo.proveedor].nombre}) on ${encargo.rama}`);
anotar([{ ts: new Date().toISOString(), tipo: "agente", repo: encargo.repo, texto: `${PROVEEDORES[encargo.proveedor].nombre}: ${encargo.tarea.split("\n")[0].slice(0, 140)}`, ref: encargo.id }]);
decir(encargo.tarea.split("\n")[0].slice(0, 160));

// Cada proveedor, sin interfaz y con permisos acotados: Claude acepta ediciones pero no ejecuta
// órdenes sin permiso (en -p, lo no permitido se deniega); Codex, en su caja de arena con
// escritura solo en el worktree; Gemini, aprobando solo ediciones.
/** @type {Record<string, string[]>} */
const ARGS = {
  claude: ["-p", "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose"],
  codex: ["exec", "--full-auto", "--skip-git-repo-check", "-"],
  gemini: ["--approval-mode", "auto_edit"],
};
const comando = PROVEEDORES[encargo.proveedor].comando;
// En Windows los CLIs de npm son .cmd: se lanzan por cmd.exe con argumentos FIJOS (la tarea, por stdin).
const hijo = spawn(WIN ? "cmd.exe" : comando, WIN ? ["/c", comando, ...ARGS[encargo.proveedor]] : ARGS[encargo.proveedor], {
  cwd: encargo.worktree, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
});
hijo.stdin.end(encargo.tarea);
const limite = setTimeout(() => {
  decir("= Failed: took more than 30 minutes, stopped");
  if (WIN && hijo.pid) try { execFileSync("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* ya no estaba */ }
  else hijo.kill("SIGTERM");
}, LIMITE_MS);

let resto = "";
hijo.stdout.setEncoding("utf8");
hijo.stdout.on("data", (/** @type {string} */ trozo) => {
  const lineas = (resto + trozo).split(/\r?\n/);
  resto = lineas.pop() ?? "";
  for (const l of lineas) {
    if (encargo.proveedor === "claude") {
      try { const dicho = lineaDeClaude(JSON.parse(l)); if (dicho) decir(dicho); } catch { /* no era JSON */ }
    } else {
      // eslint-disable-next-line no-control-regex
      const limpia = l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trimEnd();
      if (limpia) decir(limpia.slice(0, 200));
    }
  }
});
hijo.stderr.setEncoding("utf8");
hijo.stderr.on("data", (/** @type {string} */ t) => {
  const l = t.trim().split("\n")[0];
  if (l && /error|denied|not logged|login/i.test(l)) decir(`! ${l.slice(0, 200)}`);
});

hijo.on("close", (codigo) => {
  clearTimeout(limite);
  let cambios = 0;
  let commit = false;
  try {
    git(["add", "-A"], encargo.worktree);
    cambios = git(["diff", "--cached", "--name-only"], encargo.worktree).split("\n").filter(Boolean).length;
    if (cambios) {
      git(["commit", "-q", "-m", `agente(${encargo.proveedor}): ${encargo.tarea.split("\n")[0].slice(0, 70)}`], encargo.worktree);
      commit = true;
    }
  } catch (e) {
    // Lo normal: el hook de pre-commit del repo no pasa (tests, tipos). No se salta: se dice por
    // qué y los cambios se quedan en el worktree para revisarlos.
    const err = /** @type {any} */ (e);
    const motivo = `${err.stderr ?? ""}${err.stdout ?? ""}`.split("\n").map((l) => l.trim())
      .find((l) => l && !l.startsWith("✔") && !l.startsWith("ℹ")) ?? String(err.message).split("\n")[0];
    decir(`! couldn't commit (${motivo.slice(0, 160)})`);
  }
  decir(!cambios ? "= No changes"
    : commit ? `= Committed ${cambios} file(s) on ${encargo.rama} (not pushed: review and merge it)`
    : `= ${cambios} file(s) changed but NOT committed: open the worktree to review them`);
  apuntar({ estado: codigo === 0 ? "hecho" : "fallo", fin: new Date().toISOString(), cambios, commit });
  anotar([{
    ts: new Date().toISOString(), tipo: codigo === 0 ? "agente-hecho" : "agente-fallo", repo: encargo.repo, ref: encargo.id,
    texto: `${PROVEEDORES[encargo.proveedor].nombre} ${codigo === 0 ? "finished" : "failed"}: ${!cambios ? "no changes" : commit ? `${cambios} file(s) committed on ${encargo.rama}` : `${cambios} file(s) not committed`}`,
  }]);
});
