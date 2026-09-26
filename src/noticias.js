// Las noticias del palantír (núcleo puro, probado en Node; tools/noticias.mjs lo usa al descargar).
// Lo que se dice sobre IA en las redes que se dejan leer sin cuenta y al día: Bluesky, Reddit,
// Hacker News y Mastodon. X no: sin pagar su API solo queda el widget de cada perfil, que para
// muchas cuentas trae tuits de hace un año y corta a la tercera petición (medido; fuera, "lo suyo
// es que esté actualizado", uso real). Arriba, los repos de GitHub que más suben este mes.

/** @typedef {"bluesky" | "reddit" | "hn" | "mastodon"} Red */
/**
 * @typedef {{red: Red, fuente: string, autor: string, texto: string, url: string, fecha: string, puntos: number,
 *   id?: string, articulo?: string, lectura?: Lectura}} Publicacion
 *   `fuente`: de dónde (una cuenta, un subreddit, "Hacker News"); `puntos`: lo que valore esa red
 *   (me gusta, votos…), solo comparable dentro de la misma fuente; `fecha`: ISO; `id`: el suyo en
 *   su red (para pedir sus respuestas); `articulo`: la página que enlaza, si enlaza una;
 *   `lectura`: lo que se lee al hacer clic (lo rellena tools/noticias.mjs)
 */
/** @typedef {{t: "h" | "p" | "li" | "cita" | "codigo", x: string}} Bloque un trozo de texto que se lee */
/** @typedef {{autor: string, texto: string, puntos?: number}} Comentario */
/**
 * @typedef {{bloques: Bloque[], comentarios: Comentario[], titulo?: string}} Lectura
 *   `titulo`: el del artículo enlazado, si lo que se lee es él
 */

export const REDES = /** @type {const} */ ({
  bluesky: { nombre: "Bluesky", color: "#1185fe" },
  reddit: { nombre: "Reddit", color: "#ff4500" },
  hn: { nombre: "Hacker News", color: "#ff6600" },
  mastodon: { nombre: "Mastodon", color: "#8c8dff" },
});

const ENTIDADES = /** @type {Record<string, string>} */ ({
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
});

/** Solo las entidades resueltas (&lt; -> <), sin tocar lo demás. @param {string} s */
function limpiarEntidades(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** `{articulo}` solo si es una página web. @param {unknown} url */
const conArticulo = (url) => (typeof url === "string" && /^https?:\/\//.test(url) ? { articulo: url } : {});

/** Texto limpio: sin etiquetas HTML, con las entidades resueltas y los espacios juntos. @param {string} s */
export function limpiarTexto(s) {
  return s
    .replace(/<br\s*\/?>|<\/?p(\s[^>]*)?>/gi, " ") // HN separa párrafos con <p> sin cerrar: "soon.If I"
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m) => limpiarEntidades(m))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bluesky: la respuesta de app.bsky.feed.searchPosts (o de getAuthorFeed, que envuelve cada post).
 * @param {any} json @param {string} fuente
 * @returns {Publicacion[]}
 */
export function deBluesky(json, fuente) {
  /** @type {any[]} */
  const posts = json?.posts ?? (json?.feed ?? []).filter((/** @type {any} */ f) => !f.reason).map((/** @type {any} */ f) => f.post);
  return posts
    // En inglés (o sin idioma declarado): el palantír habla inglés, como el resto del mundo.
    .filter((p) => p?.record?.text && !p.record.reply && (!p.record.langs?.length || p.record.langs.includes("en")))
    .map((p) => ({
      red: /** @type {Red} */ ("bluesky"),
      fuente,
      autor: p.author?.displayName || p.author?.handle || "?",
      texto: limpiarTexto(p.record.text),
      url: `https://bsky.app/profile/${p.author?.handle}/post/${String(p.uri).split("/").pop()}`,
      fecha: new Date(p.record.createdAt ?? p.indexedAt).toISOString(),
      puntos: (p.likeCount ?? 0) + 2 * (p.repostCount ?? 0),
      id: String(p.uri),
      ...conArticulo(p.embed?.external?.uri ?? p.record.embed?.external?.uri),
    }));
}

/**
 * Reddit: el Atom de /r/<sub>/top/.rss?t=day (o de varios juntos, r/a+b/top: una sola petición,
 * que de una en una Reddit corta enseguida con 429, medido). No trae votos, pero viene ordenado por
 * ellos: los puntos salen de la posición (el primero, el que más). El subreddit de cada entrada,
 * de su <category>.
 * @param {string} xml @param {string} sub el subreddit si la entrada no dice el suyo
 * @returns {Publicacion[]}
 */
export function deReddit(xml, sub) {
  const entradas = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entradas.map((e, i) => {
    // El contenido viene como HTML escapado: el texto del post está en su <div class="md">, y un
    // post que enlaza fuera trae "[link]" apuntando a la página.
    const html = limpiarEntidades(/<content[^>]*>([\s\S]*?)<\/content>/.exec(e)?.[1] ?? "");
    const cuerpo = /<div class="md">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    const enlace = /<a href="([^"]+)">\[link\]<\/a>/.exec(html)?.[1];
    return {
    red: /** @type {Red} */ ("reddit"),
    fuente: `r/${/<category term="([^"]+)"/.exec(e)?.[1] ?? sub}`,
    autor: limpiarTexto(/<author>\s*<name>([\s\S]*?)<\/name>/.exec(e)?.[1] ?? "?"),
    texto: limpiarTexto(/<title>([\s\S]*?)<\/title>/.exec(e)?.[1] ?? ""),
    url: /<link href="([^"]+)"/.exec(e)?.[1] ?? "",
    fecha: new Date(/<published>([^<]+)<\/published>/.exec(e)?.[1] ?? /<updated>([^<]+)<\/updated>/.exec(e)?.[1] ?? 0).toISOString(),
    puntos: entradas.length - i,
    ...(cuerpo ? { lectura: { bloques: bloquesDeHtml(cuerpo), comentarios: [] } } : {}),
    ...conArticulo(enlace && !/reddit\.com|redd\.it/.test(enlace) ? enlace : undefined),
    };
  }).filter((p) => p.texto && p.url);
}

