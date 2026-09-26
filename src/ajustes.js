// El menú de ajustes (P): de momento, la carpeta de proyectos, cuyos repos son las islas. Cada
// máquina tiene la suya (uso real: "en una máquina limpia la ruta puede ser distinta"); el
// puente abre el selector de carpetas del sistema, la guarda en infinite-desk.local.json y rehace
// las islas. Sin puente, `npm run carpeta` hace lo mismo desde la terminal. Y el tutorial, que
// enseña el mundo paso a paso (src/tutorial.js).

/**
 * @param {HTMLElement} panel
 * @param {() => import("./puente.js").Puente | null} puente
 * @param {(texto: string) => void} avisar
 * @param {() => void} alCerrar
 * @param {(() => void) | null} [empezarTutorial]
 */
export function crearPanelAjustes(panel, puente, avisar, alCerrar, empezarTutorial = null) {
  const cabecera = document.createElement("h2");
  cabecera.textContent = "Settings";
  const titulo = document.createElement("h3");
  titulo.textContent = "Projects folder";
  const ruta = document.createElement("code");
  const detalle = document.createElement("p");
  const cambiar = document.createElement("button");
  cambiar.textContent = "Change…";
  const pie = document.createElement("p");
  pie.className = "pie";
  pie.textContent = "Every repo inside this folder is an island · Esc or P: close";
  const tituloTutorial = document.createElement("h3");
  tituloTutorial.textContent = "Tutorial";
  const textoTutorial = document.createElement("p");
  textoTutorial.textContent = "A short guided tour: moving, islands and their graphs, screens, the palantír, the master console and the zen zone. It moves on as you try each thing.";
  const botonTutorial = document.createElement("button");
  botonTutorial.textContent = "Start the tutorial";
  botonTutorial.addEventListener("click", () => {
    cerrar();
    empezarTutorial?.();
  });
  const tutorial = empezarTutorial ? [tituloTutorial, textoTutorial, botonTutorial] : [];
  panel.replaceChildren(cabecera, titulo, ruta, detalle, cambiar, ...tutorial, pie);

  /** @param {import("./puente.js").Carpeta} c */
  function pintar(c) {
    ruta.textContent = c.ruta; // textContent: una ruta no es HTML
    detalle.textContent = `${c.repos} repo${c.repos === 1 ? "" : "s"} with git → ${c.repos} island${c.repos === 1 ? "" : "s"}`;
  }

  cambiar.addEventListener("click", async () => {
    const p = puente();
    if (!p?.conectado) return;
    cambiar.disabled = true;
    cambiar.textContent = "The folder picker is open…";
    const r = await p.elegirCarpeta();
    cambiar.disabled = false;
    cambiar.textContent = "Change…";
    if (typeof r === "string") {
      if (r !== "cancelled") avisar(`Couldn't change the projects folder: ${r}`);
      return;
    }
    pintar(r);
    avisar(`Projects folder: ${r.ruta} · rebuilding the islands (about a minute; keep going)`);
  });

  async function abrir() {
    panel.hidden = false;
    const p = puente();
    const c = p?.conectado ? await p.carpeta() : null;
    cambiar.hidden = !c;
    if (c) pintar(c);
    else {
      ruta.textContent = "";
      detalle.textContent = "No bridge: from a terminal, npm run carpeta chooses it (then npm run grafo).";
    }
  }

  function cerrar() {
    if (panel.hidden) return;
    panel.hidden = true;
    alCerrar();
  }

  return {
    get abierto() { return !panel.hidden; },
    abrir,
    cerrar,
  };
}
