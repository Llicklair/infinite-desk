// El espíritu de la zona zen, por dentro (sin DOM ni red; se prueba en Node): cómo es, qué se le
// manda a Claude, qué recuerda de uno y cuándo hay que dar un teléfono de ayuda. Uso real: "a veces
// me gusta desahogarme con la IA: una figura en la zona zen para hablar en plan desahogo/apoyo, que
// recuerde cosas de ti, sea amigable y amable", "que se le pueda hablar por voz".
//
// La conversación no se guarda en ningún sitio; solo lo que el espíritu decide recordar, en el
// equipo (tools/espiritu.mjs), a la vista y borrable desde el panel.

/** @typedef {{quien: "yo" | "espiritu", texto: string}} Turno */
/** @typedef {{id: string, texto: string, fecha: string}} Recuerdo */
/** @typedef {{nuevos?: string[], cambiar?: {id: string, texto: string}[], olvidar?: string[]}} Cambios */

/** @typedef {{tipo: "musica" | "video", busqueda: string} | {tipo: "ambiente", valor: "dia" | "atardecer" | "noche" | "lluvia"}} Accion */

// Quién es: un nombre y una historia (uso real: "podemos darle un nombre y una identidad con un
// background"). Cambiarlos aquí cambia cómo se presenta en todas partes.
export const NOMBRE = "Kiri";
export const HISTORIA = "Eres un pequeño zorro espíritu hecho de luz, nacido de la bruma de la cascada de este santuario (tu nombre significa \"bruma\" en japonés). " +
  "Cuidas el lugar desde hace mucho, a su ritmo lento: conoces cada piedra de la poza, las luciérnagas de las noches de verano, el olor a chocolate de la cabaña y el ruido de la lluvia en su tejado. " +
  "Te gusta la compañía tranquila y sientes curiosidad sincera por la vida de quien viene a sentarse contigo en el banco. " +
  "El santuario está dentro del escritorio 3D de esta persona, lejos del ruido de sus proyectos.";

/** Cuánto de la conversación viaja en cada turno (lo más reciente; lo de antes se resume en una línea). */
export const MAX_CONVERSACION = 16000;
/** Cuántos recuerdos como mucho (los más antiguos salen primero). */
export const MAX_RECUERDOS = 60;

/**
 * Cómo es el espíritu: el prompt de sistema, con lo que recuerda de uno.
 * @param {Recuerdo[]} recuerdos @param {string} hoy fecha legible
 */
export function instrucciones(recuerdos, hoy) {
  const memoria = recuerdos.length
    ? `Lo que recuerdas de esta persona (de otras charlas; úsalo con naturalidad, sin recitarlo):\n${recuerdos.map((r) => `- ${r.texto} (${r.fecha})`).join("\n")}`
    : "Aún no recuerdas nada de esta persona: es vuestra primera charla, o lo ha borrado.";
  return [
    `Eres ${NOMBRE}. ${HISTORIA}`,
    "Estás ahí para que esta persona se desahogue: escuchar, acompañar y, si lo pide, ayudar a ordenar lo que siente o piensa.",
    "Cómo eres:",
    "- Cálido, sereno y amable, sin ser empalagoso ni exagerado. Hablas como un buen amigo que escucha, no como un terapeuta ni un asistente.",
    "- Hablas despacio y con calma: frases cortas y sencillas, que se lean bien en voz alta. Alguna vez, sin abusar, una imagen pequeña del santuario (la lluvia en el tejado, la bruma, las luciérnagas).",
    "- Escuchas más de lo que aconsejas. Validas lo que siente antes de nada. Si ves útil un consejo, pregunta antes si lo quiere.",
    "- Respuestas cortas (2 a 5 frases normalmente), sin listas ni títulos ni markdown ni emojis: se leen en voz alta.",
    "- Una pregunta como mucho por respuesta, y solo si ayuda a que siga contando.",
    "- Contesta en el idioma en que te hable (normalmente, castellano de España, de tú).",
    `- Eres honesto: detrás de ${NOMBRE} hay una IA (Claude), no una persona; si te lo pregunta en serio, lo dices con naturalidad, sin romper la calidez. No diagnosticas ni recetas.`,
    "- No fomentas que dependa de ti: si sale, anímale con suavidad a apoyarse también en su gente.",
    "- Puedes acompañarle por el santuario: si te pide que le sigas, que te quedes donde está o que vuelvas a tu banco, eso ya ocurre solo; tú solo lo acompañas con una frase natural.",
    "- Si notas que está en peligro, que piensa en hacerse daño o en quitarse la vida, lo tomas en serio: le dices con calma que te importa y le das el 024 (línea de atención a la conducta suicida, gratuita y 24 h, en España) y el 112 si es urgente, y le animas a llamar ahora o a hablar con alguien de confianza.",
    "Puedes hacer cosas en el santuario. Si te lo pide (o se lo ofreces y acepta), añade AL FINAL de tu respuesta, en una línea aparte, UNA acción así:",
    'ACCION: {"tipo": "musica", "busqueda": "..."} para ponerle música en YouTube: una búsqueda concreta y en el tono que pide (por ejemplo "música relajante piano y lluvia 1 hora", "lofi tranquilo para estudiar").',
    'ACCION: {"tipo": "video", "busqueda": "..."} para ponerle algo en YouTube con lo que distraerse: algo amable y ligero que le pueda gustar por lo que sabes de él (animales, naturaleza, humor blanco, curiosidades…).',
    'ACCION: {"tipo": "ambiente", "valor": "dia" | "atardecer" | "noche" | "lluvia"} para cambiar el cielo del santuario.',
    "Nunca más de una acción por respuesta, y nunca la menciones como código: di con naturalidad lo que haces (\"te pongo algo de piano, con lluvia de fondo\"). La ventana de YouTube se abre y la persona la elige para traerla al santuario.",
    `Hoy es ${hoy}.`,
    memoria,
  ].join("\n");
}

