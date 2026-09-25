// Disposición 3D por fuerzas, determinista (ARCHITECTURE 4). Puro: sin Three.js (ARCHITECTURE 1).

/**
 * Generador pseudoaleatorio con semilla (mulberry32): mismo grafo, mismas posiciones.
 * @param {number} semilla
 */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{nodos: {grupo: string}[], aristas: {origen: number, destino: number}[]}} grafo
 * @param {{iteraciones?: number, semilla?: number}} [opciones]
 * @returns {number[]} posiciones planas [x0, y0, z0, x1, ...]
 */
export function disponer(grafo, opciones = {}) {
  const n = grafo.nodos.length;
  const iteraciones = opciones.iteraciones ?? 300;
  const r = azar(opciones.semilla ?? 7);
  const pos = new Float64Array(n * 3);
  const vel = new Float64Array(n * 3);

  // Cada grupo nace en su propia dirección: los paquetes quedan como galaxias separadas.
  const grupos = [...new Set(grafo.nodos.map((d) => d.grupo))].sort();
  const centro = new Map(
    grupos.map((g, i) => {
      // Reparto de Fibonacci sobre la esfera: direcciones bien separadas para cualquier nº de grupos.
      const y = grupos.length === 1 ? 0 : 1 - (2 * i) / (grupos.length - 1);
      const radio = Math.sqrt(1 - y * y);
      const fi = i * Math.PI * (3 - Math.sqrt(5));
      const d = 25 * Math.cbrt(Math.max(n, 1)) / 3;
      return [g, [Math.cos(fi) * radio * d, y * d, Math.sin(fi) * radio * d]];
    }),
  );
  grafo.nodos.forEach((nodo, i) => {
    const c = /** @type {number[]} */ (centro.get(nodo.grupo));
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = c[k] + (r() - 0.5) * 10;
  });

  const repulsion = 60;
  const muelle = 0.02;
  const largo = 6;
  const atraccionGrupo = 0.004;
  const f = new Float64Array(n * 3);

  for (let it = 0; it < iteraciones; it++) {
    const temperatura = 1 - it / iteraciones;
    f.fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i * 3] - pos[j * 3];
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
        const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const s = repulsion / (d2 * Math.sqrt(d2));
        f[i * 3] += dx * s; f[i * 3 + 1] += dy * s; f[i * 3 + 2] += dz * s;
        f[j * 3] -= dx * s; f[j * 3 + 1] -= dy * s; f[j * 3 + 2] -= dz * s;
      }
    }

    for (const { origen: a, destino: b } of grafo.aristas) {
      const dx = pos[b * 3] - pos[a * 3];
      const dy = pos[b * 3 + 1] - pos[a * 3 + 1];
      const dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const s = (muelle * (d - largo)) / d;
      f[a * 3] += dx * s; f[a * 3 + 1] += dy * s; f[a * 3 + 2] += dz * s;
      f[b * 3] -= dx * s; f[b * 3 + 1] -= dy * s; f[b * 3 + 2] -= dz * s;
    }

    grafo.nodos.forEach((nodo, i) => {
      const c = /** @type {number[]} */ (centro.get(nodo.grupo));
      for (let k = 0; k < 3; k++) f[i * 3 + k] += (c[k] - pos[i * 3 + k]) * atraccionGrupo;
    });

    for (let k = 0; k < n * 3; k++) {
      vel[k] = (vel[k] + f[k]) * 0.6;
      const paso = Math.max(-2, Math.min(2, vel[k])) * temperatura;
      pos[k] += paso;
    }
  }

  // Centrado en el origen: la cámara orbita alrededor del centro de masas.
  for (let k = 0; k < 3; k++) {
    let suma = 0;
    for (let i = 0; i < n; i++) suma += pos[i * 3 + k];
    const media = n ? suma / n : 0;
    for (let i = 0; i < n; i++) pos[i * 3 + k] -= media;
  }
  return Array.from(pos, (v) => Math.round(v * 100) / 100);
}
