// La consola maestra (clic en su holograma, encima del palantír, o la tecla O): gestionar las
// cuentas de IA (Anthropic, OpenAI, Google DeepMind), todos los repos a la vez y los agentes que
// trabajan en ellos ("un mega orquestador", uso real). Seis pestañas:
//   Accounts — quién tiene sesión, con qué plan, y el uso de hoy (lo que se puede contar: el cupo
//              de una suscripción no se deja consultar por programa);
//   Repos    — el estado git de cada repo; seleccionar varios y hacer fetch o pull, o mandarles agentes;
//   Maps     — el mapa de cada repo (grafo de galaxy-brain o árbol de carpetas, y por qué), y
//              construir o rehacer los elegidos o todos con gb, varios a la vez, viéndolos acabar;
//   Agents   — lanzar un agente por repo (Claude Code, Codex o Gemini CLI) con una tarea, y ver,
//              abrir en VS Code o descartar los que hay. Cada uno trabaja en su rama y su worktree,
//              commitea ahí y NUNCA hace push: se revisa y se fusiona a mano;
//   Errors   — lo que galaxy-brain ha capturado en tus repos (gb list) y los agentes que fallaron;
//              clic, la traza, y "mandar un agente a arreglarlo" con ella como tarea; los arreglados
//              (a mano, o su fichero cambió después) aparte, y vuelven si saltan otra vez;
//   Activity — qué pasó, cuándo y dónde en todos los repos (src/actividad.js), por días.
// Todo va por el puente a tools/orquestador.mjs. Lo de fuera (nombres, ramas, tareas) se pone como texto.
import { PROVEEDORES } from "./orquesta.js";
import { claveDeFallo, fuerzaDeFallo, tareaDeArreglo } from "./fallos.js";
import { GRUPOS, ICONOS, filtrarActividad, porDias } from "./actividad.js";

/** @typedef {import("./orquesta.js").Proveedor} Proveedor */
/** @typedef {import("./orquesta.js").Agente} Agente */
/** @typedef {import("./orquesta.js").EstadoGit & {nombre: string, ultimoCommit: number | null}} Repo */
/** @typedef {{instalado: boolean, sesion: boolean, cuenta?: string, plan?: string, detalle?: string}} Cuenta */
/**
 * @typedef {{instalado: boolean, version?: string, origen?: string, python: string | null, avisoPython: string | null, local: string | null, ruta?: string}} GalaxyBrain
 *   `origen`: la carpeta si está instalado en modo editable, o "pip"; `local`: tu carpeta de galaxy-brain, si está en la de proyectos;
 *   `ruta`: dónde se encontró gb (tools/gb.mjs: PATH, las carpetas Scripts de Python…)
 */
/**
 * @typedef {{carpeta: string, cuentas: Record<Proveedor | "github", Cuenta>, repos: Repo[], agentes: Agente[],
 *   uso: Record<Proveedor, {trabajando: number, hoy: number, minutosHoy: number}>, fallos?: import("./fallos.js").Fallo[],
 *   actividad?: import("./actividad.js").Evento[], galaxyBrain?: GalaxyBrain}} EstadoMaestra
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
 * @param {(repos?: string[]) => void} [regenerar] rehacer las islas: todas (tras instalar galaxy-brain) o unas (pestaña Maps)
 * @param {() => import("./grafo3d.js").GrafoExportado[]} [islas] los mapas que hay ahora (window.GB_GRAFOS)
 */
