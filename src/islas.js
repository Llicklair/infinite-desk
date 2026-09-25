// Dónde va cada repo en el mundo y a qué escala. Puro: sin Three.js (ARCHITECTURE 1).

/**
 * Islas en círculo alrededor del punto de aparición, todas mirando al centro.
 * El radio crece con el número de repos para que no se pisen.
 * @param {number} n
 * @param {{radioMin?: number, separacion?: number}} [opciones]
 * @returns {{x: number, z: number, angulo: number}[]} `angulo`: giro en Y para mirar al centro
 */
export function colocarIslas(n, opciones = {}) {
  const radioMin = opciones.radioMin ?? 22;
  const separacion = opciones.separacion ?? 20;
  if (n === 0) return [];
  const radio = Math.max(radioMin, (n * separacion) / (2 * Math.PI));
  return Array.from({ length: n }, (_, i) => {
    // Empieza enfrente de la cámara (-Z) y sigue en sentido horario visto desde arriba.
    const a = (i / n) * 2 * Math.PI;
    const x = Math.sin(a) * radio;
    const z = -Math.cos(a) * radio;
    return { x: redondear(x), z: redondear(z), angulo: redondear(Math.atan2(x, z)) };
  });
}

/**
 * Factor que deja el 90 % de los nodos dentro de `radioObjetivo`: un satélite suelto no
 * debe encoger todo el grafo a un punto.
 * @param {number[]} posiciones planas [x0, y0, z0, ...]
 * @param {number} radioObjetivo
 */
export function escalaAjuste(posiciones, radioObjetivo) {
  const d = [];
  for (let i = 0; i < posiciones.length; i += 3) {
    d.push(Math.hypot(posiciones[i], posiciones[i + 1], posiciones[i + 2]));
  }
  if (d.length === 0) return 1;
  d.sort((a, b) => a - b);
  const p90 = d[Math.floor((d.length - 1) * 0.9)];
  return p90 > 0 ? radioObjetivo / p90 : 1;
}

/**
 * Lo que distingue un juego de grafos de otro al regenerar: repos, módulos y aristas. Si no
 * cambia, no se rehacen las islas (el fondo relee cada poco y casi nunca hay nada nuevo).
 * @param {{nombre: string, nodos: unknown[], aristas: unknown[]}[]} grafos
 */
export function firmaGrafos(grafos) {
  return grafos.map((g) => `${g.nombre}:${g.nodos.length}:${g.aristas.length}`).join("|");
}

/**
 * Repos que tienen isla ahora y antes no: lo que se anuncia al regenerar.
 * @param {string[]} antes
 * @param {string[]} ahora
 */
export function islasNuevas(antes, ahora) {
  const habia = new Set(antes);
  return ahora.filter((n) => !habia.has(n));
}

/** @param {number} v */
const redondear = (v) => Math.round(v * 1000) / 1000;
