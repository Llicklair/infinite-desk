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
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fuerzaDeCarga, posicionEn, recorrido } from "./lago.js";
import { IMPULSO, caer, deslizar, sueloBajo } from "./andar.js";
import { crearCabana } from "./cabana.js";
import { cesped as texCesped, piedra as texPiedra, triplanar } from "./texturas.js";
import { H_LABIO, RISCO_Z, Z_LABIO, cajasRisco, cima, enRisco, hendidura, mallaRisco, ruido } from "./risco.js";

/** Lejos del anillo de islas: a más distancia que el plano lejano de la cámara, no se ven. */
export const CENTRO_ZEN = new THREE.Vector3(0, 0, -2600);
const R_LAGO = 15;
const OJOS = 1.7;
// El chorro: sale del labio del risco (src/risco.js) y, como agua lanzada en horizontal, cae en arco
// (avanza K_ARCO·√(lo que ha caído)). Donde toca la poza, la espuma y las salpicaduras.
const K_ARCO = 0.55;
const PIE_Z = Z_LABIO + K_ARCO * Math.sqrt(H_LABIO);
const MAX_ONDAS = 16;

/** @typedef {"dia" | "atardecer" | "noche" | "lluvia"} Ambiente */
/**
 * @typedef {{cenit: string, horizonte: string, sol: string, solDir: [number, number, number], estrellas: number, nubes: number,
 *   niebla: string, densidad: number, cieloLuz: string, sueloLuz: string, hemi: number, luz: string, intensidad: number,
 *   hondo: string, somero: string, luciernagas: number, brillo: number, farolillos: number, motas: string, cuantasMotas: number,
 *   exposicion: number, vineta: string, lluvia: number, ventanas: number}} Preset
 *   `farolillos`: cuánto lucen (0-1); `motas`: su color (polen al sol, pétalos al atardecer); `vineta`: el borde de la pantalla;
 *   `lluvia`: cuánto llueve (0-1); `ventanas`: cuánto se ve desde fuera la luz de la cabaña
 */
/** @type {Record<Ambiente, Preset>} */
export const AMBIENTES = {
  dia: {
    cenit: "#4a98e3", horizonte: "#f8e6cc", sol: "#ffe7bd", solDir: [0.7, 0.55, 0.4], estrellas: 0, nubes: 1,
    niebla: "#e9dfca", densidad: 0.004, cieloLuz: "#dcecff", sueloLuz: "#6f9a46", hemi: 1.15, luz: "#ffe2b0", intensidad: 2.6,
    hondo: "#1ba7b8", somero: "#86e8d8", luciernagas: 0, brillo: 1, farolillos: 0.15, motas: "#fff0b3", cuantasMotas: 0.7,
    exposicion: 0.9, vineta: "rgba(90, 55, 20, 0.28)", lluvia: 0, ventanas: 0.1,
  },
  atardecer: {
    cenit: "#34357a", horizonte: "#f5a064", sol: "#ffb46c", solDir: [-0.55, 0.1, -0.8], estrellas: 0.15, nubes: 0.8,
    niebla: "#dc9372", densidad: 0.006, cieloLuz: "#ffc08e", sueloLuz: "#3b4a30", hemi: 1.35, luz: "#ffa060", intensidad: 2,
    hondo: "#1f4f6e", somero: "#7c8fa0", luciernagas: 0.4, brillo: 0.8, farolillos: 0.8, motas: "#ffb6c8", cuantasMotas: 1,
    exposicion: 1, vineta: "rgba(80, 25, 30, 0.35)", lluvia: 0, ventanas: 0.55,
  },
  noche: {
    cenit: "#040817", horizonte: "#172a4d", sol: "#dce6ff", solDir: [0.3, 0.55, -0.75], estrellas: 1, nubes: 0.25,
    niebla: "#0d172a", densidad: 0.009, cieloLuz: "#7c93c8", sueloLuz: "#0c1a12", hemi: 0.8, luz: "#a9bdff", intensidad: 0.75,
    hondo: "#0a2a48", somero: "#1f6a86", luciernagas: 1, brillo: 0.5, farolillos: 1, motas: "#ffffff", cuantasMotas: 0,
    exposicion: 1.25, vineta: "rgba(5, 10, 30, 0.45)", lluvia: 0, ventanas: 1,
  },
  // Lluvia: gris y húmedo fuera, para estar a gusto dentro de la cabaña con el fuego (uso real: "un
  // nuevo modo que es lluvia para estar cozy dentro de la cabaña").
  lluvia: {
    cenit: "#56657a", horizonte: "#95a2af", sol: "#c7d0da", solDir: [0.25, 0.8, 0.3], estrellas: 0, nubes: 1.8,
    niebla: "#8794a2", densidad: 0.013, cieloLuz: "#aab8c6", sueloLuz: "#3b4a37", hemi: 1.05, luz: "#cdd6e0", intensidad: 0.55,
    hondo: "#2a5363", somero: "#4d7c84", luciernagas: 0, brillo: 0.75, farolillos: 0.75, motas: "#ffffff", cuantasMotas: 0,
    exposicion: 1.05, vineta: "rgba(20, 30, 45, 0.4)", lluvia: 1, ventanas: 0.9,
  },
};
export const ORDEN_AMBIENTES = /** @type {Ambiente[]} */ (["dia", "atardecer", "noche", "lluvia"]);

