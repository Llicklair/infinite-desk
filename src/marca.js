// La capa de marca (tecla B): cómo se vería el mundo con la marca de una empresa, para que decida
// ella ("así se vería con vuestro branding si me decís que sí; con una tecla lo ocultamos", uso
// real). El logo flotando sobre el palantír, en una placa de su color; sus colores en el cielo y en
// el fuego (ambiente.js, paletaConMarca). Todo sale de wallpaper/marca.js (tools/marca.mjs), que no se versiona: la marca es de la empresa. Apagada no
// existe: ni pinta ni gasta.
import * as THREE from "three";

/** @typedef {{nombre: string, colores: string[], logo?: string}} Marca */

/**
 * El logo como textura, del color que se pida: el de la oferta viene en blanco sobre negro, así
 * que la luminosidad de cada píxel es cuánto de logo hay (alfa). Sin logo, su nombre en letra
 * gruesa. Sobre una placa redondeada del color de la marca.
 * @param {Marca} marca @param {() => void} listo cuando la imagen ha cargado (se repinta)
 */
function placaDeLogo(marca, listo) {
  const ancho = 1600;
  const alto = 760;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  const [fondo, tinta] = [marca.colores[0] ?? "#ffffff", marca.colores[1] ?? "#111111"];
  const placa = () => {
    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = fondo;
    ctx.beginPath();
    ctx.roundRect(10, 10, ancho - 20, alto - 20, 60);
    ctx.fill();
  };
  placa();
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  if (!marca.logo) {
    ctx.fillStyle = tinta;
    ctx.font = `800 150px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(marca.nombre, ancho / 2, alto / 2, ancho - 160);
    return textura;
  }
  const img = new Image();
  img.onload = () => {
    // El logo, con su proporción, dentro de la placa con margen.
    const margen = 110;
    const k = Math.min((ancho - 2 * margen) / img.width, (alto - 2 * margen) / img.height);
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const t = /** @type {CanvasRenderingContext2D} */ (tmp.getContext("2d"));
    t.drawImage(img, 0, 0, w, h);
    const px = t.getImageData(0, 0, w, h);
    const c = new THREE.Color(tinta);
    for (let i = 0; i < px.data.length; i += 4) {
      // Blanco = logo, negro = nada: la luminosidad es el alfa, y el color, la tinta de la marca.
      const lum = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3;
      px.data[i] = c.r * 255;
      px.data[i + 1] = c.g * 255;
      px.data[i + 2] = c.b * 255;
      px.data[i + 3] = lum;
    }
    t.putImageData(px, 0, 0);
    placa();
    ctx.drawImage(tmp, (ancho - w) / 2, (alto - h) / 2);
    textura.needsUpdate = true;
    listo();
  };
  img.src = marca.logo;
  return textura;
}

/** Un resplandor radial de un color, que se funde a transparente. @param {string} color */
function resplandor(color) {
  const lienzo = document.createElement("canvas");
  lienzo.width = 256;
  lienzo.height = 256;
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  const c = new THREE.Color(color);
  const rgba = (/** @type {number} */ a) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
  g.addColorStop(0, rgba(0.45));
  g.addColorStop(0.45, rgba(0.18));
  g.addColorStop(1, rgba(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {THREE.Scene} escena
 * @param {{alturaLogo: number}} donde el logo, encima de la consola maestra
 * @returns {{readonly disponible: boolean, readonly activa: boolean, readonly marca: Marca | null, poner(si: boolean): void, tick(t: number, camara: THREE.Camera): void}}
 */
export function crearMarca(escena, donde) {
  /** @type {THREE.Group | null} */
  let grupo = null;
  /** @type {THREE.Mesh | null} */
  let logo = null;
  let activa = false;
  const mira = new THREE.Vector3();

  function construir() {
    const marca = /** @type {Marca} */ (window.INFINITE_DESK_MARCA);
    grupo = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, fog: false });
    material.map = placaDeLogo(marca, () => { material.needsUpdate = true; });
    logo = new THREE.Mesh(new THREE.PlaneGeometry(8, 8 * 760 / 1600), material);
    logo.position.y = donde.alturaLogo;
    // Un resplandor de su color detrás, que se difumina hacia fuera (un disco plano se veía como
    // un plato gris, medido en captura): que se vea que es "lo especial" de la escena.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.MeshBasicMaterial({
      map: resplandor(marca.colores[0] ?? "#ffffff"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.position.z = -0.2;
    logo.add(halo);
    grupo.add(logo);
    escena.add(grupo);
  }

  return {
    get disponible() { return Boolean(window.INFINITE_DESK_MARCA?.nombre); },
    get activa() { return activa; },
    get marca() { return window.INFINITE_DESK_MARCA ?? null; },
    poner(si) {
      if (si && !this.disponible) return;
      if (si && !grupo) construir();
      activa = si;
      if (grupo) grupo.visible = si;
    },
    tick(t, camara) {
      if (!activa || !logo) return;
      logo.position.y = donde.alturaLogo + Math.sin(t * 0.8) * 0.25;
      camara.getWorldPosition(mira);
      mira.y = logo.position.y;
      logo.lookAt(mira);
    },
  };
}
