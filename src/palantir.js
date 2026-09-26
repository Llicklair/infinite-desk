// El palantír: una esfera de cristal oscuro con fuego dentro, en el centro del mundo, entre dos
// carruseles: abajo, a la altura de los ojos, 12 tarjetas con lo último que se dice sobre IA en las
// redes; arriba, los 8 repos de GitHub que más suben este mes (src/noticias.js, tools/noticias.mjs).
// El fuego toma los colores del cielo de la hora (ambiente.js) y se aviva cuando llega algo nuevo.
// Clic en una tarjeta: se abre en el navegador (mundo.js, por el puente) y se trae con N.
import * as THREE from "three";
import { REDES, haceCuanto, puntosCortos } from "./noticias.js";

/** @typedef {import("./noticias.js").Publicacion} Publicacion */
/** @typedef {import("./noticias.js").Repo} Repo */
/** @typedef {import("./ambiente.js").Paleta} Paleta */
/** @typedef {{generado: string, titulares: Publicacion[], repos?: Repo[]}} Noticias */
/**
 * @typedef {{url: string, etiqueta: string, publicacion?: Publicacion, repo?: Repo}} Enlace
 *   lo que abre una tarjeta: su página, cómo se nombra y lo que es (para el lector, src/lector.js)
 */

const RADIO_ESFERA = 1.5;
// Las tarjetas caben sin tocarse (12 × 3,6 < 2π × 8) y miran hacia fuera: solo se leen las de tu
// lado; las de detrás se ven de espaldas, es decir, no se ven (con sprites, todas miraban a la
// cámara y se amontonaban delante de la esfera, medido en captura).
const RADIO_ANILLO = 8;
const ALTURA = 4.4;
const ANCHO_TARJETA = 3.6;
const ALTO_TARJETA = ANCHO_TARJETA * 400 / 1024;
// Los dos anillos, uno por encima y otro por debajo de la esfera: entre ellos se ve el fuego.
const HUECO = RADIO_ESFERA + 0.25 + ALTO_TARJETA / 2;

const ESFERA_VERTICE = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vVista;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vVista = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

// Cristal casi negro con un borde (Fresnel) y, dentro, un fuego que se arremolina: ruido que gira
// despacio sobre sí mismo. Solo cuesta en los píxeles de la esfera, que son pocos.
const ESFERA_FRAGMENTO = /* glsl */ `
  uniform float uTiempo;
  uniform float uDestello;
  uniform vec3 uFuegoOscuro;
  uniform vec3 uFuegoClaro;
  uniform vec3 uBorde;
  varying vec3 vNormal;
  varying vec3 vVista;
  varying vec3 vLocal;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float ruido(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * ruido(p); p *= 2.1; a *= 0.5; }
    return v;
  }

  void main() {
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vVista)), 0.0, 1.0), 2.2);
    // Remolino: el punto gira alrededor del eje vertical más rápido cuanto más cerca del centro.
    vec3 p = vLocal / ${RADIO_ESFERA.toFixed(2)};
    float giro = uTiempo * 0.35 + (1.0 - length(p.xz)) * 2.5;
    p.xz = mat2(cos(giro), -sin(giro), sin(giro), cos(giro)) * p.xz;
    float fuego = fbm(p * 2.2 + vec3(0.0, uTiempo * 0.25, 0.0));
    fuego = smoothstep(0.3, 0.75, fuego) * (1.0 - fresnel * 0.7);
    vec3 color = vec3(0.012, 0.014, 0.03);
    color += mix(uFuegoOscuro, uFuegoClaro, fuego) * fuego * (1.5 + 1.5 * uDestello);
    color += uBorde * fresnel * 0.55;
    gl_FragColor = vec4(color, 1.0);
  }`;

const ANCHO = 1024;
const ALTO = 400;
const letra = (/** @type {number} */ px, peso = 600) => `${peso} ${px}px "Segoe UI", system-ui, sans-serif`;

/** Un lienzo con el marco de una tarjeta, del color de lo que es. @param {string} color */
function marco(color) {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  ctx.fillStyle = "rgba(8, 10, 24, 0.88)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(4, 4, ANCHO - 8, ALTO - 8, 28);
  ctx.fill();
  ctx.stroke();
  ctx.textBaseline = "top";
  return { lienzo, ctx };
}

/**
 * La cabecera: el nombre de la fuente en su color, quién después y, a la derecha, un dato.
 * @param {CanvasRenderingContext2D} ctx @param {string} nombre @param {string} color @param {string} quien @param {string} derecha
 */
function cabecera(ctx, nombre, color, quien, derecha) {
  ctx.font = letra(34, 700);
  ctx.fillStyle = color;
  ctx.fillText(nombre, 36, 28);
  const x = 36 + ctx.measureText(nombre).width;
  ctx.font = letra(32, 500);
  ctx.fillStyle = "#8d96c8";
  ctx.textAlign = "right";
  ctx.fillText(derecha, ANCHO - 36, 30);
  const hueco = ANCHO - 72 - ctx.measureText(derecha).width - (x - 36) - 24;
  ctx.textAlign = "left";
  let texto = quien ? ` · ${quien}` : "";
  while (texto && ctx.measureText(texto).width > hueco) texto = texto.slice(0, -2) + "…";
  ctx.fillText(texto, x, 30);
}

