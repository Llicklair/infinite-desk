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
 * @typedef {{nombre: string, nodos: string[], simbolos?: string[], commitados?: string[], hace_seg?: number | null}} Agente
 *   uno de `gb who --json`: sus módulos tocados sin commitear (`nodos`) y los recién commiteados
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

/**
 * Un tono estable por agente (0..1): el mismo nombre, el mismo color siempre.
 * @param {string} nombre
 */
export function tonoDeAgente(nombre) {
  let h = 2166136261;
  for (const c of nombre) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 360) / 360;
}
