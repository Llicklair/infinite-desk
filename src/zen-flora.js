// La vegetación de la zona zen: árboles de copa redonda, matas, lavanda, césped, flores y nenúfares,
// todo mecido por el mismo viento. La coloca src/zen.js.
import * as THREE from "three";
import { cesped as texCesped, triplanar } from "./texturas.js";
import { RISCO_Z, cima, enRisco, ruido } from "./risco.js";
import { R_LAGO, alturaTerreno } from "./zen-medidas.js";

/** @typedef {(material: THREE.Material, fuerza: number, desde: number) => THREE.Material} Mecer */

/**
 * El viento: hojas y hierba se mecen (en el vértice, más cuanto más arriba), todas al mismo compás.
 * `viento.value` es el tiempo; `mecer` prepara un material para moverse con él.
 */
export function crearViento() {
  const viento = { value: 0 };
  /**
   * @param {THREE.Material} material @param {number} fuerza cuánto se mueve la punta
   * @param {number} desde la altura (en la geometría) desde la que empieza a moverse
   */
  function mecer(material, fuerza, desde) {
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uViento = viento;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uViento;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 base = vec3(0.0);
          #endif
          float alto = max(transformed.y - (${desde.toFixed(2)}), 0.0);
          float fase = uViento * 1.3 + base.x * 0.35 + base.z * 0.27;
          transformed.x += sin(fase) * ${fuerza.toFixed(3)} * alto;
          transformed.z += cos(fase * 0.8) * ${(fuerza * 0.6).toFixed(3)} * alto;`);
    };
    return material;
  }
  return { viento, mecer };
}

/**
 * Planta la vegetación en la zona.
 * @param {THREE.Group} grupo
 * @param {{mecer: Mecer, sombra: (o: THREE.Object3D) => THREE.Object3D, ocupado: (x: number, z: number) => boolean}} h
 *   `ocupado`: ¿junto a la cabaña o en su camino? (ahí no se planta)
 * @returns {{x: number, z: number, y: number, s: number}[]} los árboles (sus troncos paran al andar)
 */
export function plantar(grupo, { mecer, sombra, ocupado }) {
  const c = new THREE.Color();
  // Árboles de copa redonda (instanciados): tronco y tres bolas de hojas cada uno.
  const arboles = [];
  for (let i = 0; arboles.length < 34 && i < 400; i++) {
    const a = ruido(i, 41) * Math.PI * 2;
    const d = 20 + ruido(i, 43) * 48;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ((z > 12 && Math.abs(x) < 12) || ocupado(x, z) || enRisco(x, z)) continue; // la vista desde la llegada, despejada; la cabaña; el risco
    arboles.push({ x, z, y: alturaTerreno(x, z), s: 0.9 + ruido(i, 47) * 0.8 });
  }
  // Y tres encima del risco, como en la imagen: dos grandes en los lóbulos y uno en la cola.
  for (const [x, s, atras] of [[-6.6, 1.4, 2.2], [7, 1.25, 2], [-13.5, 1, 1.6]]) {
    const arista = cima(x);
    arboles.push({ x, z: arista.z - atras, y: arista.y - 0.2, s });
  }
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.35, 3.4, 6), new THREE.MeshStandardMaterial({ color: "#6b4f3a", roughness: 1 }), arboles.length);
  const BOLAS = 5;
  const hojas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 3), triplanar(/** @type {THREE.MeshStandardMaterial} */ (mecer(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }), 0.05, -1.5)), texCesped(), 0.7), arboles.length * BOLAS);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  arboles.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, p.y + 1.7 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    tronco.setMatrixAt(i, m4);
    for (let k = 0; k < BOLAS; k++) {
      const ox = (ruido(i, k * 3) - 0.5) * 2.8 * p.s, oz = (ruido(i, k * 3 + 1) - 0.5) * 2.8 * p.s;
      const e = p.s * (0.8 + ruido(i, k + 11) * 0.6);
      m4.compose(new THREE.Vector3(p.x + ox, p.y + (3.3 + ruido(k, i + 3) * 1.4) * p.s, p.z + oz), q, new THREE.Vector3(e, e * 0.82, e));
      hojas.setMatrixAt(i * BOLAS + k, m4);
      hojas.setColorAt(i * BOLAS + k, c.setHSL(0.24 + ruido(i, k) * 0.06, 0.58, 0.3 + ruido(i, k + 5) * 0.12));
    }
  });
  sombra(tronco);
  sombra(hojas);
  grupo.add(tronco, hojas);

  // Matas: redondas y verdes, y lavanda en espigas (varias por mata). Por las orillas, sin tapar la
  // llegada ni el paso a la poza.
  const sitios = [];
  for (let i = 0; sitios.length < 140 && i < 900; i++) {
    const a = ruido(i, 81) * Math.PI * 2, d = R_LAGO + 2.5 + ruido(i, 83) * 16;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ((z > R_LAGO - 2 && Math.abs(x) < 9) || ocupado(x, z)) continue; // el patio de llegada y la vista a la cascada
    sitios.push({ x, z, lila: ruido(i, 87) > 0.5, e: 0.7 + ruido(i, 89) * 0.8, i });
  }
  const verdes = sitios.filter((m) => !m.lila);
  const lilas = sitios.filter((m) => m.lila);
  const matas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.8, 3), triplanar(/** @type {THREE.MeshStandardMaterial} */ (mecer(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), 0.04, -0.8)), texCesped(), 0.9), verdes.length);
  verdes.forEach((m, k) => {
    m4.compose(new THREE.Vector3(m.x, alturaTerreno(m.x, m.z) + 0.35 * m.e, m.z), q, new THREE.Vector3(m.e * 1.2, m.e * 0.75, m.e * 1.2));
    matas.setMatrixAt(k, m4);
    matas.setColorAt(k, c.setHSL(0.27 + ruido(m.i, 91) * 0.05, 0.5, 0.3 + ruido(m.i, 93) * 0.12));
  });
  const ESPIGAS = 7;
  const espigas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 1), mecer(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), 0.25, -0.16), lilas.length * ESPIGAS);
  const tallos = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 2), mecer(new THREE.MeshStandardMaterial({ color: "#6a9448", roughness: 1 }), 0.05, -0.5), lilas.length);
  lilas.forEach((m, k) => {
    const y0 = alturaTerreno(m.x, m.z);
    m4.compose(new THREE.Vector3(m.x, y0 + 0.2, m.z), q, new THREE.Vector3(m.e, m.e * 0.5, m.e));
    tallos.setMatrixAt(k, m4);
    for (let e = 0; e < ESPIGAS; e++) {
      const a = (e / ESPIGAS) * Math.PI * 2 + ruido(k, e);
      const d = 0.15 + ruido(e, k) * 0.35 * m.e;
      m4.compose(new THREE.Vector3(m.x + Math.cos(a) * d, y0 + (0.6 + ruido(k, e + 3) * 0.5) * m.e, m.z + Math.sin(a) * d), q, new THREE.Vector3(0.8, 2.6, 0.8));
      espigas.setMatrixAt(k * ESPIGAS + e, m4);
      espigas.setColorAt(k * ESPIGAS + e, c.setHSL(0.74 + ruido(k, e + 7) * 0.06, 0.55, 0.62 + ruido(e, k + 9) * 0.1));
    }
  });
  sombra(matas);
  sombra(tallos);
  grupo.add(matas, tallos, espigas);

  // Césped: briznas que se mecen, y flores sueltas entre ellas. Sin tapar el patio ni la poza.
  /** @param {number} x @param {number} z */
  const libre = (x, z) => {
    const r = Math.hypot(x, z);
    if (r < R_LAGO + 2 || r > 42) return false;
    if (Math.abs(x) < 8.5 && z > R_LAGO + 1 && z < R_LAGO + 13) return false; // el patio
    if (ocupado(x, z)) return false;
    return !enRisco(x, z);
  };
  const BRIZNAS = 4200;
  const geoBrizna = new THREE.ConeGeometry(0.06, 1, 3);
  geoBrizna.translate(0, 0.5, 0);
  const briznas = new THREE.InstancedMesh(geoBrizna, mecer(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), 0.12, 0), BRIZNAS);
  let nb2 = 0;
  for (let i = 0; nb2 < BRIZNAS && i < BRIZNAS * 4; i++) {
    const a = ruido(i * 0.37, 3.1) * Math.PI * 2 + i, d = R_LAGO + 2 + ruido(i * 0.53, 7.7) * 40;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!libre(x, z)) continue;
    const alto = 0.35 + ruido(i * 0.71, 1.3) * 0.5;
    m4.compose(new THREE.Vector3(x, alturaTerreno(x, z) - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((ruido(i, 2) - 0.5) * 0.4, ruido(i, 4) * 3, (ruido(i, 6) - 0.5) * 0.4)), new THREE.Vector3(1, alto, 1));
    briznas.setMatrixAt(nb2, m4);
    briznas.setColorAt(nb2++, c.setHSL(0.21 + ruido(i * 0.3, 9) * 0.07, 0.55, 0.3 + ruido(i * 0.9, 11) * 0.14));
  }
  briznas.count = nb2;
  briznas.receiveShadow = true;
  const FLORES = 420;
  const flores = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 1), mecer(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 }), 0.2, -0.3), FLORES);
  const tonos = ["#fff7e6", "#ffc4d6", "#ffe07a", "#d7b8ff"];
  let nf = 0;
  for (let i = 0; nf < FLORES && i < FLORES * 5; i++) {
    const a = ruido(i * 0.41, 13) * Math.PI * 2 + i * 1.7, d = R_LAGO + 2 + ruido(i * 0.29, 17) * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!libre(x, z)) continue;
    m4.compose(new THREE.Vector3(x, alturaTerreno(x, z) + 0.35 + ruido(i, 19) * 0.25, z), q, new THREE.Vector3(1, 1, 1));
    flores.setMatrixAt(nf, m4);
    flores.setColorAt(nf++, c.set(tonos[i % tonos.length]));
  }
  flores.count = nf;
  grupo.add(briznas, flores);

  // Nenúfares en la poza, algunos con su flor rosa.
  const hojaNenufar = new THREE.MeshStandardMaterial({ color: "#5f9e48", roughness: 0.7, side: THREE.DoubleSide });
  const petalo = new THREE.MeshStandardMaterial({ color: "#ffb3cc", roughness: 0.6 });
  for (let i = 0; i < 11; i++) {
    const a = ruido(i, 101) * Math.PI * 2, d = 5 + ruido(i, 103) * 8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z < RISCO_Z + 7 || (x > 2 && x < 11 && z > -4 && z < 10)) continue; // ni al pie de la cascada ni en las piedras
    const n = new THREE.Mesh(new THREE.CircleGeometry(0.6 + ruido(i, 105) * 0.4, 20, 0.3, Math.PI * 2 - 0.3), hojaNenufar);
    n.rotation.set(-Math.PI / 2, 0, ruido(i, 107) * 6);
    n.position.set(x, 0.03, z);
    n.receiveShadow = true;
    grupo.add(n);
    if (i % 3 === 0) {
      const f = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const pt = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), petalo);
        pt.scale.set(0.6, 1.4, 0.6);
        const ak = (k / 7) * Math.PI * 2;
        pt.position.set(Math.cos(ak) * 0.12, 0.12, Math.sin(ak) * 0.12);
        pt.rotation.set(Math.sin(ak) * 0.6, 0, -Math.cos(ak) * 0.6);
        f.add(pt);
      }
      const centro = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: "#ffe07a", emissive: "#ffcf4a", emissiveIntensity: 0.3 }));
      centro.position.y = 0.14;
      f.add(centro);
      f.position.set(x + 0.1, 0.04, z);
      grupo.add(f);
    }
  }
  return arboles;
}