/** La altura del suelo en coordenadas de la zona (la poza, en el origen, a 0). @param {number} x @param {number} z */
export function alturaTerreno(x, z) {
  const r = Math.hypot(x, z);
  const orilla = THREE.MathUtils.smoothstep(r, R_LAGO - 0.5, R_LAGO + 2) * 0.35;
  const lecho = r < R_LAGO - 0.5 ? -1.6 : 0;
  const lomas = Math.max(0, r - 32) * 0.12 + (ruido(x * 0.05, z * 0.05) - 0.5) * 2.2 * THREE.MathUtils.smoothstep(r, 24, 44);
  return lecho + orilla + lomas + (ruido(x * 0.4, z * 0.4) - 0.5) * 0.15;
}

// --- shaders ---------------------------------------------------------------------------------

const CIELO_VERTICE = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }`;
const CIELO_FRAGMENTO = /* glsl */ `
  uniform vec3 uCenit, uHorizonte, uSol;
  uniform vec3 uSolDir;
  uniform float uEstrellas, uNubes, uTiempo;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * ruido(p); p *= 2.02; a *= 0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float y = max(d.y, 0.0);
    vec3 c = mix(uHorizonte, uCenit, pow(y, 0.5));
    if (d.y < 0.0) c = uHorizonte * 0.9;
    float s = max(dot(d, normalize(uSolDir)), 0.0);
    // Nubes blandas, proyectadas en una bóveda, que se mueven despacio.
    vec2 q = d.xz / (d.y + 0.25) * 1.3 + vec2(uTiempo * 0.006, 0.0);
    // Por encima de 1, encapotado: más nubes, más grises, y no se ve el sol.
    float cubierto = max(uNubes - 1.0, 0.0);
    float n = min(1.0, smoothstep(0.52 - cubierto * 0.5, 0.8 - cubierto * 0.25, fbm(q)) * smoothstep(0.02, 0.2, d.y) * min(uNubes, 1.0) + cubierto * 0.3);
    vec3 nube = mix(vec3(1.0), uSol, 0.25) * (0.85 + 0.25 * pow(s, 4.0)) * (1.0 - cubierto * 0.4);
    c = mix(c, nube, n * 0.85);
    c += uSol * (pow(s, 900.0) * 1.5 + pow(s, 10.0) * 0.22) * (1.0 - n * 0.7);
    vec3 celda = floor(d * 220.0);
    float e = hash(celda);
    float titila = 0.6 + 0.4 * sin(uTiempo * (1.0 + e * 3.0) + e * 40.0);
    c += vec3(step(0.997, e) * titila * uEstrellas * smoothstep(0.0, 0.25, d.y) * (1.0 - n));
    gl_FragColor = vec4(c, 1.0);
  }`;

const AGUA_VERTICE = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vMundo;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vMundo = mundo.xyz;
    vec4 mvPosition = viewMatrix * mundo;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const AGUA_FRAGMENTO = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTiempo;
  uniform vec4 uOndas[${MAX_ONDAS}];
  uniform vec3 uHondo, uSomero, uReflejo, uSol, uSolDir;
  uniform float uRadio, uLluvia;
  varying vec3 vMundo;
  varying vec2 vLocal;
  float onda(vec2 p, vec2 o, float edad, float fuerza) {
    if (edad < 0.0 || edad > 7.0) return 0.0;
    float d = length(p - o);
    float frente = edad * 2.3;
    return fuerza * exp(-edad * 0.65) * exp(-pow((d - frente) * 1.5, 2.0)) * sin((d - frente) * 8.0);
  }
  // Una gota de lluvia: un anillo pequeño y rápido. Una por celda, cada una a su ritmo.
  float gotas(vec2 p) {
    float h = 0.0;
    vec2 celda = floor(p / 1.4);
    for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
      vec2 cc = celda + vec2(float(dx), float(dz));
      float r = fract(sin(dot(cc, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 o = (cc + vec2(r, fract(r * 7.13))) * 1.4;
      float edad = fract(uTiempo * 0.8 + r * 5.0) * 1.3;
      float d = length(p - o), f = edad * 1.1;
      h += exp(-edad * 3.0) * exp(-pow((d - f) * 7.0, 2.0)) * sin((d - f) * 24.0);
    }
    return h;
  }
  void main() {
    vec2 p = vec2(vLocal.x, -vLocal.y); // el plano de la malla, girado: el suelo local es (x, -y)
    float h = 0.0;
    for (int i = 0; i < ${MAX_ONDAS}; i++) h += onda(p, uOndas[i].xy, uTiempo - uOndas[i].z, uOndas[i].w);
    vec2 pie = vec2(0.0, ${PIE_Z.toFixed(2)});
    for (int k = 0; k < 3; k++) h += onda(p, pie, mod(uTiempo + float(k) * 0.55, 1.65), 0.35);
    h += 0.05 * sin(p.x * 0.9 + uTiempo * 0.7) * sin(p.y * 1.1 - uTiempo * 0.55);
    if (uLluvia > 0.0) h += gotas(p) * uLluvia * 0.4;
    vec3 P = vec3(p.x, h * 0.35, p.y);
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    if (N.y < 0.0) N = -N;
    vec3 V = normalize(cameraPosition - vMundo);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float borde = smoothstep(uRadio * 0.5, uRadio, length(p));
    vec3 c = mix(uHondo, uSomero, borde);
    // Destellos del fondo claro, como en una poza de piedra (cáusticas baratas).
    float cau = pow(abs(sin(p.x * 1.7 + uTiempo * 0.8 + sin(p.y * 1.3)) * sin(p.y * 1.9 - uTiempo * 0.6 + sin(p.x))), 6.0);
    c += uSomero * cau * 0.25;
    c = mix(c, uReflejo, clamp(fresnel * 0.8, 0.0, 1.0));
    vec3 R = reflect(-V, N);
    c += uSol * pow(max(dot(R, normalize(uSolDir)), 0.0), 80.0) * 1.2;
    float espuma = smoothstep(5.0, 0.0, length(p - pie)) * (0.55 + 0.45 * sin(uTiempo * 6.0 + p.x * 3.0));
    c = mix(c, vec3(0.95, 0.99, 1.0), espuma * 0.6);
    gl_FragColor = vec4(c, 1.0);
    #include <fog_fragment>
  }`;

