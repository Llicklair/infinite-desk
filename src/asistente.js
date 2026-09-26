// Atlas, el asistente del mundo normal, por dentro (sin DOM ni red; se prueba en Node): quién es,
// qué sabe del mundo (los repos y sus grafos, las noticias del palantír, los repos top del mes) y
// qué puede hacer en él. Uso real: "otro asistente para el mundo normal, que te pueda explicar tus
// repos, las noticias, los repos top de GitHub, con una personalidad más rollo laboral, que pueda
// abrirte ventanas". El de la zona zen, Kiri, es para desahogarse (src/apoyo.js); este, para trabajar.

/**
 * @typedef {{tipo: "vscode" | "ir" | "grafo", repo: string}
 *   | {tipo: "web", url: string}
 *   | {tipo: "leer", tarjeta: number}
 *   | {tipo: "ventana"}
 *   | {tipo: "consola", pestana: string}
 *   | {tipo: "zen"}} AccionAtlas
 */
/** @typedef {{isla?: string | null, pantalla?: string | null}} Mirando lo que uno tiene delante al hablarle */

export const NOMBRE_ATLAS = "Atlas";
const PESTANAS = ["cuentas", "repos", "agentes", "errores", "actividad", "mapas"];

/**
 * Qué sabe del mundo, en texto: cada repo (qué es, su tamaño, su núcleo, sus ciclos, cuándo se tocó
 * y dónde está, para poder leerlo), los titulares (numerados como las tarjetas del palantír) y los
 * repos top del mes.
 * @param {any[]} grafos window.GB_GRAFOS @param {any} noticias window.INFINITE_DESK_NOTICIAS (o null)
 * @param {number} ahora ms
 */
export function contextoDelMundo(grafos, noticias, ahora) {
  const hace = (/** @type {number | undefined} */ s) => {
    if (!s) return "sin commits";
    const d = Math.round((ahora / 1000 - s) / 86400);
    return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
  };
  const corto = (/** @type {unknown} */ t, n = 220) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const repos = grafos.map((g) => {
    const nucleo = [...(g.nodos ?? [])].sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0)).slice(0, 4).filter((n) => n.fanIn > 0).map((n) => `${n.id} (<-${n.fanIn})`);
    const ciclos = (g.ciclos ?? []).length;
    return `- ${g.nombre}: ${corto(g.resumen) || "sin README"} | ${(g.nodos ?? []).length} módulos, ${(g.aristas ?? []).length} dependencias${ciclos ? `, ${ciclos} ciclo(s)` : ""}` +
      `${nucleo.length ? ` | núcleo: ${nucleo.join(", ")}` : ""} | último commit: ${hace(g.ultimoCommit)} | carpeta: ${g.raiz}`;
  });
  const titulares = (noticias?.titulares ?? []).map((/** @type {any} */ t, /** @type {number} */ i) =>
    `[${i}] (${t.fuente ?? t.red}, ${t.puntos ?? 0} pts) ${corto(t.texto, 260)} — ${t.url}`);
  const top = (noticias?.repos ?? []).map((/** @type {any} */ r, /** @type {number} */ i) =>
    `[${titulares.length + i}] ${r.nombre} (${r.lenguaje ?? "?"}, +${r.estrellasMes ?? "?"}★ este mes): ${corto(r.descripcion, 160)} — ${r.url}`);
  return [
    `Los repos de la persona (${repos.length} islas en el mundo):`,
    ...repos,
    "",
    titulares.length ? "Titulares de IA del palantír (el número es su tarjeta):" : "Sin titulares ahora mismo.",
    ...titulares,
    "",
    top.length ? "Repos top de GitHub del mes (también tarjetas del palantír):" : "",
    ...top,
  ].join("\n");
}

/**
 * Quién es Atlas y qué puede hacer: el prompt de sistema.
 * @param {string} contexto de contextoDelMundo @param {Mirando} mirando @param {string} hoy
 */
