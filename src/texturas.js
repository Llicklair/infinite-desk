// Texturas de la zona zen, hechas aquí (lienzo 2D, sin descargar nada) y repetibles sin costuras:
// piedra (vetas, motas y grietas), madera en tablas (veta y nudos), tejas, césped y tela. Y cómo se
// ponen: en "triplanar", según dónde está cada punto en el mundo, así la escala es la misma en una
// pieza grande que en una pequeña o girada, y las tablas de la cabaña van siempre en horizontal. Uso
// real: "mejorar un poco las texturas, las estructuras y los materiales" (todo eran colores lisos).
import * as THREE from "three";

const LADO = 512;

/** Ruido de valor periódico (se repite cada `periodo` celdas: la textura casa por los bordes). */
function ruidoPeriodico(semilla = 1) {
  /** @param {number} x @param {number} y @param {number} p */
  const h = (x, y, p) => {
    const xi = ((x % p) + p) % p, yi = ((y % p) + p) % p;
    const s = Math.sin(xi * 127.1 + yi * 311.7 + semilla * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  /** @param {number} x @param {number} y @param {number} p el periodo, en celdas */
  const valor = (x, y, p) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy, p), b = h(ix + 1, iy, p), c = h(ix, iy + 1, p), d = h(ix + 1, iy + 1, p);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  /** fbm periódico: `u, v` en 0..1. @param {number} u @param {number} v @param {number} base celdas de la primera octava @param {number} [octavas] */
  return (u, v, base, octavas = 4) => {
    let s = 0, a = 0.5, p = base;
    for (let o = 0; o < octavas; o++) { s += a * valor(u * p, v * p, p); a *= 0.5; p *= 2; }
    return s;
  };
}

/** Un lienzo LADO×LADO pintado píxel a píxel con `color(u, v) -> [r, g, b]` (0-255). @param {(u: number, v: number) => number[]} color */
function lienzo(color) {
  const c = document.createElement("canvas");
  c.width = c.height = LADO;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const img = ctx.createImageData(LADO, LADO);
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const [r, g, b] = color(x / LADO, y / LADO);
      const i = (y * LADO + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}

/** @param {HTMLCanvasElement} c */
function textura(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Una línea que cruza el borde se pinta también al otro lado (para que la textura case). @param {CanvasRenderingContext2D} ctx @param {() => void} pintar */
function envuelto(ctx, pintar) {
  for (const dx of [-LADO, 0, LADO]) for (const dy of [-LADO, 0, LADO]) {
    ctx.save();
    ctx.translate(dx, dy);
    pintar();
    ctx.restore();
  }
}

/** @type {Map<string, THREE.Texture>} */
const hechas = new Map();
/** @param {string} nombre @param {() => THREE.Texture} hacer */
const una = (nombre, hacer) => { if (!hechas.has(nombre)) hechas.set(nombre, hacer()); return /** @type {THREE.Texture} */ (hechas.get(nombre)); };

/** Piedra clara: moteada, con vetas suaves y alguna grieta. Neutra (el color lo pone el material). */
export const piedra = () => una("piedra", () => {
  const r = ruidoPeriodico(3), r2 = ruidoPeriodico(7);
  const { c, ctx } = lienzo((u, v) => {
    const n = r(u, v, 4, 5), m = r2(u, v, 16, 3);
    const vetas = Math.abs(Math.sin((v * 6 + r(u, v, 3, 2) * 2.5) * Math.PI)) ** 8 * 0.08;
    let k = 0.82 + (n - 0.5) * 0.28 + (m - 0.5) * 0.12 - vetas;
    if (m > 0.78) k -= 0.1; // motas oscuras
    const cal = (r2(u, v, 32, 2) - 0.5) * 0.04; // un punto cálido o frío
    return [255 * (k + cal), 255 * k, 255 * (k - cal)];
  });
  ctx.strokeStyle = "rgba(70, 60, 50, 0.35)";
  ctx.lineWidth = 1.4;
  envuelto(ctx, () => {
    for (let g = 0; g < 5; g++) { // grietas: líneas quebradas
      let x = ((g * 97) % LADO), y = ((g * 211) % LADO);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) { x += 14 + ((g * s * 37) % 20); y += ((g + s) % 2 ? 1 : -1) * (6 + ((s * 13) % 14)); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
  return textura(c);
});

/** Madera en tablas horizontales (8 por textura): cada una de su tono, con veta, juntas y algún nudo. */
export const madera = () => una("madera", () => {
  const r = ruidoPeriodico(11), r2 = ruidoPeriodico(13);
  const TABLAS = 8, alto = 1 / TABLAS;
  const { c, ctx } = lienzo((u, v) => {
    const fila = Math.floor(v / alto);
    const enTabla = (v % alto) / alto;
    const tono = 0.84 + ((fila * 0.37) % 1) * 0.16;
    // La veta: líneas largas en horizontal que ondulan.
    const veta = Math.sin((v * 90 + r(u, v, 2, 3) * 6) * Math.PI) * 0.5 + 0.5;
    let k = tono - veta * 0.08 - (r2(u * 0.25, v, 8, 3) - 0.5) * 0.1;
    if (enTabla < 0.04 || enTabla > 0.97) k *= 0.55; // la junta entre tablas
    return [255 * k, 238 * k, 220 * k];
  });
  ctx.fillStyle = "rgba(60, 35, 20, 0.45)";
  envuelto(ctx, () => {
    for (let n = 0; n < 6; n++) { // nudos
      ctx.beginPath();
      ctx.ellipse((n * 173) % LADO, (n * 2 + 1) * (LADO / 16) + ((n * 7) % 10), 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return textura(c);
});

/** Tejas escalonadas: filas desplazadas media teja, con el canto de abajo redondeado y su sombra. */
export const tejas = () => una("tejas", () => {
  const r = ruidoPeriodico(17);
  const FILAS = 8, COLS = 8;
  return textura(lienzo((u, v) => {
    const fila = Math.floor(v * FILAS);
    const du = (u * COLS + (fila % 2) * 0.5) % 1;
    const dv = (v * FILAS) % 1;
    // El borde inferior de cada teja es un arco: por debajo, sombra de la de encima.
    const arco = 0.82 + 0.18 * Math.sqrt(Math.max(0, 1 - (2 * du - 1) ** 2));
    const tono = 0.8 + ((fila * 0.53 + Math.floor(u * COLS + (fila % 2) * 0.5) * 0.31) % 1) * 0.2;
    let k = tono + (r(u, v, 8, 3) - 0.5) * 0.12;
    if (dv > arco) k *= 0.55;
    if (du < 0.03 || du > 0.97) k *= 0.7;
    return [255 * k, 245 * k, 238 * k];
  }).c);
});

/** Césped visto de cerca: motas claras y oscuras que rompen el verde liso. */
export const cesped = () => una("cesped", () => {
  const r = ruidoPeriodico(19), r2 = ruidoPeriodico(23);
  return textura(lienzo((u, v) => {
    const n = r(u, v, 8, 4), m = r2(u, v, 64, 2);
    const k = 0.88 + (n - 0.5) * 0.22 + (m > 0.7 ? 0.08 : m < 0.25 ? -0.08 : 0);
    return [255 * k, 255 * Math.min(1, k + 0.03), 255 * k];
  }).c);
});

/** Tela: trama fina, para el sillón, los cojines y las mantas. */
export const tela = () => una("tela", () => {
  const r = ruidoPeriodico(29);
  return textura(lienzo((u, v) => {
    const trama = (Math.sin(u * LADO * 0.9) * Math.sin(v * LADO * 0.9)) * 0.05;
    const k = 0.9 + trama + (r(u, v, 16, 2) - 0.5) * 0.08;
    return [255 * k, 255 * k, 255 * k];
  }).c);
});

/**
 * Pone `tex` en el material en triplanar: se muestrea con la posición en el mundo (a `escala`
 * repeticiones por metro) desde los tres ejes y se mezcla según hacia dónde mira cada cara. Además,
 * la luz se tiñe un poco con la textura para dar relieve sin mapa de normales (barato).
 * @param {THREE.MeshStandardMaterial} material @param {THREE.Texture} tex @param {number} escala
 */
export function triplanar(material, tex, escala) {
  const previo = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    previo?.call(material, sh, r);
    sh.uniforms.uTri = { value: tex };
    sh.uniforms.uEscalaTri = { value: escala };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNor;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 triMundo = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vTriNor = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vec4 triMundo = modelMatrix * vec4(transformed, 1.0);
          vTriNor = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vTriPos = triMundo.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uTri;\nuniform float uEscalaTri;\nvarying vec3 vTriPos;\nvarying vec3 vTriNor;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 triPeso = pow(abs(vTriNor), vec3(4.0));
        triPeso /= triPeso.x + triPeso.y + triPeso.z;
        vec3 triP = vTriPos * uEscalaTri;
        vec4 triC = texture2D(uTri, triP.zy) * triPeso.x + texture2D(uTri, triP.xz) * triPeso.y + texture2D(uTri, triP.xy) * triPeso.z;
        diffuseColor.rgb *= triC.rgb;`);
  };
  material.customProgramCacheKey = () => `tri-${tex.uuid}-${escala}`;
  material.needsUpdate = true;
  return material;
}