/**
 * Hacker News: la búsqueda de Algolia (hn.algolia.com/api/v1/search). El enlace va a la
 * conversación, que es lo "social"; el artículo está a un clic desde ahí.
 * @param {any} json
 * @returns {Publicacion[]}
 */
export function deHN(json) {
  /** @type {any[]} */
  const hits = json?.hits ?? [];
  return hits.filter((h) => h.title).map((h) => ({
    red: /** @type {Red} */ ("hn"),
    fuente: "Hacker News",
    autor: h.author ?? "?",
    texto: limpiarTexto(h.title),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    fecha: new Date((h.created_at_i ?? 0) * 1000).toISOString(),
    puntos: (h.points ?? 0) + (h.num_comments ?? 0),
    id: String(h.objectID),
    ...conArticulo(h.url),
  }));
}

/**
 * Mastodon: la línea de una etiqueta (/api/v1/timelines/tag/<tag>). Sin respuestas ni impulsos.
 * @param {any} json @param {string} fuente
 * @returns {Publicacion[]}
 */
export function deMastodon(json, fuente) {
  /** @type {any[]} */
  const estados = Array.isArray(json) ? json : [];
  return estados
    // Solo en inglés: las etiquetas mezclan idiomas (medido: la mitad de #LLM, en japonés).
    .filter((s) => !s.reblog && !s.in_reply_to_id && s.content && s.language === "en")
    .map((s) => ({
      red: /** @type {Red} */ ("mastodon"),
      fuente,
      autor: s.account?.display_name || s.account?.acct || "?",
      texto: limpiarTexto(s.content),
      url: s.url ?? s.uri,
      fecha: new Date(s.created_at).toISOString(),
      puntos: (s.favourites_count ?? 0) + 2 * (s.reblogs_count ?? 0),
      id: String(s.id),
      ...conArticulo(s.card?.url),
    }));
}

export const HORA = 3600 * 1000;
export const CADUCA_HORAS = 72;

/**
 * Los titulares que se ven. Cada publicación pesa por sus puntos RELATIVOS a lo mejor de su
 * fuente (un me gusta en Mastodon no vale lo mismo que en X) y por lo reciente que es (la mitad
 * cada día y medio, y nada pasados 3 días). Sin repetidas (mismo enlace o mismo principio), sin
 * textos de nada, y como mucho `porRed` de cada red para que haya variedad.
 * @param {Publicacion[]} publicaciones
 * @param {number} ahora ms desde 1970
 * @param {{n?: number, porRed?: number}} [opciones]
 * @returns {Publicacion[]}
 */
