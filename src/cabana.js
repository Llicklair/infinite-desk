// La cabaña de la zona zen: de madera, con porche, silla, farol, puerta que se abre, ventanas y una
// chimenea con humo; dentro, el fuego que crepita, un sillón, una alfombra, estantería con libros,
// una cama con manta y, en la mesita, una taza de chocolate caliente con su nube (se coge, se bebe y
// se rellena al dejarla). Uso real: "items con los que interactuar: una silla, una taza de chocolate
// caliente con un marshmallow, una cabaña, y un modo lluvia para estar cozy dentro de la cabaña".
// Aquí solo se construye y se anima; andar, sentarse y la tecla E son cosa de src/zen.js.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { colocarCaja } from "./andar.js";
import { madera as texMadera, piedra as texPiedra, tejas as texTejas, tela as texTela, triplanar } from "./texturas.js";

/** @typedef {import("./andar.js").Caja} Caja */
/**
 * @typedef {{objeto: THREE.Object3D, texto: () => string, accion: (z: Acciones) => void, asiento?: boolean}} Interactivo
 *   `asiento`: se sienta uno en él (también con la taza en la mano)
 * @typedef {{sentarse: (pos: THREE.Vector3, mirar: THREE.Vector3) => void, avisar: (t: string) => void, sonar: (que: "chispa" | "sorbo" | "puerta") => void}} Acciones
 *   lo que la zona pone a disposición de los objetos (posiciones en coordenadas de la zona)
 */

const SUELO = 0.5; // la altura del suelo de dentro sobre el terreno

const RUIDO_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * ruido(p); p *= 2.03; a *= 0.5; } return v; }`;
const LLAMA_VERTICE = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LLAMA_FRAGMENTO = /* glsl */ `
  uniform float uTiempo, uAvivado, uSemilla;
  varying vec2 vUv;
  ${RUIDO_GLSL}
  void main() {
    vec2 uv = vUv;
    // El ruido sube (la llama "corre" hacia arriba) y tuerce más cuanto más alto.
    float n = fbm(vec2(uv.x * 3.0 + uSemilla, uv.y * 2.6 - uTiempo * 2.4));
    float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * uv.y;
    float alto = 0.72 + uAvivado * 0.25;
    // Forma de lágrima: ancha abajo, en punta arriba, con la base suave.
    float ancho = (1.0 - smoothstep(0.0, alto, uv.y)) * 0.75 + 0.05;
    float forma = (1.0 - smoothstep(ancho * 0.45, ancho, abs(x))) * smoothstep(0.0, 0.1, uv.y);
    float calor = clamp(forma * (1.15 - uv.y / alto) + (n - 0.45) * 0.5 * forma, 0.0, 1.0);
    vec3 c = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.5, 0.08), smoothstep(0.1, 0.45, calor));
    c = mix(c, vec3(1.0, 0.9, 0.55), smoothstep(0.55, 0.95, calor));
    float a = smoothstep(0.03, 0.3, calor);
    gl_FragColor = vec4(c * a * 1.5, a);
  }`;
const BRASAS_VERTICE = /* glsl */ `
  varying vec3 vPos;
  void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BRASAS_FRAGMENTO = /* glsl */ `
  uniform float uTiempo, uAvivado;
  varying vec3 vPos;
  ${RUIDO_GLSL}
  void main() {
    // Carbones: celdas de ruido fino; las grietas entre ellos, oscuras; lo de dentro, respirando.
    float n = fbm(vPos.xz * 9.0 + vec2(0.0, uTiempo * 0.15));
    float pulso = 0.75 + 0.25 * sin(uTiempo * 1.3 + n * 9.0) + uAvivado * 0.4;
    float brillo = smoothstep(0.35, 0.8, n) * pulso;
    vec3 c = mix(vec3(0.08, 0.03, 0.02), vec3(0.9, 0.18, 0.03), brillo);
    c = mix(c, vec3(1.0, 0.6, 0.15), smoothstep(0.75, 1.1, brillo));
    gl_FragColor = vec4(c, 1.0);
  }`;
const ALTO = 3; // de las paredes
const ANCHO = 7, FONDO = 6;

const VIDRIO_VERTICE = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VIDRIO_FRAGMENTO = /* glsl */ `
  uniform float uTiempo, uLluvia, uCalido;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec3 c = vec3(0.78, 0.88, 0.92);
    float a = 0.14;
    // Regueros de lluvia: gotas que bajan por el cristal, cada columna a su ritmo.
    float col = floor(vUv.x * 26.0);
    float fase = hash(col * 3.1);
    float y = fract(vUv.y + uTiempo * (0.15 + fase * 0.25) + fase * 9.0);
    float gota = smoothstep(0.035, 0.0, abs(fract(vUv.x * 26.0) - 0.5) * 0.06) * smoothstep(0.0, 0.06, y) * smoothstep(0.2, 0.06, y);
    a += gota * 0.5 * uLluvia * step(0.35, hash(col * 7.7));
    // Desde fuera, de noche o con lluvia, la luz cálida de dentro.
    if (gl_FrontFacing) { c = mix(c, vec3(1.0, 0.72, 0.38), uCalido); a = mix(a, 0.85, uCalido); }
    gl_FragColor = vec4(c, a);
  }`;