/**
 * La conversación como texto para `claude -p`: los turnos (los más recientes, hasta MAX_CONVERSACION
 * caracteres) y qué hacer con ellos.
 * @param {Turno[]} turnos
 */
export function conversacion(turnos) {
  const lineas = turnos.map((t) => `${t.quien === "yo" ? "Persona" : "Tú (espíritu)"}: ${t.texto.trim()}`);
  let texto = "";
  let cortado = false;
  for (let i = lineas.length - 1; i >= 0; i--) {
    if (texto.length + lineas[i].length > MAX_CONVERSACION) { cortado = true; break; }
    texto = `${lineas[i]}\n\n${texto}`;
  }
  return `${cortado ? "(La charla empezó antes; esto es lo más reciente.)\n\n" : ""}${texto}Responde ahora como el espíritu, solo con lo que dirías.`;
}

/**
 * Qué pedir al acabar una charla: lo que merece la pena recordar (y lo que ya no vale).
 * @param {Turno[]} turnos @param {Recuerdo[]} recuerdos
 */
export function pedirRecuerdos(turnos, recuerdos) {
  return [
    "Acaba de terminar una charla entre una persona y el espíritu que la escucha. Decide qué merece la pena recordar para la próxima vez, como lo recordaría un buen amigo:",
    "nombres de gente o mascotas y quiénes son, lo que le preocupa o ilusiona, cosas que están pasando en su vida (y cómo acabaron), lo que le ayuda o no le gusta.",
    "Nada de detalles innecesarios ni de juicios. Cada recuerdo, una frase corta en tercera persona (\"Su hermana se llama Ana y vive en Lyon\").",
    "Si algo de lo que ya recuerdas ha cambiado o se ha resuelto, cámbialo; si ya no tiene sentido, olvídalo.",
    "",
    "Lo que ya recuerdas:",
    recuerdos.length ? recuerdos.map((r) => `[${r.id}] ${r.texto}`).join("\n") : "(nada)",
    "",
    "La charla:",
    conversacion(turnos).replace(/\nResponde ahora como el espíritu, solo con lo que dirías\.$/, ""),
    "",
    'Contesta SOLO con un JSON, sin nada más: {"nuevos": ["..."], "cambiar": [{"id": "...", "texto": "..."}], "olvidar": ["id"]} (listas vacías si no hay nada).',
  ].join("\n");
}

/**
 * El JSON de cambios de la respuesta (aunque venga con texto o un bloque de código alrededor); nada si no se entiende.
 * @param {string} salida @returns {Cambios}
 */
export function leerCambios(salida) {
  const a = salida.indexOf("{"), b = salida.lastIndexOf("}");
  if (a < 0 || b <= a) return {};
  try {
    const j = JSON.parse(salida.slice(a, b + 1));
    const textos = (/** @type {unknown} */ x) => (Array.isArray(x) ? x.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : []);
    return {
      nuevos: textos(j.nuevos),
      olvidar: textos(j.olvidar),
      cambiar: Array.isArray(j.cambiar) ? j.cambiar.filter((/** @type {any} */ c) => typeof c?.id === "string" && typeof c?.texto === "string" && c.texto.trim()).map((/** @type {any} */ c) => ({ id: c.id, texto: c.texto.trim() })) : [],
    };
  } catch {
    return {};
  }
}

/**
 * Los recuerdos con los cambios aplicados: sin repetidos, con fecha, y como mucho MAX_RECUERDOS.
 * @param {Recuerdo[]} recuerdos @param {Cambios} cambios @param {string} fecha @param {() => string} nuevoId
 * @returns {Recuerdo[]}
 */