const CASCADA_VERTICE = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const CASCADA_FRAGMENTO = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTiempo, uVelocidad, uBrillo;
  uniform vec3 uAgua;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float caida = 1.0 - vUv.y; // 0 en el labio, 1 abajo
    // Se acelera al caer: la coordenada a lo largo del chorro va con la raíz de lo caído.
    float s = sqrt(caida) * 3.0 - uTiempo * uVelocidad * 0.35;
    float hebras = ruido(vec2(vUv.x * 26.0, s * 1.1));
    float fino = ruido(vec2(vUv.x * 60.0, s * 4.0 + 3.0));
    float n = hebras * 0.65 + fino * 0.35;
    // Bordes que se deshilachan (más abajo, más).
    float borde = 0.06 + 0.1 * caida * ruido(vec2(s * 2.0, vUv.x * 3.0));
    float bordes = smoothstep(0.0, borde, vUv.x) * smoothstep(1.0, 1.0 - borde, vUv.x);
    float alfa = bordes * (0.55 + 0.45 * n) * (0.75 + 0.25 * step(0.3, fino));
    // Espuma: al romper abajo, y una línea clara en el labio, donde el agua se dobla.
    float espuma = smoothstep(0.72, 1.0, caida) + smoothstep(0.035, 0.0, caida) * 0.6;
    // uBrillo: cuánta luz le da (de noche, poca: si no, parecía un tubo de neón).
    vec3 c = mix(uAgua * 0.85, vec3(0.97, 1.0, 1.0), clamp(pow(n, 1.4) * 0.9 + espuma * 0.7, 0.0, 1.0)) * uBrillo;
    gl_FragColor = vec4(c, clamp(alfa + espuma * 0.25 * bordes, 0.0, 1.0));
    #include <fog_fragment>
  }`;

const PUNTOS_VERTICE = /* glsl */ `
  uniform float uTiempo, uTam;
  attribute float aFase;
  varying float vLuz;
  void main() {
    vec3 p = position + vec3(sin(uTiempo * 0.35 + aFase * 6.0) * 1.6, sin(uTiempo * 0.5 + aFase * 9.0) * 0.6, cos(uTiempo * 0.3 + aFase * 4.0) * 1.6);
    vLuz = 0.5 + 0.5 * sin(uTiempo * (1.2 + aFase) + aFase * 30.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uTam / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const LUCIERNAGA_FRAGMENTO = /* glsl */ `
  uniform float uIntensidad;
  varying float vLuz;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vLuz * uIntensidad;
    gl_FragColor = vec4(vec3(0.75, 1.0, 0.45) * a, a);
  }`;
// La bruma al pie de la cascada: puntos grandes, blancos y muy tenues que suben.
const BRUMA_VERTICE = /* glsl */ `
  uniform float uTiempo;
  attribute float aFase;
  varying float vA;
  void main() {
    float vida = fract(uTiempo * 0.18 + aFase);
    vec3 p = position + vec3(sin(aFase * 20.0 + uTiempo * 0.4) * 1.5, vida * 5.0, cos(aFase * 13.0) * 1.2 + vida * 1.5);
    vA = sin(vida * 3.14159) * 0.22;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = 900.0 / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const SALPICA_VERTICE = /* glsl */ `
  uniform float uTiempo;
  attribute float aFase;
  attribute vec3 aDir;
  varying float vA;
  void main() {
    float vida = fract(uTiempo * 0.9 + aFase);
    vec3 p = position + vec3(aDir.x * vida * 2.4, aDir.y * vida * 3.2 - 4.8 * vida * vida, aDir.z * vida * 2.2);
    vA = (1.0 - vida) * 0.8 * step(0.0, p.y + 0.1);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = 70.0 / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const BRUMA_FRAGMENTO = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.0, d) * vA);
  }`;

// Motas que flotan a la luz: polen dorado de día, pétalos al atardecer. Caen despacio y se mecen.
const MOTAS_VERTICE = /* glsl */ `
  uniform float uTiempo;
  attribute float aFase;
  varying float vA;
  void main() {
    float caida = mod(position.y - uTiempo * (0.25 + aFase * 0.3), 9.0);
    vec3 p = vec3(position.x + sin(uTiempo * 0.5 + aFase * 12.0) * 1.2, caida, position.z + cos(uTiempo * 0.4 + aFase * 7.0) * 1.2);
    vA = smoothstep(0.0, 1.0, caida) * smoothstep(9.0, 7.5, caida);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (40.0 + aFase * 40.0) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const MOTAS_FRAGMENTO = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensidad;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d) * vA * uIntensidad;
    gl_FragColor = vec4(uColor, a);
  }`;

// --- el sonido: el rumor de la cascada y el plop de las piedras (sintetizados, sin ficheros) -----

function crearSonido() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let cascada = null;
  /** @type {GainNode | null} */
  let lluvia = null;
  /** @type {BiquadFilterNode | null} */
  let filtroLluvia = null;
  /** @type {AudioBuffer | null} */
  let ruido = null;
  function preparar() {
    if (ctx) return ctx;
    try { ctx = new AudioContext(); } catch { return null; }
    // Ruido rosado filtrado: agua que cae, de lejos.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const fuente = ctx.createBufferSource();
    fuente.buffer = buf;
    fuente.loop = true;
    const paso = ctx.createBiquadFilter();
    paso.type = "lowpass";
    paso.frequency.value = 1100;
    cascada = ctx.createGain();
    cascada.gain.value = 0;
    fuente.connect(paso).connect(cascada).connect(ctx.destination);
    fuente.start();
    // La lluvia: el mismo ruido, más rápido (más agudo); dentro de la cabaña, amortiguada.
    const fuenteL = ctx.createBufferSource();
    fuenteL.buffer = buf;
    fuenteL.loop = true;
    fuenteL.playbackRate.value = 1.8;
    filtroLluvia = ctx.createBiquadFilter();
    filtroLluvia.type = "lowpass";
    filtroLluvia.frequency.value = 4500;
    lluvia = ctx.createGain();
    lluvia.gain.value = 0;
    fuenteL.connect(filtroLluvia).connect(lluvia).connect(ctx.destination);
    fuenteL.start();
    ruido = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const r = ruido.getChannelData(0);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    return ctx;
  }
  /** Un golpe corto de ruido filtrado (una chispa, un sorbo). @param {number} dur @param {number} vol @param {BiquadFilterType} tipo @param {number} f */
  function golpe(dur, vol, tipo, f) {
    if (!ctx || !ruido) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = ruido;
    const fl = ctx.createBiquadFilter();
    fl.type = tipo;
    fl.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(fl).connect(g).connect(ctx.destination);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur);
  }
  return {
    /** @param {boolean} si */
    ambiente(si) {
      const c = si ? preparar() : ctx;
      if (!c || !cascada) return;
      if (si) void c.resume();
      cascada.gain.cancelScheduledValues(c.currentTime);
      // Bajita, de fondo (uso real: "baja el volumen de la cascada"; con 0,3 tapaba la música).
      cascada.gain.setTargetAtTime(si ? 0.1 : 0, c.currentTime, 0.6);
      if (!si && lluvia) lluvia.gain.setTargetAtTime(0, c.currentTime, 0.4);
    },
    /** @param {number} nivel 0-1 @param {boolean} dentro en la cabaña: más apagada, como en el tejado */
    lluvia(nivel, dentro) {
      if (!ctx || !lluvia || !filtroLluvia) return;
      const t = ctx.currentTime;
      lluvia.gain.setTargetAtTime(nivel * (dentro ? 0.3 : 0.2), t, 0.5);
      filtroLluvia.frequency.setTargetAtTime(dentro ? 650 : 4500, t, 0.3);
    },
    /** El fuego crepita. @param {number} vol */
    chispa(vol) { golpe(0.05 + Math.random() * 0.05, vol, "bandpass", 1800 + Math.random() * 1800); },
    sorbo() { golpe(0.35, 0.05, "lowpass", 700); },
    puerta() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const fl = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(190, t);
      o.frequency.linearRampToValueAtTime(120, t + 0.45);
      fl.type = "lowpass";
      fl.frequency.value = 700;
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      o.connect(fl).connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.5);
    },
    /** El agua al recibir una piedra: grave y redondo si se hunde, corto y agudo si rebota. @param {"bote" | "hundir"} tipo */
    agua(tipo) {
      const c = ctx;
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      const [f0, f1, dur, vol] = tipo === "hundir" ? [520, 150, 0.22, 0.22] : [950, 480, 0.08, 0.1];
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.6);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur * 1.7);
    },
  };
}

// --- la zona ----------------------------------------------------------------------------------

/**
 * @param {THREE.Scene} escena
 * @param {{hemi: THREE.HemisphereLight, sol: THREE.DirectionalLight, niebla: THREE.FogExp2, cieloMundo: THREE.Object3D, renderer: THREE.WebGLRenderer, avisar: (t: string) => void}} mundo
 *   lo del mundo que la zona cambia mientras se está en ella (y devuelve al salir)
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

  // El viento: hojas y hierba se mecen (en el vértice, más cuanto más arriba), todas al mismo compás.
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
  const cojin = sombra(new THREE.Mesh(caja(4.6, 0.35, 1.4, 0.16), new THREE.MeshStandardMaterial({ color: "#9cba74", roughness: 1 })));
  // Y dos cojines pequeños, redondos y blanditos.
  for (const x of [-1.6, 1.4]) {
    const cp = sombra(new THREE.Mesh(caja(0.9, 0.7, 0.3, 0.14), new THREE.MeshStandardMaterial({ color: x < 0 ? "#b5c98a" : "#e8d9b0", roughness: 1 })));
    cp.position.set(x, 0.95, -0.45);
    cp.rotation.x = -0.25;
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

  // Árboles de copa redonda (instanciados): tronco y tres bolas de hojas cada uno.
  const arboles = [];
  for (let i = 0; arboles.length < 34 && i < 400; i++) {
    const a = ruido(i, 41) * Math.PI * 2;
    const d = 20 + ruido(i, 43) * 48;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ((z > 12 && Math.abs(x) < 12) || junto(x, z) || enRisco(x, z)) continue; // la vista desde la llegada, despejada; la cabaña; el risco
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
    if ((z > R_LAGO - 2 && Math.abs(x) < 9) || junto(x, z)) continue; // el patio de llegada y la vista a la cascada
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
    if (junto(x, z)) return false;
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

  // Islotes flotando en el cielo y colinas al fondo, redondos como el resto (uso real: "no me gusta
  // que la cascada tenga bloques apilados"; lo mismo para las torres de losas y las pirámides).
  /**
   * Una bola abollada: cada vértice sale o entra según el ruido de donde está (bultos suaves).
   * @param {number} detalle @param {number} amp @param {number} frec @param {number} semilla
   */
  const bolaAbollada = (detalle, amp, frec, semilla) => {
    // Con los vértices compartidos (el icosaedro los repite por cara): si no, sale facetada.
    const suelta = new THREE.IcosahedronGeometry(1, detalle);
    suelta.deleteAttribute("normal");
    suelta.deleteAttribute("uv");
    const g = mergeVertices(suelta);
    suelta.dispose();
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = ruido(v.x * frec + semilla, v.y * frec + v.z * frec * 0.7) * 0.65 + ruido(v.z * frec * 2.1 + semilla, v.x * frec * 2.1 - v.y) * 0.35;
      v.multiplyScalar(1 + (n - 0.5) * 2 * amp);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  };
  /** @type {THREE.Group[]} */
  const monolitos = [];
  const rocaIslote = triplanar(new THREE.MeshStandardMaterial({ color: "#b3a58f", roughness: 1 }), texPiedra(), 0.25);
  const copaIslote = mecer(new THREE.MeshStandardMaterial({ color: "#6fae4c", roughness: 0.9 }), 0.05, -1.2);
  for (const [x, y, z, s] of [[-45, 38, -90, 1], [55, 44, -110, 1.3], [5, 55, -160, 1.6]]) {
    // Un islote: una roca redonda que cuelga (como una gota), su cojín de césped, una piedra
    // alta y lisa con musgo en la cabeza, y un árbol de copa redonda.
    const g = new THREE.Group();
    const roca = sombra(new THREE.Mesh(bolaAbollada(4, 0.14, 1.6, x), rocaIslote));
    roca.scale.set(6.2, 7.5, 6.2);
    roca.position.y = -1.2;
    const cesped = sombra(new THREE.Mesh(bolaAbollada(3, 0.08, 2, z), musgo));
    cesped.scale.set(6.6, 1.3, 6.6);
    cesped.position.y = 0.1;
    g.add(roca, cesped);
    const alta = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.2 + ruido(x, 1) * 2, 6, 14), tono(x)));
    alta.position.set(-1.8, 2.8, 0.6);
    alta.rotation.z = (ruido(x, 3) - 0.5) * 0.25;
    const gorro = sombra(new THREE.Mesh(bolaAbollada(2, 0.12, 2.5, y), musgo));
    gorro.scale.set(1.2, 0.45, 1.2);
    gorro.position.set(0, 1.6 + ruido(x, 1), 0);
    alta.add(gorro);
    const tronco = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 3, 7), new THREE.MeshStandardMaterial({ color: "#6b4f3a", roughness: 1 })));
    tronco.position.set(2.2, 2, -0.8);
    g.add(alta, tronco);
    for (let k = 0; k < 4; k++) {
      const copa = sombra(new THREE.Mesh(bolaAbollada(2, 0.1, 2, k + x), copaIslote));
      const e = 1.4 + ruido(k, x) * 0.7;
      copa.scale.set(e, e * 0.85, e);
      copa.position.set(2.2 + (ruido(k, 1) - 0.5) * 2.4, 4.4 + ruido(k, 2) * 1.4, -0.8 + (ruido(k, 3) - 0.5) * 2.4);
      g.add(copa);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    monolitos.push(g);
    grupo.add(g);
  }
  // Colinas al fondo: dos filas de lomas redondas; las de delante, verdes, las de atrás, azuladas
  // (la niebla hace el resto).
  /** Las dos filas de colinas; el color lo pone el ambiente (ponerAmbiente). @type {THREE.MeshStandardMaterial[]} */
  const colinas = [];
  for (const [fila, radio, cuantas] of [[0, 150, 9], [1, 210, 8]]) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    colinas.push(mat);
    for (let i = 0; i < cuantas; i++) {
      const a = -Math.PI * 0.92 + (i / (cuantas - 1)) * Math.PI * 0.84 + (ruido(i, 5 + fila) - 0.5) * 0.12;
      const ancho = (fila ? 55 : 38) + ruido(i, 7 + fila) * 30, alto = (fila ? 48 : 26) + ruido(i, 9 + fila) * (fila ? 40 : 20);
      const m = new THREE.Mesh(bolaAbollada(4, 0.08, 1.4, i * 7 + fila), mat);
      m.scale.set(ancho, alto, ancho * 0.8);
      m.position.set(Math.cos(a) * radio, -alto * 0.3, Math.sin(a) * radio);
      m.rotation.y = a;
      grupo.add(m);
    }
  }

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

  // --- la lluvia: rayas que caen alrededor de la cámara (dentro de la cabaña, no) --------------------------
  const NL = 2600;
  const lPosL = new Float32Array(NL * 6), lExt = new Float32Array(NL * 2);
  for (let i = 0; i < NL; i++) {
    const x = (Math.random() - 0.5) * 60, y = Math.random() * 26, z = (Math.random() - 0.5) * 60;
    lPosL.set([x, y, z, x, y, z], i * 6);
    lExt[i * 2 + 1] = 1;
  }
  const geoLluvia = new THREE.BufferGeometry();
  geoLluvia.setAttribute("position", new THREE.BufferAttribute(lPosL, 3));
  geoLluvia.setAttribute("aExtremo", new THREE.BufferAttribute(lExt, 1));
  const uLluvia = {
    uTiempo: { value: 0 }, uIntensidad: { value: 0 }, uCentro: { value: new THREE.Vector2() },
    uTecho: { value: new THREE.Vector4(cabana.cubierta.x0, cabana.cubierta.x1, cabana.cubierta.z0, cabana.cubierta.z1) },
    uAltoTecho: { value: cabana.cubierta.y1 },
  };
  const rayasLluvia = new THREE.LineSegments(geoLluvia, new THREE.ShaderMaterial({
    uniforms: uLluvia, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aExtremo;
      uniform float uTiempo, uIntensidad, uAltoTecho;
      uniform vec2 uCentro;
      uniform vec4 uTecho;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x = uCentro.x + mod(p.x - uCentro.x + 30.0, 60.0) - 30.0;
        p.z = uCentro.y + mod(p.z - uCentro.y + 30.0, 60.0) - 30.0;
        p.y = mod(p.y - uTiempo * 16.0, 26.0) - 1.0 + aExtremo * 0.55;
        p.x += aExtremo * 0.07;
        vA = 0.32 * uIntensidad;
        bool bajoTecho = p.x > uTecho.x && p.x < uTecho.y && p.z > uTecho.z && p.z < uTecho.w && p.y < uAltoTecho;
        if (bajoTecho || uIntensidad <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `varying float vA; void main() { gl_FragColor = vec4(0.78, 0.84, 0.92, vA); }`,
  }));
  rayasLluvia.frustumCulled = false;
  grupo.add(rayasLluvia);

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
      if (sentado) return d?.objeto === cabana.taza.grupo ? `E: take the hot chocolate${levantarse}` : "E or Space: stand up";
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
      } else if (sentado && i?.objeto !== cabana.taza.grupo) {
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
