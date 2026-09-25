// Pantallas flotantes: una ventana capturada en vivo, con el grafo de su repo detrás y encima.
import * as THREE from "three";
import { crearGrafo3D } from "./grafo3d.js";
import { rotulo } from "./rotulo.js";
import { hwndDeEtiqueta } from "./puente.js";

const ANCHO_INICIAL = 4;

/** ¿Deja este navegador capturar ventanas aquí? (exige contexto seguro y la API). */
export const puedeCapturar = () => Boolean(window.isSecureContext && navigator.mediaDevices?.getDisplayMedia);

/**
 * Abre el selector del sistema; el usuario elige una ventana.
 *
 * Por defecto Chromium ENFOCA lo que se empieza a capturar: la ventana elegida salta al frente
 * del escritorio y tapa el mundo. `CaptureController.setFocusBehavior` pide que el foco se
 * quede aquí, y la ventana sigue viva detrás (Windows captura ventanas tapadas, no minimizadas).
 */
export async function capturarVentana() {
  /** @type {{setFocusBehavior(f: string): void} | undefined} */
  const controlador = "CaptureController" in window
    ? new (/** @type {any} */ (window).CaptureController)()
    : undefined;
  // Se puede pedir antes de capturar (Chromium reciente) o justo al resolver (más antiguo).
  let enfocado = false;
  try {
    controlador?.setFocusBehavior("no-focus-change");
    enfocado = true;
  } catch { /* se reintenta al resolver */ }
  // Sin `displaySurface: "window"`: era solo la pestaña con la que abre el selector, y en Edge
  // `--app` tumbaba la captura con NotReadableError "Could not start video source".
  const stream = await navigator.mediaDevices.getDisplayMedia(/** @type {any} */ ({
    // 60 si la ventana los da: a 30, un vídeo de 60 fps capturado va a tirones (uso real, YouTube).
    video: { frameRate: { ideal: 60 } },
    audio: false,
    controller: controlador,
    selfBrowserSurface: "exclude", // el propio mundo no se ofrece: sería un espejo infinito
  }));
  if (!enfocado) {
    try { controlador?.setFocusBehavior("no-focus-change"); } catch { /* sin soporte: enfoca */ }
  }
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  // La etiqueta NO es el título: en Edge es `window:<HWND>:0`. El título lo da el puente.
  const etiqueta = stream.getVideoTracks()[0]?.label ?? "";
  return { stream, video, titulo: etiqueta, hwnd: hwndDeEtiqueta(etiqueta) };
}

/**
 * Una "ventana" falsa pintada en un canvas, con el título que se le dé. Recorre el mismo
 * camino que una captura real (stream -> vídeo -> pantalla -> grafo por título) sin pasar
 * por el selector del sistema: sirve para `?vista=demo` y para comprobarlo sin manos.
 * @param {string} titulo
 */
export async function capturaDeDemostracion(titulo) {
  const lienzo = document.createElement("canvas");
  lienzo.width = 1280;
  lienzo.height = 800;
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  // captureStream solo emite fotogramas cuando el canvas CAMBIA: se crea antes de pintar y
  // un cursor que parpadea lo mantiene vivo, como una ventana de verdad.
  const stream = lienzo.captureStream(10);
  const codigo = ["def main():", "    grafo = gb.graph('.')", "    for nodo in grafo:", "        pintar(nodo)", "", "if __name__ == '__main__':", "    main()"];
  const colores = ["#569cd6", "#9cdcfe", "#c586c0", "#dcdcaa", "#ccc", "#c586c0", "#dcdcaa"];
  let cursor = true;
  function pintar() {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, 1280, 800);
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, 1280, 36);
    ctx.fillStyle = "#ccc";
    ctx.font = "18px Consolas, monospace";
    ctx.fillText(titulo, 16, 24);
    ctx.font = "26px Consolas, monospace";
    codigo.forEach((l, i) => {
      ctx.fillStyle = "#858585";
      ctx.fillText(String(i + 1).padStart(3), 16, 90 + i * 40);
      ctx.fillStyle = colores[i];
      ctx.fillText(l, 80, 90 + i * 40);
    });
    if (cursor) {
      ctx.fillStyle = "#aeafad";
      ctx.fillRect(80 + ctx.measureText(codigo[6]).width + 2, 68 + 6 * 40, 3, 28);
    }
    cursor = !cursor;
  }
  pintar();
  const latido = setInterval(pintar, 500);
  stream.getVideoTracks()[0]?.addEventListener("ended", () => clearInterval(latido));
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  return { stream, video, titulo, hwnd: null };
}

