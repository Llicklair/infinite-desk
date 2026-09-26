// Andar y saltar por la zona zen (núcleo puro, probado en Node; lo usa src/zen.js): el suelo bajo los
// pies (el terreno o lo que haya encima, un escalón, una piedra, el suelo de la cabaña), qué te para
// (paredes, troncos, muebles) y la caída al saltar. Uso real: "que tengas mecánicas de salto en la
// zona zen". Todo en coordenadas de la zona, con cajas alineadas a los ejes.

/** @typedef {{x0: number, x1: number, z0: number, z1: number, y0: number, y1: number}} Caja */

export const GRAVEDAD = 22;
export const IMPULSO = 7.2; // m/s hacia arriba al saltar: algo más de un metro
/** Lo que se sube andando sin saltar (un escalón, una losa). */
export const ESCALON = 0.45;
export const ALTO_CUERPO = 1.7;
export const RADIO = 0.3;

/**
 * La altura de lo que hay bajo los pies: el terreno, o la parte de arriba de una caja si se está
 * encima (o se llega a ella subiendo un escalón).
 * @param {number} x @param {number} z @param {number} pies la altura de los pies ahora
 * @param {number} terreno la altura del terreno ahí @param {Caja[]} cajas
 */
export function sueloBajo(x, z, pies, terreno, cajas) {
  let suelo = terreno;
  for (const c of cajas) {
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
    if (c.y1 <= pies + ESCALON && c.y1 > suelo) suelo = c.y1;
  }
  return suelo;
}

/**
 * ¿Choca el cuerpo (un cilindro de radio RADIO y alto ALTO_CUERPO desde los pies) con alguna caja?
 * No cuenta la que se puede subir de un paso ni la que queda por encima de la cabeza.
 * @param {number} x @param {number} z @param {number} pies @param {Caja[]} cajas
 */
export function choca(x, z, pies, cajas) {
  for (const c of cajas) {
    if (x < c.x0 - RADIO || x > c.x1 + RADIO || z < c.z0 - RADIO || z > c.z1 + RADIO) continue;
    if (c.y1 <= pies + ESCALON) continue; // se sube (o ya se está encima)
    if (c.y0 >= pies + ALTO_CUERPO) continue; // pasa por debajo
    return true;
  }
  return false;
}

/**
 * Moverse de (ax, az) a (x, z): si choca, se desliza por la pared (solo x, o solo z) o se queda.
 * @param {{x: number, z: number}} desde @param {{x: number, z: number}} hacia @param {number} pies @param {Caja[]} cajas
 * @returns {{x: number, z: number}}
 */
export function deslizar(desde, hacia, pies, cajas) {
  if (!choca(hacia.x, hacia.z, pies, cajas)) return { x: hacia.x, z: hacia.z };
  if (!choca(hacia.x, desde.z, pies, cajas)) return { x: hacia.x, z: desde.z };
  if (!choca(desde.x, hacia.z, pies, cajas)) return { x: desde.x, z: hacia.z };
  return { x: desde.x, z: desde.z };
}

/**
 * Un paso de la caída (o del salto): la gravedad tira, y al llegar al suelo se para. Si el suelo está
 * un poco más alto (un escalón), se sube sin más.
 * @param {{pies: number, vy: number}} e @param {number} dt @param {number} suelo
 * @returns {{pies: number, vy: number, enSuelo: boolean}}
 */
export function caer(e, dt, suelo) {
  let vy = e.vy - GRAVEDAD * dt;
  let pies = e.pies + vy * dt;
  if (pies <= suelo) return { pies: suelo, vy: 0, enSuelo: true };
  // Pegado al suelo al bajar una cuesta o un escalón pequeño, en vez de ir a saltitos.
  if (e.vy <= 0 && pies - suelo < 0.08) return { pies: suelo, vy: 0, enSuelo: true };
  return { pies, vy, enSuelo: false };
}

/**
 * Una caja en el sitio de la zona: `local` en el marco de un objeto girado 0, 90, 180 o 270 grados
 * (`cuartos` de vuelta, como Object3D.rotation.y) y colocado en (ox, oy, oz).
 * @param {Caja} local @param {number} ox @param {number} oy @param {number} oz @param {number} cuartos
 * @returns {Caja}
 */
export function colocarCaja(local, ox, oy, oz, cuartos) {
  const q = ((cuartos % 4) + 4) % 4;
  // rotation.y de θ: (x, z) -> (x·cosθ + z·sinθ, -x·sinθ + z·cosθ)
  const esquinas = [[local.x0, local.z0], [local.x1, local.z1]].map(([x, z]) =>
    q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x]);
  const xs = esquinas.map((e) => e[0]), zs = esquinas.map((e) => e[1]);
  return {
    x0: ox + Math.min(...xs), x1: ox + Math.max(...xs),
    z0: oz + Math.min(...zs), z1: oz + Math.max(...zs),
    y0: oy + local.y0, y1: oy + local.y1,
  };
}
