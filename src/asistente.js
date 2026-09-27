// Atlas, el asistente del mundo normal, por dentro (sin DOM ni red; se prueba en Node): quién es,
// qué sabe del mundo (los repos y sus grafos, las noticias del palantír, los repos top del mes) y
// qué puede hacer en él. Uso real: "otro asistente para el mundo normal, que te pueda explicar tus
// repos, las noticias, los repos top de GitHub, con una personalidad más rollo laboral, que pueda
// abrirte ventanas". El de la zona zen, Kiri, es para desahogarse (src/apoyo.js); este, para trabajar.

/**
 * @typedef {{tipo: "vscode" | "ir" | "grafo" | "trabajar", repo: string}
 *   | {tipo: "agente", repo: string, tarea: string}
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
 * @param {import("./apoyo.js").Recuerdo[]} [recuerdos] lo que recuerda de otras veces (de trabajo)
 */
export function instruccionesAtlas(contexto, mirando, hoy, recuerdos = []) {
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
    "- Lo marcado \"(por voz)\" llega dictado y puede traer palabras mal oídas (sobre todo nombres de repos): entiende lo más probable, mirando las otras lecturas y los nombres de abajo; si no está claro, pregunta en una frase.",
    "- Si notas que la persona está mal de verdad, sé humano y recuérdale que en la zona zen (tecla Z) está Kiri para hablar con calma.",
    "",
    "Puedes hacer cosas en el mundo. Si te lo pide (o lo ofreces y acepta), añade AL FINAL de tu respuesta, cada una en su línea, hasta DOS acciones así:",
    'ACCION: {"tipo": "vscode", "repo": "NombreExacto"} abre el repo en VS Code DENTRO del mundo, como pantalla en vivo (la persona trabaja en ella con Enter).',
    'ACCION: {"tipo": "agente", "repo": "NombreExacto", "tarea": "..."} manda un agente de Claude a hacer cambios en el repo: trabaja en su propia rama y su propia copia (worktree), hace commits ahí y nunca hace push; la persona lo ve trabajar sobre la isla y decide qué integra. Tú no editas ficheros: para cambiar código, mandas un agente. La tarea, concreta y completa (qué cambiar, dónde y cómo comprobarlo). Antes de mandarlo, confirma la tarea en una frase, salvo que la persona ya lo haya pedido con claridad.',
    'ACCION: {"tipo": "ir", "repo": "NombreExacto"} le lleva volando a la isla de ese repo.',
    'ACCION: {"tipo": "trabajar", "repo": "NombreExacto"} le prepara para trabajar en ese repo: le lleva a su isla y le pone delante su VS Code como pantalla (para "prepárame para trabajar en X", "vamos con X").',
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
    recuerdos.length
      ? `Lo que recuerdas de esta persona de otras veces (úsalo con naturalidad, sin recitarlo; si algo ya no vale, no pasa nada):\n${recuerdos.map((r) => `- ${r.texto} (${r.fecha})`).join("\n")}`
      : "Aún no recuerdas nada de esta persona: primera vez, o lo ha borrado.",
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
    if ((a?.tipo === "vscode" || a?.tipo === "ir" || a?.tipo === "grafo" || a?.tipo === "trabajar") && repo) return { tipo: a.tipo, repo };
    if (a?.tipo === "agente" && repo && typeof a.tarea === "string" && a.tarea.trim().length >= 10) return { tipo: "agente", repo, tarea: a.tarea.trim().slice(0, 4000) };
    if (a?.tipo === "web" && typeof a.url === "string" && /^https?:\/\/[^\s]+$/i.test(a.url.trim())) return { tipo: "web", url: a.url.trim() };
    if (a?.tipo === "leer" && Number.isInteger(a.tarjeta) && a.tarjeta >= 0 && a.tarjeta < mundo.tarjetas) return { tipo: "leer", tarjeta: a.tarjeta };
    if (a?.tipo === "ventana" || a?.tipo === "zen") return { tipo: a.tipo };
    if (a?.tipo === "consola") return { tipo: "consola", pestana: PESTANAS.includes(a.pestana) ? a.pestana : "repos" };
    return null;
  };
}

/**
 * Qué pedir al acabar una charla con Atlas: lo que un buen jefe de gabinete apuntaría para la
 * próxima vez (de trabajo; lo personal es cosa de Kiri, que tiene su propia memoria aparte).
 * @param {import("./apoyo.js").Turno[]} turnos @param {import("./apoyo.js").Recuerdo[]} recuerdos
 */
export function pedirRecuerdosAtlas(turnos, recuerdos) {
  const charla = turnos.map((t) => `${t.quien === "yo" ? "Persona" : "Atlas"}: ${t.texto.trim()}`).join("\n\n").slice(-16000);
  return [
    "Acaba de terminar una charla de trabajo entre una persona y Atlas, su asistente. Decide qué merece la pena recordar para la próxima vez, como lo apuntaría un buen jefe de gabinete:",
    "en qué proyectos anda y cuáles le importan más, qué quiere conseguir, cómo le gusta que se hagan las cosas (herramientas, estilo, lo que no quiere), decisiones tomadas, tareas pendientes o encargadas (y cómo acabaron), y datos útiles de su trabajo.",
    "Nada personal que no sea de trabajo, ni secretos (claves, contraseñas), ni detalles pasajeros. Cada recuerdo, una frase corta en tercera persona (\"Prioriza terminar infinite-desk antes del lunes\").",
    "Si algo de lo que ya recuerdas ha cambiado o se ha resuelto, cámbialo; si ya no tiene sentido, olvídalo.",
    "",
    "Lo que ya recuerdas:",
    recuerdos.length ? recuerdos.map((r) => `[${r.id}] ${r.texto}`).join("\n") : "(nada)",
    "",
    "La charla:",
    charla,
    "",
    'Contesta SOLO con un JSON, sin nada más: {"nuevos": ["..."], "cambiar": [{"id": "...", "texto": "..."}], "olvidar": ["id"]} (listas vacías si no hay nada).',
  ].join("\n");
}