export function elegirTitulares(publicaciones, ahora, { n = 12, porRed = 3 } = {}) {
  /** @type {Map<string, number>} */
  const mejorDe = new Map();
  for (const p of publicaciones) mejorDe.set(p.fuente, Math.max(mejorDe.get(p.fuente) ?? 0, p.puntos));
  const pesadas = publicaciones
    .map((p) => {
      const horas = (ahora - Date.parse(p.fecha)) / HORA;
      const relativos = (p.puntos + 1) / ((mejorDe.get(p.fuente) ?? 0) + 1);
      return { p, horas, peso: relativos * Math.pow(0.5, Math.max(0, horas) / 36) };
    })
    .filter(({ p, horas }) => horas <= CADUCA_HORAS && p.texto.length >= 20)
    .sort((a, b) => b.peso - a.peso);

  /** @type {Publicacion[]} */
  const elegidas = [];
  /** @type {Map<Red, number>} */
  const deCadaRed = new Map();
  const vistas = new Set();
  const firma = (/** @type {Publicacion} */ p) => p.texto.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 50);
  const repetida = (/** @type {Publicacion} */ p) => vistas.has(p.url) || vistas.has(firma(p));
  const elegir = (/** @type {Publicacion} */ p) => {
    vistas.add(p.url);
    vistas.add(firma(p));
    deCadaRed.set(p.red, (deCadaRed.get(p.red) ?? 0) + 1);
    elegidas.push(p);
  };
  for (const { p } of pesadas) {
    if (elegidas.length >= n) break;
    if (!repetida(p) && (deCadaRed.get(p.red) ?? 0) < porRed) elegir(p);
  }
  // Si alguna red no llegó (caída, sin nada reciente), se rellena con lo mejor del resto.
  for (const { p } of pesadas) {
    if (elegidas.length >= n) break;
    if (!repetida(p)) elegir(p);
  }
  return elegidas;
}

/**
 * Cuánto hace, corto: "ahora", "12m", "3h", "2d" (en inglés, como el resto del mundo: "now").
 * @param {string} fecha ISO @param {number} ahora ms desde 1970
 */
export function haceCuanto(fecha, ahora) {
  const min = Math.max(0, (ahora - Date.parse(fecha)) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${Math.floor(min)}m`;
  if (min < 48 * 60) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

/** Puntos cortos: 950, 1.2k, 34k. @param {number} n */
export function puntosCortos(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

/**
 * @typedef {{nombre: string, descripcion: string, lenguaje: string, color: string, estrellas: number, estrellasMes: number, url: string, lectura?: Lectura}} Repo
 *   `nombre`: dueño/repo; `estrellasMes`: las ganadas este mes; `color`: el del lenguaje en GitHub;
 *   `lectura`: su README (lo rellena tools/noticias.mjs)
 */

/** "12,345" -> 12345. @param {string | undefined} s */
const numero = (s) => Number((s ?? "0").replace(/[^\d]/g, "")) || 0;

/**
 * GitHub: la página de tendencias del mes (github.com/trending?since=monthly), los repos que más
 * estrellas han ganado en 30 días. No hay API para esto: se lee su HTML, así que si GitHub lo
 * cambia sale vacío (y tools/noticias.mjs se queda con los de la vez anterior). De más a menos.
 * @param {string} html
 * @returns {Repo[]}
 */
export function deTendencias(html) {
  return html.split('<article class="Box-row"').slice(1).map((a) => {
    const nombre = /<h2[^>]*>\s*<a[^>]*href="\/([^"]+)"/.exec(a)?.[1] ?? "";
    return {
      nombre,
      descripcion: limpiarTexto(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/.exec(a)?.[1] ?? ""),
      lenguaje: /itemprop="programmingLanguage">([^<]+)</.exec(a)?.[1] ?? "",
      color: /repo-language-color" style="background-color: (#[0-9a-fA-F]{3,6})/.exec(a)?.[1] ?? "#8b949e",
      estrellas: numero(/\/stargazers"[^>]*>(?:\s|<svg[\s\S]*?<\/svg>)*([\d,]+)/.exec(a)?.[1]),
      estrellasMes: numero(/([\d,]+) stars this month/.exec(a)?.[1]),
      url: `https://github.com/${nombre}`,
    };
  }).filter((r) => r.nombre.includes("/")).sort((a, b) => b.estrellasMes - a.estrellasMes);
}

