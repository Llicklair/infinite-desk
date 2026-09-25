// Qué repo muestra una ventana, a partir de su título. Puro: sin Three.js (ARCHITECTURE 1).
//
// VS Code titula sus ventanas `fichero - carpeta - Visual Studio Code` por defecto, así que el
// nombre del repo aparece como palabra suelta. Otras herramientas (terminal, navegador en
// localhost) suelen llevarlo también.

/** @param {string} s */
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} titulo título de la ventana (label de la pista de captura)
 * @param {string[]} nombres nombres de los repos con isla
 * @returns {string | null} el repo, o null si ninguno aparece como palabra suelta
 */
export function repoDeTitulo(titulo, nombres) {
  // El más largo primero: `galaxy-brain` gana a un hipotético `galaxy`.
  const candidatos = [...nombres].sort((a, b) => b.length - a.length);
  for (const nombre of candidatos) {
    // Guion y guion bajo cuentan como parte de la palabra: `forja` no casa con `forja-web`.
    const borde = "[^\\p{L}\\p{N}_-]";
    const patron = new RegExp(`(^|${borde})${escapar(nombre)}($|${borde})`, "iu");
    if (patron.test(titulo)) return nombre;
  }
  return null;
}

/**
 * Siguiente repo al pulsar G sobre una pantalla: null -> primero -> ... -> último -> null.
 * @param {string | null} actual
 * @param {string[]} nombres
 */
export function siguienteRepo(actual, nombres) {
  if (nombres.length === 0) return null;
  const i = actual === null ? -1 : nombres.indexOf(actual);
  return i + 1 >= nombres.length ? null : nombres[i + 1];
}

/**
 * @typedef {{nombre: string, nodos: string[], simbolos?: string[], commitados?: string[], hace_seg?: number | null,
 *   consola?: string[], cambios?: string[], vecinos?: string[]}} Agente
 *   uno de `gb who --json`: sus módulos tocados sin commitear (`nodos`) y los recién commiteados;
 *   `consola`, las últimas líneas de su `<worktree>.consola.log`; `cambios`, firmas que cambió
 */

/**
 * Qué nodos encienden los agentes de gb, por índice: quién lo toca, si solo lo commiteó y si
 * hay CRUCE (dos agentes en el mismo módulo a la vez, lo que gb llama cruce).
 * @param {string[]} ids los módulos del grafo, en orden
 * @param {Agente[]} agentes
 * @returns {Map<number, {agentes: string[], commit: boolean, cruce: boolean}>}
 */
export function encendidosPorAgentes(ids, agentes) {
  const indice = new Map(ids.map((id, i) => [id, i]));
  /** @type {Map<number, {agentes: string[], commit: boolean, cruce: boolean}>} */
  const r = new Map();
  for (const a of agentes) {
    for (const [lista, commit] of /** @type {const} */ ([[a.nodos ?? [], false], [a.commitados ?? [], true]])) {
      for (const id of lista) {
        const i = indice.get(id);
        if (i === undefined) continue; // un módulo naciente aún no es nodo del mapa
        const e = r.get(i) ?? { agentes: [], commit: true, cruce: false };
        if (!e.agentes.includes(a.nombre)) e.agentes.push(a.nombre);
        e.commit &&= commit; // con que uno lo tenga sin commitear, está vivo
        r.set(i, e);
      }
    }
  }
  // Cruce solo con cambios sin commitear de dos agentes, como en gb: dos que commitearon hace
  // rato no están chocando.
  for (const [i, e] of r) {
    const vivos = agentes.filter((a) => (a.nodos ?? []).includes(ids[i])).length;
    e.cruce = vivos > 1;
  }
  return r;
}

/** La paleta de agentes del mapa de gb (viz.py `_COLOR_AGENTE`), y el gris del quinto en adelante. */
export const COLORES_AGENTE = ["#ff4d9d", "#a3e635", "#22d3ee", "#fb923c"];
export const COLOR_AGENTE_DE_MAS = "#94a3b8";

/**
 * El color de un agente, como en el mapa de gb: por su puesto entre los nombres ordenados, así
 * el mismo agente tiene el mismo color aquí y allí.
 * @param {string} nombre
 * @param {string[]} nombres todos los agentes del repo
 */
export function colorDeAgente(nombre, nombres) {
  const i = [...new Set(nombres)].sort().indexOf(nombre);
  return i >= 0 && i < COLORES_AGENTE.length ? COLORES_AGENTE[i] : COLOR_AGENTE_DE_MAS;
}

/** Como en gb (`ONDA_FRESCA`, `ONDA_MUERTA`): con fuerza 3 min, apagado del todo a los 10. */
export const ONDA_FRESCA = 180;
export const ONDA_MUERTA = 600;

/**
 * La fuerza (0..1) de lo que hizo un agente hace `hace` segundos: entera mientras está fresco,
 * y se apaga en línea recta hasta ONDA_MUERTA. Sin dato (null), entera.
 * @param {number | null | undefined} hace
 */
export function vigorOnda(hace) {
  if (hace == null || hace <= ONDA_FRESCA) return 1;
  return Math.max(0, 1 - (hace - ONDA_FRESCA) / (ONDA_MUERTA - ONDA_FRESCA));
}

/**
 * Las señales que viajan por las aristas, como la "sinapsis" del mapa de gb: toda arista con un
 * extremo encendido lleva una, DESDE el nodo tocado hacia el otro (el cambio propagándose hacia
 * quien lo usa). Con los dos tocados, de origen a destino. Solo presencia de agentes: nada al azar.
 * @param {{origen: number, destino: number}[]} aristas
 * @param {Map<number, {agentes: string[]}>} encendidos de `encendidosPorAgentes`
 * @returns {{desde: number, hasta: number, agentes: string[]}[]}
 */
export function senalesDeAgentes(aristas, encendidos) {
  /** @type {{desde: number, hasta: number, agentes: string[]}[]} */
  const r = [];
  for (const { origen, destino } of aristas) {
    const eo = encendidos.get(origen);
    const ed = encendidos.get(destino);
    if (eo) r.push({ desde: origen, hasta: destino, agentes: eo.agentes });
    else if (ed) r.push({ desde: destino, hasta: origen, agentes: ed.agentes });
  }
  return r;
}

/**
 * Qué líneas de una consola son nuevas respecto a lo ya enseñado, para que "caigan" de una en
 * una como en las terminales del mapa de gb. Se busca la última línea vista; si ya no está
 * (la consola corrió mucho), las últimas `maximo`.
 * @param {string[]} vistas lo ya enseñado, en orden
 * @param {string[]} consola lo que dice ahora `gb who` (sus últimas líneas)
 * @param {number} [maximo]
 */
export function lineasNuevas(vistas, consola, maximo = 12) {
  if (!vistas.length) return consola.slice(-maximo);
  const ultima = vistas[vistas.length - 1];
  const i = consola.lastIndexOf(ultima);
  return (i === -1 ? consola : consola.slice(i + 1)).slice(-maximo);
}
