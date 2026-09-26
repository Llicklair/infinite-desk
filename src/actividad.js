// El registro de actividad (núcleo puro, probado en Node; lo usan tools/orquestador.mjs, el agente y
// el mundo): qué pasó, cuándo y dónde en todos tus repos, para no tener que estar mirando en el
// momento. Agentes (lanzado, hecho, fallido, descartado), commits nuevos, fallos nuevos que captura
// galaxy-brain y pulls. Se apunta en un fichero de líneas JSON fuera del repo; la primera vez no se
// vuelca la historia entera: solo lo que pasa desde entonces.

/**
 * @typedef {"agente" | "agente-hecho" | "agente-fallo" | "agente-descartado" | "commit" | "fallo" | "pull"} TipoEvento
 * @typedef {{ts: string, tipo: TipoEvento, repo: string, texto: string, ref?: string}} Evento
 *   `ts`: ISO; `texto`: lo que se lee; `ref`: el id del agente, del fallo o del commit
 */

export const ICONOS = /** @type {Record<TipoEvento, string>} */ ({
  agente: "🤖", "agente-hecho": "✅", "agente-fallo": "✗", "agente-descartado": "🗑", commit: "⎇", fallo: "⚠", pull: "⇣",
});

/** Los grupos de tipos para filtrar (la pestaña Activity). */
export const GRUPOS = /** @type {const} */ ({
  agentes: ["agente", "agente-hecho", "agente-fallo", "agente-descartado"],
  commits: ["commit"],
  fallos: ["fallo"],
  pulls: ["pull"],
});

export const SEPARADOR = "\u001f"; // entre campos de `git log --format`: no sale en un mensaje normal

/** El formato de `git log` que entiende commitsDeLog. */
export const FORMATO_LOG = ["%H", "%ct", "%an", "%s"].join("%x1f");

/**
 * Los commits de `git log --format=<FORMATO_LOG>`, como eventos, del más reciente al más antiguo.
 * @param {string} salida @param {string} repo
 * @returns {Evento[]}
 */
export function commitsDeLog(salida, repo) {
  /** @type {Evento[]} */
  const r = [];
  for (const l of salida.split(/\r?\n/)) {
    const [sha, ct, autor, asunto] = l.split(SEPARADOR);
    const cuando = new Date(Number(ct) * 1000);
    if (!sha || !ct || Number.isNaN(cuando.getTime())) continue; // una línea rota no es un commit
    r.push({ ts: cuando.toISOString(), tipo: "commit", repo, texto: `${autor}: ${asunto ?? ""}`.slice(0, 200), ref: sha });
  }
  return r;
}

/**
 * Los fallos nuevos desde la última vez: los que tienen una captura (`id`) que no se había visto.
 * La primera vez (sin vistos) no son eventos: se apuntan como vistos, para no volcar la historia.
 * @param {import("./fallos.js").Fallo[]} fallos
 * @param {string[] | undefined} vistos los ids ya vistos (undefined: primera vez)
 * @returns {{eventos: Evento[], vistos: string[]}}
 */
export function fallosNuevos(fallos, vistos) {
  const ids = fallos.map((f) => f.id);
  if (!vistos) return { eventos: [], vistos: ids };
  const ya = new Set(vistos);
  const eventos = fallos.filter((f) => !ya.has(f.id)).map((f) => ({
    ts: f.ultimo, tipo: /** @type {TipoEvento} */ ("fallo"), repo: f.repo,
    texto: `${f.tipo}: ${f.mensaje}${f.fichero ? ` (${f.fichero.split("/").pop()}${f.linea ? `:${f.linea}` : ""})` : ""}`.slice(0, 200), ref: f.id,
  }));
  // Se guardan los de ahora y los de antes (acotado): un fallo que deja de salir en la lista no
  // debe volver a contar como nuevo si reaparece con la misma captura.
  return { eventos, vistos: [...new Set([...ids, ...vistos])].slice(0, 2000) };
}

/**
 * Filtra por repo y por grupo de tipos (los de GRUPOS), el más reciente primero.
 * @param {Evento[]} eventos @param {{repo?: string | null, grupo?: keyof typeof GRUPOS | null}} [filtro]
 */
export function filtrarActividad(eventos, filtro = {}) {
  const tipos = filtro.grupo ? /** @type {readonly string[]} */ (GRUPOS[filtro.grupo]) : null;
  return eventos
    .filter((e) => (!filtro.repo || e.repo === filtro.repo) && (!tipos || tipos.includes(e.tipo)))
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

/**
 * Por días, para la línea de tiempo: "Today", "Yesterday" o la fecha (en inglés, como el resto del
 * mundo). Los eventos ya vienen ordenados.
 * @param {Evento[]} eventos @param {number} ahora ms
 * @returns {{dia: string, eventos: Evento[]}[]}
 */
export function porDias(eventos, ahora) {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  /** @type {{dia: string, eventos: Evento[]}[]} */
  const r = [];
  for (const e of eventos) {
    const d = new Date(e.ts);
    const dias = Math.floor((hoy.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
    const dia = dias <= 0 ? "Today" : dias === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const ultimo = r.at(-1);
    if (ultimo?.dia === dia) ultimo.eventos.push(e);
    else r.push({ dia, eventos: [e] });
  }
  return r;
}
