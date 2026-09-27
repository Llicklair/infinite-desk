// La zona zen (tecla Z): un santuario luminoso lejos de las islas, en el estilo de la imagen que se
// pidió como referencia: bloques de piedra clara con musgo, una cascada blanca y turquesa que cae a
// una poza con piedras para pisar, árboles de copa redonda, lavanda, un banco con cojín, una puerta
// de luna, islotes flotando en el cielo y colinas al fondo. Se tiran piedras a la poza (mantener
// pulsado para cargar, soltar para lanzar): plana y fuerte hace la rana (src/lago.js) y cada contacto
// abre ondas. Tres ambientes, día, atardecer y noche (tecla L), con su cielo, sus luces y su niebla;
// al entrar se guardan los del mundo y al salir se devuelven. Uso real: "una zona zen a la que te
// puedas tepear, con una cascada algo así verde e interacciones relajantes, como tirar piedras a un
// lago", "configurable: diurna, nocturna, atardecer", "algo así" (la imagen). Todo son formas de
// three y shaders; nada se descarga.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { fuerzaDeCarga, posicionEn, recorrido } from "./lago.js";
import { IMPULSO, caer, deslizar, sueloBajo } from "./andar.js";
import { crearCabana } from "./cabana.js";
import { crearEspiritu } from "./espiritu.js";
import { NOMBRE } from "./apoyo.js";
import { cesped as texCesped, piedra as texPiedra, triplanar } from "./texturas.js";
import { H_LABIO, RISCO_Z, Z_LABIO, cajasRisco, cima, hendidura, mallaRisco, ruido } from "./risco.js";
import { CENTRO_ZEN, K_ARCO, MAX_ONDAS, OJOS, PIE_Z, R_LAGO, alturaTerreno } from "./zen-medidas.js";
import { AMBIENTES, ORDEN_AMBIENTES } from "./zen-ambientes.js";
import {
  AGUA_FRAGMENTO, AGUA_VERTICE, BRUMA_FRAGMENTO, BRUMA_VERTICE, CASCADA_FRAGMENTO, CASCADA_VERTICE, CIELO_FRAGMENTO, CIELO_VERTICE,
  LUCIERNAGA_FRAGMENTO, MOTAS_FRAGMENTO, MOTAS_VERTICE, PUNTOS_VERTICE, SALPICA_VERTICE,
} from "./zen-shaders.js";
import { crearSonido } from "./zen-sonido.js";
import { crearViento, plantar } from "./zen-flora.js";
import { crearLejos } from "./zen-lejos.js";
import { crearLluvia } from "./zen-lluvia.js";

/** @typedef {import("./zen-ambientes.js").Ambiente} Ambiente */

// --- la zona ----------------------------------------------------------------------------------

/**
 * @param {THREE.Scene} escena
 * @param {{hemi: THREE.HemisphereLight, sol: THREE.DirectionalLight, niebla: THREE.FogExp2, cieloMundo: THREE.Object3D, renderer: THREE.WebGLRenderer, avisar: (t: string) => void, alHablar?: () => void}} mundo
 *   lo del mundo que la zona cambia mientras se está en ella (y devuelve al salir); `alHablar`: E sobre el espíritu
 */
