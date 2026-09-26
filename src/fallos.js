// Los fallos de tus repos (núcleo puro, probado en Node; lo usan tools/orquestador.mjs y el mundo).
// galaxy-brain ya captura cada excepción de lo que corre en un proyecto (`gb list --json --all`,
// `gb show <id> --json`); aquí se reparten por repo y por módulo para pintarlos en rojo en su isla,
// se hace legible la traza y se escribe la tarea para mandar un agente a arreglarlo. Un fallo es
// del repo del FICHERO donde saltó, no del proyecto desde el que se ejecutó (medido: un NameError
// de galaxy-brain/cli.py salía como de infinite-desk, porque gb se corrió desde allí).

/**
 * @typedef {{id: string, repo: string, tipo: string, mensaje: string, fichero: string | null, linea: number | null,
 *   veces: number, ultimo: string, primero: string}} Fallo
 *   `id`: el de su última captura (para `gb show`); `fichero`: relativo al repo, con "/"
 */

/** @param {string} ruta */
const normal = (ruta) => ruta.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/**
 * "C:\...\cli.py:2489" -> {fichero, linea}. La letra de unidad de Windows también lleva ":".
 * @param {string | null | undefined} donde
 * @returns {{fichero: string, linea: number | null} | null}
 */
export function partirDonde(donde) {
  if (!donde) return null;
  const m = /^(.*):(\d+)$/.exec(donde);
  return m ? { fichero: m[1], linea: Number(m[2]) } : { fichero: donde, linea: null };
}

/**
 * El repo que contiene una ruta (el más largo, por si hay repos dentro de repos) y la ruta
 * relativa a él; null si no está en ninguno de tus repos.
 * @param {string} ruta @param {{nombre: string, ruta: string}[]} repos
 */
export function repoDeRuta(ruta, repos) {
  const r = normal(ruta);
  let mejor = null;
  for (const repo of repos) {
    const base = normal(repo.ruta);
    if ((r === base || r.startsWith(`${base}/`)) && (!mejor || base.length > normal(mejor.ruta).length)) mejor = repo;
  }
  if (!mejor) return null;
  const base = mejor.ruta.replace(/\\/g, "/").replace(/\/+$/, "");
  return { repo: mejor.nombre, relativa: ruta.replace(/\\/g, "/").slice(base.length + 1) };
}

/**
 * Los fallos de `gb list --json --all` que son de tus repos, repartidos por el fichero donde
 * saltaron (o, si gb no sabe dónde, por el proyecto desde el que se corrió). Lo de carpetas
 * temporales y demás, fuera. El más reciente primero.
 * @param {any[]} lista @param {{nombre: string, ruta: string}[]} repos
 * @returns {Fallo[]}
 */
export function fallosDeRepos(lista, repos) {
  /** @type {Fallo[]} */
  const r = [];
  for (const f of Array.isArray(lista) ? lista : []) {
    const donde = partirDonde(f?.where);
    const enRepo = donde ? repoDeRuta(donde.fichero, repos) : f?.project ? repoDeRuta(f.project, repos) : null;
    if (!enRepo) continue;
    r.push({
      id: String(f.last_id ?? ""),
      repo: enRepo.repo,
      tipo: String(f.type ?? "Error"),
      mensaje: String(f.last_message ?? "").slice(0, 300),
      fichero: donde ? enRepo.relativa : null,
      linea: donde?.linea ?? null,
      veces: Number(f.count) || 1,
      ultimo: String(f.last_ts ?? ""),
      primero: String(f.first_ts ?? f.last_ts ?? ""),
    });
  }
  return r.sort((a, b) => Date.parse(b.ultimo) - Date.parse(a.ultimo));
}

/**
 * El módulo del grafo de un fichero: "src/galaxybrain/cli.py" es "galaxybrain.cli", "src/mundo.js"
 * es "mundo", "tools/agente.mjs" es "tools.agente". Se prueba del más largo al más corto de los
 * sufijos del camino sin extensión, con puntos; en el árbol de carpetas, la ruta tal cual.
 * @param {string} fichero relativo al repo, con "/"
 * @param {string[]} ids los módulos del grafo
 * @returns {number} su índice, o -1
 */
export function nodoDeFichero(fichero, ids) {
  const directo = ids.indexOf(fichero);
  if (directo >= 0) return directo;
  const partes = fichero.replace(/\.[^./]+$/, "").split("/").filter(Boolean);
  if (partes.at(-1) === "__init__") partes.pop(); // el paquete es su __init__
  for (let i = 0; i < partes.length; i++) {
    const k = ids.indexOf(partes.slice(i).join("."));
    if (k >= 0) return k;
  }
  return -1;
}

/**
 * Cuánto pesa un fallo para pintarlo (0..1): reciente y repetido, más. Pasada una semana sin
 * repetirse, nada: ya no se enseña en la isla (sigue en la consola).
 * @param {Fallo} f @param {number} ahora ms
 */
export function fuerzaDeFallo(f, ahora) {
  const dias = (ahora - Date.parse(f.ultimo)) / 86400000;
  if (!(dias >= 0) || dias > 7) return dias < 0 ? 1 : 0;
  return Math.min(1, (1 - dias / 7) * (0.5 + Math.min(f.veces, 20) / 40));
}

/**
 * La traza de `gb show <id> --json`, legible y sin las variables locales (pueden llevar datos): el
 * error, y los marcos que no son de librerías, con su línea de código.
 * @param {any} captura
 */
export function trazaLegible(captura) {
  const e = captura?.exception ?? {};
  /** @type {any[]} */
  const marcos = (captura?.frames ?? []).filter((/** @type {any} */ m) => !m.is_library && !String(m.file).startsWith("<"));
  const lineas = marcos.slice(-8).map((m) => {
    // gb da unas líneas alrededor, {n, text, is_fail}: la que falla es la de is_fail.
    const codigo = Array.isArray(m.source) ? m.source.find((/** @type {any} */ s) => s?.is_fail)?.text ?? "" : "";
    return `  at ${m.function ?? "?"} (${m.file}:${m.line})${codigo ? `\n      ${String(codigo).trim()}` : ""}`;
  });
  return `${e.type ?? "Error"}: ${e.message ?? ""}${lineas.length ? `\n${lineas.join("\n")}` : ""}`;
}

/**
 * La tarea para el agente que lo arregle: qué falla, dónde, cuántas veces, la traza, y que lo
 * pruebe y no toque más de lo necesario.
 * @param {Fallo} f @param {string} traza
 */
export function tareaDeArreglo(f, traza) {
  return [
    `Fix this error, which galaxy-brain has captured ${f.veces} time${f.veces === 1 ? "" : "s"} (last: ${f.ultimo}):`,
    `${f.tipo}: ${f.mensaje}${f.fichero ? `\nWhere: ${f.fichero}${f.linea ? `:${f.linea}` : ""}` : ""}`,
    "",
    "Traceback:",
    traza,
    "",
    "Find the root cause, make the smallest correct fix, add or adjust a test that reproduces it if the project has tests, and run them. Don't change unrelated code.",
  ].join("\n");
}