/**
 * @param {{stream: MediaStream, video: HTMLVideoElement, titulo: string, hwnd: number | null}} captura
 */
export function crearPantalla(captura) {
  const { stream, video, titulo, hwnd } = captura;
  const objeto = new THREE.Group();

  const textura = new THREE.VideoTexture(video);
  textura.colorSpace = THREE.SRGBColorSpace;
  const lienzo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: textura, toneMapped: false, side: THREE.DoubleSide }),
  );
  const marco = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: "#3a4480", side: THREE.DoubleSide }),
  );
  marco.position.z = -0.02;
  objeto.add(marco, lienzo);
  lienzo.userData.pantalla = true;
  marco.userData.pantalla = true;

  let alto = ANCHO_INICIAL * 9 / 16;
  function medir() {
    if (video.videoWidth) alto = ANCHO_INICIAL * video.videoHeight / video.videoWidth;
    lienzo.scale.set(ANCHO_INICIAL, alto, 1);
    marco.scale.set(ANCHO_INICIAL + 0.12, alto + 0.12, 1);
    colocarAnexos();
  }
  // La ventana capturada puede cambiar de tamaño: la pantalla la sigue.
  video.addEventListener("resize", medir);

  /** @type {import("./grafo3d.js").Grafo3D | null} */
  let grafo3d = null;
  /** @type {THREE.Sprite | null} */
  let etiqueta = null;
  let grafoVisible = true; // V: el grafo encima de la ventana se quita y se pone, sin perder el repo

  function colocarAnexos() {
    if (grafo3d) {
      const radio = ANCHO_INICIAL * 0.42;
      // Detrás y por encima: se ve por encima del borde sin tapar el contenido.
      grafo3d.objeto.position.set(0, alto / 2 + radio * 0.75, -radio * 1.3);
    }
    if (etiqueta) etiqueta.position.set(0, -alto / 2 - 0.3, 0.05);
  }

  const pantalla = {
    objeto,
    titulo,
    /** la ventana real (null en la demo): con el puente se puede entrar a escribir en ella */
    hwnd,
    /** la superficie con la imagen: el ratón se traduce a coordenadas sobre ella */
    lienzo,
    /** @type {string | null} */
    repo: null,
    get grafo3d() { return grafo3d; },
    /**
     * Engancha el grafo de un repo (o lo quita con null).
     * @param {import("./grafo3d.js").GrafoExportado | null} grafo
     */
    enganchar(grafo) {
      if (grafo3d) objeto.remove(grafo3d.objeto);
      if (etiqueta) objeto.remove(etiqueta);
      grafo3d = grafo ? crearGrafo3D(grafo, ANCHO_INICIAL * 0.42) : null;
      pantalla.repo = grafo?.nombre ?? null;
      if (grafo3d) {
        grafo3d.objeto.visible = grafoVisible;
        objeto.add(grafo3d.objeto);
      }
      etiqueta = rotulo([grafo ? grafo.nombre : "no repo", grafo ? titulo : "G to pick a graph"], { alto: 0.22 });
      objeto.add(etiqueta);
      /** @type {THREE.MeshBasicMaterial} */ (marco.material).color.set(grafo ? "#5a6cff" : "#3a4480");
      colocarAnexos();
    },
    /** Quita o vuelve a poner el grafo encima de la ventana; devuelve si queda visible. */
    alternarGrafo() {
      grafoVisible = !grafoVisible;
      if (grafo3d) grafo3d.objeto.visible = grafoVisible;
      return grafoVisible;
    },
    cerrar() {
      for (const t of stream.getTracks()) t.stop();
      textura.dispose();
      objeto.removeFromParent();
    },
    /** @param {() => void} alTerminar la ventana se cerró o se dejó de compartir */
    alTerminar(alTerminar) {
      stream.getVideoTracks()[0]?.addEventListener("ended", alTerminar);
    },
  };
  medir();
  pantalla.enganchar(null);
  return pantalla;
}

/** @typedef {ReturnType<typeof crearPantalla>} Pantalla */