// --- lo que se lee al hacer clic ---------------------------------------------------------------

export const MAX_LECTURA = 12000; // caracteres por publicación: un artículo largo, no un libro
const MAX_COMENTARIOS = 8;
const MAX_COMENTARIO = 700;

/**
 * Los bloques hasta `max` caracteres; el último que no cabe, cortado con "…".
 * @param {Bloque[]} bloques @param {number} max
 * @returns {Bloque[]}
 */
function recortar(bloques, max) {
  /** @type {Bloque[]} */
  const r = [];
  let quedan = max;
  for (const b of bloques) {
    if (quedan <= 0) break;
    r.push(b.x.length <= quedan ? b : { ...b, x: `${b.x.slice(0, quedan).trimEnd()}…` });
    quedan -= b.x.length;
  }
  return r;
}

// Los botones de compartir y demás restos de la página que vienen como listas ("Share on
// Facebook", "Email", "Comments"): medido, abrían la lectura de un artículo de Mother Jones.
const RESTOS = /^(share( on [\w ]+| this( article| story)?)?|email|e-mail|comments?|print|tweet|copy link|facebook|twitter|x|linkedin|reddit|bluesky|threads|whatsapp|subscribe|sign in|log in|sign up|menu|advertisement|read more)$/i;

/**
 * El texto legible de una página (un artículo): lo de dentro de <article> (o <main>, o <body>), sin
 * menús, cabeceras, pies ni scripts, como títulos, párrafos, listas, citas y código, en su orden.
 * Los párrafos de nada ("Share", "Subscribe") fuera. Sin JavaScript no hay más: una página que se
 * pinta con JS sale vacía, y el lector ofrece abrirla en el navegador.
 * @param {string} html
 * @param {number} [max]
 * @returns {Bloque[]}
 */