const HUMO_VERTICE = /* glsl */ `
  uniform float uTiempo;
  attribute float aFase;
  varying float vA;
  void main() {
    float vida = fract(uTiempo * 0.12 + aFase);
    vec3 p = position + vec3(sin(aFase * 30.0 + vida * 4.0) * 0.4 + vida * 1.5, vida * 7.0, cos(aFase * 17.0) * 0.3);
    vA = sin(vida * 3.14159) * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (400.0 + vida * 900.0) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const HUMO_FRAGMENTO = /* glsl */ `
  varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.85), smoothstep(0.5, 0.0, d) * vA); }`;

/**
 * @param {{x: number, z: number, cuartos: number, suelo: number}} donde en coordenadas de la zona:
 *   el centro, cuántos cuartos de vuelta (la puerta mira a +z girada tantos cuartos) y la altura del terreno
 */
export function crearCabana(donde) {
  const grupo = new THREE.Group();
  grupo.position.set(donde.x, donde.suelo, donde.z);
  grupo.rotation.y = (donde.cuartos * Math.PI) / 2;
  /** @type {Caja[]} cajas fijas (en coordenadas de la zona) */
  const cajas = [];
  /** @type {Interactivo[]} */
  const interactivos = [];
  /** @param {number} x0 @param {number} x1 @param {number} y0 @param {number} y1 @param {number} z0 @param {number} z1 */
  const solido = (x0, x1, y0, y1, z0, z1) => { cajas.push(colocarCaja({ x0, x1, y0, y1, z0, z1 }, donde.x, donde.suelo, donde.z, donde.cuartos)); };
  /** @param {number} w @param {number} h @param {number} d @param {number} [r] */
  const caja = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.005, h / 2 - 0.005, d / 2 - 0.005));
  /** @param {THREE.Object3D} o */
  const sombra = (o) => { o.castShadow = true; o.receiveShadow = true; return o; };
  /**
   * Una zona de toque invisible (no se pinta, pero el rayo de la E la encuentra): las cosas de
   * listones finos, como una silla, eran difíciles de apuntar (medido: el rayo pasaba entre las patas).
   * @param {THREE.Object3D} padre @param {number} w @param {number} h @param {number} d @param {number} y
   */
  const zonaDeToque = (padre, w, h, d, y) => {
    const z = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    z.position.y = y;
    padre.add(z);
  };
  /** Una pieza: caja redondeada de un material, colocada por su centro. @param {THREE.BufferGeometry} g @param {THREE.Material} m @param {number} x @param {number} y @param {number} z */
  const pieza = (g, m, x, y, z, padre = grupo) => { const o = sombra(new THREE.Mesh(g, m)); o.position.set(x, y, z); padre.add(o); return o; };

  // Tablas de unos 35 cm, tejas de 25, piedra de la chimenea con su veta (texturas.js, en triplanar).
  const madera = triplanar(new THREE.MeshStandardMaterial({ color: "#b07a4f", roughness: 0.8 }), texMadera(), 0.35);
  const maderaOscura = triplanar(new THREE.MeshStandardMaterial({ color: "#7a5236", roughness: 0.85 }), texMadera(), 0.5);
  const maderaClara = triplanar(new THREE.MeshStandardMaterial({ color: "#d4a877", roughness: 0.7 }), texMadera(), 0.45);
  const tejado = triplanar(new THREE.MeshStandardMaterial({ color: "#9a4a3a", roughness: 0.85 }), texTejas(), 0.5);
  const piedra = triplanar(new THREE.MeshStandardMaterial({ color: "#b0a697", roughness: 0.95 }), texPiedra(), 0.6);
  const crema = new THREE.MeshStandardMaterial({ color: "#f1e6d2", roughness: 0.7 });

  // --- base, suelo y porche --------------------------------------------------------------------
  pieza(caja(ANCHO + 0.4, 1.3, FONDO + 0.4, 0.12), piedra, 0, SUELO - 0.7, 0);
  pieza(caja(ANCHO, 0.1, FONDO, 0.04), maderaClara, 0, SUELO - 0.05, 0);
  solido(-ANCHO / 2, ANCHO / 2, -1, SUELO, -FONDO / 2, FONDO / 2);
  pieza(caja(ANCHO, 0.2, 1.9, 0.05), madera, 0, SUELO - 0.1, FONDO / 2 + 0.95);
  solido(-ANCHO / 2, ANCHO / 2, -1, SUELO, FONDO / 2, FONDO / 2 + 1.9);
  pieza(caja(2.2, 0.25, 0.6, 0.05), maderaOscura, 0, 0.125, FONDO / 2 + 2.2);
  solido(-1.1, 1.1, -1, 0.25, FONDO / 2 + 1.9, FONDO / 2 + 2.5);
  for (const x of [-ANCHO / 2 + 0.15, ANCHO / 2 - 0.15]) {
    pieza(caja(0.2, 0.9, 0.2), maderaOscura, x, SUELO + 0.45, FONDO / 2 + 1.75); // la barandilla
    pieza(caja(0.12, 0.1, 1.7), maderaOscura, x, SUELO + 0.85, FONDO / 2 + 0.95);
  }

  // --- paredes (con el hueco de la puerta y dos ventanas) ------------------------------------------
  /** Un trozo de pared, de madera, que además para. @param {number} x0 @param {number} x1 @param {number} y0 @param {number} y1 @param {number} z0 @param {number} z1 */
  const pared = (x0, x1, y0, y1, z0, z1) => {
    pieza(caja(x1 - x0, y1 - y0, z1 - z0, 0.05), madera, (x0 + x1) / 2, SUELO + (y0 + y1) / 2, (z0 + z1) / 2);
    solido(x0, x1, SUELO + y0, SUELO + y1, z0, z1);
  };
  const E = 0.3; // grosor
  const zf = FONDO / 2, xd = ANCHO / 2;
  pared(-xd, xd, 0, ALTO, -zf, -zf + E); // la de atrás (la de la chimenea)
  pared(-xd, -xd + E, 0, ALTO, -zf, zf); // la izquierda
  // La derecha, con ventana.
  pared(xd - E, xd, 0, ALTO, -zf, -1);
  pared(xd - E, xd, 0, ALTO, 0.6, zf);
  pared(xd - E, xd, 0, 1, -1, 0.6);
  pared(xd - E, xd, 2.1, ALTO, -1, 0.6);
  // La de delante: la puerta en medio y una ventana a la derecha.
  pared(-xd, -0.65, 0, ALTO, zf - E, zf);
  pared(-0.65, 0.65, 2.25, ALTO, zf - E, zf);
  pared(0.65, 1.5, 0, ALTO, zf - E, zf);
  pared(1.5, 2.8, 0, 1, zf - E, zf);
  pared(1.5, 2.8, 2.1, ALTO, zf - E, zf);
  pared(2.8, xd, 0, ALTO, zf - E, zf);
  // Troncos en las esquinas y listones abajo y arriba: que se vea cabaña, no caja.
  for (const [x, z] of [[-xd, -zf], [xd, -zf], [-xd, zf], [xd, zf]]) pieza(caja(0.36, ALTO + 0.1, 0.36, 0.12), maderaOscura, x, SUELO + ALTO / 2, z);
  for (const y of [0.12, ALTO - 0.12]) {
    pieza(caja(ANCHO + 0.1, 0.2, 0.12, 0.04), maderaOscura, 0, SUELO + y, zf + 0.04);
    pieza(caja(ANCHO + 0.1, 0.2, 0.12, 0.04), maderaOscura, 0, SUELO + y, -zf - 0.04);
  }
  for (let y = 0.5; y < ALTO; y += 0.5) { // tablas horizontales por fuera, apenas marcadas
    pieza(caja(ANCHO - 0.3, 0.05, 0.04, 0.01), maderaOscura, 0, SUELO + y, -zf - 0.02);
  }

  // --- ventanas: cristal con regueros de lluvia y luz de dentro vista desde fuera -------------------
  const uVidrio = { uTiempo: { value: 0 }, uLluvia: { value: 0 }, uCalido: { value: 0 } };
  const vidrio = new THREE.ShaderMaterial({ uniforms: uVidrio, vertexShader: VIDRIO_VERTICE, fragmentShader: VIDRIO_FRAGMENTO, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  /** @param {number} w @param {number} h @param {THREE.Vector3} pos @param {number} giro */
  const ventana = (w, h, pos, giro) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = giro;
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), vidrio));
    for (const [x, y, ww, hh] of [[0, h / 2, w + 0.16, 0.1], [0, -h / 2, w + 0.2, 0.12], [-w / 2, 0, 0.1, h], [w / 2, 0, 0.1, h], [0, 0, 0.05, h], [0, 0, w, 0.05]]) {
      pieza(caja(ww, hh, 0.12, 0.02), crema, x, y, 0, g);
    }
    // Una jardinera con flores bajo la ventana.
    pieza(caja(w, 0.25, 0.3, 0.05), maderaOscura, 0, -h / 2 - 0.2, 0.2, g);
    const flor = new THREE.MeshStandardMaterial({ color: "#e86d7f", roughness: 0.7 });
    for (let i = 0; i < 6; i++) pieza(new THREE.SphereGeometry(0.09, 8, 6), i % 2 ? flor : new THREE.MeshStandardMaterial({ color: "#ffd166" }), -w / 2 + 0.15 + i * (w - 0.3) / 5, -h / 2 - 0.02, 0.22, g);
    grupo.add(g);
  };
  ventana(1.3, 1.1, new THREE.Vector3(2.15, SUELO + 1.55, zf - E / 2), 0);
  ventana(1.6, 1.1, new THREE.Vector3(xd - E / 2, SUELO + 1.55, -0.2), Math.PI / 2);

  // --- la puerta (con bisagra: se abre hacia dentro) ------------------------------------------------
  const bisagra = new THREE.Group();
  bisagra.position.set(-0.65, SUELO, zf - E / 2);
  grupo.add(bisagra);
  const hoja = pieza(caja(1.3, 2.25, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: "#5d7c55", roughness: 0.8 }), 0.65, 1.125, 0, bisagra);
  pieza(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: "#d4a94a", metalness: 0.6, roughness: 0.35 }), 1.15, 1.05, 0.08, bisagra);
  pieza(new THREE.CircleGeometry(0.2, 16), new THREE.MeshStandardMaterial({ color: "#f0e2c0", side: THREE.DoubleSide }), 0.65, 1.6, 0.06, bisagra); // un ojo de buey
  let puertaAbierta = false;
  let giroPuerta = 0;
  const cajaPuerta = colocarCaja({ x0: -0.65, x1: 0.65, y0: SUELO, y1: SUELO + 2.25, z0: zf - E, z1: zf }, donde.x, donde.suelo, donde.z, donde.cuartos);
  interactivos.push({
    objeto: hoja,
    texto: () => (puertaAbierta ? "E: close the door" : "E: open the door"),
    accion: (a) => { puertaAbierta = !puertaAbierta; a.sonar("puerta"); },
  });

  // --- el tejado a dos aguas, los hastiales y la chimenea con humo ------------------------------------
  const alzada = 1.7, vuelo = 0.5;
  const faldon = Math.hypot(zf + vuelo, alzada);
  const angulo = Math.atan2(alzada, zf + vuelo);
  for (const lado of [1, -1]) {
    const f = pieza(caja(ANCHO + 1, 0.22, faldon + 0.2, 0.08), tejado, 0, SUELO + ALTO + alzada / 2, (lado * (zf + vuelo)) / 2);
    f.rotation.x = lado * angulo;
  }
  // Por dentro, techo de tablas (desde dentro se veían las tejas).
  const faldonDentro = Math.hypot(zf - E, alzada * ((zf - E) / (zf + vuelo)));
  for (const lado of [1, -1]) {
    const t = pieza(caja(ANCHO - 2 * E, 0.06, faldonDentro, 0.02), maderaClara, 0, SUELO + ALTO + alzada / 2 - 0.2, (lado * (zf - E)) / 2);
    t.rotation.x = lado * angulo;
  }
  // Los hastiales (los triángulos bajo el tejado) van en las paredes de los lados: el tejado cae
  // hacia delante y hacia atrás. Se dibujan en XY a lo largo de z y se giran un cuarto de vuelta.
  const hastial = new THREE.Shape();
  hastial.moveTo(-zf, 0);
  hastial.lineTo(zf, 0);
  hastial.lineTo(0, alzada - 0.05);
  const geoHastial = new THREE.ExtrudeGeometry(hastial, { depth: E, bevelEnabled: false });
  for (const x of [-xd, xd - E]) {
    const h = sombra(new THREE.Mesh(geoHastial, madera));
    h.rotation.y = Math.PI / 2;
    h.position.set(x + E, SUELO + ALTO, 0);
    grupo.add(h);
  }
  const chimeneaX = -1.6;
  pieza(caja(1, 5.2, 0.9, 0.08), piedra, chimeneaX, SUELO + 2.6, -zf - 0.2);
  solido(chimeneaX - 0.5, chimeneaX + 0.5, 0, SUELO + 5.2, -zf - 0.65, -zf + 0.25);
  const nh = 18;
  const hPos = new Float32Array(nh * 3), hFase = new Float32Array(nh);
  for (let i = 0; i < nh; i++) { hPos.set([chimeneaX, SUELO + 5.3, -zf - 0.2], i * 3); hFase[i] = i / nh; }
  const hGeo = new THREE.BufferGeometry();
  hGeo.setAttribute("position", new THREE.BufferAttribute(hPos, 3));
  hGeo.setAttribute("aFase", new THREE.BufferAttribute(hFase, 1));
  const uHumo = { uTiempo: { value: 0 } };
  const humo = new THREE.Points(hGeo, new THREE.ShaderMaterial({ uniforms: uHumo, vertexShader: HUMO_VERTICE, fragmentShader: HUMO_FRAGMENTO, transparent: true, depthWrite: false }));
  humo.frustumCulled = false;
  grupo.add(humo);

  // --- dentro: chimenea con fuego, alfombra, sillón, mesita, estantería, cama ------------------------------
  const zc = -zf + E + 0.35; // delante de la pared de atrás
  pieza(caja(2.4, 1.7, 0.7, 0.08), piedra, chimeneaX, SUELO + 0.85, zc);
  pieza(caja(2.7, 0.18, 0.85, 0.05), maderaOscura, chimeneaX, SUELO + 1.75, zc + 0.05); // la repisa
  solido(chimeneaX - 1.2, chimeneaX + 1.2, SUELO, SUELO + 1.7, -zf, zc + 0.35);
  // El marco de la boca: dos jambas y un dintel de madera, y delante el hogar, una losa de piedra.
  for (const dx of [-0.78, 0.78]) pieza(caja(0.3, 1.15, 0.22, 0.05), piedra, chimeneaX + dx, SUELO + 0.575, zc + 0.42);
  pieza(caja(1.95, 0.24, 0.26, 0.05), maderaOscura, chimeneaX, SUELO + 1.24, zc + 0.43);
  pieza(caja(2.3, 0.1, 0.8, 0.04), piedra, chimeneaX, SUELO + 0.05, zc + 0.7);
  solido(chimeneaX - 0.7, chimeneaX + 0.7, SUELO, SUELO + 0.6, zc + 0.35, zc + 0.95); // no se anda por el fuego
  // El fondo de la boca: hollín, y el resplandor del fuego en él (más cuanto más arde).
  const matHueco = new THREE.MeshStandardMaterial({ color: "#120b07", roughness: 1, emissive: "#ff5a1a", emissiveIntensity: 0.05 });
  const hueco = new THREE.Mesh(caja(1.3, 1.0, 0.1, 0.03), matHueco);
  hueco.position.set(chimeneaX, SUELO + 0.6, zc + 0.33);
  grupo.add(hueco);
  // La leña: cuatro troncos en cruz sobre la cama de brasas; la corteza oscura, el corte brillando.
  const corteza = new THREE.MeshStandardMaterial({ color: "#3b2619", roughness: 1, emissive: "#ff4a10", emissiveIntensity: 0 });
  const troncos = new THREE.Group();
  troncos.position.set(chimeneaX, SUELO + 0.1, zc + 0.62);
  grupo.add(troncos);
  for (const [giro, alto, dx] of [[0.35, 0.1, -0.05], [-0.4, 0.1, 0.05], [1.35, 0.22, 0], [-1.2, 0.24, 0.02]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.75, 9), corteza);
    t.rotation.set(0, giro, Math.PI / 2);
    t.position.set(dx, alto, 0);
    troncos.add(t);
  }
  // Las brasas: un montón bajo que respira (ruido que se mueve despacio, del rojo oscuro al naranja).
  const uBrasas = { uTiempo: { value: 0 }, uAvivado: { value: 0 } };
  const brasas = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: uBrasas, vertexShader: BRASAS_VERTICE, fragmentShader: BRASAS_FRAGMENTO }));
  brasas.scale.set(1, 0.28, 0.6);
  brasas.position.set(chimeneaX, SUELO + 0.1, zc + 0.62);
  grupo.add(brasas);
  // Las llamas: tres láminas cruzadas con un shader de llama (ruido que sube, forma de lágrima, del
  // blanco del centro al rojo del borde), sumando luz. Antes eran conos lisos.
  const uLlama = { uTiempo: { value: 0 }, uAvivado: { value: 0 } };
  /** @type {THREE.Mesh[]} */
  const llamas = [];
  for (const [giro, ancho, alto, semilla] of [[0, 1.1, 1.2, 0], [Math.PI / 3, 0.85, 1.0, 3.1], [-Math.PI / 3, 0.9, 1.05, 7.3]]) {
    const g = new THREE.PlaneGeometry(ancho, alto);
    g.translate(0, alto / 2, 0);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { ...uLlama, uSemilla: { value: semilla } }, vertexShader: LLAMA_VERTICE, fragmentShader: LLAMA_FRAGMENTO,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.position.set(chimeneaX, SUELO + 0.12, zc + 0.62);
    m.rotation.y = giro;
    m.renderOrder = 2;
    grupo.add(m);
    llamas.push(m);
  }
  // Chispas: suben girando y se apagan; al avivar el fuego, salen muchas más.
  const NCH = 48;
  const chPos = new Float32Array(NCH * 3), chVida = new Float32Array(NCH).map((_, i) => i / NCH);
  const chispas = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(chPos, 3)),
    new THREE.PointsMaterial({ color: "#ffb24a", size: 0.035, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  chispas.position.set(chimeneaX, SUELO + 0.25, zc + 0.62);
  chispas.frustumCulled = false;
  grupo.add(chispas);
  const fuego = new THREE.PointLight("#ff9147", 6, 10, 1.4);
  fuego.position.set(chimeneaX, SUELO + 0.8, zc + 1.1);
  grupo.add(fuego);
  // Y un resplandor bajo, rojizo, en el suelo y la alfombra.
  const rescoldo = new THREE.PointLight("#ff5a24", 1.5, 3.5, 1.8);
  rescoldo.position.set(chimeneaX, SUELO + 0.25, zc + 0.95);
  grupo.add(rescoldo);
  let avivado = 0;
  interactivos.push({
    objeto: hueco,
    texto: () => "E: stoke the fire",
    accion: (a) => { avivado = 1; a.sonar("chispa"); a.avisar("You stoke the fire: it crackles and sparks fly"); },
  });
  // Una alfombra redonda, en dos tonos.
  const alfombra = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshStandardMaterial({ color: "#9b3d3a", roughness: 1 }));
  alfombra.rotation.x = -Math.PI / 2;
  alfombra.position.set(chimeneaX + 0.2, SUELO + 0.012, -0.5);
  alfombra.receiveShadow = true;
  const ribete = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.4, 40), new THREE.MeshStandardMaterial({ color: "#e0b16a", roughness: 1 }));
  ribete.rotation.x = -Math.PI / 2;
  ribete.position.set(chimeneaX + 0.2, SUELO + 0.016, -0.5);
  grupo.add(alfombra, ribete);
  // El sillón, mirando al fuego.
  const tela = triplanar(new THREE.MeshStandardMaterial({ color: "#c0673e", roughness: 1 }), texTela(), 3);
  const sillon = new THREE.Group();
  sillon.position.set(chimeneaX + 0.2, SUELO, 0.35);
  grupo.add(sillon);
  pieza(caja(1.2, 0.45, 1, 0.14), tela, 0, 0.3, 0, sillon);
  pieza(caja(1.1, 0.18, 0.85, 0.08), new THREE.MeshStandardMaterial({ color: "#e0a36a", roughness: 1 }), 0, 0.6, -0.05, sillon); // el cojín
  pieza(caja(1.2, 0.95, 0.28, 0.14), tela, 0, 0.9, 0.38, sillon);
  for (const x of [-0.55, 0.55]) pieza(caja(0.22, 0.7, 1, 0.1), tela, x, 0.5, 0, sillon);
  solido(chimeneaX + 0.2 - 0.6, chimeneaX + 0.2 + 0.6, SUELO, SUELO + 0.7, -0.15, 0.85);
  const manta = pieza(caja(0.32, 0.035, 0.75, 0.015), new THREE.MeshStandardMaterial({ color: "#6e8f7a", roughness: 1 }), 0.66, 0.82, 0.05, sillon);
  manta.rotation.z = -0.9;
  interactivos.push({
    objeto: sillon,
    texto: () => "E: sit in the armchair",
    asiento: true,
    accion: (a) => a.sentarse(aZona(chimeneaX + 0.2, SUELO + 1.35, 0.3), aZona(chimeneaX, SUELO + 0.9, zc)),
  });
  // La mesita, con la taza.
  const mesa = new THREE.Group();
  mesa.position.set(chimeneaX + 1.35, SUELO, 0.1);
  grupo.add(mesa);
  pieza(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), maderaClara, 0, 0.62, 0, mesa);
  pieza(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 10), maderaOscura, 0, 0.3, 0, mesa);
  solido(chimeneaX + 1.0, chimeneaX + 1.7, SUELO, SUELO + 0.65, -0.25, 0.45);
  const taza = crearTaza();
  taza.grupo.position.set(0, 0.65, 0);
  mesa.add(taza.grupo);
  zonaDeToque(taza.grupo, 0.3, 0.3, 0.3, 0.1);
  interactivos.push({
    objeto: taza.grupo,
    texto: () => (taza.enMano ? "" : "E: take the hot chocolate"),
    accion: (a) => { if (!taza.enMano) a.avisar("Hot chocolate with a marshmallow · click: a sip · E: leave it on the table"); },
  });
  // La estantería con libros, en la pared izquierda.
  const estante = new THREE.Group();
  estante.position.set(-xd + E + 0.25, SUELO, 1.3);
  grupo.add(estante);
  pieza(caja(0.06, 2.2, 1.6, 0.02), maderaOscura, -0.2, 1.1, 0, estante); // el fondo
  for (const z of [-0.78, 0.78]) pieza(caja(0.45, 2.2, 0.06, 0.02), maderaOscura, 0, 1.1, z, estante);
  pieza(caja(0.45, 0.06, 1.6, 0.02), maderaOscura, 0, 2.18, 0, estante);
  solido(-xd + E, -xd + E + 0.5, SUELO, SUELO + 2.2, 0.5, 2.1);
  const tapas = ["#7a3b3b", "#35587a", "#6b7a3b", "#c79a3b", "#5a3b7a", "#3b7a6b"];
  for (let balda = 0; balda < 3; balda++) {
    pieza(caja(0.42, 0.05, 1.5, 0.01), maderaClara, 0.02, 0.45 + balda * 0.6, 0, estante);
    for (let b = 0; b < 9; b++) {
      const alto = 0.3 + ((b * 7 + balda * 3) % 5) * 0.035;
      const libro = pieza(caja(0.3, alto, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: tapas[(b + balda * 2) % tapas.length], roughness: 0.8 }), 0.05, 0.48 + balda * 0.6 + alto / 2, -0.62 + b * 0.155, estante);
      if (b === 8) libro.rotation.x = 0.35;
    }
  }
  // La cama, con su manta de cuadros (dos tonos) y la almohada.
  const cama = new THREE.Group();
  cama.position.set(xd - E - 1.1, SUELO, -zf + E + 1.05);
  grupo.add(cama);
  pieza(caja(2, 0.45, 1.9, 0.08), maderaOscura, 0, 0.23, 0, cama);
  pieza(caja(1.9, 0.25, 1.8, 0.1), crema, 0, 0.55, 0, cama);
  pieza(caja(1.3, 0.1, 1.84, 0.05), new THREE.MeshStandardMaterial({ color: "#7b9e87", roughness: 1 }), 0.28, 0.7, 0, cama);
  pieza(caja(0.4, 0.13, 1.86, 0.04), new THREE.MeshStandardMaterial({ color: "#c7d9c4", roughness: 1 }), 0.28, 0.71, 0, cama);
  pieza(caja(0.45, 0.16, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: "#fbf5ea", roughness: 1 }), -0.68, 0.74, 0, cama);
  solido(xd - E - 2.1, xd - E - 0.1, SUELO, SUELO + 0.7, -zf + E + 0.1, -zf + E + 2);

  // --- el porche: una silla mirando a la poza y un farol junto a la puerta ---------------------------------
  const silla = new THREE.Group();
  silla.position.set(2.3, SUELO, zf + 1.1);
  grupo.add(silla);
  pieza(caja(0.7, 0.08, 0.65, 0.03), maderaClara, 0, 0.5, 0, silla);
  pieza(caja(0.7, 0.8, 0.08, 0.03), maderaClara, 0, 0.92, -0.3, silla);
  for (const [x, z] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]]) pieza(caja(0.07, 0.5, 0.07, 0.02), maderaOscura, x, 0.25, z, silla);
  pieza(caja(0.62, 0.08, 0.58, 0.04), new THREE.MeshStandardMaterial({ color: "#d9a441", roughness: 1 }), 0, 0.57, 0.02, silla); // el cojín
  zonaDeToque(silla, 0.95, 1.4, 0.95, 0.7);
  interactivos.push({
    objeto: silla,
    texto: () => "E: sit on the porch chair",
    asiento: true,
    accion: (a) => a.sentarse(aZona(2.3, SUELO + 1.25, zf + 1.0), aZona(2.3, SUELO + 1.0, zf + 12)),
  });
  const farol = new THREE.Group();
  farol.position.set(0.95, SUELO + 2.05, zf + 0.12);
  grupo.add(farol);
  const luzFarol = new THREE.MeshStandardMaterial({ color: "#fff1d6", emissive: "#ffb454", emissiveIntensity: 1 });
  pieza(caja(0.22, 0.3, 0.22, 0.03), luzFarol, 0, 0, 0.1, farol);
  pieza(new THREE.ConeGeometry(0.2, 0.15, 4), maderaOscura, 0, 0.22, 0.1, farol).rotation.y = Math.PI / 4;
  const luzPorche = new THREE.PointLight("#ffb866", 0, 8, 1.6);
  luzPorche.position.set(0, -0.1, 0.4);
  farol.add(luzPorche);

  /** Un punto de la cabaña (local) en coordenadas de la zona. @param {number} x @param {number} y @param {number} z */
  function aZona(x, y, z) {
    grupo.updateMatrix();
    return new THREE.Vector3(x, y, z).applyMatrix4(grupo.matrix);
  }
  const interior = colocarCaja({ x0: -xd + E, x1: xd - E, y0: 0, y1: SUELO + ALTO + alzada, z0: -zf + E, z1: zf - E }, donde.x, donde.suelo, donde.z, donde.cuartos);
  const cubierta = colocarCaja({ x0: -xd - 0.6, x1: xd + 0.6, y0: 0, y1: SUELO + ALTO + alzada, z0: -zf - 0.6, z1: zf + vuelo + 0.3 }, donde.x, donde.suelo, donde.z, donde.cuartos);

  return {
    grupo,
    interactivos,
    taza,
    /** Lo que para ahora (con la puerta, si está cerrada). */
    cajas() { return puertaAbierta ? cajas : [...cajas, cajaPuerta]; },
    /** ¿Está este punto (de la zona) dentro de la cabaña? @param {number} x @param {number} z */
    dentro(x, z) { return x > interior.x0 && x < interior.x1 && z > interior.z0 && z < interior.z1; },
    /** Lo que tapa el tejado (para que no llueva dentro), en coordenadas de la zona. */
    cubierta,
    /** Dónde está el fuego, en la zona (para oírlo crepitar más cerca). */
    fuego: aZona(chimeneaX, SUELO + 0.6, zc + 0.4),
    /** Dónde aparecer dentro, mirando al fuego (`?zen=...&cabana`). */
    dentroDe: () => ({ pos: aZona(1.2, SUELO + 1.7, 1.6), mirar: aZona(chimeneaX, SUELO + 1, zc) }),
    /** Dónde aparecer fuera, delante del porche, mirando la cabaña (`&cabana=fuera`). */
    fueraDe: () => ({ pos: aZona(4, 1.7, zf + 9), mirar: aZona(0, 2.2, 0) }),
    /** @param {{calido: number, lluvia: number}} p */
    ponerAmbiente(p) {
      uVidrio.uCalido.value = p.calido;
      uVidrio.uLluvia.value = p.lluvia;
      luzFarol.emissiveIntensity = 0.3 + p.calido * 2;
      luzPorche.intensity = p.calido * 6;
    },
    /** @param {number} t @param {number} dt */
    tick(t, dt) {
      uVidrio.uTiempo.value = t;
      uHumo.uTiempo.value = t;
      giroPuerta += ((puertaAbierta ? -1.75 : 0) - giroPuerta) * Math.min(1, dt * 6);
      bisagra.rotation.y = -giroPuerta;
      avivado = Math.max(0, avivado - dt / 5);
      const baile = Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.3 + Math.sin(t * 23) * 0.2;
      fuego.intensity = (4.2 + baile * 1) * (1 + avivado * 0.8);
      rescoldo.intensity = (1.5 + Math.sin(t * 1.7) * 0.3) * (1 + avivado * 0.5);
      uLlama.uTiempo.value = t;
      uLlama.uAvivado.value = avivado;
      uBrasas.uTiempo.value = t;
      uBrasas.uAvivado.value = avivado;
      corteza.emissiveIntensity = 0.12 + (Math.sin(t * 2.3) * 0.5 + 0.5) * 0.1 + avivado * 0.3;
      matHueco.emissiveIntensity = 0.06 + baile * 0.02 + avivado * 0.1;
      llamas.forEach((l, i) => l.scale.set(1, 1 + avivado * 0.45 + Math.sin(t * (4 + i) + i) * 0.05, 1));
      // Las chispas: cada una sube en espiral lo que dura su vida y vuelve a nacer abajo.
      for (let i = 0; i < NCH; i++) {
        chVida[i] += dt * (0.35 + (i % 5) * 0.06) * (1 + avivado * 1.5);
        if (chVida[i] > 1) chVida[i] -= 1;
        const v = chVida[i], vivas = i < NCH * (0.35 + avivado * 0.65); // pocas en calma, todas al avivarlo
        const a = i * 2.4 + v * 5;
        const r = 0.08 + v * 0.18;
        chPos.set(vivas ? [Math.cos(a) * r, v * (1.1 + avivado * 0.6), Math.sin(a) * r * 0.6] : [0, -5, 0], i * 3);
      }
      chispas.geometry.attributes.position.needsUpdate = true;
      taza.tick(t, dt);
    },
  };
}

/**
 * La taza de chocolate caliente con su nube: vapor que sube, y el nivel baja con cada sorbo. Se lleva
 * en la mano (pegada a la cámara) o está en la mesita; al dejarla vacía, se rellena.
 */
function crearTaza() {
  const grupo = new THREE.Group();
  const loza = new THREE.MeshStandardMaterial({ color: "#f4ead9", roughness: 0.45 });
  const perfil = [[0, 0], [0.07, 0], [0.078, 0.02], [0.08, 0.15], [0.085, 0.16], [0.075, 0.16], [0.07, 0.03], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y));
  const cuerpo = new THREE.Mesh(new THREE.LatheGeometry(perfil, 28), loza);
  cuerpo.castShadow = true;
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.013, 8, 18, Math.PI * 1.2), loza);
  asa.position.set(0.085, 0.085, 0);
  asa.rotation.z = -Math.PI * 0.6;
  // Una franja de color, que es lo que hace que una taza sea tuya.
  const franja = new THREE.Mesh(new THREE.CylinderGeometry(0.0805, 0.0805, 0.025, 28, 1, true), new THREE.MeshStandardMaterial({ color: "#c2574a", roughness: 0.5 }));
  franja.position.y = 0.11;
  const chocolate = new THREE.Mesh(new THREE.CircleGeometry(0.071, 28), new THREE.MeshStandardMaterial({ color: "#5a2e1b", roughness: 0.3 }));
  chocolate.rotation.x = -Math.PI / 2;
  const nube = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.045, 0.055, 2, 0.015), new THREE.MeshStandardMaterial({ color: "#fff4f6", roughness: 0.9 }));
  grupo.add(cuerpo, asa, franja, chocolate, nube);
  // El vapor: unas volutas que suben y se van.
  const nv = 10;
  const vPos = new Float32Array(nv * 3), vFase = new Float32Array(nv);
  for (let i = 0; i < nv; i++) { vPos.set([(i % 3 - 1) * 0.02, 0.16, ((i * 7) % 3 - 1) * 0.02], i * 3); vFase[i] = i / nv; }
  const vGeo = new THREE.BufferGeometry();
  vGeo.setAttribute("position", new THREE.BufferAttribute(vPos, 3));
  vGeo.setAttribute("aFase", new THREE.BufferAttribute(vFase, 1));
  const uVapor = { uTiempo: { value: 0 } };
  const vapor = new THREE.Points(vGeo, new THREE.ShaderMaterial({
    uniforms: uVapor, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTiempo; attribute float aFase; varying float vA;
      void main() {
        float vida = fract(uTiempo * 0.35 + aFase);
        vec3 p = position + vec3(sin(aFase * 20.0 + vida * 6.0) * 0.025, vida * 0.3, cos(aFase * 11.0 + vida * 5.0) * 0.02);
        vA = sin(vida * 3.14159) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (30.0 + vida * 60.0) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.0, d) * vA); }`,
  }));
  vapor.frustumCulled = false;
  grupo.add(vapor);

  let nivel = 1;
  let sorbo = -1; // desde cuándo se está dando un sorbo (-1: no)
  let reloj = 0;
  let enMano = false;
  /** @type {THREE.Object3D | null} */
  let mesa = null;
  const enLaMesa = { pos: new THREE.Vector3(), rot: new THREE.Euler() };
  function pintarNivel() {
    const y = 0.035 + nivel * 0.11;
    chocolate.position.y = y;
    chocolate.visible = nivel > 0.02;
    nube.visible = nivel > 0.15;
    vapor.visible = nivel > 0.02;
  }
  pintarNivel();
  return {
    grupo,
    get enMano() { return enMano; },
    get nivel() { return nivel; },
    /** Cogerla: se pega a la cámara, abajo a la derecha. @param {THREE.Camera} camara */
    coger(camara) {
      if (enMano) return;
      mesa = grupo.parent;
      enLaMesa.pos.copy(grupo.position);
      enLaMesa.rot.copy(grupo.rotation);
      camara.add(grupo);
      grupo.position.set(0.24, -0.26, -0.55);
      grupo.rotation.set(0.1, -0.5, 0);
      enMano = true;
    },
    /** Dejarla en su mesita; si estaba vacía, se rellena. @returns {boolean} si se rellenó */
    dejar() {
      if (!enMano || !mesa) return false;
      mesa.add(grupo);
      grupo.position.copy(enLaMesa.pos);
      grupo.rotation.copy(enLaMesa.rot);
      enMano = false;
      sorbo = -1;
      const rellena = nivel < 0.05;
      if (rellena) nivel = 1;
      pintarNivel();
      return rellena;
    },
    /** Un sorbo (si está en la mano y no se está ya bebiendo). @returns {boolean} */
    sorber() {
      if (!enMano || sorbo >= 0 || nivel <= 0.02) return false;
      sorbo = reloj;
      return true;
    },
    /** @param {number} t @param {number} dt */
    tick(t, dt) {
      reloj = t;
      uVapor.uTiempo.value = t;
      nube.position.set(Math.sin(t * 0.8) * 0.018, chocolate.position.y + 0.012 + Math.sin(t * 2.1) * 0.003, Math.cos(t * 0.6) * 0.018);
      nube.rotation.y = t * 0.3;
      if (sorbo >= 0) {
        // Se acerca a la boca, se inclina, y vuelve; a mitad, baja el nivel.
        const k = (t - sorbo) / 1.4;
        const s = Math.sin(Math.min(1, k) * Math.PI);
        grupo.position.set(0.24 - 0.2 * s, -0.26 + 0.12 * s, -0.55 + 0.18 * s);
        grupo.rotation.set(0.1 + 0.95 * s, -0.5 + 0.4 * s, 0);
        if (k >= 0.5 && nivel > 0 && grupo.userData.bebido !== sorbo) {
          nivel = Math.max(0, nivel - 0.34);
          grupo.userData.bebido = sorbo;
          pintarNivel();
        }
        if (k >= 1) sorbo = -1;
      }
      void dt;
    },
  };
}