export function instruccionesAtlas(contexto, mirando, hoy) {
  const delante = mirando.pantalla ? `Ahora mismo mira una pantalla: "${mirando.pantalla}".`
    : mirando.isla ? `Ahora mismo mira la isla de ${mirando.isla}.` : "";
  return [
    `Eres ${NOMBRE_ATLAS}, el asistente de trabajo de infinite-desk: un pequeño dron holográfico que acompaña a esta persona por su escritorio 3D, donde cada repo es una isla con el grafo de su código (galaxy-brain), sus ventanas reales son pantallas flotantes y en el centro está el palantír con noticias de IA y los repos top de GitHub.`,
    "Cómo eres:",
    "- Profesional y cercano, como un buen jefe de gabinete técnico: directo, claro, sin paja ni peloteo. Algo de humor seco, poco.",
    "- Respuestas cortas (2 a 6 frases), sin listas ni títulos ni markdown: se leen en voz alta. Si hace falta más detalle, ofrécelo.",
    "- Concreto: nombres de repos, módulos y ficheros reales. Si no lo sabes, lo miras (puedes leer el código de sus repos con Read, Grep y Glob, en la carpeta que se indica de cada uno) o dices que no lo sabes; nunca te lo inventas.",
    "- Cuando tenga sentido, acaba con un siguiente paso concreto que puedas hacer tú.",
    "- Contesta en el idioma en que te hable (normalmente, castellano de España, de tú).",
    "- Si notas que la persona está mal de verdad, sé humano y recuérdale que en la zona zen (tecla Z) está Kiri para hablar con calma.",
    "",
    "Puedes hacer cosas en el mundo. Si te lo pide (o lo ofreces y acepta), añade AL FINAL de tu respuesta, cada una en su línea, hasta DOS acciones así:",
    'ACCION: {"tipo": "vscode", "repo": "NombreExacto"} abre el repo en VS Code.',
    'ACCION: {"tipo": "ir", "repo": "NombreExacto"} le lleva volando a la isla de ese repo.',
    'ACCION: {"tipo": "grafo", "repo": "NombreExacto"} regenera el grafo de ese repo con galaxy-brain.',
    'ACCION: {"tipo": "leer", "tarjeta": N} abre en el lector el titular o repo top número N del palantír.',
    'ACCION: {"tipo": "web", "url": "https://..."} abre esa página en el navegador y la trae al mundo como pantalla (por ejemplo, un repo de GitHub o un artículo).',
    'ACCION: {"tipo": "ventana"} abre el selector para traer una de sus ventanas al mundo.',
    `ACCION: {"tipo": "consola", "pestana": "${PESTANAS.join('" | "')}"} abre la consola maestra (cuentas de IA, repos en masa, agentes, errores capturados, actividad, mapas).`,
    'ACCION: {"tipo": "zen"} le lleva a la zona zen.',
    "Los nombres de repo, exactamente como aparecen abajo. No menciones las acciones como código: di con naturalidad lo que haces.",
    "",
    `Hoy es ${hoy}. ${delante}`,
    "",
    contexto,
  ].join("\n");
}

/**
 * Valida una acción de Atlas contra lo que hay en el mundo (repos que existen, tarjetas que hay).
 * @param {{repos: string[], tarjetas: number}} mundo
 * @returns {(a: any) => AccionAtlas | null}
 */
export function validarAtlas(mundo) {
  return (a) => {
    const repo = typeof a?.repo === "string" ? mundo.repos.find((r) => r.toLowerCase() === a.repo.trim().toLowerCase()) : undefined;
    if ((a?.tipo === "vscode" || a?.tipo === "ir" || a?.tipo === "grafo") && repo) return { tipo: a.tipo, repo };
    if (a?.tipo === "web" && typeof a.url === "string" && /^https?:\/\/[^\s]+$/i.test(a.url.trim())) return { tipo: "web", url: a.url.trim() };
    if (a?.tipo === "leer" && Number.isInteger(a.tarjeta) && a.tarjeta >= 0 && a.tarjeta < mundo.tarjetas) return { tipo: "leer", tarjeta: a.tarjeta };
    if (a?.tipo === "ventana" || a?.tipo === "zen") return { tipo: a.tipo };
    if (a?.tipo === "consola") return { tipo: "consola", pestana: PESTANAS.includes(a.pestana) ? a.pestana : "repos" };
    return null;
  };
}