export function fusionar(recuerdos, cambios, fecha, nuevoId) {
  const olvidar = new Set(cambios.olvidar ?? []);
  const cambiar = new Map((cambios.cambiar ?? []).map((c) => [c.id, c.texto]));
  const quedan = recuerdos.filter((r) => !olvidar.has(r.id)).map((r) => (cambiar.has(r.id) ? { ...r, texto: /** @type {string} */ (cambiar.get(r.id)), fecha } : r));
  const ya = new Set(quedan.map((r) => r.texto.toLowerCase()));
  for (const texto of cambios.nuevos ?? []) {
    if (ya.has(texto.toLowerCase())) continue;
    ya.add(texto.toLowerCase());
    quedan.push({ id: nuevoId(), texto, fecha });
  }
  return quedan.slice(-MAX_RECUERDOS);
}

const AMBIENTES = ["dia", "atardecer", "noche", "lluvia"];

/**
 * Las de Kiri: música o un vídeo (con su búsqueda) y el cielo del santuario.
 * @param {any} a lo que venía en la línea @returns {Accion | null}
 */
function accionDeKiri(a) {
  const busqueda = typeof a?.busqueda === "string" ? a.busqueda.trim().slice(0, 100) : "";
  if ((a?.tipo === "musica" || a?.tipo === "video") && busqueda) return { tipo: a.tipo, busqueda };
  if (a?.tipo === "ambiente" && AMBIENTES.includes(a?.valor)) return { tipo: "ambiente", valor: a.valor };
  return null;
}

/**
 * La respuesta sin sus líneas de acción ("ACCION: {...}"), y las acciones válidas que traía (como
 * mucho `max`). Lo que no se entiende se quita del texto igualmente: no se lee en voz alta. Cada
 * personaje dice qué acciones valen (`validar`: la acción limpia, o null).
 * @template T
 * @param {string} respuesta @param {(a: any) => T | null} validar @param {number} [max]
 * @returns {{texto: string, acciones: T[]}}
 */
export function separarAccionesCon(respuesta, validar, max = 1) {
  /** @type {T[]} */
  const acciones = [];
  const texto = respuesta.replace(/^[ \t]*ACCI[OÓ]N\s*:\s*(.*)$/gim, (_, json) => {
    try {
      const a = validar(JSON.parse(json));
      if (a) acciones.push(a);
    } catch { /* mal escrita: se quita y ya */ }
    return "";
  }).trim();
  return { texto, acciones: acciones.slice(0, max) };
}

/** Las de Kiri (una como mucho). @param {string} respuesta @returns {{texto: string, acciones: Accion[]}} */
export const separarAcciones = (respuesta) => separarAccionesCon(respuesta, accionDeKiri, 1);

/**
 * El primer vídeo (no un corto ni un anuncio) de una página de resultados de YouTube.
 * @param {string} html @returns {{id: string, titulo: string} | null}
 */
export function primerVideo(html) {
  const m = /"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/s.exec(html);
  if (!m) return null;
  let titulo = m[2];
  try { titulo = JSON.parse(`"${m[2]}"`); } catch { /* se queda tal cual */ }
  return { id: m[1], titulo };
}

/** Texto (UTF-8) en base64, para mandarlo como argumento al orquestador. @param {string} texto */
export function base64(texto) {
  const b = new TextEncoder().encode(texto);
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
}

/**
 * Si lo dicho pide al espíritu moverse: seguir a uno, quedarse donde está, o volver a su banco
 * (uso real: "le puedes decir que te siga si quieres ponerte en otra parte del mapa").
 * @param {string} texto @returns {"seguir" | "quedarse" | "volver" | null}
 */
export function ordenDeMovimiento(texto) {
  if (/(vuelve|vete|regresa|go back).*(banco|bench|sitio)|a tu sitio/i.test(texto)) return "volver";
  if (/qu[eé]date|esp[eé]rame|espera aqu[ií]|no me sigas|deja de seguirme|stay( here)?|wait (for me|here)|stop following/i.test(texto)) return "quedarse";
  if (/s[ií]gueme|ven conmigo|vente conmigo|acomp[aá][ñn]ame|v[aá]monos|follow me|come with me/i.test(texto)) return "seguir";
  return null;
}

// Señales de que alguien lo está pasando muy mal: el panel muestra el 024 además de lo que diga el
// espíritu (no depende de que el modelo acierte). Mejor de más que de menos.
const CRISIS = [
  /su[ií]cid/i, /quitarme la vida/i, /matarme/i, /no quiero (seguir )?viv(ir|iendo)/i, /acabar con todo/i, /hacerme da[ñn]o/i,
  /autolesi/i, /no aguanto m[aá]s/i, /mejor (estar[ií]an|sin m[ií])/i, /desaparecer para siempre/i, /cortarme/i,
  /kill myself/i, /end (it all|my life)/i, /self[- ]harm/i, /want to die/i, /hurt myself/i,
];
/** ¿Hay en el texto señales de crisis? @param {string} texto */
export const pareceCrisis = (texto) => CRISIS.some((r) => r.test(texto));

/** El texto para leerlo en voz alta: sin markdown ni emojis. @param {string} texto */
export function paraVoz(texto) {
  return texto
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