export function crearZen(escena, mundo) {
  const grupo = new THREE.Group();
  grupo.position.copy(CENTRO_ZEN);
  grupo.visible = false;
  escena.add(grupo);
  const c = new THREE.Color();
  // Sombras suaves del sol (solo aquí: al salir se apagan) y el blanco del sol hacia su objetivo.
  mundo.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  escena.add(mundo.sol.target);

  // El viento: hojas y hierba se mecen, todas al mismo compás (src/zen-flora.js).
  const { viento, mecer } = crearViento();
  /** Proyecta y recibe sombra (todo lo sólido de la zona). @param {THREE.Object3D} o */
  const sombra = (o) => { o.castShadow = true; o.receiveShadow = true; return o; };

  // Cielo propio (el del mundo es siempre oscuro): sigue a la cámara.
  const uCielo = {
    uCenit: { value: new THREE.Color() }, uHorizonte: { value: new THREE.Color() }, uSol: { value: new THREE.Color() },
    uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uEstrellas: { value: 0 }, uNubes: { value: 1 }, uTiempo: { value: 0 },
  };
  const cielo = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({ uniforms: uCielo, vertexShader: CIELO_VERTICE, fragmentShader: CIELO_FRAGMENTO, side: THREE.BackSide, depthWrite: false, fog: false }));
  cielo.renderOrder = -1;
  cielo.frustumCulled = false;
  cielo.visible = false;
  escena.add(cielo);

  // Suelo: césped con lomas suaves, facetado.
  const geo = new THREE.PlaneGeometry(220, 220, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, alturaTerreno(x, z));
    const n = ruido(x * 0.3, z * 0.3);
    if (Math.hypot(x, z) < R_LAGO + 1) c.setHSL(0.2, 0.25, 0.55 + n * 0.08); // piedra clara del borde de la poza
    else c.setHSL(0.24 + n * 0.05, 0.6 + n * 0.12, 0.3 + n * 0.08);
    colores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
  geo.computeVertexNormals();
  const terreno = new THREE.Mesh(geo, triplanar(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), texCesped(), 0.45));
  terreno.receiveShadow = true;
  grupo.add(terreno);

  // Bloques de piedra clara con musgo encima: el gran escalonado del que cae la cascada, y más.
  const piedra = triplanar(new THREE.MeshStandardMaterial({ color: "#e3d8c4", roughness: 0.85 }), texPiedra(), 0.35);
  /** Uno de los tonos de piedra, para cualquier entero (también negativo: `sillares[-1]` era undefined y three pintaba ese sillar con su material por defecto, blanco y sin luz). @param {number} n */
  const tono = (n) => sillares[((Math.round(n) % sillares.length) + sillares.length) % sillares.length];
  const sillares = ["#e0d5c0", "#d4c8b1", "#e8dfcc", "#cbc0aa"].map((col) => triplanar(new THREE.MeshStandardMaterial({ color: col, roughness: 0.88 }), texPiedra(), 0.3));
  const musgo = triplanar(new THREE.MeshStandardMaterial({ color: "#7cb84a", roughness: 0.9 }), texCesped(), 0.9);
  /** Una caja con las esquinas redondeadas (lo cozy). @param {number} w @param {number} h @param {number} d @param {number} [r] */
  const caja = (w, h, d, r = 0.25) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
  /** Lo sólido de piedra (sillares, la puerta de luna, el banco): se choca con ello y se sube encima. @type {import("./andar.js").Caja[]} */
  const rocas = [];
  /**
   * Una caja girada `giro` en y, como caja alineada (la que la envuelve).
   * @param {number} cx @param {number} cz @param {number} w @param {number} d @param {number} y0 @param {number} y1 @param {number} [giro]
   */
  const roca = (cx, cz, w, d, y0, y1, giro = 0) => {
    const c = Math.abs(Math.cos(giro)), sn = Math.abs(Math.sin(giro));
    const hx = (w * c + d * sn) / 2, hz = (w * sn + d * c) / 2;
    rocas.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, y0, y1 });
  };
  const zc = RISCO_Z;
  // El risco de la cascada, de una sola pieza (src/risco.js da la forma). Aquí se viste: piedra
  // clara, musgo donde es plano (las repisas y la cima), oscura y brillante donde la moja el agua.
  const { posiciones: pRisco, indices: iRisco } = mallaRisco();
  const geoRisco = new THREE.BufferGeometry();
  geoRisco.setAttribute("position", new THREE.BufferAttribute(pRisco, 3));
  geoRisco.setIndex(iRisco);
  geoRisco.computeVertexNormals();
  const nRisco = geoRisco.attributes.normal;
  const cRisco = new Float32Array(pRisco.length), mRisco = new Float32Array(pRisco.length / 3);
  const colPiedra = new THREE.Color(), colMusgo = new THREE.Color(), colMojada = new THREE.Color("#46524f");
  for (let i = 0; i < pRisco.length / 3; i++) {
    const x = pRisco[i * 3], y = pRisco[i * 3 + 1], z = pRisco[i * 3 + 2];
    const n = ruido(x * 0.35, (y - z) * 0.35);
    colPiedra.setHSL(0.1 + n * 0.02, 0.22 + n * 0.08, 0.84 + (ruido(x * 1.3, y * 1.3) - 0.5) * 0.1);
    colMusgo.setHSL(0.24 + n * 0.04, 0.5, 0.33 + n * 0.08);
    // Musgo según la pendiente (y un poco en las grietas de la cara), nunca bajo el agua.
    const musgoso = THREE.MathUtils.smoothstep(nRisco.getY(i), 0.3 - n * 0.2, 0.62) * THREE.MathUtils.smoothstep(y, 0.4, 1.2);
    // Mojada: la hendidura entera, la orilla del agua y donde salpica al pie de la cascada.
    const mojada = Math.min(1, hendidura(x) * (z > zc - 2.5 ? 1 : 0.5)
      + (1 - THREE.MathUtils.smoothstep(y, 0.2, 1.4)) * 0.6
      + (1 - THREE.MathUtils.smoothstep(Math.abs(x), 2.5, 5.5)) * (1 - THREE.MathUtils.smoothstep(y, 0.5, 4)) * 0.7);
    c.copy(colPiedra).lerp(colMusgo, musgoso * (1 - mojada * 0.7)).lerp(colMojada, mojada * (1 - musgoso * 0.5) * 0.85);
    cRisco.set([c.r, c.g, c.b], i * 3);
    mRisco[i] = mojada;
  }
  geoRisco.setAttribute("color", new THREE.BufferAttribute(cRisco, 3));
  geoRisco.setAttribute("mojado", new THREE.BufferAttribute(mRisco, 1));
  const matRisco = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  matRisco.onBeforeCompile = (sh) => { // lo mojado brilla (menos rugoso)
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float mojado;\nvarying float vMojado;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMojado = mojado;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vMojado;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.2, vMojado);");
  };
  triplanar(matRisco, texPiedra(), 0.18);
  matRisco.customProgramCacheKey = () => "risco"; // su propio programa (el de triplanar lo comparten los sillares)
  const risco = sombra(new THREE.Mesh(geoRisco, matRisco));
  grupo.add(risco);
  for (const k of cajasRisco()) rocas.push(k);
  // Piedras para pisar, en fila por la poza.
  for (let i = 0; i < 5; i++) {
    const s = sombra(new THREE.Mesh(caja(2.6, 0.5, 1.8, 0.2), piedra));
    s.position.set(4 + i * 1.3, 0.05, 8 - i * 2.6);
    s.rotation.y = 0.15 * (i % 2 ? 1 : -1);
    grupo.add(s);
  }
  // El bordillo de la poza: piedras redondeadas, una tras otra y cada una algo distinta, todo
  // alrededor (menos donde están los bloques de la cascada). Y el patio de losas donde se llega.
  const PIEDRAS_BORDE = 46;
  for (let i = 0; i < PIEDRAS_BORDE; i++) {
    const a = (i / PIEDRAS_BORDE) * Math.PI * 2;
    const d = R_LAGO + 1.05;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z < RISCO_Z + 5 && Math.abs(x) < 9) continue;
    const largo = (2 * Math.PI * d) / PIEDRAS_BORDE + 0.25;
    const l = sombra(new THREE.Mesh(caja(largo * (0.92 + ruido(i, 141) * 0.1), 0.38 + ruido(i, 143) * 0.12, 1.1 + ruido(i, 145) * 0.3, 0.16), tono(i)));
    l.position.set(x, 0.12 + ruido(i, 147) * 0.05, z);
    l.rotation.y = -a + Math.PI / 2 + (ruido(i, 149) - 0.5) * 0.08;
    grupo.add(l);
  }
  for (let ix = -2; ix <= 2; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const l = sombra(new THREE.Mesh(caja(2.8, 0.3, 2.8, 0.12), piedra));
      l.position.set(ix * 3 + (iz % 2) * 1.5, 0.3 + alturaTerreno(ix * 3, R_LAGO + 5 + iz * 3), R_LAGO + 5 + iz * 3);
      grupo.add(l);
    }
  }
  // El banco con su cojín verde.
  const banco = sombra(new THREE.Mesh(caja(5, 0.9, 1.6, 0.3), piedra));
  banco.position.set(-8, 0.9, R_LAGO + 6);
  banco.rotation.y = 0.5;
  roca(-8, R_LAGO + 6, 5, 1.6, 0.45, 1.5, 0.5);
  // El espíritu de luz (src/espiritu.js), sentado en el banco a tu lado (entre los cojines), mirando a la poza.
  const asiento = new THREE.Vector3(0.62, 0, 0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).add(new THREE.Vector3(-8, 1.66, R_LAGO + 6));
  const espiritu = crearEspiritu({ asiento, mirando: Math.atan2(-asiento.x, -asiento.z) });
  grupo.add(espiritu.grupo);
  const cojin = sombra(new THREE.Mesh(caja(4.6, 0.35, 1.4, 0.16), new THREE.MeshStandardMaterial({ color: "#9cba74", roughness: 1 })));
  // Y dos cojines pequeños, redondos y blanditos.
  for (const x of [-1.6, 1.4]) {
    const cp = sombra(new THREE.Mesh(caja(0.9, 0.7, 0.3, 0.14), new THREE.MeshStandardMaterial({ color: x < 0 ? "#b5c98a" : "#e8d9b0", roughness: 1 })));
    cp.position.set(x, 0.95, 0.45); // el respaldo, del lado contrario a la poza (se mira al agua)
    cp.rotation.x = 0.25;
    cojin.add(cp);
  }
  cojin.position.set(0, 0.6, 0);
  banco.add(cojin);
  grupo.add(banco);
  // La puerta de luna: un aro de piedra grande, a un lado.
  const aro = new THREE.Mesh(new THREE.TorusGeometry(4, 0.75, 4, 48), piedra);
  aro.scale.z = 0.45; // de canto, plano: un muro con un hueco redondo, no un donut
  aro.position.set(-19, 4.6, 2);
  aro.rotation.y = Math.PI / 2.6;
  grupo.add(aro);
  // Sólido a trozos a lo largo del aro: se choca con la piedra y se pasa por el hueco.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const lx = Math.cos(a) * 4, ly = Math.sin(a) * 4;
    const px = -19 + lx * Math.cos(aro.rotation.y), pz = 2 - lx * Math.sin(aro.rotation.y);
    const py = 4.6 + ly;
    if (py - 0.75 > 2.2) continue; // lo de arriba queda por encima de la cabeza (y no se llega)
    roca(px, pz, 1.2, 1.2, Math.max(-1, py - 0.75), py + 0.75);
  }

  // La poza.
  const uAgua = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTiempo: { value: 0 }, uRadio: { value: R_LAGO + 1.5 },
    uOndas: { value: Array.from({ length: MAX_ONDAS }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uHondo: { value: new THREE.Color() }, uSomero: { value: new THREE.Color() }, uReflejo: { value: new THREE.Color() },
    uSol: { value: new THREE.Color() }, uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uLluvia: { value: 0 },
  };
  const agua = new THREE.Mesh(new THREE.CircleGeometry(R_LAGO + 1.5, 96),
    new THREE.ShaderMaterial({ uniforms: uAgua, vertexShader: AGUA_VERTICE, fragmentShader: AGUA_FRAGMENTO, fog: true }));
  agua.rotation.x = -Math.PI / 2;
  grupo.add(agua);
  let siguienteOnda = 0;
  /** @param {number} x @param {number} z @param {number} fuerza */
  function ondear(x, z, fuerza) {
    uAgua.uOndas.value[siguienteOnda].set(x, z, uAgua.uTiempo.value, fuerza);
    siguienteOnda = (siguienteOnda + 1) % MAX_ONDAS;
  }

  // La cascada: una lámina curva que sale del labio en arco y se abre al caer (no un plano).
  /** @param {number} w0 ancho arriba @param {number} w1 ancho abajo @param {number} alto @param {number} k cuánto avanza al caer */
  function lamina(w0, w1, alto, k) {
    const g = new THREE.PlaneGeometry(1, 1, 10, 48);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5, v = 0.5 - pos.getY(i); // u: de lado a lado; v: 0 arriba, 1 abajo
      const d = v * alto;
      pos.setXYZ(i, (u - 0.5) * (w0 + (w1 - w0) * v), alto - d, k * Math.sqrt(d));
    }
    g.computeVertexNormals();
    return g;
  }
  /** @type {{uTiempo: {value: number}, uBrillo: {value: number}}[]} */
  const uCascada = [];
  /** @param {THREE.BufferGeometry} g @param {number} velocidad @param {string} color @param {number} x @param {number} y @param {number} z */
  function chorro(g, velocidad, color, x, y, z) {
    const u = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTiempo: { value: 0 }, uVelocidad: { value: velocidad }, uAgua: { value: new THREE.Color(color) }, uBrillo: { value: 1 },
    };
    uCascada.push(u);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: CASCADA_VERTICE, fragmentShader: CASCADA_FRAGMENTO, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    grupo.add(m);
    return m;
  }
  chorro(lamina(4.6, 5.8, H_LABIO, K_ARCO * 0.85), 1.5, "#6fcfd4", 0, 0, Z_LABIO - 0.2); // la de detrás, más lenta
  chorro(lamina(4.2, 5.2, H_LABIO, K_ARCO), 2.2, "#8fe3e6", 0, 0, Z_LABIO); // la de delante
  for (const x of [-2.35, 2.35]) chorro(lamina(0.45, 0.9, H_LABIO - 0.3, K_ARCO * 0.7), 2.6, "#a4ebec", x, 0, Z_LABIO - 0.35); // chorritos
  // El agua del canal, arriba, corriendo hacia el labio.
  const canal = chorro(new THREE.PlaneGeometry(4.3, Z_LABIO - (zc - 3.2) - 0.2, 1, 12), 0.8, "#7fd9da", 0, H_LABIO + 0.02, (Z_LABIO + zc - 3.2) / 2 - 0.1);
  canal.rotation.x = -Math.PI / 2;
  // Rocas redondas y mojadas donde rompe el agua.
  const rocaMojada = triplanar(new THREE.MeshStandardMaterial({ color: "#5c6661", roughness: 0.3 }), texPiedra(), 0.6);
  for (const [x, z, e] of [[-3, PIE_Z - 0.3, 1.1], [3.2, PIE_Z + 0.2, 0.9], [-1.8, PIE_Z + 1.9, 0.6], [2.2, PIE_Z + 2.2, 0.7], [0.4, PIE_Z - 1.2, 0.8]]) {
    const r = sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), rocaMojada));
    r.scale.set(e * 1.3, e * 0.7, e);
    r.position.set(x, -0.15, z);
    r.rotation.y = x;
    grupo.add(r);
  }
  // Matas en los salientes de arriba.
  const helecho = mecer(new THREE.MeshStandardMaterial({ color: "#5f9f44", roughness: 0.9 }), 0.05, -0.6);
  for (const [x, e] of [[-8.2, 0.9], [-4.4, 0.6], [-3, 0.45], [3.1, 0.45], [4.6, 0.55], [7.6, 0.8], [11, 0.7], [-11.5, 0.75], [15, 0.6]]) {
    const arista = cima(x);
    const m = sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 3), helecho));
    m.scale.set(e * 1.3, e * 0.8, e * 1.3);
    m.position.set(x, arista.y + e * 0.3, arista.z - e * 0.6);
    grupo.add(m);
  }
  // Bruma al pie (nube blanda) y salpicaduras que saltan en arco.
  const nb = 60;
  const bPos = new Float32Array(nb * 3), bFase = new Float32Array(nb);
  for (let i = 0; i < nb; i++) { bPos.set([(ruido(i, 3) - 0.5) * 6, 0.1, PIE_Z + (ruido(i, 5) - 0.3) * 2.5], i * 3); bFase[i] = ruido(i, 9); }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute("aFase", new THREE.BufferAttribute(bFase, 1));
  const uBruma = { uTiempo: { value: 0 } };
  const bruma = new THREE.Points(bGeo, new THREE.ShaderMaterial({ uniforms: uBruma, vertexShader: BRUMA_VERTICE, fragmentShader: BRUMA_FRAGMENTO, transparent: true, depthWrite: false }));
  bruma.frustumCulled = false;
  grupo.add(bruma);
  const ns = 110;
  const sPos = new Float32Array(ns * 3), sFase = new Float32Array(ns), sDir = new Float32Array(ns * 3);
  for (let i = 0; i < ns; i++) {
    sPos.set([(ruido(i, 51) - 0.5) * 4.4, 0.05, PIE_Z + (ruido(i, 53) - 0.5) * 0.8], i * 3);
    sFase[i] = ruido(i, 57);
    const a = ruido(i, 59) * Math.PI * 2;
    sDir.set([Math.cos(a) * (0.3 + ruido(i, 61)), 0.6 + ruido(i, 63) * 0.8, Math.abs(Math.sin(a)) * (0.4 + ruido(i, 65))], i * 3);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute("aFase", new THREE.BufferAttribute(sFase, 1));
  sGeo.setAttribute("aDir", new THREE.BufferAttribute(sDir, 3));
  const salpicas = new THREE.Points(sGeo, new THREE.ShaderMaterial({ uniforms: uBruma, vertexShader: SALPICA_VERTICE, fragmentShader: BRUMA_FRAGMENTO.replace("vA", "vA"), transparent: true, depthWrite: false }));
  salpicas.frustumCulled = false;
  grupo.add(salpicas);

  // La cabaña, a un lado del patio, con la puerta hacia la poza (un cuarto de vuelta: la puerta a +x).
  const CABANA = { x: -25, z: 12 };
  const cabana = crearCabana({ ...CABANA, cuartos: 1, suelo: alturaTerreno(CABANA.x, CABANA.z) });
  grupo.add(cabana.grupo);
  /** ¿Junto a la cabaña (para no plantar nada encima)? @param {number} x @param {number} z */
  const junto = (x, z) => {
    if (x > cabana.cubierta.x0 - 2 && x < cabana.cubierta.x1 + 7 && z > cabana.cubierta.z0 - 2 && z < cabana.cubierta.z1 + 2) return true; // la cabaña y su porche, despejado
    // El caminito del patio a la cabaña.
    const t = THREE.MathUtils.clamp(((x - CAMINO[0][0]) * (CAMINO[1][0] - CAMINO[0][0]) + (z - CAMINO[0][1]) * (CAMINO[1][1] - CAMINO[0][1])) / LARGO_CAMINO ** 2, 0, 1);
    return Math.hypot(x - (CAMINO[0][0] + t * (CAMINO[1][0] - CAMINO[0][0])), z - (CAMINO[0][1] + t * (CAMINO[1][1] - CAMINO[0][1]))) < 1.6;
  };
  // Un caminito de losas redondas del patio a los escalones del porche.
  const CAMINO = [[-7.5, R_LAGO + 7], [CABANA.x + 6.6, CABANA.z]];
  const LARGO_CAMINO = Math.hypot(CAMINO[1][0] - CAMINO[0][0], CAMINO[1][1] - CAMINO[0][1]);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = CAMINO[0][0] + t * (CAMINO[1][0] - CAMINO[0][0]) + (ruido(i, 131) - 0.5) * 0.5;
    const z = CAMINO[0][1] + t * (CAMINO[1][1] - CAMINO[0][1]) + (ruido(i, 133) - 0.5) * 0.5;
    const losa = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + ruido(i, 137) * 0.2, 0.6, 0.12, 14), sillares[i % sillares.length]);
    losa.position.set(x, alturaTerreno(x, z) + 0.03, z);
    losa.rotation.y = ruido(i, 139) * 3;
    losa.receiveShadow = true;
    grupo.add(losa);
  }

  const arboles = plantar(grupo, { mecer, sombra, ocupado: junto });

  // Farolillos de piedra con luz cálida: apenas de día, encendidos al atardecer y de noche.
  const luzFarol = new THREE.MeshStandardMaterial({ color: "#fff1d6", emissive: "#ffb454", emissiveIntensity: 1 });
  /** @type {THREE.PointLight[]} */
  const farolas = [];
  for (const [x, z] of [[-7.5, R_LAGO + 3.5], [7.5, R_LAGO + 3.5], [-15, -2], [14, -6]]) {
    const f = new THREE.Group();
    const y0 = alturaTerreno(x, z);
    const pie = sombra(new THREE.Mesh(caja(0.9, 0.3, 0.9, 0.1), piedra)); pie.position.y = 0.15;
    const poste = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 10), piedra)); poste.position.y = 0.85;
    const camara = sombra(new THREE.Mesh(caja(0.7, 0.55, 0.7, 0.1), piedra)); camara.position.y = 1.65;
    const luz = new THREE.Mesh(caja(0.74, 0.3, 0.46, 0.05), luzFarol); luz.position.y = 1.67;
    const luz2 = new THREE.Mesh(caja(0.46, 0.3, 0.74, 0.05), luzFarol); luz2.position.y = 1.67;
    const techo = sombra(new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.5, 4), piedra)); techo.position.y = 2.15; techo.rotation.y = Math.PI / 4;
    const bola = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), piedra)); bola.position.y = 2.45;
    const pl = new THREE.PointLight("#ffb866", 0, 14, 1.6);
    pl.position.y = 1.7;
    farolas.push(pl);
    f.add(pie, poste, camara, luz, luz2, techo, bola, pl);
    f.position.set(x, y0, z);
    grupo.add(f);
  }

  // Motas a la luz (polen, pétalos).
  const nm = 260;
  const mPos = new Float32Array(nm * 3), mFase = new Float32Array(nm);
  for (let i = 0; i < nm; i++) {
    const a = ruido(i, 121) * Math.PI * 2, d = ruido(i, 123) * 32;
    mPos.set([Math.cos(a) * d, ruido(i, 125) * 9, Math.sin(a) * d], i * 3);
    mFase[i] = ruido(i, 127);
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute("aFase", new THREE.BufferAttribute(mFase, 1));
  const uMotas = { uTiempo: { value: 0 }, uColor: { value: new THREE.Color() }, uIntensidad: { value: 0 } };
  const motas = new THREE.Points(mGeo, new THREE.ShaderMaterial({ uniforms: uMotas, vertexShader: MOTAS_VERTICE, fragmentShader: MOTAS_FRAGMENTO, transparent: true, depthWrite: false }));
  motas.frustumCulled = false;
  grupo.add(motas);

  // El borde de la pantalla, cálido y suave (un viñeteado de CSS: sin pasadas extra de la GPU).
  const vineta = typeof document !== "undefined" ? document.createElement("div") : null;
  if (vineta) {
    vineta.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:1;display:none;transition:background 1s";
    document.body.append(vineta);
  }

  // Islotes flotando en el cielo y colinas al fondo (src/zen-lejos.js).
  const { monolitos, colinas } = crearLejos(grupo, { mecer, sombra, musgo, tono });

  // Luciérnagas (de noche, y algunas al atardecer).
  const n = 140;
  const lPos = new Float32Array(n * 3), lFase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = ruido(i, 61) * Math.PI * 2, d = 6 + ruido(i, 63) * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    lPos.set([x, Math.max(0, alturaTerreno(x, z)) + 0.5 + ruido(i, 67) * 2.5, z], i * 3);
    lFase[i] = ruido(i, 71);
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3));
  lGeo.setAttribute("aFase", new THREE.BufferAttribute(lFase, 1));
  const uLuz = { uTiempo: { value: 0 }, uTam: { value: 90 }, uIntensidad: { value: 0 } };
  const luciernagas = new THREE.Points(lGeo, new THREE.ShaderMaterial({ uniforms: uLuz, vertexShader: PUNTOS_VERTICE, fragmentShader: LUCIERNAGA_FRAGMENTO, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  luciernagas.frustumCulled = false;
  grupo.add(luciernagas);

  // --- lo que para y lo que se pisa (además de la cabaña): src/andar.js ------------------------------------
  /** @type {import("./andar.js").Caja[]} */
  const cajasFijas = [...rocas];
  for (let i = 0; i < 5; i++) { // las piedras de la poza: se puede ir saltando de una a otra
    const x = 4 + i * 1.3, z = 8 - i * 2.6;
    cajasFijas.push({ x0: x - 1.15, x1: x + 1.15, z0: z - 0.8, z1: z + 0.8, y0: -0.4, y1: 0.3 });
  }
  for (let ix = -2; ix <= 2; ix++) for (let iz = 0; iz < 3; iz++) { // las losas del patio
    const x = ix * 3 + (iz % 2) * 1.5, z = R_LAGO + 5 + iz * 3, y = 0.3 + alturaTerreno(ix * 3, z);
    cajasFijas.push({ x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4, y0: y - 0.15, y1: y + 0.15 });
  }
  for (const [x, z] of [[-7.5, R_LAGO + 3.5], [7.5, R_LAGO + 3.5], [-15, -2], [14, -6]]) { // los farolillos
    cajasFijas.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y0: -1, y1: alturaTerreno(x, z) + 2.5 });
  }
  for (const a of arboles) { // los troncos
    const r = 0.3 * a.s;
    cajasFijas.push({ x0: a.x - r, x1: a.x + r, z0: a.z - r, z1: a.z + r, y0: a.y - 1, y1: a.y + 3.4 * a.s });
  }

  // --- la lluvia: rayas que caen alrededor de la cámara (src/zen-lluvia.js) --------------------------
  const uLluvia = crearLluvia(grupo, cabana.cubierta);

  // --- ambiente: día, atardecer o noche ------------------------------------------------------
  /** @type {Ambiente} */
  let ambiente = "dia";
  try { const g = localStorage.getItem("infinite-desk.zen"); if (g && g in AMBIENTES) ambiente = /** @type {Ambiente} */ (g); } catch { /* sin almacenamiento */ }
  /** Lo del mundo antes de entrar, para devolverlo. @type {{hemiCielo: THREE.Color, hemiSuelo: THREE.Color, hemi: number, sol: THREE.Color, solI: number, solPos: THREE.Vector3, niebla: THREE.Color, densidad: number, tono: THREE.ToneMapping, exposicion: number} | null} */
  let guardado = null;

  function aplicarAmbiente() {
    const p = AMBIENTES[ambiente];
    const dir = new THREE.Vector3(...p.solDir).normalize();
    uCielo.uCenit.value.set(p.cenit);
    uCielo.uHorizonte.value.set(p.horizonte);
    uCielo.uSol.value.set(p.sol);
    uCielo.uSolDir.value.copy(dir);
    uCielo.uEstrellas.value = p.estrellas;
    uCielo.uNubes.value = p.nubes;
    uAgua.uHondo.value.set(p.hondo);
    uAgua.uSomero.value.set(p.somero);
    uAgua.uReflejo.value.set(p.horizonte).lerp(new THREE.Color(p.cenit), 0.35);
    uAgua.uSol.value.set(p.sol);
    uAgua.uSolDir.value.copy(dir);
    for (const u of uCascada) u.uBrillo.value = p.brillo;
    uLuz.uIntensidad.value = p.luciernagas;
    // Las de delante, verdes teñidas de la luz del cielo; las de atrás, casi del color del cielo.
    colinas[0].color.set("#6f9a52").lerp(new THREE.Color(p.cieloLuz), 0.2).multiplyScalar(0.6 + p.hemi * 0.3);
    colinas[1].color.set(p.horizonte).lerp(new THREE.Color(p.cenit), 0.6).lerp(new THREE.Color("#6f9a52"), 0.15);
    mundo.hemi.color.set(p.cieloLuz);
    mundo.hemi.groundColor.set(p.sueloLuz);
    mundo.hemi.intensity = p.hemi;
    mundo.sol.color.set(p.luz);
    mundo.sol.intensity = p.intensidad;
    // El sol, lejos en su dirección y apuntando a la zona: así sus sombras caen donde hay que verlas.
    mundo.sol.position.copy(CENTRO_ZEN).addScaledVector(dir, 120);
    mundo.sol.target.position.copy(CENTRO_ZEN);
    mundo.niebla.color.set(p.niebla);
    mundo.niebla.density = p.densidad;
    mundo.renderer.toneMappingExposure = p.exposicion;
    luzFarol.emissiveIntensity = 0.3 + p.farolillos * 2.2;
    for (const f of farolas) f.intensity = p.farolillos * 14;
    uMotas.uColor.value.set(p.motas);
    uMotas.uIntensidad.value = p.cuantasMotas;
    uAgua.uLluvia.value = p.lluvia;
    uLluvia.uIntensidad.value = p.lluvia;
    cabana.ponerAmbiente({ calido: p.ventanas, lluvia: p.lluvia });
    if (vineta) vineta.style.background = `radial-gradient(ellipse at center, transparent 55%, ${p.vineta} 100%)`;
  }

  // --- piedras -------------------------------------------------------------------------------
  const sonido = crearSonido();
  const geoPiedra = new THREE.DodecahedronGeometry(0.09, 0);
  const matPiedra = new THREE.MeshStandardMaterial({ color: "#9a9489", roughness: 0.7, flatShading: true });
  /** @type {{malla: THREE.Mesh, r: ReturnType<typeof recorrido>, t0: number, origen: THREE.Vector3, dir: THREE.Vector2, siguiente: number, enTierra: number}[]} */
  const piedras = [];
  let reloj = 0;
  let activa = false;

  // --- el cuerpo: andar, saltar, sentarse; y lo que se toca con E --------------------------------------
  const cuerpo = { pies: 0, vy: 0, enSuelo: true };
  const ultimoSeguro = new THREE.Vector3(0, 0.45, R_LAGO + 8);
  /** @type {{pos: THREE.Vector3, mirar: THREE.Vector3} | null} */
  let sentado = null;
  const rayo = new THREE.Raycaster();
  rayo.far = 4.2;
  /** @type {import("./cabana.js").Interactivo[]} */
  const interactivos = [
    ...cabana.interactivos,
    {
      objeto: espiritu.grupo,
      texto: () => `E: talk to ${NOMBRE} (V: just talk, by voice)`,
      accion: () => mundo.alHablar?.(),
      sentado: true,
    },
    {
      objeto: banco,
      texto: () => "E: sit on the bench",
      asiento: true,
      accion: (a) => a.sentarse(new THREE.Vector3(-8, 2.45, R_LAGO + 6.1), new THREE.Vector3(0, 1.5, 0)),
    },
  ];
  /** @type {import("./cabana.js").Acciones} */
  const acciones = {
    sentarse: (pos, mirar) => { sentado = { pos, mirar }; },
    avisar: (t) => mundo.avisar(t),
    sonar: (que) => (que === "chispa" ? sonido.chispa(0.14) : que === "sorbo" ? sonido.sorbo() : sonido.puerta()),
  };
  /** Lo que se tiene delante (a mano: menos de 4,2 m), si se puede tocar. @param {THREE.Camera} camara */
  function delante(camara) {
    camara.updateMatrixWorld(); // con la de este momento, no la del último fotograma pintado
    rayo.setFromCamera(new THREE.Vector2(0, 0), camara);
    let mejor = null, distancia = Infinity;
    for (const i of interactivos) {
      if (i.objeto === cabana.taza.grupo && cabana.taza.enMano) continue; // la de la mano no tapa lo de delante
      const h = rayo.intersectObject(i.objeto, true)[0];
      if (h && h.distance < distancia) { mejor = i; distancia = h.distance; }
    }
    return mejor;
  }
  function levantarse() {
    sentado = null;
    cuerpo.vy = 0;
    cuerpo.enSuelo = false;
  }

  return {
    get activa() { return activa; },
    /** El espíritu de luz: que siga, se quede o vuelva; y cuándo habla o escucha (brilla más). */
    espiritu,
    get ambiente() { return ambiente; },
    /**
     * Dónde se aparece al llegar (en el mundo) y hacia dónde mira: en el patio, de cara a la cascada;
     * o dentro de la cabaña, mirando al fuego.
     * @param {boolean | "fuera" | "cascada"} [enCabana] dentro de la cabaña, o fuera mirándola; o de cerca de la cascada
     */
    llegada(enCabana = false) {
      sentado = null;
      cuerpo.vy = 0;
      if (enCabana === "cascada") {
        const x = 7, z = R_LAGO + 2.5;
        cuerpo.pies = 0.35 + alturaTerreno(x, z);
        return { posicion: new THREE.Vector3(x, cuerpo.pies + OJOS, z).add(CENTRO_ZEN), mirar: new THREE.Vector3(0, 5.5, PIE_Z).add(CENTRO_ZEN) };
      }
      if (enCabana) {
        const d = enCabana === "fuera" ? cabana.fueraDe() : cabana.dentroDe();
        cuerpo.pies = d.pos.y - OJOS;
        return { posicion: d.pos.clone().add(CENTRO_ZEN), mirar: d.mirar.clone().add(CENTRO_ZEN) };
      }
      const x = 0, z = R_LAGO + 8;
      cuerpo.pies = 0.45 + alturaTerreno(0, z);
      ultimoSeguro.set(x, cuerpo.pies, z);
      return {
        posicion: new THREE.Vector3(x, cuerpo.pies + OJOS, z).add(CENTRO_ZEN),
        mirar: new THREE.Vector3(0, 4.5, RISCO_Z).add(CENTRO_ZEN),
      };
    },
    /** Espacio: saltar (o levantarse, si se está sentado). */
    saltar() {
      if (sentado) { levantarse(); return; }
      if (!cuerpo.enSuelo) return;
      cuerpo.vy = IMPULSO;
      cuerpo.enSuelo = false;
    },
    /** Lo que diría el cartel de info: qué se puede hacer con lo que se tiene delante. @param {THREE.Camera} camara */
    pista(camara) {
      const d = delante(camara);
      const levantarse = sentado ? " · Space: stand up" : "";
      if (cabana.taza.enMano) {
        const sorbo = cabana.taza.nivel > 0.02 ? "Click: a sip" : "Empty";
        if (!sentado && d?.asiento) return `${sorbo} · ${d.texto()} (with your hot chocolate)`;
        return `${sorbo} · E: leave it on the table${cabana.taza.nivel > 0.02 ? "" : " to refill it"}${levantarse}`;
      }
      if (sentado) return d?.objeto === cabana.taza.grupo || d?.sentado ? `${d.texto()}${levantarse}` : "E or Space: stand up";
      return d?.texto() ?? "";
    },
    /** E: tocar lo que se tiene delante (o levantarse, o dejar la taza). @param {THREE.Camera} camara @returns {boolean} si hizo algo */
    // Sentarse y beber a la vez (uso real: "necesito poder sentarme y beber el chocolate"): con la
    // taza en la mano, E sobre un asiento sienta sin soltarla; sentado, E sobre la taza la coge sin
    // levantarse. Lo demás: con la taza, E la deja; sentado, E (o Espacio) levanta.
    interactuar(camara) {
      const i = delante(camara);
      if (cabana.taza.enMano) {
        if (sentado || !i?.asiento) {
          mundo.avisar(cabana.taza.dejar() ? "Back on the table, and freshly refilled" : "Back on the table");
          return true;
        }
      } else if (sentado && i?.objeto !== cabana.taza.grupo && !i?.sentado) {
        levantarse();
        return true;
      }
      if (!i) return false;
      if (i.objeto === cabana.taza.grupo) cabana.taza.coger(camara);
      i.accion(acciones);
      if (sentado) {
        const { pos, mirar } = /** @type {{pos: THREE.Vector3, mirar: THREE.Vector3}} */ (sentado);
        camara.position.copy(pos).add(CENTRO_ZEN);
        camara.lookAt(mirar.clone().add(CENTRO_ZEN));
      }
      return true;
    },
    /**
     * Para las pruebas sin manos: dónde está (en la zona) lo tocable cuyo texto dice `que`.
     * @param {string} que @returns {number[] | null}
     */
    dondeEsta(que) {
      const i = interactivos.find((x) => x.texto().includes(que));
      if (!i) return null;
      const v = new THREE.Box3().setFromObject(i.objeto).getCenter(new THREE.Vector3()).sub(CENTRO_ZEN);
      return [v.x, v.y, v.z];
    },
    /** Para las pruebas sin manos: el estado de lo que se toca. */
    get estado() { return { sentado: Boolean(sentado), tazaEnMano: cabana.taza.enMano, nivel: cabana.taza.nivel, pies: cuerpo.pies, enSuelo: cuerpo.enSuelo }; },
    /** Un clic: con la taza en la mano, un sorbo (y no se tira piedra). @returns {boolean} si lo usó */
    clic() {
      if (!cabana.taza.enMano) return false;
      if (cabana.taza.sorber()) setTimeout(() => sonido.sorbo(), 500);
      return true;
    },
    /** @param {boolean} si */
    activar(si) {
      if (si === activa) return;
      activa = si;
      grupo.visible = si;
      cielo.visible = si;
      mundo.cieloMundo.visible = !si;
      if (si) {
        guardado = {
          hemiCielo: mundo.hemi.color.clone(), hemiSuelo: mundo.hemi.groundColor.clone(), hemi: mundo.hemi.intensity,
          sol: mundo.sol.color.clone(), solI: mundo.sol.intensity, solPos: mundo.sol.position.clone(),
          niebla: mundo.niebla.color.clone(), densidad: mundo.niebla.density,
          tono: mundo.renderer.toneMapping, exposicion: mundo.renderer.toneMappingExposure,
        };
        // Tono cinematográfico, sombras suaves: solo aquí (en el mundo, como estaba).
        mundo.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        mundo.renderer.shadowMap.enabled = true;
        const s = mundo.sol.shadow;
        mundo.sol.castShadow = true;
        s.mapSize.set(2048, 2048);
        s.camera.left = -55; s.camera.right = 55; s.camera.top = 55; s.camera.bottom = -55;
        s.camera.near = 20; s.camera.far = 260;
        s.camera.updateProjectionMatrix();
        s.bias = -0.0006;
        s.normalBias = 0.04;
        s.radius = 5;
        if (vineta) vineta.style.display = "block";
        aplicarAmbiente();
      } else if (guardado) {
        mundo.hemi.color.copy(guardado.hemiCielo);
        mundo.hemi.groundColor.copy(guardado.hemiSuelo);
        mundo.hemi.intensity = guardado.hemi;
        mundo.sol.color.copy(guardado.sol);
        mundo.sol.intensity = guardado.solI;
        mundo.sol.position.copy(guardado.solPos);
        mundo.niebla.color.copy(guardado.niebla);
        mundo.niebla.density = guardado.densidad;
        mundo.renderer.toneMapping = guardado.tono;
        mundo.renderer.toneMappingExposure = guardado.exposicion;
        mundo.renderer.shadowMap.enabled = false;
        mundo.sol.castShadow = false;
        mundo.sol.target.position.set(0, 0, 0);
        if (vineta) vineta.style.display = "none";
        for (const p of piedras.splice(0)) grupo.remove(p.malla);
        if (cabana.taza.enMano) cabana.taza.dejar();
        sentado = null;
      }
      sonido.ambiente(si);
    },
    /** Día -> atardecer -> noche (L). Devuelve el nuevo. */
    siguienteAmbiente() {
      ambiente = ORDEN_AMBIENTES[(ORDEN_AMBIENTES.indexOf(ambiente) + 1) % ORDEN_AMBIENTES.length];
      try { localStorage.setItem("infinite-desk.zen", ambiente); } catch { /* sin almacenamiento */ }
      if (activa) aplicarAmbiente();
      return ambiente;
    },
    /** @param {Ambiente} a */
    ponerAmbiente(a) {
      if (!(a in AMBIENTES)) return;
      ambiente = a;
      if (activa) aplicarAmbiente();
    },
    /**
     * Andando (y saltando) por la zona: la gravedad, el suelo bajo los pies (terreno, losas, piedras,
     * la cabaña), lo que para (paredes, troncos, muebles) y el agua: quien se cae a la poza sale en la
     * orilla, con su chapuzón. Sentado, no se mueve.
     * @param {THREE.Vector3} p la posición de la cámara (en el mundo) tras moverse; se corrige en el sitio
     * @param {THREE.Vector3} antes dónde estaba antes de moverse @param {number} dt
     */
    ajustar(p, antes, dt) {
      if (sentado) { p.copy(sentado.pos).add(CENTRO_ZEN); return; }
      const l = p.clone().sub(CENTRO_ZEN), la = antes.clone().sub(CENTRO_ZEN);
      const cajas = [...cajasFijas, ...cabana.cajas()];
      let { x, z } = deslizar({ x: la.x, z: la.z }, { x: l.x, z: l.z }, cuerpo.pies, cajas);
      const r = Math.hypot(x, z);
      if (r > 70) { x *= 70 / r; z *= 70 / r; }
      const suelo = sueloBajo(x, z, cuerpo.pies, alturaTerreno(x, z), cajas);
      Object.assign(cuerpo, caer(cuerpo, Math.min(dt, 0.05), suelo));
      if (cuerpo.pies < -0.1 && Math.hypot(x, z) < R_LAGO + 0.5) {
        // ¡Al agua! Plof, ondas, y de vuelta a donde se pisaba seco.
        ondear(x, z, 1.4);
        sonido.agua("hundir");
        ({ x, z } = { x: ultimoSeguro.x, z: ultimoSeguro.z });
        cuerpo.pies = ultimoSeguro.y;
        cuerpo.vy = 0;
      } else if (cuerpo.enSuelo && cuerpo.pies > -0.05) ultimoSeguro.set(x, cuerpo.pies, z);
      p.set(x, cuerpo.pies + OJOS, z).add(CENTRO_ZEN);
    },
    /**
     * Tirar una piedra desde la cámara hacia donde mira, con la fuerza de lo que se cargó.
     * @param {THREE.Camera} camara @param {number} msCargado
     * @returns {number} cuántos botes dará (para decirlo)
     */
    lanzar(camara, msCargado) {
      const dir3 = camara.getWorldDirection(new THREE.Vector3());
      const origen = camara.getWorldPosition(new THREE.Vector3()).addScaledVector(dir3, 0.4).add(new THREE.Vector3(0, -0.25, 0));
      const dir = new THREE.Vector2(dir3.x, dir3.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, -1);
      dir.normalize();
      // Un poco por encima de donde se mira: se lanza desde la cadera, no desde los ojos.
      const angulo = (Math.asin(THREE.MathUtils.clamp(dir3.y, -1, 1)) * 180) / Math.PI + 4;
      const r = recorrido({ altura: origen.y - CENTRO_ZEN.y, velocidad: fuerzaDeCarga(msCargado), angulo });
      const malla = new THREE.Mesh(geoPiedra, matPiedra);
      grupo.add(malla);
      piedras.push({ malla, r, t0: reloj, origen: origen.sub(CENTRO_ZEN), dir, siguiente: 0, enTierra: -1 });
      return r.contactos.filter((x) => x.tipo === "bote").length;
    },
    /** @param {number} t segundos @param {number} dt @param {THREE.Camera} camara */
    tick(t, dt, camara) {
      if (!activa) return;
      reloj = t;
      uCielo.uTiempo.value = t;
      uAgua.uTiempo.value = t;
      uLuz.uTiempo.value = t;
      uBruma.uTiempo.value = t;
      for (const u of uCascada) u.uTiempo.value = t;
      viento.value = t;
      uMotas.uTiempo.value = t;
      cabana.tick(t, dt);
      espiritu.tick(t, dt, camara.position.clone().sub(CENTRO_ZEN), cuerpo.pies);
      // La lluvia, alrededor de donde se está; y cómo suena: fuera, o apagada dentro de la cabaña.
      const aqui = camara.position.clone().sub(CENTRO_ZEN);
      uLluvia.uTiempo.value = t;
      uLluvia.uCentro.value.set(aqui.x, aqui.z);
      const dentro = cabana.dentro(aqui.x, aqui.z);
      sonido.lluvia(AMBIENTES[ambiente].lluvia, dentro);
      // Junto al fuego, crepita.
      const cerca = Math.max(0, 1 - aqui.distanceTo(cabana.fuego) / 6);
      if (dentro && Math.random() < dt * 5 * cerca) sonido.chispa(0.02 + cerca * 0.05);
      cielo.position.copy(camara.position);
      monolitos.forEach((g, i) => { g.position.y += Math.sin(t * 0.3 + i * 2) * dt * 0.4; g.rotation.y = t * 0.02 * (i % 2 ? 1 : -1); });
      for (let i = piedras.length - 1; i >= 0; i--) {
        const p = piedras[i];
        if (p.enTierra >= 0) {
          // Cayó fuera del agua: se queda un momento en el suelo y desaparece.
          if (t - p.enTierra > 4) { grupo.remove(p.malla); piedras.splice(i, 1); }
          continue;
        }
        const s = t - p.t0;
        const pq = posicionEn(p.r, s);
        const x = p.origen.x + p.dir.x * pq.d, z = p.origen.z + p.dir.y * pq.d;
        p.malla.position.set(x, pq.y, z);
        p.malla.rotation.x += dt * 14;
        p.malla.rotation.z += dt * 9;
        const suelo = alturaTerreno(x, z);
        if (Math.hypot(x, z) > R_LAGO + 0.5 && pq.y <= Math.max(0, suelo) + 0.05) {
          p.malla.position.y = Math.max(0, suelo) + 0.08;
          p.enTierra = t;
          continue;
        }
        while (p.siguiente < p.r.contactos.length && s >= p.r.contactos[p.siguiente].t) {
          const cto = p.r.contactos[p.siguiente++];
          ondear(p.origen.x + p.dir.x * cto.d, p.origen.z + p.dir.y * cto.d, cto.tipo === "hundir" ? 1 : 0.55);
          sonido.agua(cto.tipo);
        }
        if (pq.fin) { grupo.remove(p.malla); piedras.splice(i, 1); }
      }
    },
  };
}

/** @typedef {ReturnType<typeof crearZen>} Zen */
