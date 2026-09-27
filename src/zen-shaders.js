// Los shaders de la zona zen: el cielo, la poza, la cascada, las luciérnagas, la bruma, las
// salpicaduras y las motas.
import { MAX_ONDAS, PIE_Z } from "./zen-medidas.js";

export const CIELO_VERTICE = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }`;
export const CIELO_FRAGMENTO = /* glsl */ `
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

export const AGUA_VERTICE = /* glsl */ `
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
export const AGUA_FRAGMENTO = /* glsl */ `
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

export const CASCADA_VERTICE = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
export const CASCADA_FRAGMENTO = /* glsl */ `
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

export const PUNTOS_VERTICE = /* glsl */ `
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
export const LUCIERNAGA_FRAGMENTO = /* glsl */ `
  uniform float uIntensidad;
  varying float vLuz;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vLuz * uIntensidad;
    gl_FragColor = vec4(vec3(0.75, 1.0, 0.45) * a, a);
  }`;
// La bruma al pie de la cascada: puntos grandes, blancos y muy tenues que suben.
export const BRUMA_VERTICE = /* glsl */ `
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
export const SALPICA_VERTICE = /* glsl */ `
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
export const BRUMA_FRAGMENTO = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.0, d) * vA);
  }`;

// Motas que flotan a la luz: polen dorado de día, pétalos al atardecer. Caen despacio y se mecen.
export const MOTAS_VERTICE = /* glsl */ `
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
export const MOTAS_FRAGMENTO = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensidad;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d) * vA * uIntensidad;
    gl_FragColor = vec4(uColor, a);
  }`;
