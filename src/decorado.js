// La decoración del mundo: el cielo (degradado, nebulosa y estrellas que titilan), los cristales
// que flotan alrededor de una isla con vida y el faro que se enciende sobre una isla con agentes.
// Todo en shaders o moviendo un grupo entero: el fondo animado pinta siempre, y la CPU se midió
// con lupa (docs/evidencia.md). Nada se descarga: formas de three y ruido calculado.
import * as THREE from "three";

/** @typedef {import("./ambiente.js").Paleta} Paleta */

// El cielo en dos pasos. Lo caro (degradado y nebulosa: ruido fbm por píxel) se HORNEA en un cubo
// de textura cuando cambia la paleta, una vez por minuto; en cada fotograma solo se lee el cubo y
// se añaden las estrellas, que sí titilan. Medido: con la nebulosa en vivo, la GPU del fondo pasaba
// del 11 % al 16 % en una ventana de 1600×900.
const DIRECCION = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w; // siempre al fondo del todo
  }`;

// Ruido de valor en 3D y fbm de 4 octavas: la nebulosa.
const HORNO_FRAGMENTO = /* glsl */ `
  uniform vec3 uCenit;
  uniform vec3 uHorizonte;
  uniform vec3 uNebulosa;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float ruido(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * ruido(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 color = mix(uHorizonte, uCenit, pow(clamp(d.y, 0.0, 1.0), 0.55));
    // Nebulosa: una banda ancha e inclinada, deshilachada por el ruido.
    float banda = exp(-pow((d.y - 0.35 + 0.25 * d.x) * 2.2, 2.0));
    float nube = smoothstep(0.45, 0.85, fbm(d * 2.4)) * banda;
    color += uNebulosa * nube * 0.55;
    // Junto al horizonte y por debajo, solo el color del horizonte, que es el de la niebla: el
    // borde del suelo (que acaba) se funde con el cielo. Si no, se veía como una raya recta.
    color = mix(uHorizonte, color, smoothstep(-0.03, 0.1, d.y));
    // En alfa, cuánta nebulosa hay: tapa un poco las estrellas que tiene detrás.
    gl_FragColor = vec4(color, nube);
  }`;

// Estrellas: una rejilla en la esfera con una estrella al azar por celda; cada una titila a su ritmo.
const CIELO_FRAGMENTO = /* glsl */ `
  uniform samplerCube uFondo;
  uniform float uEstrellas;
  uniform float uTiempo;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 d = normalize(vDir);
    vec4 fondo = textureCube(uFondo, d);
    vec3 color = fondo.rgb;
    vec3 celda = floor(d * 150.0);
    float h = hash(celda);
    if (h > 0.978 && d.y > 0.0) {
      // Dentro de su celda (si se sale, la cortan los bordes y parece una raya) y nunca de menos
      // de ~1,5 píxeles: con un tamaño fijo en ángulo, en pantalla eran motas de un píxel que no
      // se veían ("no se ven las estrellas", uso real). fwidth: cuánto cambia d de un píxel al otro.
      vec3 centro = (celda + 0.5 + (vec3(hash(celda + 1.3), hash(celda + 2.7), hash(celda + 4.1)) - 0.5) * 0.2) / 150.0;
      float dist = distance(d, normalize(centro));
      float pixel = length(fwidth(d));
      float r = max(0.0011 + h * 0.0007, pixel * 1.5);
      float brillo = 1.0 - smoothstep(0.0, r, dist);
      brillo += 0.3 * (1.0 - smoothstep(0.0, min(r * 2.4, 0.0026), dist)); // un halo suave
      float titila = 0.6 + 0.4 * sin(uTiempo * (1.0 + h * 3.0) + h * 60.0);
      color += vec3(0.85, 0.9, 1.0) * brillo * titila * uEstrellas * (1.0 - fondo.a * 0.5) * smoothstep(0.0, 0.07, d.y);
    }
    gl_FragColor = vec4(color, 1.0);
  }`;

/**
 * El cielo: una esfera que sigue a la cámara (así nunca se llega a él).
 * @param {THREE.WebGLRenderer} renderer para hornear el fondo en su cubo
 * @returns {{objeto: THREE.Mesh, paleta(p: Paleta): void, tick(t: number, camara: THREE.Camera): void}}
 */
export function crearCielo(renderer) {
  const horno = {
    uCenit: { value: new THREE.Color() },
    uHorizonte: { value: new THREE.Color() },
    uNebulosa: { value: new THREE.Color() },
  };
  const escenaHorno = new THREE.Scene();
  escenaHorno.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({ uniforms: horno, vertexShader: DIRECCION, fragmentShader: HORNO_FRAGMENTO, side: THREE.BackSide, depthWrite: false }),
  ));
  const cubo = new THREE.WebGLCubeRenderTarget(512);
  const camaraCubo = new THREE.CubeCamera(0.1, 100, cubo);

  const uniformes = { uFondo: { value: cubo.texture }, uEstrellas: { value: 1 }, uTiempo: { value: 0 } };
  const objeto = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: uniformes, vertexShader: DIRECCION, fragmentShader: CIELO_FRAGMENTO,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  );
  objeto.renderOrder = -1;
  objeto.frustumCulled = false;
  return {
    objeto,
    paleta(p) {
      horno.uCenit.value.setRGB(...p.cenit);
      horno.uHorizonte.value.setRGB(...p.horizonte);
      horno.uNebulosa.value.setRGB(...p.nebulosa);
      uniformes.uEstrellas.value = p.estrellas;
      camaraCubo.update(renderer, escenaHorno);
    },
    tick(t, camara) {
      uniformes.uTiempo.value = t;
      objeto.position.copy(camara.position);
    },
  };
}

const octaedro = new THREE.OctahedronGeometry(0.35, 0);

/**
 * Los cristales de una isla: más y más brillantes cuanta más vida tiene su repo (ambiente.js:
 * vidaDeRepo). Un solo InstancedMesh; se anima girando el grupo entero, sin tocar instancias.
 * @param {THREE.Color} color @param {number} vida 0..1
 * @returns {{objeto: THREE.Group, tick(t: number): void}}
 */
export function crearCristales(color, vida) {
  const n = Math.round(3 + vida * 11);
  const material = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.25 + vida * 1.1, roughness: 0.25, metalness: 0.2,
    transparent: true, opacity: 0.45 + vida * 0.5,
  });
  const cristales = new THREE.InstancedMesh(octaedro, material, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  // Deterministas por isla: el mismo repo, los mismos cristales en cada recarga.
  let semilla = n * 9301 + Math.round(vida * 1000);
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + azar() * 0.4;
    const r = 7.8 + azar() * 2.2;
    const escala = 0.6 + azar() * 1.4;
    q.setFromEuler(e.set(azar() * 0.6, azar() * Math.PI, azar() * 0.6));
    m.compose(new THREE.Vector3(Math.cos(a) * r, 1.2 + azar() * 3.5, Math.sin(a) * r), q, new THREE.Vector3(escala * 0.7, escala * 1.6, escala * 0.7));
    cristales.setMatrixAt(i, m);
  }
  const objeto = new THREE.Group();
  objeto.add(cristales);
  const fase = azar() * 10;
  return {
    objeto,
    tick(t) {
      objeto.rotation.y = t * 0.03 + fase;
      objeto.position.y = Math.sin(t * 0.6 + fase) * 0.25;
    },
  };
}

const FARO_VERTICE = /* glsl */ `
  varying float vAlto;
  void main() {
    vAlto = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FARO_FRAGMENTO = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFuerza;
  uniform float uTiempo;
  varying float vAlto;
  void main() {
    // Se desvanece hacia arriba, y le suben pulsos: el agente está trabajando.
    float pulso = 0.55 + 0.45 * sin(vAlto * 40.0 - uTiempo * 3.0);
    float a = uFuerza * pow(1.0 - vAlto, 1.6) * smoothstep(0.0, 0.06, vAlto) * pulso * 0.32;
    gl_FragColor = vec4(uColor * a, a);
  }`;

/**
 * El faro de una isla con agentes trabajando: una columna de luz que se ve desde lejos, del color
 * del agente. Apagado no se pinta.
 * @returns {{objeto: THREE.Mesh, encender(fuerza: number, color: string): void, tick(t: number): void}}
 */
export function crearFaro() {
  const uniformes = { uColor: { value: new THREE.Color() }, uFuerza: { value: 0 }, uTiempo: { value: 0 } };
  const objeto = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 140, 24, 1, true),
    new THREE.ShaderMaterial({
      uniforms: uniformes, vertexShader: FARO_VERTICE, fragmentShader: FARO_FRAGMENTO,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }),
  );
  objeto.position.y = 17 + 70; // nace encima del cartel de la isla: no tapa el grafo
  objeto.visible = false;
  return {
    objeto,
    encender(fuerza, color) {
      uniformes.uFuerza.value = fuerza;
      uniformes.uColor.value.set(color).convertLinearToSRGB(); // el shader pinta sRGB tal cual
      objeto.visible = fuerza > 0.01;
    },
    tick(t) { uniformes.uTiempo.value = t; },
  };
}
