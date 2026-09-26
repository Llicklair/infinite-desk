// El lector del palantír: al hacer clic en una tarjeta, el post o la noticia entera dentro del
// mundo, sin ir al navegador ("que pueda leer los post o noticias enteros directamente dándole un
// clic desde el mundo", uso real). El post, el artículo que enlaza (su texto), las mejores
// respuestas y, para un repo, su README; todo lo baja tools/noticias.mjs cada 30 minutos, y si
// llega una versión nueva con el lector abierto, se repinta en el sitio (sin perder por dónde se
// iba). Todo lo de fuera se pone como TEXTO (textContent), nunca como HTML: viene de internet.
import { REDES, haceCuanto, puntosCortos } from "./noticias.js";

/** @typedef {import("./palantir.js").Enlace} Enlace */
/** @typedef {import("./palantir.js").Noticias} Noticias */
/** @typedef {import("./noticias.js").Lectura} Lectura */

/**
 * @param {string} etiqueta @param {string} [clase] @param {string} [texto]
 * @returns {HTMLElement}
 */
function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * @param {HTMLElement} panel
 * @param {(enlace: Enlace) => void} abrirEnNavegador
 * @param {() => void} alCerrar
 */
export function crearLector(panel, abrirEnNavegador, alCerrar) {
  /** @type {Enlace | null} */
  let actual = null;

  /** @param {Lectura | undefined} lectura */
  function cuerpo(lectura) {
    const trozos = [];
    /** @type {HTMLElement | null} */
    let lista = null;
    for (const b of lectura?.bloques ?? []) {
      if (b.t === "li") {
        if (!lista) trozos.push((lista = el("ul")));
        lista.append(el("li", undefined, b.x));
        continue;
      }
      lista = null;
      trozos.push(b.t === "h" ? el("h3", undefined, b.x) : b.t === "cita" ? el("blockquote", undefined, b.x) : b.t === "codigo" ? el("pre", undefined, b.x) : el("p", undefined, b.x));
    }
    return trozos;
  }

  /** @param {Enlace} enlace */
  function pintar(enlace) {
    const ahora = Date.now();
    const { publicacion: p, repo: r } = enlace;
    const cabecera = el("div", "cabecera");
    const lectura = p?.lectura ?? r?.lectura;
    if (p) {
      const red = REDES[p.red];
      const insignia = el("span", "insignia", red.nombre);
      insignia.style.color = red.color;
      insignia.style.borderColor = red.color;
      const puntos = p.red === "hn" ? `▲ ${puntosCortos(p.puntos)}` : p.red === "reddit" ? "top today" : `♥ ${puntosCortos(p.puntos)}`;
      cabecera.append(insignia, el("span", "quien", `${p.fuente === red.nombre ? "" : `${p.fuente} · `}${p.autor} · ${haceCuanto(p.fecha, ahora)} · ${puntos}`));
    } else if (r) {
      cabecera.append(el("span", "insignia", "GitHub"), el("span", "quien", `top this month · ★ +${puntosCortos(r.estrellasMes)} (${puntosCortos(r.estrellas)} total)${r.lenguaje ? ` · ${r.lenguaje}` : ""}`));
    }
    const titulo = el("h2", undefined, p ? p.texto : r?.nombre ?? enlace.etiqueta);
    // El título va dentro de lo que se desplaza: en Bluesky o Mastodon es el post entero, y largo.
    const texto = el("div", "texto");
    texto.append(titulo);
    // El texto del post ya está en el título: la lectura empieza por lo que añade (el artículo).
    const bloques = cuerpo(lectura).filter((n, i) => !(i === 0 && p && n.textContent === p.texto));
    if (r?.descripcion) texto.append(el("p", "descripcion", r.descripcion));
    if (lectura?.titulo) texto.append(el("p", "articulo", `🔗 ${lectura.titulo}`));
    texto.append(...bloques);
    if (!bloques.length && !lectura?.comentarios.length) {
      texto.append(el("p", "vacio", "Nothing more to read here (an image or video, or a page that only loads in a browser). Open it in the browser below."));
    }
    const comentarios = lectura?.comentarios ?? [];
    if (comentarios.length) {
      texto.append(el("h3", "respuestas", `Top replies (${comentarios.length})`));
      for (const c of comentarios) {
        const d = el("div", "comentario");
        d.append(el("b", undefined, `${c.autor}${c.puntos ? ` · ♥ ${puntosCortos(c.puntos)}` : ""}`), el("p", undefined, c.texto));
        texto.append(d);
      }
    }
    const pie = el("div", "pie");
    const navegador = el("button", undefined, "Open in the browser (then N brings it in)");
    navegador.addEventListener("click", () => { cerrar(); abrirEnNavegador(enlace); });
    const cerrarB = el("button", undefined, "Close (Esc or click outside)");
    cerrarB.addEventListener("click", () => cerrar());
    pie.append(navegador, cerrarB);
    panel.replaceChildren(cabecera, texto, pie);
  }

  function cerrar() {
    if (panel.hidden) return;
    panel.hidden = true;
    actual = null;
    alCerrar();
  }

  return {
    get abierto() { return !panel.hidden; },
    /** @param {Enlace} enlace */
    abrir(enlace) {
      actual = enlace;
      pintar(enlace);
      panel.hidden = false;
      const texto = panel.querySelector(".texto");
      if (texto) texto.scrollTop = 0;
    },
    cerrar,
    /**
     * Llegaron noticias nuevas: si lo que se está leyendo sigue en ellas, se repinta con lo nuevo
     * (más respuestas, otros puntos), por donde se iba.
     * @param {Noticias | undefined} noticias
     */
    actualizar(noticias) {
      if (!actual || panel.hidden) return;
      const url = actual.url;
      const p = noticias?.titulares.find((t) => t.url === url);
      const r = noticias?.repos?.find((x) => x.url === url);
      if (!p && !r) return; // ya no está en el palantír: se deja lo que había
      const texto = panel.querySelector(".texto");
      const donde = texto?.scrollTop ?? 0;
      actual = { ...actual, publicacion: p, repo: r };
      pintar(actual);
      const nuevo = panel.querySelector(".texto");
      if (nuevo) nuevo.scrollTop = donde;
    },
  };
}