export function bloquesDeHtml(html, max = MAX_LECTURA) {
  const cuerpo = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1]
    ?? /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1]
    ?? /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1]
    ?? html;
  const limpio = cuerpo.replace(/<(script|style|nav|header|footer|aside|form|svg|noscript|figure|button)\b[\s\S]*?<\/\1>/gi, "");
  /** @type {Bloque[]} */
  const bloques = [];
  for (const m of limpio.matchAll(/<(h[1-4]|p|li|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const etiqueta = m[1].toLowerCase();
    if (etiqueta === "pre") {
      const codigo = limpiarEntidades(m[2].replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
      if (codigo) bloques.push({ t: "codigo", x: codigo.split("\n").slice(0, 20).join("\n") });
      continue;
    }
    const x = limpiarTexto(m[2]);
    const t = etiqueta.startsWith("h") ? "h" : etiqueta === "li" ? "li" : etiqueta === "blockquote" ? "cita" : "p";
    if (!x || (t === "p" && x.length < 40) || (t === "li" && x.length < 3) || RESTOS.test(x)) continue;
    // Un <p> dentro de un <blockquote> o de un <li> saldría dos veces.
    if (bloques.length && bloques[bloques.length - 1].x.includes(x)) continue;
    bloques.push({ t, x });
  }
  return recortar(bloques, max);
}

/**
 * El texto legible de un README (Markdown): títulos, párrafos, listas, citas y código, sin
 * insignias, imágenes ni HTML; los enlaces, solo su texto.
 * @param {string} md
 * @param {number} [max]
 * @returns {Bloque[]}
 */
export function bloquesDeMarkdown(md, max = MAX_LECTURA) {
  const enLinea = (/** @type {string} */ s) => limpiarTexto(s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // imágenes (e insignias)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // enlaces: su texto
    .replace(/(\*\*|__|`)/g, ""));
  /** @type {Bloque[]} */
  const bloques = [];
  let parrafo = "";
  const cerrar = () => {
    const x = enLinea(parrafo);
    if (x) bloques.push({ t: "p", x });
    parrafo = "";
  };
  const lineas = md.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^\s*```/.test(l)) {
      cerrar();
      const codigo = [];
      for (i++; i < lineas.length && !/^\s*```/.test(lineas[i]); i++) codigo.push(lineas[i]);
      if (codigo.length) bloques.push({ t: "codigo", x: codigo.slice(0, 20).join("\n") });
      continue;
    }
    if (/^\s*<[^>]+>\s*$/.test(l) || /^\s*[-=]{3,}\s*$/.test(l) || /^\s*\|/.test(l)) { cerrar(); continue; } // HTML suelto, rayas, tablas
    const titulo = /^\s*#{1,6}\s+(.*)$/.exec(l);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l);
    const cita = /^\s*>\s?(.*)$/.exec(l);
    if (titulo || item || cita || !l.trim()) cerrar();
    if (titulo) { const x = enLinea(titulo[1]); if (x) bloques.push({ t: "h", x }); }
    else if (item) { const x = enLinea(item[1]); if (x) bloques.push({ t: "li", x }); }
    else if (cita) { const x = enLinea(cita[1]); if (x) bloques.push({ t: "cita", x }); }
    else if (l.trim()) parrafo += ` ${l.trim()}`;
  }
  cerrar();
  return recortar(bloques, max);
}

/** @param {string} texto */
const corto = (texto) => (texto.length > MAX_COMENTARIO ? `${texto.slice(0, MAX_COMENTARIO).trimEnd()}…` : texto);

/**
 * Hacker News: los primeros comentarios de una conversación (hn.algolia.com/api/v1/items/<id>), en
 * el orden en que los da (el de la página); sin borrados.
 * @param {any} item
 * @returns {Comentario[]}
 */
export function comentariosHN(item) {
  /** @type {any[]} */
  const hijos = item?.children ?? [];
  return hijos.filter((c) => c?.text && c.author)
    .slice(0, MAX_COMENTARIOS)
    .map((c) => ({ autor: c.author, texto: corto(limpiarTexto(c.text)) }));
}

/**
 * Bluesky: las respuestas directas a un post (app.bsky.feed.getPostThread), las más votadas primero.
 * @param {any} hilo
 * @returns {Comentario[]}
 */
export function respuestasBluesky(hilo) {
  /** @type {any[]} */
  const respuestas = hilo?.thread?.replies ?? [];
  return respuestas.map((r) => r?.post).filter((p) => p?.record?.text)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, MAX_COMENTARIOS)
    .map((p) => ({ autor: p.author?.displayName || p.author?.handle || "?", texto: corto(limpiarTexto(p.record.text)), puntos: p.likeCount ?? 0 }));
}

/**
 * Mastodon: las respuestas directas a un estado (/api/v1/statuses/<id>/context), las más
 * marcadas como favoritas primero.
 * @param {any} contexto @param {string} id
 * @returns {Comentario[]}
 */
export function respuestasMastodon(contexto, id) {
  /** @type {any[]} */
  const descendientes = contexto?.descendants ?? [];
  return descendientes.filter((s) => String(s.in_reply_to_id) === id && s.content)
    .sort((a, b) => (b.favourites_count ?? 0) - (a.favourites_count ?? 0))
    .slice(0, MAX_COMENTARIOS)
    .map((s) => ({ autor: s.account?.display_name || s.account?.acct || "?", texto: corto(limpiarTexto(s.content)), puntos: s.favourites_count ?? 0 }));
}

/**
 * Reddit: los comentarios de un post (el Atom de <post>/.rss): la primera entrada es el propio post
 * y el resto, sus comentarios, en el orden de Reddit (los mejores primero).
 * @param {string} xml
 * @returns {Comentario[]}
 */
export function comentariosReddit(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(1).map((m) => m[1])
    .map((e) => ({
      autor: limpiarTexto(/<author>\s*<name>([\s\S]*?)<\/name>/.exec(e)?.[1] ?? "?").replace(/^\/u\//, ""),
      texto: corto(limpiarTexto(limpiarEntidades(/<content[^>]*>([\s\S]*?)<\/content>/.exec(e)?.[1] ?? ""))),
    }))
    .filter((c) => c.texto)
    .slice(0, MAX_COMENTARIOS);
}
