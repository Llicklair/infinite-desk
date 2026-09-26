// El ambiente del mundo, sin 3D (núcleo puro, probado en Node): los colores del cielo según la hora
// de verdad y cuánta vida tiene una isla según su último commit. La decoración que cuenta cosas:
// una isla viva brilla y tiene cristales; una olvidada se apaga, sin desaparecer.

/** @typedef {[number, number, number]} RGB componentes 0..1 */
/**
 * @typedef {{cenit: RGB, horizonte: RGB, nebulosa: RGB, estrellas: number}} Paleta
 *   `horizonte` es también el color de la niebla: el suelo se funde con el cielo;
 *   `estrellas`, 0..1, cuánto se ven (de día menos, pero se ven: "no se ven las estrellas", uso real)
 */

/** @param {string} hex @returns {RGB} */
const rgb = (hex) => {
  const c = (/** @type {number} */ i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return [c(1), c(3), c(5)];
};

// Siempre oscuro: las pantallas son lo importante y un cielo claro se come su contraste. El día es
// un azul profundo, no un cielo de mediodía.
/** @type {[number, Paleta][]} hora del día (0..24) y su paleta; entre dos se mezcla */
export const PALETAS = [
  [0, { cenit: rgb("#03040b"), horizonte: rgb("#0b0d1f"), nebulosa: rgb("#5b2a86"), estrellas: 1 }],
  [5.5, { cenit: rgb("#05061a"), horizonte: rgb("#1a1230"), nebulosa: rgb("#7a3a8c"), estrellas: 0.9 }],
  [7.5, { cenit: rgb("#0d1438"), horizonte: rgb("#5a2f45"), nebulosa: rgb("#d06a5a"), estrellas: 0.7 }],
  [11, { cenit: rgb("#0b1d45"), horizonte: rgb("#1d3560"), nebulosa: rgb("#3a8fb0"), estrellas: 0.55 }],
  [16, { cenit: rgb("#0a1a40"), horizonte: rgb("#223a66"), nebulosa: rgb("#4a7fc0"), estrellas: 0.55 }],
  [19.5, { cenit: rgb("#120f35"), horizonte: rgb("#4a2140"), nebulosa: rgb("#e0645a"), estrellas: 0.75 }],
  [21.5, { cenit: rgb("#050616"), horizonte: rgb("#120f28"), nebulosa: rgb("#6a2f90"), estrellas: 0.9 }],
];

/** @param {RGB} a @param {RGB} b @param {number} k @returns {RGB} */
const mezclar = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/**
 * La paleta de una hora del día, mezclando las dos más cercanas (de la última de la noche se
 * vuelve a la primera: el día da la vuelta).
 * @param {number} horas 0..24, con decimales (14.5 = 14:30)
 * @returns {Paleta}
 */
export function paletaDeHora(horas) {
  const h = ((horas % 24) + 24) % 24;
  let i = PALETAS.length - 1;
  while (i > 0 && PALETAS[i][0] > h) i--;
  const [h0, p0] = PALETAS[i];
  const [h1, p1] = PALETAS[(i + 1) % PALETAS.length];
  const tramo = ((h1 - h0) + 24) % 24 || 24;
  const k = (((h - h0) + 24) % 24) / tramo;
  return {
    cenit: mezclar(p0.cenit, p1.cenit, k),
    horizonte: mezclar(p0.horizonte, p1.horizonte, k),
    nebulosa: mezclar(p0.nebulosa, p1.nebulosa, k),
    estrellas: p0.estrellas + (p1.estrellas - p0.estrellas) * k,
  };
}

export const DIA = 86400;
export const VIDA_MINIMA = 0.12;

/**
 * Cuánta vida tiene un repo, 0..1, por la edad de su último commit: entera el primer día, y se va
 * apagando despacio (a escala logarítmica: la diferencia entre ayer y hace una semana se nota
 * más que entre hace dos y tres meses). Nunca del todo: una isla olvidada sigue ahí.
 * Sin fecha (no es un repo git o no tiene commits), a medias.
 * @param {number | undefined} ultimoCommit segundos desde 1970
 * @param {number} ahora segundos desde 1970
 */
export function vidaDeRepo(ultimoCommit, ahora) {
  if (ultimoCommit === undefined || !Number.isFinite(ultimoCommit)) return 0.5;
  const dias = Math.max(0, ahora - ultimoCommit) / DIA;
  if (dias <= 1) return 1;
  // 1 día -> 1; 180 días -> VIDA_MINIMA.
  const k = Math.log(dias) / Math.log(180);
  return Math.max(VIDA_MINIMA, 1 - k * (1 - VIDA_MINIMA));
}

/**
 * La paleta con los colores de una marca (la capa de marca, tecla B): la nebulosa, del color
 * principal, y el cénit, un poco hacia el secundario. El horizonte (y la niebla) no se toca: el
 * suelo se sigue fundiendo con el cielo, y el cielo sigue siendo oscuro.
 * @param {Paleta} p @param {string[]} colores hex, "#rrggbb": el principal y, si hay, el secundario
 * @returns {Paleta}
 */
export function paletaConMarca(p, colores) {
  const [uno, dos] = colores.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map(rgb);
  if (!uno) return p;
  return { ...p, nebulosa: uno, cenit: dos ? mezclar(p.cenit, dos, 0.18) : p.cenit };
}
