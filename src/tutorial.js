// La tarjeta del tutorial (Settings -> Start the tutorial): arriba a la izquierda, sin quitar el
// ratón al mundo, un paso cada vez (src/guia.js). Mira cada cuarto de segundo qué ha hecho uno y,
// cuando cumple lo que pide el paso, lo marca y pasa al siguiente. Tab salta, Shift+Tab vuelve,
// Retroceso lo cierra.
import { empezarGuia } from "./guia.js";

/**
 * @typedef {Omit<import("./guia.js").Foto, "andado" | "girado">} Estado lo que cuenta el mundo;
 *   lo andado y lo girado lo lleva la tarjeta con la cámara
 */

/**
 * @param {HTMLElement} tarjeta
 * @param {import("three").Camera} camara
 * @param {() => Estado} leerEstado
 */
export function crearTutorial(tarjeta, camara, leerEstado) {
  /** @type {ReturnType<typeof empezarGuia> | null} */
  let guia = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let reloj = null;
  let andado = 0, girado = 0;
  const antes = { pos: camara.position.clone(), dir: camara.getWorldDirection(camara.position.clone()) };
  const dir = camara.position.clone();

  /** @returns {import("./guia.js").Foto} */
  function foto() {
    // Lo andado y girado desde la última mirada; un salto (la zona zen, un teletransporte) no cuenta.
    const d = camara.position.distanceTo(antes.pos);
    if (d < 20) andado += d;
    camara.getWorldDirection(dir);
    girado += dir.angleTo(antes.dir);
    antes.pos.copy(camara.position);
    antes.dir.copy(dir);
    return { ...leerEstado(), andado, girado };
  }

  /** @param {string} etiqueta @param {string} [clase] */
  const el = (etiqueta, clase) => { const e = document.createElement(etiqueta); if (clase) e.className = clase; return e; };

  function pintar() {
    if (!guia) return;
    const p = guia.paso;
    const cabecera = el("div", "cuenta");
    cabecera.textContent = `Tutorial · ${guia.numero + 1} / ${guia.total}`;
    const titulo = el("h2");
    titulo.textContent = p.titulo;
    const texto = el("p");
    texto.textContent = p.texto;
    const teclas = el("ul");
    for (const [tecla, que] of p.teclas) {
      const li = el("li");
      const k = el("kbd");
      k.textContent = tecla;
      li.append(k, ` ${que}`);
      teclas.append(li);
    }
    const pide = el("p", guia.cumplido ? "pide hecho" : "pide");
    pide.textContent = guia.cumplido ? `✓ ${p.pide}` : `→ ${p.pide}`;
    const pie = el("p", "pie");
    pie.textContent = guia.numero === guia.total - 1 ? "Tab: finish · Shift+Tab: back" : "Tab: skip · Shift+Tab: back · Backspace: close";
    tarjeta.replaceChildren(cabecera, titulo, texto, teclas, pide, pie);
  }

  function cerrar() {
    if (reloj) clearInterval(reloj);
    reloj = null;
    guia = null;
    tarjeta.hidden = true;
  }

  /** @param {number} [desde] el paso por el que empezar (`?tutorial=N`, para comprobarlo sin manos) */
  function empezar(desde = 0) {
    andado = 0;
    girado = 0;
    antes.pos.copy(camara.position);
    camara.getWorldDirection(antes.dir);
    guia = empezarGuia(foto());
    for (let i = 0; i < desde && i < guia.total - 1; i++) guia.ir(1, foto());
    tarjeta.hidden = false;
    pintar();
    let estaba = "sigue";
    let numero = 0;
    if (reloj) clearInterval(reloj);
    reloj = setInterval(() => {
      if (!guia) return;
      const r = guia.mirar(foto(), performance.now());
      if (r === "fin") { cerrar(); return; }
      if (r !== estaba || guia.numero !== numero) pintar();
      estaba = r;
      numero = guia.numero;
    }, 250);
  }

  return {
    get activo() { return guia !== null; },
    empezar,
    cerrar,
    /**
     * Las teclas del tutorial (Tab, Shift+Tab, Retroceso). @param {KeyboardEvent} e
     * @returns {boolean} si era suya (y no debe hacer nada más)
     */
    tecla(e) {
      if (!guia) return false;
      if (e.code === "Tab") {
        if (guia.ir(e.shiftKey ? -1 : 1, foto()) === "fin") cerrar();
        else pintar();
        return true;
      }
      if (e.code === "Backspace") { cerrar(); return true; }
      return false;
    },
  };
}
