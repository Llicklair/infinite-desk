// El risco de la cascada, de una sola pieza: roca redondeada con dos lóbulos, entre ellos la
// hendidura por donde mana el agua (un labio que sale en voladizo), repisas a media altura y colas
// que bajan hasta hundirse en la hierba a los lados. Uso real: "no me gusta que la cascada tenga
// bloques apilados". Aquí solo la forma, en números (sin three, se prueba en Node): la malla, lo
// que choca y dónde van los árboles y las matas de encima. zen.js la viste (musgo, humedad).

export const RISCO_Z = -18; // la pared de detrás del agua; los lóbulos, algo por delante
export const ALTO_CASCADA = 11;
// El agua sale del labio a esta altura y a esta z (por delante de la pared: cae en arco).
export const H_LABIO = ALTO_CASCADA + 0.2;
export const Z_LABIO = RISCO_Z + 2.1;
const SUELO = -2; // el pie del risco, bajo la hierba y bajo la poza
const FONDO = RISCO_Z - 13; // donde acaba la cima por detrás
export const X_RISCO = 22; // de -X_RISCO a X_RISCO; en las puntas, bajo tierra
const PASO_X = 0.25;
const FILAS = 128;

/** Ruido de valor 2D determinista (el risco es siempre el mismo). @param {number} x @param {number} y */
export function ruido(x, y) {
  const h = (/** @type {number} */ a, /** @type {number} */ b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
/** @param {number} x @param {number} y */
const fbm = (x, y) => ruido(x, y) * 0.55 + ruido(x * 2.1 + 17, y * 2.1) * 0.3 + ruido(x * 4.3 + 5, y * 4.3 + 9) * 0.15;
/** 0 en `a`, 1 en `b` (también con a > b), suave. @param {number} a @param {number} b @param {number} v */
const suave = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Curva por puntos que no se pasa de ellos (Hermite monótona, Fritsch-Carlson): un lóbulo no hace
 * un pico raro por encima del punto más alto.
 * @param {number[]} xs @param {number[]} ys
 */
function monotona(xs, ys) {
  const n = xs.length;
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  /** @param {number} x */
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// La silueta, de izquierda a derecha: [x, alto, cuánto sale la cara por delante de RISCO_Z].
// Dos lóbulos altos encajonan la hendidura (el de la izquierda, algo más alto), y las colas bajan.
const SILUETA = [
  [-X_RISCO, -1.5, 6], [-19.5, 2.5, 4.5], [-17, 7.5, 3], [-14, 11, 2], [-10, 13.2, 1.2], [-6, 14.6, 0.5], [-3.5, 14, 0.9],
  [-2.55, 12.2, 0.4], [-2.1, H_LABIO - 0.05, 0], [2.1, H_LABIO - 0.05, 0], [2.55, 11.9, 0.4],
  [3.5, 13.1, 1], [6, 13.8, 0.6], [10, 12.6, 1.3], [14, 10.2, 2.2], [17, 6.5, 3.2], [19.5, 2.2, 4.6], [X_RISCO, -1.5, 6.2],
];
const altoEn = monotona(SILUETA.map((p) => p[0]), SILUETA.map((p) => p[1]));
const caraEn = monotona(SILUETA.map((p) => p[0]), SILUETA.map((p) => p[2]));

/** Lo alto del risco (sin el ruido) en `x`. @param {number} x */
export const alto = (x) => altoEn(x);
/** 1 en la hendidura por donde cae el agua, 0 fuera. @param {number} x */
export const hendidura = (x) => 1 - suave(2, 2.7, Math.abs(x));

/**
 * El perfil de la columna `x` (en y, z), de abajo a arriba por la cara, redondeando la arista, por
 * la cima hacia atrás y bajando por detrás; sin ruido y con puntos densos.
 * @param {number} x
 */
function perfilDenso(x) {
  const h = hendidura(x);
  const T = alto(x);
  const cara = RISCO_Z + caraEn(x);
  const r = Math.min(1.5 + (0.3 - 1.5) * h, Math.max(0.05, (T - SUELO) * 0.4));
  const inclina = 0.1 * (1 - h);
  // Dos repisas a media altura (donde crece el musgo), en lo que es alto y no es la hendidura.
  const repisas = (1 - h) * suave(3.5, 6, T);
  const y1 = T * 0.42 + (ruido(x * 0.2, 5) - 0.5) * 1.6, y2 = T * 0.72 + (ruido(x * 0.2, 9) - 0.5) * 1.2;
  /** @param {number} y */
  const zCara = (y) => cara - inclina * Math.max(y, 0)
    - repisas * (0.9 * suave(y1 - 0.35, y1 + 0.35, y) + 0.6 * suave(y2 - 0.3, y2 + 0.3, y))
    + h * (Z_LABIO - RISCO_Z) * suave(H_LABIO - 1.3, H_LABIO - 0.35, y); // el labio, en voladizo
  /** @type {[number, number][]} */
  const p = [];
  for (let y = SUELO; y < T - r; y += 0.1) p.push([y, zCara(y)]);
  const zf = zCara(T - r);
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * (Math.PI / 2);
    p.push([T - r + r * Math.sin(a), zf - r + r * Math.cos(a)]);
  }
  // La cima hacia atrás; en la hendidura, detrás del canal, sube la roca de la que mana el agua.
  const z0 = zf - r;
  /** @param {number} z */
  const cima = (z) => T + h * 3.8 * suave(z0 - 5, z0 - 7, z) + (1 - h) * 0.6 * suave(z0 - 1, z0 - 6, z);
  for (let z = z0 - 0.1; z > FONDO; z -= 0.12) p.push([cima(z), z]);
  const yf = cima(FONDO);
  for (let y = yf; y > SUELO; y -= 0.12) p.push([y, FONDO - (yf - y) * 0.45]);
  return p;
}

/**
 * La columna `x` como FILAS puntos repartidos por igual a lo largo del perfil, ya con el ruido (hacia
 * fuera de la roca: bultos redondeados, más suaves en la hendidura, que el agua no la atraviese).
 * @param {number} x @returns {[number, number][]}
 */
export function columna(x) {
  const p = perfilDenso(x);
  const largo = [0];
  for (let i = 1; i < p.length; i++) largo.push(largo[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const total = largo[largo.length - 1];
  /** @type {[number, number][]} */
  const liso = [];
  let j = 0;
  for (let f = 0; f < FILAS; f++) {
    const s = (f / (FILAS - 1)) * total;
    while (j < p.length - 2 && largo[j + 1] < s) j++;
    const t = (s - largo[j]) / Math.max(1e-6, largo[j + 1] - largo[j]);
    liso.push([p[j][0] + (p[j + 1][0] - p[j][0]) * t, p[j][1] + (p[j + 1][1] - p[j][1]) * t]);
  }
  const h = hendidura(x);
  return liso.map(([y, z], f) => {
    // Liso solo donde corre el agua (la pared, el labio y el canal); la roca de atrás, rugosa.
    const amp = 1 - 0.97 * h * suave(RISCO_Z - 5.5, RISCO_Z - 3.5, z);
    const a = liso[Math.max(0, f - 1)], b = liso[Math.min(FILAS - 1, f + 1)];
    const ty = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(ty, tz) || 1;
    const d = amp * ((ruido(x * 0.08 + 31, (y - z) * 0.08) - 0.5) * 2.4 // grandes bultos redondos
      + (fbm(x * 0.22, (y - z) * 0.22) - 0.5) * 2 + (ruido(x * 0.9 + 3, (y - z) * 0.9) - 0.5) * 0.35);
    return [y + (-tz / l) * d, z + (ty / l) * d];
  });
}

/** Los vértices del risco (x, y, z) por columnas, y sus triángulos, para una sola malla. */
export function mallaRisco() {
  const columnas = Math.round((2 * X_RISCO) / PASO_X) + 1;
  const posiciones = new Float32Array(columnas * FILAS * 3);
  for (let c = 0; c < columnas; c++) {
    const x = -X_RISCO + c * PASO_X;
    columna(x).forEach(([y, z], f) => posiciones.set([x, y, z], (c * FILAS + f) * 3));
  }
  /** @type {number[]} */
  const indices = [];
  for (let c = 0; c < columnas - 1; c++) {
    for (let f = 0; f < FILAS - 1; f++) {
      const a = c * FILAS + f, b = a + FILAS;
      indices.push(a, b, a + 1, b, b + 1, a + 1); // la cara que mira hacia fuera
    }
  }
  return { posiciones, indices, columnas, filas: FILAS };
}

/**
 * Lo más adelantado de la cara del risco en `x` entre las alturas `y0` e `y1`, con el ruido.
 * @param {number} x @param {number} y0 @param {number} y1
 */
export function frenteEntre(x, y0, y1) {
  let z = -Infinity;
  for (const [y, zz] of columna(x)) if (y > y0 && y < y1 && zz > z) z = zz;
  return z;
}
/** Lo más adelantado a la altura del cuerpo (lo que para al andar). @param {number} x */
export const frente = (x) => frenteEntre(x, -0.5, 2.2);

/** @type {number[]} el frente cada medio metro, calculado una vez (enRisco se pregunta miles de veces) */
let frentes = [];
/**
 * Si el punto del suelo (x, z) queda bajo el risco o pegado a su cara: ahí no van hierba ni árboles.
 * @param {number} x @param {number} z
 */
export function enRisco(x, z) {
  if (Math.abs(x) >= X_RISCO || z < FONDO - 4 || alto(x) < 0) return false;
  if (!frentes.length) for (let xx = -X_RISCO; xx <= X_RISCO + 0.5; xx += 0.5) frentes.push(frente(xx));
  const i = Math.round((x + X_RISCO) / 0.5);
  return z < Math.max(frentes[i], frentes[Math.max(0, i - 1)], frentes[Math.min(frentes.length - 1, i + 1)]) + 0.4;
}

/**
 * La arista de arriba del risco en `x`, con el ruido: donde van árboles, matas y la hiedra que cuelga.
 * @param {number} x @returns {{y: number, z: number}}
 */
export function cima(x) {
  const col = columna(x);
  // Lo delantero: la cara y los primeros metros de la cima. De ahí, el primer punto casi tan alto
  // como lo más alto (el borde, no algo más atrás).
  const delante = col.filter(([, z]) => z > RISCO_Z + caraEn(x) - 3);
  const tope = Math.max(...delante.map(([y]) => y));
  const [y, z] = /** @type {[number, number]} */ (delante.find(([yy]) => yy > tope - 0.25));
  return { y, z };
}

/**
 * Cajas para chocar con el risco (src/andar.js): una por metro, de la cara hacia atrás y hasta su
 * cima. En las colas bajas se puede subir de un salto.
 * @returns {import("./andar.js").Caja[]}
 */
export function cajasRisco() {
  /** @type {import("./andar.js").Caja[]} */
  const cajas = [];
  for (let x = -X_RISCO + 0.5; x < X_RISCO; x += 1) {
    let z1 = -Infinity, y1 = -Infinity;
    for (const xx of [x - 0.5, x, x + 0.5]) {
      z1 = Math.max(z1, frente(xx));
      for (const [y, z] of columna(xx)) if (z > FONDO + 1 && y > y1) y1 = y;
    }
    if (y1 < 0.3) continue; // bajo la hierba
    cajas.push({ x0: x - 0.5, x1: x + 0.5, z0: FONDO - 4, z1, y0: SUELO, y1: Math.min(y1, alto(x) + 0.8) });
  }
  return cajas;
}
