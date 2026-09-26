// El holograma de la consola maestra: flota encima del palantír ("la consola maestra encima del
// palantír flotando", uso real) con el resumen de un vistazo: cómo están las cuentas de Anthropic,
// OpenAI y Google DeepMind, cuántos repos tienen algo sin commitear o sin subir y cuántos agentes
// trabajan. Mira siempre hacia la cámara y sube y baja despacio. Clic: la consola entera (maestra.js).
import * as THREE from "three";
import { PROVEEDORES } from "./orquesta.js";
import { fuerzaDeFallo } from "./fallos.js";

/** @typedef {import("./maestra.js").EstadoMaestra} EstadoMaestra */

const ANCHO = 1024;
const ALTO = 440;
const ANCHO_MUNDO = 9; // a 20 m de donde se aparece: con 7,2 la letra quedaba justa
const CIAN = "#6ff3ff";

/** @param {EstadoMaestra | null} e @param {string} [aviso] */
function pintar(e, aviso) {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  const letra = (/** @type {number} */ px, peso = 600) => `${peso} ${px}px "Segoe UI", system-ui, sans-serif`;

  // Cristal cian translúcido, con líneas de barrido: un holograma.
  ctx.fillStyle = "rgba(10, 40, 60, 0.55)";
  ctx.strokeStyle = CIAN;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, ANCHO - 8, ALTO - 8, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(111, 243, 255, 0.05)";
  for (let y = 8; y < ALTO; y += 6) ctx.fillRect(8, y, ANCHO - 16, 2);

  ctx.textBaseline = "top";
  ctx.fillStyle = CIAN;
  ctx.font = letra(40, 800);
  ctx.fillText("MASTER CONSOLE", 36, 26);
  ctx.font = letra(24, 500);
  ctx.fillStyle = "#9fdfe8";
  ctx.textAlign = "right";
  ctx.fillText("click to open · O", ANCHO - 36, 38);
  ctx.textAlign = "left";

  if (!e) {
    ctx.font = letra(34, 500);
    ctx.fillStyle = "#cfefff";
    ctx.fillText(aviso ?? "Connecting…", 36, 120);
  } else {
    // Las tres cuentas, una columna cada una.
    const ids = /** @type {(keyof typeof PROVEEDORES)[]} */ (["claude", "codex", "gemini"]);
    ids.forEach((id, i) => {
      const x = 36 + i * 325;
      const p = PROVEEDORES[id];
      const c = e.cuentas[id];
      const u = e.uso[id];
      ctx.font = letra(24, 600);
      ctx.fillStyle = "#9fdfe8";
      ctx.fillText(p.empresa, x, 96);
      ctx.font = letra(32, 700);
      ctx.fillStyle = "#e8fbff";
      ctx.fillText(p.nombre, x, 126);
      ctx.font = letra(26, 600);
      const bien = c?.instalado && c.sesion;
      ctx.fillStyle = bien ? "#7dffa8" : "#ffb86b";
      ctx.fillText(bien ? `● ${c.plan ? c.plan.toUpperCase() : "signed in"}` : c?.instalado ? "● not signed in" : "● not installed", x, 168);
      ctx.fillStyle = "#cfefff";
      ctx.font = letra(24, 500);
      ctx.fillText(u.trabajando ? `${u.trabajando} working now` : `${u.hoy} today · ${u.minutosHoy} min`, x, 204);
    });
    // Repos y agentes, abajo.
    const sinCommit = e.repos.filter((r) => r.cambios).length;
    const sinSubir = e.repos.filter((r) => r.delante).length;
    const trabajando = e.agentes.filter((a) => a.estado === "trabajando").length;
    const hechos = e.agentes.filter((a) => a.estado === "hecho").length;
    ctx.fillStyle = "rgba(111, 243, 255, 0.35)";
    ctx.fillRect(36, 258, ANCHO - 72, 2);
    ctx.font = letra(32, 700);
    ctx.fillStyle = "#e8fbff";
    ctx.fillText(`${e.repos.length} repos`, 36, 284);
    ctx.font = letra(26, 500);
    ctx.fillStyle = sinCommit ? "#ffb86b" : "#7dffa8";
    ctx.fillText(`${sinCommit} with uncommitted changes`, 36, 330);
    ctx.fillStyle = sinSubir ? "#ffb86b" : "#7dffa8";
    ctx.fillText(`${sinSubir} to push`, 36, 368);
    const errores = (e.fallos ?? []).filter((f) => fuerzaDeFallo(f, Date.now()) > 0).length;
    ctx.fillStyle = errores ? "#ff6b7d" : "#7dffa8";
    ctx.fillText(errores ? `⚠ ${errores} errors this week` : "no errors this week", 36, 404);
    ctx.font = letra(32, 700);
    ctx.fillStyle = "#e8fbff";
    ctx.fillText("Agents", 560, 284);
    ctx.font = letra(26, 500);
    ctx.fillStyle = trabajando ? "#6ff3ff" : "#cfefff";
    ctx.fillText(`${trabajando} working`, 560, 330);
    ctx.fillStyle = "#cfefff";
    ctx.fillText(`${hechos} done, to review`, 560, 368);
  }
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * @param {number} altura dónde flota (encima del anillo de arriba del palantír)
 * @returns {{objeto: THREE.Mesh, actualizar(e: EstadoMaestra | null, aviso?: string): void, tick(t: number, camara: THREE.Camera): void}}
 */
export function crearHolograma(altura) {
  const material = new THREE.MeshBasicMaterial({ map: pintar(null), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const objeto = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO_MUNDO, ANCHO_MUNDO * ALTO / ANCHO), material);
  objeto.position.y = altura;
  objeto.renderOrder = 2;
  const mirar = new THREE.Vector3();
  return {
    objeto,
    actualizar(e, aviso) {
      material.map?.dispose();
      material.map = pintar(e, aviso);
      material.needsUpdate = true;
    },
    tick(t, camara) {
      objeto.position.y = altura + Math.sin(t * 0.7) * 0.15;
      // De cara a la cámara, pero derecho (solo gira en vertical).
      camara.getWorldPosition(mirar);
      mirar.y = objeto.getWorldPosition(new THREE.Vector3()).y;
      objeto.lookAt(mirar);
      material.opacity = 0.9 + Math.sin(t * 3.1) * 0.05; // un parpadeo de holograma, leve
    },
  };
}
