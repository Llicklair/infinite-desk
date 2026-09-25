// El panel del escritorio (F): lo que hay en el escritorio del usuario, más el Explorador y el
// navegador, para abrirlo con su programa desde el mundo y capturar su ventana como pantalla.
// Lo abre el puente (puente/Escritorio.cs); sin puente, el panel lo dice.

/** @typedef {{nombre: string, ruta: string, tipo: "carpeta" | "programa" | "web" | "fichero"}} Cosa */

const ICONO = { carpeta: "📁", programa: "🚀", web: "🌐", fichero: "📄" };

/**
 * @param {HTMLElement} panel
 * @param {() => import("./puente.js").Puente | null} puente
 * @param {(que: string) => void} alAbrir se abrió algo (su ventana llegará en un momento: se trae con N)
 * @param {(texto: string) => void} avisar
 * @param {() => void} alCerrar
 */
export function crearPanelFicheros(panel, puente, alAbrir, avisar, alCerrar) {
  const lista = document.createElement("div");
  lista.className = "cosas";
  const cabecera = document.createElement("h2");
  cabecera.textContent = "Desktop";
  const pie = document.createElement("p");
  pie.textContent = "Click: it opens in its app; when it's ready, N brings its window in · Esc or F: close";
  panel.replaceChildren(cabecera, lista, pie);

  /** @param {string} icono @param {string} nombre @param {() => Promise<string | null>} abrir */
  function boton(icono, nombre, abrir) {
    const b = document.createElement("button");
    b.innerHTML = `<span class="icono">${icono}</span>`;
    const t = document.createElement("span");
    t.textContent = nombre; // textContent: un nombre de fichero no es HTML
    b.append(t);
    b.addEventListener("click", async () => {
      cerrar();
      const error = await abrir();
      if (error === "cancelled") return; // se cerró el selector de carpetas sin elegir: nada que decir
      if (error) avisar(`Couldn't open ${nombre}: ${error}`);
      else alAbrir(nombre);
    });
    return b;
  }

  async function abrir() {
    panel.hidden = false;
    const p = puente();
    if (!p?.conectado) {
      lista.replaceChildren(Object.assign(document.createElement("p"), {
        textContent: "No bridge, so nothing can be opened. Come back in from the desktop right-click menu.",
      }));
      return;
    }
    const cosas = await p.escritorio();
    lista.replaceChildren(
      boton("🗂️", "File Explorer", () => p.abrir({ especial: "explorador" })),
      boton("🧭", "Browser", () => p.abrir({ especial: "navegador" })),
      // El "Open Folder" de VS Code no se puede usar desde dentro (su diálogo sale fuera de la
      // captura): el puente abre su selector por encima del mundo y la carpeta en un VS Code nuevo.
      boton("📂", "Open a folder in VS Code…", () => p.carpetaEnVSCode()),
      ...cosas.map((c) => boton(ICONO[c.tipo] ?? "📄", c.nombre, () => p.abrir({ ruta: c.ruta }))),
    );
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
