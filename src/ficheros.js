// El panel del escritorio (F): lo que hay en el escritorio del usuario, más el Explorador y el
// navegador, para abrirlo con su programa desde el mundo y capturar su ventana como pantalla.
// Lo abre el puente (puente/Escritorio.cs); sin puente, el panel lo dice.

/** @typedef {{nombre: string, ruta: string, tipo: "carpeta" | "programa" | "web" | "fichero"}} Cosa */

const ICONO = { carpeta: "📁", programa: "🚀", web: "🌐", fichero: "📄" };

/**
 * @param {HTMLElement} panel
 * @param {() => import("./puente.js").Puente | null} puente
 * @param {(que: string) => void} alAbrir se abrió algo: toca capturar su ventana (con el gesto del clic)
 * @param {(texto: string) => void} avisar
 * @param {() => void} alCerrar
 */
export function crearPanelFicheros(panel, puente, alAbrir, avisar, alCerrar) {
  const lista = document.createElement("div");
  lista.className = "cosas";
  const cabecera = document.createElement("h2");
  cabecera.textContent = "Escritorio";
  const pie = document.createElement("p");
  pie.textContent = "Clic: se abre con su programa y eliges su ventana en el selector · Esc o F: cerrar";
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
      if (error) avisar(`No se pudo abrir ${nombre}: ${error}`);
      else alAbrir(nombre);
    });
    return b;
  }

  async function abrir() {
    panel.hidden = false;
    const p = puente();
    if (!p?.conectado) {
      lista.replaceChildren(Object.assign(document.createElement("p"), {
        textContent: "Sin puente no se puede abrir nada. Vuelve a entrar desde el clic derecho del escritorio.",
      }));
      return;
    }
    const cosas = await p.escritorio();
    lista.replaceChildren(
      boton("🗂️", "Explorador de archivos", () => p.abrir({ especial: "explorador" })),
      boton("🧭", "Navegador", () => p.abrir({ especial: "navegador" })),
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
