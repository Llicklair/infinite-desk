// De `gb graph --json` al grafo que pinta infinitas. Puro: sin Three.js (ARCHITECTURE 1).

/**
 * @typedef {{id: string, grupo: string, fanIn: number, fanOut: number, enCiclo: boolean}} Nodo
 * @typedef {{origen: number, destino: number, enCiclo: boolean}} Arista
 * @typedef {{raiz: string, nodos: Nodo[], aristas: Arista[], ciclos: number, fuente?: "gb" | "carpetas"}} Grafo
 */

/**
 * El grupo es el primer tramo del nombre de módulo (`galaxybrain.cli` -> `galaxybrain`),
 * que en gb coincide con el paquete o la carpeta de primer nivel.
 * @param {string} id
 */
export function grupoDe(id) {
  const punto = id.indexOf(".");
  return punto === -1 ? id : id.slice(0, punto);
}

/**
 * @param {any} json salida de `gb graph --json`
 * @returns {Grafo}
 */
export function desdeGbGraph(json) {
  const fanIn = json.fan_in ?? {};
  const fanOut = json.fan_out ?? {};
  const ids = [...new Set([...Object.keys(fanIn), ...Object.keys(fanOut)])].sort();

  /** @type {Set<string>} */
  const enCiclo = new Set();
  /** @type {Map<string, number>} módulo -> índice del ciclo al que pertenece */
  const cicloDe = new Map();
  (json.cycles ?? []).forEach((/** @type {string[]} */ ciclo, /** @type {number} */ i) => {
    for (const m of ciclo) {
      enCiclo.add(m);
      cicloDe.set(m, i);
    }
  });

  const indice = new Map(ids.map((id, i) => [id, i]));
  const nodos = ids.map((id) => ({
    id,
    grupo: grupoDe(id),
    fanIn: fanIn[id] ?? 0,
    fanOut: fanOut[id] ?? 0,
    enCiclo: enCiclo.has(id),
  }));

  /** @type {Arista[]} */
  const aristas = [];
  for (const [a, b] of json.edge_list ?? []) {
    const origen = indice.get(a);
    const destino = indice.get(b);
    // Una arista a un módulo que gb no lista como nodo no se inventa: se omite.
    if (origen === undefined || destino === undefined || origen === destino) continue;
    const mismoCiclo = cicloDe.has(a) && cicloDe.get(a) === cicloDe.get(b);
    aristas.push({ origen, destino, enCiclo: mismoCiclo });
  }

  return { raiz: json.root ?? "", nodos, aristas, ciclos: (json.cycles ?? []).length, fuente: "gb" };
}

/** Más nodos que esto no se leen en una isla: por encima, solo carpetas. */
export const TOPE_CARPETAS = 700;

/**
 * Sin galaxy-brain (ADR 0003): el árbol de carpetas del repo como grafo. Nodos: carpetas y
 * ficheros; aristas: de cada carpeta a lo que contiene. Es estructura, no dependencias, y la
 * isla lo dice (`fuente: "carpetas"`). Si hay demasiados ficheros, se queda en las carpetas.
 * @param {string} raiz
 * @param {string[]} ficheros rutas relativas con `/` (p. ej. la salida de `git ls-files`)
 * @returns {Grafo}
 */
export function desdeCarpetas(raiz, ficheros) {
  const limpios = [...new Set(ficheros.map((f) => f.replace(/\\/g, "/").replace(/^\.?\//, "")).filter(Boolean))];
  /** @type {Set<string>} */
  const carpetas = new Set();
  for (const f of limpios) {
    const tramos = f.split("/");
    for (let i = 1; i < tramos.length; i++) carpetas.add(tramos.slice(0, i).join("/"));
  }
  const conFicheros = carpetas.size + limpios.length <= TOPE_CARPETAS;
  const ids = [...carpetas, ...(conFicheros ? limpios : [])].sort();
  // La raíz del repo también es un nodo ("."): así lo de primer nivel no queda suelto.
  ids.unshift(".");
  const indice = new Map(ids.map((id, i) => [id, i]));
  /** @param {string} id */
  const padre = (id) => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : ".");

  /** @type {Arista[]} */
  const aristas = [];
  const hijos = new Map();
  for (const id of ids) {
    if (id === ".") continue;
    const p = padre(id);
    aristas.push({ origen: /** @type {number} */ (indice.get(p)), destino: /** @type {number} */ (indice.get(id)), enCiclo: false });
    hijos.set(p, (hijos.get(p) ?? 0) + 1);
  }
  const nodos = ids.map((id) => ({
    id,
    grupo: id === "." ? "." : id.split("/")[0],
    fanIn: id === "." ? 0 : 1,
    fanOut: hijos.get(id) ?? 0,
    enCiclo: false,
  }));
  return { raiz, nodos, aristas, ciclos: 0, fuente: "carpetas" };
}
