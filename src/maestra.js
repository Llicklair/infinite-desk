// La consola maestra (clic en su holograma, encima del palantír, o la tecla O): gestionar las
// cuentas de IA (Anthropic, OpenAI, Google DeepMind), todos los repos a la vez y los agentes que
// trabajan en ellos ("un mega orquestador", uso real). Tres pestañas:
//   Accounts — quién tiene sesión, con qué plan, y el uso de hoy (lo que se puede contar: el cupo
//              de una suscripción no se deja consultar por programa);
//   Repos    — el estado git de cada repo; seleccionar varios y hacer fetch o pull, o mandarles agentes;
//   Agents   — lanzar un agente por repo (Claude Code, Codex o Gemini CLI) con una tarea, y ver,
//              abrir en VS Code o descartar los que hay. Cada uno trabaja en su rama y su worktree,
//              commitea ahí y NUNCA hace push: se revisa y se fusiona a mano.
// Todo va por el puente a tools/orquestador.mjs. Lo de fuera (nombres, ramas, tareas) se pone como texto.
import { PROVEEDORES } from "./orquesta.js";

/** @typedef {import("./orquesta.js").Proveedor} Proveedor */
/** @typedef {import("./orquesta.js").Agente} Agente */
/** @typedef {import("./orquesta.js").EstadoGit & {nombre: string, ultimoCommit: number | null}} Repo */
/** @typedef {{instalado: boolean, sesion: boolean, cuenta?: string, plan?: string, detalle?: string}} Cuenta */
/**
 * @typedef {{carpeta: string, cuentas: Record<Proveedor | "github", Cuenta>, repos: Repo[], agentes: Agente[],
 *   uso: Record<Proveedor, {trabajando: number, hoy: number, minutosHoy: number}>}} EstadoMaestra
 */

/**
 * @param {string} etiqueta @param {string} [clase] @param {string} [texto]
 * @returns {HTMLElement}
 */
function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
/** @param {string} texto @param {() => void} alPulsar @param {string} [clase] */
function boton(texto, alPulsar, clase) {
  const b = /** @type {HTMLButtonElement} */ (el("button", clase, texto));
  b.addEventListener("click", alPulsar);
  return b;
}
/** @param {number | null} seg */
function hace(seg) {
  if (!seg) return "—";
  const min = (Date.now() / 1000 - seg) / 60;
  return min < 60 ? `${Math.max(1, Math.round(min))}m` : min < 48 * 60 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
}

/**
 * @param {HTMLElement} panel
 * @param {(args: string[]) => Promise<{ok: boolean, datos?: any, error?: string}>} orquestador
 * @param {(e: EstadoMaestra) => void} alEstado cada vez que llega un estado nuevo (el holograma)
 * @param {() => void} alCerrar
 */
