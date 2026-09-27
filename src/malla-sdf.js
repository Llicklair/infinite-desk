// Una malla de una sola pieza a partir de una forma definida por distancias (SDF): la forma es una
// función que dice, para cada punto, a qué distancia está de la superficie (negativo dentro), y
// aquí se saca su piel con "surface nets" (sin tablas: un vértice por celda que cruza la superficie,
// en la media de los cruces, y un quad por cada arista cruzada). Uso real: "mejora el modelado de
// Kiri, que está construido con figuras esféricas; que sea una única pieza". Sin three ni DOM: se
// prueba en Node.

/** @typedef {(x: number, y: number, z: number) => number} Distancia */

/** Unión suave (se funden con un cuello redondeado de tamaño `k`). @param {number} a @param {number} b @param {number} k */
export function unionSuave(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Elipsoide (aproximación de Íñigo Quílez). @param {number[]} c centro @param {number[]} r radios @returns {Distancia} */
export function elipsoide(c, r) {
  return (x, y, z) => {
    const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
    const k0 = Math.hypot(px, py, pz);
    const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
  };
}

/** Un cono de puntas redondeadas de `a` (radio ra) a `b` (radio rb). @param {number[]} a @param {number[]} b @param {number} ra @param {number} rb @returns {Distancia} */
export function conoRedondo(a, b, ra, rb) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2;
  return (x, y, z) => {
    const pa = [x - a[0], y - a[1], z - a[2]];
    // El punto del eje más cercano (t en 0..1) y el radio interpolado ahí: suficiente para formas
    // suaves (no es la distancia exacta, pero la piel sale bien con la unión suave).
    const t = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / l2));
    const d = Math.hypot(pa[0] - ba[0] * t, pa[1] - ba[1] * t, pa[2] - ba[2] * t);
    return d - (ra + (rb - ra) * t);
  };
}

/**
 * La piel de `f` entre `min` y `max`, con celdas de lado `paso`: posiciones, normales (del
 * gradiente de la distancia: lisas) y triángulos, todo de una pieza.
 * @param {Distancia} f @param {number[]} min @param {number[]} max @param {number} paso
 */
export function piel(f, min, max, paso) {
  const n = [0, 1, 2].map((i) => Math.ceil((max[i] - min[i]) / paso) + 1);
  const valores = new Float32Array(n[0] * n[1] * n[2]);
  const idx = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => x + n[0] * (y + n[1] * z);
  for (let z = 0; z < n[2]; z++) for (let y = 0; y < n[1]; y++) for (let x = 0; x < n[0]; x++) {
    valores[idx(x, y, z)] = f(min[0] + x * paso, min[1] + y * paso, min[2] + z * paso);
  }
  /** @type {number[]} */
  const pos = [];
  const celda = new Int32Array((n[0] - 1) * (n[1] - 1) * (n[2] - 1)).fill(-1);
  const cid = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => x + (n[0] - 1) * (y + (n[1] - 1) * z);
  const esquinas = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const aristas = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < n[2] - 1; z++) for (let y = 0; y < n[1] - 1; y++) for (let x = 0; x < n[0] - 1; x++) {
    const v = esquinas.map(([a, b, c]) => valores[idx(x + a, y + b, z + c)]);
    const dentro = v.filter((d) => d < 0).length;
    if (dentro === 0 || dentro === 8) continue;
    // El vértice: la media de dónde cruza la superficie cada arista de la celda.
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [i, j] of aristas) {
      if ((v[i] < 0) === (v[j] < 0)) continue;
      const t = v[i] / (v[i] - v[j]);
      const a = esquinas[i], b = esquinas[j];
      sx += a[0] + (b[0] - a[0]) * t; sy += a[1] + (b[1] - a[1]) * t; sz += a[2] + (b[2] - a[2]) * t;
      m++;
    }
    celda[cid(x, y, z)] = pos.length / 3;
    pos.push(min[0] + (x + sx / m) * paso, min[1] + (y + sy / m) * paso, min[2] + (z + sz / m) * paso);
  }
  // Un quad por cada arista de la rejilla que cruza la superficie, con las 4 celdas que la rodean.
  /** @type {number[]} */
  const tris = [];
  for (let z = 1; z < n[2] - 1; z++) for (let y = 1; y < n[1] - 1; y++) for (let x = 1; x < n[0] - 1; x++) {
    const d0 = valores[idx(x, y, z)];
    for (let eje = 0; eje < 3; eje++) {
      const o = [x, y, z];
      o[eje]++;
      if (o[eje] >= n[eje]) continue;
      const d1 = valores[idx(o[0], o[1], o[2])];
      if ((d0 < 0) === (d1 < 0)) continue;
      const j = (eje + 1) % 3, k = (eje + 2) % 3;
      const c = (/** @type {number} */ dj, /** @type {number} */ dk) => {
        const p = [x, y, z];
        p[j] -= dj; p[k] -= dk;
        return celda[cid(p[0], p[1], p[2])];
      };
      const q = [c(0, 0), c(1, 0), c(1, 1), c(0, 1)];
      if (q.some((i) => i < 0)) continue;
      if (d0 < 0) tris.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else tris.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }
  // Normales del gradiente (diferencias centrales): lisas, sin facetas.
  const posiciones = new Float32Array(pos);
  const normales = new Float32Array(pos.length);
  const e = paso * 0.5;
  for (let i = 0; i < pos.length; i += 3) {
    const [px, py, pz] = [pos[i], pos[i + 1], pos[i + 2]];
    const gx = f(px + e, py, pz) - f(px - e, py, pz), gy = f(px, py + e, pz) - f(px, py - e, pz), gz = f(px, py, pz + e) - f(px, py, pz - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    normales.set([gx / l, gy / l, gz / l], i);
  }
  return { posiciones, normales, indices: tris };
}
