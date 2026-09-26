// La física de tirar piedras al lago de la zona zen (núcleo puro, probado en Node; lo usa src/zen.js).
// Una piedra lanzada plana y rápida rebota en el agua ("hacer la rana") mientras entre con poco
// ángulo y le quede velocidad; si entra empinada o lenta, se hunde. Cada bote pierde velocidad.

export const GRAVEDAD = 9.8;
/** Por encima de este ángulo de entrada (grados) ya no rebota: se hunde. */
export const ANGULO_MAXIMO = 22;
/** Por debajo de esta velocidad horizontal (m/s) tampoco. */
export const VELOCIDAD_MINIMA = 3.5;
const MAX_BOTES = 15;

/**
 * @typedef {{t: number, d: number, tipo: "bote" | "hundir"}} Contacto
 *   cuándo (s desde el lanzamiento) y a qué distancia horizontal (m) toca el agua, y qué pasa
 * @typedef {{h: number, vh: number, vy: number, t: number, d: number}} Tramo
 *   un vuelo: desde la altura `h` con velocidad horizontal `vh` y vertical `vy`, empezando en `t` y `d`
 */

/**
 * El recorrido entero de una piedra: sus vuelos y dónde toca el agua cada vez.
 * @param {{altura: number, velocidad: number, angulo: number}} lanzamiento
 *   `altura` sobre el agua (m), `velocidad` (m/s) y `angulo` sobre la horizontal (grados; negativo, hacia abajo)
 * @returns {{tramos: Tramo[], contactos: Contacto[]}}
 */
export function recorrido({ altura, velocidad, angulo }) {
  const a = (angulo * Math.PI) / 180;
  let vh = Math.max(0, velocidad * Math.cos(a));
  let vy = velocidad * Math.sin(a);
  let h = Math.max(0, altura);
  let t = 0;
  let d = 0;
  /** @type {Tramo[]} */
  const tramos = [];
  /** @type {Contacto[]} */
  const contactos = [];
  for (let n = 0; n <= MAX_BOTES; n++) {
    // Cuándo llega al agua (y = 0): h + vy·τ - g·τ²/2 = 0.
    const tau = (vy + Math.sqrt(vy * vy + 2 * GRAVEDAD * h)) / GRAVEDAD;
    tramos.push({ h, vh, vy, t, d });
    t += tau;
    d += vh * tau;
    const vyEntrada = vy - GRAVEDAD * tau; // negativa: bajando
    const entrada = (Math.atan2(-vyEntrada, vh) * 180) / Math.PI;
    // Y solo si el salto siguiente es de verdad (medio metro o más): si no, eran saltitos de
    // centímetros al final, que no se ven como una rana sino como un temblor.
    const siguiente = vh * 0.8 * ((2 * -vyEntrada * 0.45) / GRAVEDAD);
    const rebota = n < MAX_BOTES && vh > VELOCIDAD_MINIMA && entrada < ANGULO_MAXIMO && siguiente >= 0.5;
    contactos.push({ t, d, tipo: rebota ? "bote" : "hundir" });
    if (!rebota) break;
    // Rebota: pierde algo de velocidad horizontal y sale con menos de la vertical con que entró.
    vh *= 0.8;
    vy = -vyEntrada * 0.45;
    h = 0;
  }
  return { tramos, contactos };
}

/**
 * Dónde está la piedra `t` segundos después de lanzarla: distancia horizontal recorrida y altura
 * sobre el agua; `fin` cuando ya se ha hundido.
 * @param {{tramos: Tramo[], contactos: Contacto[]}} r @param {number} t
 * @returns {{d: number, y: number, fin: boolean}}
 */
export function posicionEn(r, t) {
  const ultimo = r.contactos[r.contactos.length - 1];
  if (t >= ultimo.t) return { d: ultimo.d, y: 0, fin: true };
  let i = r.tramos.length - 1;
  while (i > 0 && r.tramos[i].t > t) i--;
  const tr = r.tramos[i];
  const s = t - tr.t;
  return { d: tr.d + tr.vh * s, y: Math.max(0, tr.h + tr.vy * s - (GRAVEDAD * s * s) / 2), fin: false };
}

/**
 * La fuerza de un lanzamiento según cuánto se mantuvo pulsado: de un toque flojo a uno fuerte en
 * poco más de un segundo, y no más.
 * @param {number} ms
 */
export function fuerzaDeCarga(ms) {
  const k = Math.min(1, Math.max(0, ms / 1100));
  return 7 + k * 15; // de 7 a 22 m/s
}