export function crearMaestra(panel, orquestador, alEstado, alCerrar) {
  /** @type {EstadoMaestra | null} */
  let estado = null;
  /** @type {"cuentas" | "repos" | "agentes"} */
  let pestana = "repos";
  /** @type {Set<string>} */
  const elegidos = new Set();
  /** @type {Proveedor} */
  let proveedor = "claude";
  let tarea = "";
  let mensaje = "";
  let ocupado = false;

  async function refrescar() {
    const r = await orquestador(["estado"]);
    if (r.ok && r.datos) {
      estado = r.datos;
      alEstado(r.datos);
    } else mensaje = `Couldn't read the state: ${r.error ?? "no bridge"}`;
    // Sin repintar mientras se escribe la tarea: se perdería el foco a media frase.
    const escribiendo = document.activeElement instanceof HTMLTextAreaElement && panel.contains(document.activeElement);
    if (!panel.hidden && !escribiendo) pintar();
    return r.ok;
  }

  /** @param {string[]} args @param {string} haciendo @param {(datos: any) => string} hecho */
  async function orden(args, haciendo, hecho) {
    ocupado = true;
    mensaje = haciendo;
    pintar();
    const r = await orquestador(args);
    mensaje = r.ok ? hecho(r.datos) : `Failed: ${r.error}`;
    ocupado = false;
    await refrescar();
  }

  function cuentas() {
    const d = el("div", "cuentas");
    if (!estado) return d;
    for (const id of /** @type {Proveedor[]} */ (["claude", "codex", "gemini"])) {
      const p = PROVEEDORES[id];
      const c = estado.cuentas[id];
      const u = estado.uso[id];
      const t = el("div", "cuenta");
      t.append(el("div", "empresa", p.empresa), el("h3", undefined, p.nombre));
      const bien = c?.instalado && c.sesion;
      t.append(el("p", bien ? "bien" : "mal", bien ? `Signed in${c.cuenta ? ` as ${c.cuenta}` : ""}${c.plan ? ` · ${c.plan.toUpperCase()}` : ""}` : c?.instalado ? "Not signed in" : "Not installed"));
      if (!bien) t.append(el("code", undefined, c?.instalado ? p.entrar : p.instalar));
      t.append(el("p", "uso", `Today: ${u.hoy} agent${u.hoy === 1 ? "" : "s"} · ${u.minutosHoy} min${u.trabajando ? ` · ${u.trabajando} working now` : ""}`));
      d.append(t);
    }
    const gh = estado.cuentas.github;
    const g = el("div", "cuenta");
    g.append(el("div", "empresa", "GitHub"), el("h3", undefined, "gh"), el("p", gh?.sesion ? "bien" : "mal", gh?.sesion ? `Signed in as ${gh.cuenta ?? "?"}` : "Not signed in"));
    d.append(g);
    d.append(el("p", "nota", "Subscription quotas can't be read by a program: this counts the agents launched from here and their minutes."));
    return d;
  }

  function repos() {
    const d = el("div", "repos");
    if (!estado) return d;
    const barra = el("div", "barra");
    barra.append(
      boton("All", () => { for (const r of estado?.repos ?? []) elegidos.add(r.nombre); pintar(); }),
      boton("With changes", () => { elegidos.clear(); for (const r of estado?.repos ?? []) if (r.cambios || r.delante || r.detras) elegidos.add(r.nombre); pintar(); }),
      boton("None", () => { elegidos.clear(); pintar(); }),
      el("span", "cuenta-sel", `${elegidos.size} selected`),
      boton("Fetch", () => void orden(["accion", "fetch", ...elegidos], `Fetching ${elegidos.size} repo(s)…`, (r) => resumenAccion(r))),
      boton("Pull", () => void orden(["accion", "pull", ...elegidos], `Pulling ${elegidos.size} repo(s)…`, (r) => resumenAccion(r))),
      boton("Send agents →", () => { pestana = "agentes"; pintar(); }, "principal"),
    );
    for (const b of barra.querySelectorAll("button")) if (["Fetch", "Pull", "Send agents →"].includes(b.textContent ?? "")) b.disabled = !elegidos.size || ocupado;
    const tabla = el("table");
    const cabeza = el("tr");
    for (const t of ["", "Repo", "Branch", "Uncommitted", "Push / pull", "Last commit"]) cabeza.append(el("th", undefined, t));
    tabla.append(cabeza);
    for (const r of estado.repos) {
      const fila = el("tr", elegidos.has(r.nombre) ? "elegido" : undefined);
      const caja = /** @type {HTMLInputElement} */ (el("input"));
      caja.type = "checkbox";
      caja.checked = elegidos.has(r.nombre);
      caja.addEventListener("change", () => { if (caja.checked) elegidos.add(r.nombre); else elegidos.delete(r.nombre); pintar(); });
      const c0 = el("td");
      c0.append(caja);
      fila.append(c0, el("td", "nombre", r.nombre), el("td", undefined, r.rama),
        el("td", r.cambios ? "aviso" : "tenue", r.cambios ? String(r.cambios) : "—"),
        el("td", r.delante || r.detras ? "aviso" : "tenue", r.sinRemoto ? "no remote" : r.delante || r.detras ? `↑${r.delante} ↓${r.detras}` : "—"),
        el("td", "tenue", hace(r.ultimoCommit)));
      fila.addEventListener("click", (ev) => { if (ev.target !== caja) caja.click(); });
      tabla.append(fila);
    }
    d.append(barra, tabla);
    return d;
  }

  /** @param {{repo: string, ok: boolean, salida: string}[]} r */
  function resumenAccion(r) {
    const mal = r.filter((x) => !x.ok);
    return mal.length ? `${r.length - mal.length} ok · failed: ${mal.map((x) => `${x.repo} (${x.salida})`).join("; ")}` : `${r.length} repo(s) ok`;
  }

  function agentes() {
    const d = el("div", "agentes");
    if (!estado) return d;
    // Lanzar: proveedor, tarea y los repos elegidos en la pestaña Repos.
    const f = el("div", "lanzar");
    const provs = el("div", "proveedores");
    for (const id of /** @type {Proveedor[]} */ (["claude", "codex", "gemini"])) {
      const c = estado.cuentas[id];
      const listo = Boolean(c?.instalado && c.sesion);
      const b = boton(`${PROVEEDORES[id].empresa} · ${PROVEEDORES[id].nombre}${listo ? "" : " (not ready)"}`, () => { proveedor = id; pintar(); }, proveedor === id ? "elegido" : undefined);
      /** @type {HTMLButtonElement} */ (b).disabled = !listo;
      provs.append(b);
    }
    if (!estado.cuentas[proveedor]?.sesion) {
      const listo = /** @type {Proveedor[]} */ (["claude", "codex", "gemini"]).find((id) => estado?.cuentas[id]?.sesion);
      if (listo) proveedor = listo;
    }
    const area = /** @type {HTMLTextAreaElement} */ (el("textarea"));
    area.placeholder = "The task for each agent, e.g. \"Update the dependencies and make the tests pass\"";
    area.value = tarea;
    area.addEventListener("input", () => { tarea = area.value; lanzarB.disabled = !puedeLanzar(); });
    const puedeLanzar = () => Boolean(tarea.trim() && elegidos.size && estado?.cuentas[proveedor]?.sesion && !ocupado);
    const lanzarB = /** @type {HTMLButtonElement} */ (boton(`Launch ${elegidos.size} agent${elegidos.size === 1 ? "" : "s"}`, () => {
      const lista = [...elegidos];
      const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(tarea.trim())));
      void orden(["lanzar", proveedor, b64, ...lista], `Launching ${lista.length} ${PROVEEDORES[proveedor].nombre} agent(s)…`,
        (r) => `Launched ${r.length}: each on its own branch (agente/…), watch them on their islands`);
    }, "principal"));
    lanzarB.disabled = !puedeLanzar();
    f.append(el("h3", undefined, "Launch agents"), provs, area,
      el("p", "nota", elegidos.size ? `On: ${[...elegidos].join(", ")}` : "Pick repos in the Repos tab first."),
      el("p", "nota", "Each agent works in its own worktree and branch, commits there and never pushes: you review and merge."),
      lanzarB);
    d.append(f);

    const lista = el("div", "lista");
    lista.append(el("h3", undefined, `Agents (${estado.agentes.filter((a) => a.estado !== "descartado").length})`));
    for (const a of estado.agentes.filter((x) => x.estado !== "descartado")) {
      const fila = el("div", `agente ${a.estado}`);
      const hecho = a.estado === "hecho" ? (a.cambios ? (a.commit ? `✓ ${a.cambios} file(s) committed` : `⚠ ${a.cambios} file(s), not committed`) : "✓ no changes")
        : a.estado === "trabajando" ? "● working…" : "✗ failed";
      fila.append(
        el("div", "cabeza", `${a.repo} · ${PROVEEDORES[a.proveedor]?.nombre ?? a.proveedor} · ${hace(Date.parse(a.inicio) / 1000)} ago`),
        el("div", "tarea", a.tarea),
        el("div", "rama", `${a.rama} · ${hecho}`),
      );
      const acciones = el("div", "acciones");
      acciones.append(
        boton("Open in VS Code", () => void orden(["abrir", a.id], "Opening…", () => `Opened ${a.rama} in a new VS Code window`)),
        boton("Discard", () => {
          if (confirm(`Discard ${a.rama}? Its worktree and branch are deleted (unmerged work is lost).`)) {
            void orden(["descartar", a.id], "Discarding…", () => `Discarded ${a.rama}`);
          }
        }),
      );
      fila.append(acciones);
      lista.append(fila);
    }
    d.append(lista);
    return d;
  }

  function pintar() {
    const cabeza = el("div", "cabecera");
    cabeza.append(el("h2", undefined, "Master console"));
    const pestanas = el("div", "pestanas");
    for (const [id, nombre] of /** @type {const} */ ([["cuentas", "Accounts"], ["repos", "Repos"], ["agentes", "Agents"]])) {
      pestanas.append(boton(nombre, () => { pestana = id; pintar(); }, pestana === id ? "activa" : undefined));
    }
    cabeza.append(pestanas, boton("Refresh", () => { mensaje = "Refreshing…"; pintar(); void refrescar().then(() => { mensaje = ""; pintar(); }); }), boton("Close (Esc)", () => cerrar()));
    const cuerpo = el("div", "cuerpo");
    cuerpo.append(!estado ? el("p", "nota", mensaje || "Reading accounts and repos…") : pestana === "cuentas" ? cuentas() : pestana === "repos" ? repos() : agentes());
    const pie = el("p", "mensaje", mensaje);
    panel.replaceChildren(cabeza, cuerpo, pie);
  }

  function cerrar() {
    if (panel.hidden) return;
    panel.hidden = true;
    alCerrar();
  }

  return {
    get abierto() { return !panel.hidden; },
    abrir() {
      panel.hidden = false;
      pintar();
      void refrescar();
    },
    cerrar,
    refrescar,
  };
}