export function crearMaestra(panel, orquestador, alEstado, alCerrar, regenerar, islas) {
  /** @type {EstadoMaestra | null} */
  let estado = null;
  /** @type {"cuentas" | "repos" | "mapas" | "agentes" | "errores" | "actividad"} */
  let pestana = "repos";
  /** @type {{repo: string | null, grupo: keyof typeof GRUPOS | null}} */
  const filtro = { repo: null, grupo: null };
  /** @type {import("./fallos.js").Fallo | null} el fallo abierto en la pestaña Errors */
  let fallo = null;
  /** @type {Map<string, string>} trazas ya pedidas, por id */
  const trazas = new Map();
  /** @type {Set<string>} */
  const elegidos = new Set();
  /** @type {Proveedor} */
  let proveedor = "claude";
  let tarea = "";
  let mensaje = "";
  let ocupado = false;
  /** @type {Map<string, {estado: "cola" | "ok" | "salto" | "error", texto?: string}>} lo que se está construyendo (pestaña Maps) */
  const obras = new Map();

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
    // galaxy-brain: sin él, las islas son árboles de carpetas; con él, grafos de dependencias.
    const gb = estado.galaxyBrain;
    if (gb) {
      const t = el("div", "cuenta");
      t.append(el("div", "empresa", "Code maps · 16 languages"), el("h3", undefined, "galaxy-brain"),
        el("p", gb.instalado ? "bien" : "mal", gb.instalado ? `Installed · ${gb.version}` : "Not installed: islands are folder trees"));
      if (gb.instalado) t.append(el("p", "uso", gb.origen && gb.origen !== "pip" ? `Editable, from ${gb.origen}` : "From pip"));
      if (gb.avisoPython) t.append(el("p", "mal", gb.avisoPython));
      t.append(el("p", "uso", gb.local ? "Installs from your galaxy-brain folder (stays current with git pull)" : "Installs from GitHub (Llicklair/galaxy-brain)"));
      t.append(boton(gb.instalado ? "Reinstall" : "Install galaxy-brain", () => void orden(["instalarGb"], "Installing galaxy-brain with pip… (up to a few minutes)",
        (r) => { regenerar?.(); return `galaxy-brain ${r.version} ready: rebuilding the islands as dependency graphs…`; }), "principal"));
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
      boton("Maps →", () => { pestana = "mapas"; pintar(); }),
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

  /** Construir con gb los mapas de estos repos (o de todos): sin IA, gb es determinista y no gasta cupo. @param {string[]} [lista] */
  function construir(lista) {
    const todos = lista ?? (estado?.repos ?? []).map((r) => r.nombre);
    for (const n of todos) obras.set(n, { estado: "cola" });
    regenerar?.(lista);
    mensaje = `Building ${todos.length} map${todos.length === 1 ? "" : "s"} with galaxy-brain, 4 at a time… (you can close this and keep going)`;
    pintar();
  }

  function mapas() {
    const d = el("div", "mapas");
    if (!estado) return d;
    const gb = estado.galaxyBrain;
    const cabeza = el("div", "gb");
    if (gb?.instalado) {
      cabeza.append(el("span", "bien", `galaxy-brain ${gb.version}`), el("span", "tenue", ` · ${gb.ruta ?? "on the PATH"}`));
      if (gb.avisoPython) cabeza.append(el("span", "mal", ` · ${gb.avisoPython}`));
    } else {
      cabeza.append(el("span", "mal", "galaxy-brain isn't installed (or wasn't found): maps are folder trees. "),
        boton("Install galaxy-brain", () => void orden(["instalarGb"], "Installing galaxy-brain with pip… (up to a few minutes)",
          (r) => { construir(); return `galaxy-brain ${r.version} ready: building every map…`; }), "principal"));
    }
    const hay = new Map((islas?.() ?? []).map((g) => [g.nombre, g]));
    const barra = el("div", "barra");
    const construyendo = [...obras.values()].some((o) => o.estado === "cola");
    // Los que no tienen código que gb lea ya tienen su mapa (el árbol de carpetas): no se eligen.
    const conMapa = (/** @type {string} */ n) => hay.get(n)?.fuente === "gb" || Boolean(hay.get(n)?.sinCodigo);
    barra.append(
      boton("All", () => { for (const r of estado?.repos ?? []) elegidos.add(r.nombre); pintar(); }),
      boton("Without a gb map", () => { elegidos.clear(); for (const r of estado?.repos ?? []) if (!conMapa(r.nombre)) elegidos.add(r.nombre); pintar(); }),
      boton("None", () => { elegidos.clear(); pintar(); }),
      el("span", "cuenta-sel", `${elegidos.size} selected`),
    );
    const elegidosB = /** @type {HTMLButtonElement} */ (boton(`Build selected (${elegidos.size})`, () => construir([...elegidos]), "principal"));
    elegidosB.disabled = !elegidos.size;
    barra.append(elegidosB, boton("Rebuild all", () => construir()));
    if (construyendo) barra.append(el("span", "aviso", "● building…"));
    const tabla = el("table");
    const fila0 = el("tr");
    for (const t of ["", "Repo", "Map", "Size", "Built", ""]) fila0.append(el("th", undefined, t));
    tabla.append(fila0);
    for (const r of estado.repos) {
      const g = hay.get(r.nombre);
      const obra = obras.get(r.nombre);
      const fila = el("tr", elegidos.has(r.nombre) ? "elegido" : undefined);
      const caja = /** @type {HTMLInputElement} */ (el("input"));
      caja.type = "checkbox";
      caja.checked = elegidos.has(r.nombre);
      caja.addEventListener("change", () => { if (caja.checked) elegidos.add(r.nombre); else elegidos.delete(r.nombre); pintar(); });
      const c0 = el("td");
      c0.append(caja);
      const tipo = !g ? el("td", "tenue", "no island") : g.fuente === "gb" ? el("td", "bien", "dependency graph")
        : el("td", g.sinCodigo ? "tenue" : "aviso", g.sinCodigo ? "folder tree (no code)" : "folder tree");
      const tamano = !g ? "—" : g.fuente === "gb"
        ? `${g.nodos.length} modules · ${g.aristas.length} edges${g.ciclos ? ` · ${g.ciclos} cycle${g.ciclos === 1 ? "" : "s"}` : ""}`
        : `${g.nodos.length} folders and files`;
      // Lo último que se sabe: construyéndose, cómo acabó, o por qué es árbol de carpetas. Un repo sin
      // código que gb lea no es un fallo: se dice qué tiene y que su mapa es ese (uso real: "no me
      // deja buildear algunos mapas… pues que se lo diga la consola").
      const nota = obra?.estado === "cola" ? el("td", "aviso", "● building…")
        : obra && obra.estado !== "ok" ? el("td", "mal", `✗ ${obra.texto ?? ""}`)
        : g?.sinCodigo ? el("td", "tenue", `ℹ ${g.porque ?? "no code for galaxy-brain here"}`)
        : g?.fuente === "carpetas" ? el("td", "aviso", `⚠ ${g.porque ?? ""}`)
        : obra ? el("td", "bien", "✓ rebuilt")
        : el("td", "tenue", "");
      fila.append(c0, el("td", "nombre", r.nombre), tipo, el("td", "tenue", tamano), el("td", "tenue", g?.generado ? `${hace(g.generado)} ago` : "—"), nota);
      fila.addEventListener("click", (ev) => { if (ev.target !== caja) caja.click(); });
      tabla.append(fila);
    }
    d.append(cabeza, barra, tabla,
      el("p", "nota", "galaxy-brain reads 16 languages; a repo it can't read (or with too few modules) stays a folder tree. R on an island rebuilds just that one."));
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

  function errores() {
    const d = el("div", "errores");
    if (!estado) return d;
    const lista = el("div", "lista");
    const todos = estado.fallos ?? [];
    const ahora = Date.now();
    const abiertos = todos.filter((f) => !f.estado || f.estado === "abierto");
    const cerrados = todos.filter((f) => f.estado && f.estado !== "abierto");
    /** @param {import("./fallos.js").Fallo} f */
    const fila = (f) => {
      const cerrado = f.estado === "arreglado" ? " arreglado" : f.estado === "quizas" ? " quizas" : "";
      const d = el("div", `fallo${fuerzaDeFallo(f, ahora) > 0 ? " reciente" : ""}${cerrado}${fallo?.id === f.id ? " abierto" : ""}`);
      d.append(
        el("div", "que", `${f.estado === "arreglado" ? "✔ " : f.estado === "quizas" ? "✔? " : ""}${f.tipo}: ${f.mensaje}`),
        el("div", "donde", `${f.repo}${f.fichero ? ` · ${f.fichero}${f.linea ? `:${f.linea}` : ""}` : ""} · ×${f.veces} · ${hace(Date.parse(f.ultimo) / 1000)} ago`),
      );
      d.addEventListener("click", () => {
        fallo = f;
        pintar();
        if (!trazas.has(f.id)) {
          void orquestador(["traza", f.id]).then((r) => {
            trazas.set(f.id, r.ok ? r.datos.traza : `(couldn't read the traceback: ${r.error})`);
            if (fallo?.id === f.id) pintar();
          });
        }
      });
      return d;
    };
    lista.append(el("h3", undefined, `Open (${abiertos.length})`));
    if (!abiertos.length) lista.append(el("p", "nota", todos.length ? "Nothing open: everything captured is fixed." : "Nothing captured in your repos (or gb isn't installed)."));
    for (const f of abiertos) lista.append(fila(f));
    if (cerrados.length) {
      lista.append(el("h3", undefined, `Fixed (${cerrados.length})`),
        el("p", "nota", "Marked as fixed, or its file changed after the last time it failed. Any of them comes back here if it fails again."));
      for (const f of cerrados) lista.append(fila(f));
    }
    const fallidos = estado.agentes.filter((a) => a.estado === "fallo");
    if (fallidos.length) {
      lista.append(el("h3", undefined, `Failed agents (${fallidos.length})`));
      for (const a of fallidos) {
        const fila = el("div", "fallo agente-fallido");
        fila.append(el("div", "que", `${a.repo}: ${a.tarea.split("\n")[0].slice(0, 120)}`), el("div", "donde", `${a.rama} · its console is on its island`));
        fila.append(boton("Open in VS Code", () => void orden(["abrir", a.id], "Opening…", () => `Opened ${a.rama}`)));
        lista.append(fila);
      }
    }
    const detalle = el("div", "detalle");
    if (!fallo) detalle.append(el("p", "nota", "Click an error to see its traceback and send an agent to fix it."));
    else {
      const f = fallo;
      const traza = trazas.get(f.id);
      detalle.append(el("h3", undefined, `${f.tipo} in ${f.repo}`), el("p", "mensaje-fallo", f.mensaje),
        el("p", "nota", `${f.fichero ?? "(no file)"}${f.linea ? `:${f.linea}` : ""} · ${f.veces} time${f.veces === 1 ? "" : "s"} · first ${hace(Date.parse(f.primero) / 1000)} ago, last ${hace(Date.parse(f.ultimo) / 1000)} ago`));
      // Arreglado o no: lo dice, y se marca (o se reabre) a mano. Vuelve solo si salta otra vez.
      const b64clave = btoa(String.fromCharCode(...new TextEncoder().encode(claveDeFallo(f))));
      const marca = el("div", "marca-fallo");
      if (f.estado === "arreglado") {
        marca.append(el("span", "bien", "✔ Marked as fixed: it comes back if it fails again. "),
          boton("Reopen", () => void orden(["reabrir", b64clave], "Reopening…", () => `Reopened: ${f.tipo} in ${f.repo}`)));
      } else {
        if (f.estado === "quizas") {
          marca.append(el("span", "bien", f.desaparecido ? `✔? Probably fixed: ${f.fichero} doesn't exist any more. `
            : `✔? Probably fixed: ${f.fichero} changed ${hace(Date.parse(f.tocado ?? "") / 1000)} ago, after the last time it failed. `));
        }
        marca.append(boton("Mark as fixed", () => void orden(["arreglado", b64clave], "Marking as fixed…", () => `Marked as fixed: ${f.tipo} in ${f.repo} (it comes back if it fails again)`)));
      }
      detalle.append(marca, el("pre", "traza", traza ?? "Reading the traceback…"));
      const listos = /** @type {Proveedor[]} */ (["claude", "codex", "gemini"]).filter((id) => estado?.cuentas[id]?.sesion);
      if (!listos.includes(proveedor) && listos.length) proveedor = listos[0];
      const provs = el("div", "proveedores");
      for (const id of listos) provs.append(boton(`${PROVEEDORES[id].empresa} · ${PROVEEDORES[id].nombre}`, () => { proveedor = id; pintar(); }, proveedor === id ? "elegido" : undefined));
      const mandar = /** @type {HTMLButtonElement} */ (boton("Send an agent to fix it", () => {
        const tareaF = tareaDeArreglo(f, traza ?? "");
        const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(tareaF)));
        void orden(["lanzar", proveedor, b64, f.repo], `Sending a ${PROVEEDORES[proveedor].nombre} agent to ${f.repo}…`,
          () => { pestana = "agentes"; return `Agent sent to ${f.repo}: it works on its own branch; watch it on the island`; });
      }, "principal"));
      mandar.disabled = !traza || !listos.length || ocupado;
      detalle.append(provs, mandar, el("p", "nota", listos.length ? "It works on its own worktree and branch, commits there and never pushes." : "No AI account signed in (see Accounts)."));
    }
    d.append(lista, detalle);
    return d;
  }

  function actividad() {
    const d = el("div", "actividad");
    if (!estado) return d;
    const barra = el("div", "barra");
    const sel = /** @type {HTMLSelectElement} */ (el("select"));
    sel.append(Object.assign(document.createElement("option"), { value: "", textContent: "All repos" }));
    for (const r of estado.repos) sel.append(Object.assign(document.createElement("option"), { value: r.nombre, textContent: r.nombre, selected: filtro.repo === r.nombre }));
    sel.addEventListener("change", () => { filtro.repo = sel.value || null; pintar(); });
    barra.append(sel);
    for (const [id, nombre] of /** @type {const} */ ([[null, "All"], ["agentes", "Agents"], ["commits", "Commits"], ["fallos", "Errors"], ["pulls", "Pulls"]])) {
      barra.append(boton(nombre, () => { filtro.grupo = id; pintar(); }, filtro.grupo === id ? "activa" : undefined));
    }
    d.append(barra);
    const eventos = filtrarActividad(estado.actividad ?? [], filtro);
    if (!eventos.length) {
      d.append(el("p", "nota", (estado.actividad ?? []).length ? "Nothing with these filters." : "Nothing yet: from now on, commits, agents, new errors and pulls show up here."));
      return d;
    }
    for (const grupo of porDias(eventos, Date.now())) {
      d.append(el("h3", "dia", grupo.dia));
      for (const e of grupo.eventos) {
        const fila = el("div", `evento ${e.tipo}`);
        fila.append(el("span", "hora", new Date(e.ts).toTimeString().slice(0, 5)), el("span", "icono", ICONOS[e.tipo] ?? "·"),
          el("span", "repo", e.repo), el("span", "texto", e.texto));
        // Un fallo lleva a su traza; un agente, a la lista de agentes.
        if (e.tipo === "fallo" || e.tipo === "arreglado") {
          fila.classList.add("enlace");
          fila.addEventListener("click", () => { fallo = (estado?.fallos ?? []).find((f) => f.id === e.ref) ?? null; pestana = "errores"; pintar(); });
        } else if (e.tipo.startsWith("agente")) {
          fila.classList.add("enlace");
          fila.addEventListener("click", () => { pestana = "agentes"; pintar(); });
        }
        d.append(fila);
      }
    }
    return d;
  }

  function pintar() {
    const cabeza = el("div", "cabecera");
    cabeza.append(el("h2", undefined, "Master console"));
    const pestanas = el("div", "pestanas");
    const recientes = (estado?.fallos ?? []).filter((f) => fuerzaDeFallo(f, Date.now()) > 0).length;
    for (const [id, nombre] of /** @type {const} */ ([["cuentas", "Accounts"], ["repos", "Repos"], ["mapas", "Maps"], ["agentes", "Agents"], ["errores", "Errors"], ["actividad", "Activity"]])) {
      const etiqueta = id === "errores" && recientes ? `Errors (${recientes})` : nombre;
      pestanas.append(boton(etiqueta, () => { pestana = id; pintar(); }, `${pestana === id ? "activa" : ""}${id === "errores" && recientes ? " con-fallos" : ""}`.trim() || undefined));
    }
    cabeza.append(pestanas, boton("Refresh", () => { mensaje = "Refreshing…"; pintar(); void refrescar().then(() => { mensaje = ""; pintar(); }); }), boton("Close (Esc)", () => cerrar()));
    const cuerpo = el("div", "cuerpo");
    cuerpo.append(!estado ? el("p", "nota", mensaje || "Reading accounts and repos…")
      : pestana === "cuentas" ? cuentas() : pestana === "repos" ? repos() : pestana === "mapas" ? mapas() : pestana === "errores" ? errores()
      : pestana === "actividad" ? actividad() : agentes());
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
    /** @param {string} [en] la pestaña: "cuentas", "repos", "mapas", "agentes", "errores" o "actividad" */
    abrir(en) {
      if (en === "cuentas" || en === "repos" || en === "mapas" || en === "agentes" || en === "errores" || en === "actividad") pestana = en;
      panel.hidden = false;
      pintar();
      void refrescar();
    },
    cerrar,
    refrescar,
    /** Una isla acabó de regenerarse (evento del puente): se marca en la pestaña Maps. @param {{repo: string, ok: boolean, texto: string}} m */
    islaHecha(m) {
      obras.set(m.repo, { estado: m.ok ? "ok" : "salto", texto: m.texto });
      if (!panel.hidden && pestana === "mapas") pintar();
    },
    /** Acabó la regeneración entera (y el mundo ya releyó los grafos). @param {boolean} ok @param {string} resumen */
    grafosHechos(ok, resumen) {
      let quedaban = 0;
      for (const [n, o] of obras) if (o.estado === "cola") { quedaban++; obras.set(n, { estado: "error", texto: ok ? "not rebuilt" : resumen }); }
      // Cuántos salieron con grafo de gb y cuántos se quedan en carpetas (y por qué, en su fila).
      const hay = new Map((islas?.() ?? []).map((g) => [g.nombre, g]));
      const hechos = [...obras.keys()].filter((n) => obras.get(n)?.estado === "ok");
      const sinCodigo = hechos.filter((n) => hay.get(n)?.sinCodigo).length;
      const graficos = hechos.filter((n) => hay.get(n)?.fuente === "gb").length;
      if (obras.size) {
        mensaje = !ok ? `Building failed: ${resumen}`
          : `Done: ${graficos} dependency graph${graficos === 1 ? "" : "s"}${sinCodigo ? ` · ${sinCodigo} with no code for galaxy-brain (their map is the folder tree)` : ""}${quedaban ? ` · ${quedaban} not rebuilt` : ""}`;
      }
      if (!panel.hidden) pintar();
    },
  };
}
