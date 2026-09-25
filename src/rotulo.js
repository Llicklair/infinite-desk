// Texto dentro del mundo: un sprite con una textura de canvas (siempre mira a la cámara).
import * as THREE from "three";

/**
 * @param {string[]} lineas la primera en grande, el resto pequeñas
 * @param {{alto?: number, color?: string}} [opciones] alto: altura de la primera línea en el mundo
 */
export function rotulo(lineas, opciones = {}) {
  const alto = opciones.alto ?? 1;
  const lienzo = document.createElement("canvas");
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  const grande = 64;
  const pequena = 36;
  const fuente = (/** @type {number} */ px) => `600 ${px}px "Segoe UI", system-ui, sans-serif`;
  ctx.font = fuente(grande);
  let ancho = ctx.measureText(lineas[0]).width;
  ctx.font = fuente(pequena);
  for (const l of lineas.slice(1)) ancho = Math.max(ancho, ctx.measureText(l).width);

  lienzo.width = Math.ceil(ancho + 48);
  lienzo.height = grande + 24 + (lineas.length - 1) * (pequena + 10);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 12;
  lineas.forEach((l, i) => {
    ctx.font = fuente(i === 0 ? grande : pequena);
    ctx.fillStyle = i === 0 ? (opciones.color ?? "#e4e8ff") : "#8d96c8";
    ctx.fillText(l, lienzo.width / 2, i === 0 ? 12 : grande + 20 + (i - 1) * (pequena + 10));
  });

  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false }));
  const escala = alto / grande;
  sprite.scale.set(lienzo.width * escala, lienzo.height * escala, 1);
  return sprite;
}