/**
 * Un texto partido en líneas que caben; si no cabe en `maximo`, con puntos suspensivos.
 * @param {CanvasRenderingContext2D} ctx @param {string} texto @param {number} y @param {number} maximo @param {number} interlineado
 */
function parrafo(ctx, texto, y, maximo, interlineado) {
  const cabe = ANCHO - 72;
  /** @type {string[]} */
  const lineas = [];
  let linea = "";
  for (const palabra of texto.split(" ")) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > cabe && linea) {
      lineas.push(linea);
      linea = palabra;
    } else linea = prueba;
  }
  if (linea) lineas.push(linea);
  if (lineas.length > maximo) {
    lineas.length = maximo;
    while (ctx.measureText(`${lineas[maximo - 1]}…`).width > cabe) lineas[maximo - 1] = lineas[maximo - 1].slice(0, -1);
    lineas[maximo - 1] += "…";
  }
  lineas.forEach((l, i) => ctx.fillText(l, 36, y + i * interlineado));
}

/** @param {HTMLCanvasElement} lienzo */
function textura(lienzo) {
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * La tarjeta de una publicación: de qué red y quién, hace cuánto, el texto (hasta 4 líneas) y
 * sus puntos. Un lienzo de 2D pintado una vez; en el mundo, un plano que mira hacia fuera del anillo.
 * @param {Publicacion} p @param {number} ahora
 */
function tarjetaDePublicacion(p, ahora) {
  const red = REDES[p.red];
  const { lienzo, ctx } = marco(red.color);
  cabecera(ctx, red.nombre, red.color, p.fuente === red.nombre ? p.autor : `${p.fuente} · ${p.autor}`, haceCuanto(p.fecha, ahora));
  ctx.font = letra(42, 500);
  ctx.fillStyle = "#e8ebff";
  parrafo(ctx, p.texto, 92, 4, 56);
  ctx.font = letra(30, 600);
  ctx.fillStyle = "#6f78a8";
  ctx.fillText(p.red === "hn" ? `▲ ${puntosCortos(p.puntos)}` : p.red === "reddit" ? "top today" : `♥ ${puntosCortos(p.puntos)}`, 36, ALTO - 60);
  return textura(lienzo);
}

/**
 * La tarjeta de un repo del mes: cuántas estrellas ha ganado, su nombre en grande, qué es y en qué
 * lenguaje está (con el color que le da GitHub).
 * @param {Repo} r
 */
function tarjetaDeRepo(r) {
  const { lienzo, ctx } = marco("#c9d1d9");
  cabecera(ctx, "GitHub", "#f0f6fc", "top this month", `★ +${puntosCortos(r.estrellasMes)}`);
  const [dueno, nombre] = r.nombre.split("/");
  ctx.font = letra(50, 700);
  ctx.fillStyle = "#f0f6fc";
  ctx.fillText(nombre, 36, 86);
  const x = 36 + ctx.measureText(nombre).width;
  ctx.font = letra(32, 500);
  ctx.fillStyle = "#8d96c8";
  ctx.fillText(`  ${dueno}`, x, 102);
  ctx.font = letra(36, 500);
  ctx.fillStyle = "#d4d9f5";
  parrafo(ctx, r.descripcion || "(no description)", 160, 3, 46);
  ctx.font = letra(30, 600);
  if (r.lenguaje) {
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(50, ALTO - 45, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#6f78a8";
  ctx.fillText(`${r.lenguaje ? `${r.lenguaje} · ` : ""}★ ${puntosCortos(r.estrellas)} total`, r.lenguaje ? 72 : 36, ALTO - 60);
  return textura(lienzo);
}

/**
 * @param {number} [escala] 1 en primera persona; en el fondo, mayor cuanto más grande es el
 *   círculo de islas (si no, desde la órbita era una mota en medio)
 * @returns {{
 *   objeto: THREE.Group,
 *   tarjetas: THREE.Mesh[],
 *   actualizar(noticias: Noticias | undefined, ahora: number): void,
 *   enlaceDe(s: THREE.Object3D): Enlace | null,
 *   resaltar(s: THREE.Object3D | null): void,
 *   paleta(p: Paleta): void,
 *   tick(t: number, dt: number): void,
 * }}
 */
export function crearPalantir(escala = 1) {
  const objeto = new THREE.Group();
  objeto.scale.setScalar(escala);
  const piedra = new THREE.MeshStandardMaterial({ color: "#161a30", roughness: 0.7, metalness: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.35, 40), piedra);
  base.position.y = 0.175;
  const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, ALTURA - RADIO_ESFERA - 0.35, 24), piedra);
  columna.position.y = 0.35 + (ALTURA - RADIO_ESFERA - 0.35) / 2;
  // La copa: tres garras que sujetan la esfera por debajo.
  const garras = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const garra = new THREE.Mesh(new THREE.TorusGeometry(RADIO_ESFERA * 0.98, 0.07, 8, 24, Math.PI * 0.42), piedra);
    garra.rotation.set(0, (i / 3) * Math.PI * 2, Math.PI * 1.29);
    garras.add(garra);
  }
  garras.position.y = ALTURA;

  const uniformes = {
    uTiempo: { value: 0 },
    uDestello: { value: 0 },
    uFuegoOscuro: { value: new THREE.Color(0.55, 0.12, 0.03) },
    uFuegoClaro: { value: new THREE.Color(1, 0.62, 0.25) },
    uBorde: { value: new THREE.Color(0.35, 0.42, 0.95) },
  };
  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(RADIO_ESFERA, 64, 32),
    new THREE.ShaderMaterial({ uniforms: uniformes, vertexShader: ESFERA_VERTICE, fragmentShader: ESFERA_FRAGMENTO }),
  );
  esfera.position.y = ALTURA;

  const abajo = new THREE.Group();
  abajo.position.y = ALTURA - HUECO;
  const arriba = new THREE.Group();
  arriba.position.y = ALTURA + HUECO;
  objeto.add(base, columna, garras, esfera, abajo, arriba);

  const plano = new THREE.PlaneGeometry(ANCHO_TARJETA, ALTO_TARJETA);
  /** @type {THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]} */
  const tarjetas = [];
  /** @type {Map<THREE.Object3D, Enlace>} */
  const enlaces = new Map();
  /** @type {Set<string>} */
  let vistas = new Set();
  /** @type {THREE.Object3D | null} */
  let resaltada = null;

  /**
   * Un carrusel: las tarjetas repartidas por el anillo, de cara hacia fuera.
   * @param {THREE.Group} anillo @param {THREE.CanvasTexture[]} texturas @param {Enlace[]} deCada
   */
  function poner(anillo, texturas, deCada) {
    texturas.forEach((map, i) => {
      const s = new THREE.Mesh(plano, new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.FrontSide }));
      const a = (i / texturas.length) * Math.PI * 2;
      s.position.set(Math.sin(a) * RADIO_ANILLO, 0, Math.cos(a) * RADIO_ANILLO);
      s.rotation.y = a; // de cara hacia fuera
      anillo.add(s);
      tarjetas.push(s);
      enlaces.set(s, deCada[i]);
    });
  }

  return {
    objeto,
    tarjetas,
    actualizar(noticias, ahora) {
      for (const s of tarjetas) {
        s.parent?.remove(s);
        s.material.map?.dispose(); // la geometría es de todas: no se toca
        s.material.dispose();
      }
      tarjetas.length = 0;
      enlaces.clear();
      resaltada = null;
      const titulares = noticias?.titulares ?? [];
      const repos = noticias?.repos ?? [];
      poner(abajo, titulares.map((p) => tarjetaDePublicacion(p, ahora)), titulares.map((p) => ({ url: p.url, etiqueta: p.fuente, publicacion: p })));
      poner(arriba, repos.map(tarjetaDeRepo), repos.map((r) => ({ url: r.url, etiqueta: r.nombre, repo: r })));
      // Si hay algo que no estaba, el fuego se aviva (no la primera vez: todo sería nuevo).
      const ahoraVistas = new Set([...titulares, ...repos].map((x) => x.url));
      if (vistas.size && [...ahoraVistas].some((u) => !vistas.has(u))) uniformes.uDestello.value = 1;
      vistas = ahoraVistas;
    },
    enlaceDe(s) {
      return enlaces.get(s) ?? null;
    },
    resaltar(s) {
      if (s === resaltada) return;
      resaltada?.scale.setScalar(1);
      resaltada = s;
      s?.scale.setScalar(1.12);
    },
    // El fuego, del TONO del cielo de la hora: la nebulosa, llevada a toda su intensidad (tal cual
    // es muy oscura y el fuego no se veía, medido en captura), oscura en las brasas y aclarada en
    // las llamas; el borde, entre el cénit y la nebulosa. sRGB tal cual, como el cielo (decorado.js).
    paleta(p) {
      const tope = Math.max(...p.nebulosa, 0.01);
      const [r, g, b] = p.nebulosa.map((c) => c / tope);
      uniformes.uFuegoOscuro.value.setRGB(r * 0.55, g * 0.55, b * 0.55);
      uniformes.uFuegoClaro.value.setRGB(r + (1 - r) * 0.5, g + (1 - g) * 0.5, b + (1 - b) * 0.5);
      const [cr, cg, cb] = p.cenit;
      uniformes.uBorde.value.setRGB(cr + r * 0.45, cg + g * 0.45, cb + b * 0.45);
    },
    tick(t, dt) {
      uniformes.uTiempo.value = t;
      uniformes.uDestello.value = Math.max(0, uniformes.uDestello.value - dt / 4);
      // Quietos mientras se apunta a una tarjeta: que no se escape al ir a hacer clic. Cada
      // anillo en un sentido.
      if (resaltada) return;
      abajo.rotation.y += dt * 0.04;
      arriba.rotation.y -= dt * 0.03;
    },
  };
}
