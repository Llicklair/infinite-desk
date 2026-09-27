// Las medidas de la zona zen (src/zen.js y sus piezas): dónde está, la poza, el chorro de la
// cascada y la altura del suelo.
import * as THREE from "three";
import { H_LABIO, Z_LABIO, ruido } from "./risco.js";

/** Lejos del anillo de islas: a más distancia que el plano lejano de la cámara, no se ven. */
export const CENTRO_ZEN = new THREE.Vector3(0, 0, -2600);
export const R_LAGO = 15;
export const OJOS = 1.7;
// El chorro: sale del labio del risco (src/risco.js) y, como agua lanzada en horizontal, cae en arco
// (avanza K_ARCO·√(lo que ha caído)). Donde toca la poza, la espuma y las salpicaduras.
export const K_ARCO = 0.55;
export const PIE_Z = Z_LABIO + K_ARCO * Math.sqrt(H_LABIO);
export const MAX_ONDAS = 16;

/** La altura del suelo en coordenadas de la zona (la poza, en el origen, a 0). @param {number} x @param {number} z */
export function alturaTerreno(x, z) {
  const r = Math.hypot(x, z);
  const orilla = THREE.MathUtils.smoothstep(r, R_LAGO - 0.5, R_LAGO + 2) * 0.35;
  const lecho = r < R_LAGO - 0.5 ? -1.6 : 0;
  const lomas = Math.max(0, r - 32) * 0.12 + (ruido(x * 0.05, z * 0.05) - 0.5) * 2.2 * THREE.MathUtils.smoothstep(r, 24, 44);
  return lecho + orilla + lomas + (ruido(x * 0.4, z * 0.4) - 0.5) * 0.15;
}
