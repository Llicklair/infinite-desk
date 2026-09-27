// El espacio de trabajo en el mundo: al volver, como se dejó (qué guardar y cómo restaurarlo lo
// decide src/espacio.js). Uso real: "que se quede como lo dejaste" (al salir se perdían las
// pantallas y dónde estaban). Se guarda solo tras cada cambio (traer, mover, redimensionar, cambiar
// de grafo, cerrar) y se restaura al entrar: lo que sigue abierto vuelve a su sitio sin el selector
// de N; los repos y las webs cerrados se reabren.
import { espacioParaGuardar, leerEspacio, planDeRestauracion } from "./espacio.js";

/**
 * @typedef {import("./pantallas.js").Pantalla} Pantalla
 * @typedef {import("./grafo3d.js").GrafoExportado} GrafoExportado
 */

/**
 * @param {{
 *   activo: () => boolean, puente: ReturnType<typeof import("./puente.js").crearPuente> | null, pantallas: Pantalla[],
 *   avisar: (t: string) => void, grafoDe: (nombre: string) => GrafoExportado | null,
 *   pantallaNativa: (hwnd: number, titulo: string, origen?: Pantalla["origen"], callado?: boolean) => Promise<Pantalla | null>,
 *   abrirRepoComoPantalla: (g: GrafoExportado, callado?: boolean) => Promise<Pantalla | null>,
 *   abrirComoPantalla: (url: string, nombre: string, callado?: boolean) => Promise<Pantalla | null>,
 * }} m lo del mundo que hace falta; `activo`: dentro del mundo (no en el fondo ni en una demo)
 */
export function crearEspacioDeTrabajo(m) {
  const puente = m.puente;
  let restaurando = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let guardarLuego = null;
  function cambioEnEspacio() {
    if (restaurando || !m.activo()) return;
    if (guardarLuego) clearTimeout(guardarLuego);
    guardarLuego = setTimeout(() => void guardarEspacio(), 1500);
  }
  async function guardarEspacio() {
    if (!puente?.conectado || restaurando) return;
    const programas = new Map((await puente.ventanas()).map((v) => [v.hwnd, v.proceso]));
    const entradas = m.pantallas.filter((p) => p.hwnd !== null).map((p) => ({
      tipo: p.origen.tipo, titulo: p.titulo, repo: p.repo, raiz: p.origen.raiz, url: p.origen.url,
      proceso: programas.get(/** @type {number} */ (p.hwnd)),
      pos: p.objeto.position.toArray(), giro: p.objeto.quaternion.toArray(), escala: p.objeto.scale.x,
    }));
    await puente.espacio(espacioParaGuardar(entradas));
  }
  async function restaurarEspacio() {
    if (!puente?.conectado || !m.activo()) return;
    const entradas = leerEspacio(await puente.espacio());
    if (!entradas.length) return;
    restaurando = true;
    try {
      const plan = planDeRestauracion(entradas, await puente.ventanas(), m.pantallas.flatMap((p) => (p.hwnd === null ? [] : [p.hwnd])));
      let traidas = 0, reabiertas = 0;
      for (const paso of plan) {
        const e = paso.entrada;
        /** @type {Pantalla | null} */
        let p = null;
        if (paso.hacer === "traer" && paso.hwnd !== null) {
          await puente.traer(paso.hwnd);
          p = await m.pantallaNativa(paso.hwnd, e.titulo, { tipo: e.tipo, url: e.url, raiz: e.raiz }, true);
          if (p) traidas++;
        } else if (paso.hacer === "abrirRepo") {
          const g = (window.GB_GRAFOS ?? []).find((x) => x.raiz === e.raiz || x.nombre === e.repo);
          if (g) p = await m.abrirRepoComoPantalla(g, true);
          if (p) reabiertas++;
        } else if (paso.hacer === "abrirWeb" && e.url) {
          p = await m.abrirComoPantalla(e.url, e.titulo, true);
          if (p) reabiertas++;
        }
        if (!p) continue;
        p.objeto.position.fromArray(e.pos);
        p.objeto.quaternion.fromArray(e.giro);
        p.objeto.scale.setScalar(e.escala);
        if (e.repo && p.repo !== e.repo) p.enganchar(m.grafoDe(e.repo));
      }
      if (traidas + reabiertas) m.avisar(`Your workspace is back: ${traidas + reabiertas} screen${traidas + reabiertas === 1 ? "" : "s"}${reabiertas ? ` (${reabiertas} reopened)` : ""}`);
    } finally {
      restaurando = false;
    }
  }
  return { cambio: cambioEnEspacio, restaurar: restaurarEspacio };
}
