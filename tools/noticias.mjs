// npm run noticias: lo último que se dice sobre IA en las redes y los repos de GitHub que más suben
// este mes, para el palantír del mundo. Descarga (sin cuentas ni claves, solo lo público), elige
// 12 titulares y 8 repos (src/noticias.js) y los deja en wallpaper/noticias.js, que el mundo relee
// solo. El puente lo corre cada 30 minutos. Si una fuente falla (caída, límite de peticiones,
// cambió su formato) se sigue con las demás, y se dice cuál. X no está: sin pagar su API no hay
// forma de leerla al día (medido; docs/evidencia.md).
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REDES, bloquesDeHtml, bloquesDeMarkdown, comentariosHN, comentariosReddit, deBluesky, limpiarTexto, deHN, deMastodon, deReddit, deTendencias, elegirTitulares,
  respuestasBluesky, respuestasMastodon,
} from "../src/noticias.js";

/** @typedef {import("../src/noticias.js").Publicacion} Publicacion */
/** @typedef {import("../src/noticias.js").Repo} Repo */
/** @typedef {import("../src/noticias.js").Lectura} Lectura */

const BUSQUEDAS_BLUESKY = ["LLM", "OpenAI", "Anthropic Claude", "Gemini AI", "AI agents"];
const SUBREDDITS = ["LocalLLaMA", "MachineLearning", "singularity", "OpenAI", "ClaudeAI", "artificial"];
const BUSQUEDAS_HN = ["AI", "LLM", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic"];
const ETIQUETAS_MASTODON = ["LLM", "MachineLearning", "GenerativeAI"]; // #AI, demasiado revuelta (medido)
const REPOS = 8;

const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper", "noticias.js");
const AGENTE = "infinite-desk/1.0 (AI news orb; +https://github.com/Llicklair/infinite-desk)";
const ahora = Date.now();
const hace2dias = Math.floor(ahora / 1000) - 2 * 86400;

const espera = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Con un reintento si el sitio dice "demasiadas peticiones" (429): Reddit lo dice en cuanto se le
 * pide varias cosas seguidas (medido; una a una, contesta).
 * @param {string} url @param {"json" | "texto"} como
 */
async function traer(url, como) {
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, { headers: { "User-Agent": AGENTE, Accept: como === "json" ? "application/json" : "*/*" }, signal: AbortSignal.timeout(15000) });
    if (r.status === 429 && intento === 0) { await espera(6000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return como === "json" ? r.json() : r.text();
  }
}

/** Lo que había en noticias.js (para no perder los repos si GitHub falla esta vez). */
function anterior() {
  try {
    const texto = readFileSync(salida, "utf8");
    return JSON.parse(texto.slice(texto.indexOf("=") + 1).trim().replace(/;$/, ""));
  } catch { return null; }
}

/** @typedef {{nombre: string, leer: () => Promise<Publicacion[]>}} Fuente */
// Por sitio, cada uno a su ritmo y todos a la vez: dentro de un sitio, de una en una y con
// `pausa` entre ellas.
/** @type {{pausa: number, fuentes: Fuente[]}[]} */
const sitios = [
  { pausa: 200, fuentes: BUSQUEDAS_BLUESKY.map((q) => ({
    nombre: `Bluesky "${q}"`,
    leer: async () => deBluesky(await traer(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=top&limit=25&since=${new Date(hace2dias * 1000).toISOString()}`, "json"), "Bluesky"),
  })) },
  // Todos los subreddits en UNA petición (r/a+b+c): de uno en uno, Reddit cortaba al segundo.
  { pausa: 0, fuentes: [{ nombre: `r/${SUBREDDITS.join("+")}`, leer: async () => deReddit(await traer(`https://www.reddit.com/r/${SUBREDDITS.join("+")}/top/.rss?t=day&limit=40`, "texto"), SUBREDDITS[0]) }] },
  { pausa: 200, fuentes: BUSQUEDAS_HN.map((q) => ({
    nombre: `HN "${q}"`,
    leer: async () => deHN(await traer(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${hace2dias},points>30&hitsPerPage=20`, "json")),
  })) },
  { pausa: 500, fuentes: ETIQUETAS_MASTODON.map((t) => ({ nombre: `Mastodon #${t}`, leer: async () => deMastodon(await traer(`https://mastodon.social/api/v1/timelines/tag/${t}?limit=40`, "json"), "Mastodon") })) },
];

/** @type {{nombre: string, n: number, error?: string}[]} */
const informe = [];
/** @type {Publicacion[]} */
const todas = [];
/** @type {Repo[]} */
let repos = [];
await Promise.all([
  ...sitios.map(async ({ pausa, fuentes }) => {
    for (const [i, f] of fuentes.entries()) {
      if (i > 0) await espera(pausa);
      try {
        const leidas = await f.leer();
        todas.push(...leidas);
        informe.push({ nombre: f.nombre, n: leidas.length });
      } catch (e) {
        informe.push({ nombre: f.nombre, n: 0, error: String(/** @type {Error} */ (e)?.message ?? e).slice(0, 80) });
      }
    }
  }),
  (async () => {
    try {
      repos = deTendencias(await traer("https://github.com/trending?since=monthly", "texto")).slice(0, REPOS);
      informe.push({ nombre: "GitHub trending (mes)", n: repos.length, ...(repos.length ? {} : { error: "sin repos: ¿cambió la página?" }) });
    } catch (e) {
      informe.push({ nombre: "GitHub trending (mes)", n: 0, error: String(/** @type {Error} */ (e)?.message ?? e).slice(0, 80) });
    }
  })(),
]);
informe.sort((a, b) => a.nombre.localeCompare(b.nombre));
// Sin repos esta vez, los de la anterior: el top del mes no cambia en media hora.
if (!repos.length) repos = anterior()?.repos ?? [];

const titulares = elegirTitulares(todas, ahora);

// Lo que se lee al hacer clic en el palantír: el post entero y sus mejores respuestas, el
// artículo que enlaza (su texto) y el README de cada repo. Solo para lo elegido, ~20 peticiones;
// lo que falle se queda sin lectura y el lector ofrece abrirlo en el navegador.
/** @param {string} url */
const textoDe = async (url) => traer(url, "texto").then((t) => /** @type {string} */ (t));
/** @param {import("../src/noticias.js").Publicacion} p @returns {Promise<Lectura>} */
async function leer(p) {
  const propia = p.lectura ?? { bloques: p.red === "hn" ? [] : [{ t: "p", x: p.texto }], comentarios: [] };
  const [comentarios, articulo] = await Promise.all([
    (async () => {
      if (p.red === "hn" && p.id) return comentariosHN(await traer(`https://hn.algolia.com/api/v1/items/${p.id}`, "json"));
      if (p.red === "bluesky" && p.id) return respuestasBluesky(await traer(`https://api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(p.id)}&depth=1&parentHeight=0`, "json"));
      if (p.red === "mastodon" && p.id) return respuestasMastodon(await traer(`https://mastodon.social/api/v1/statuses/${p.id}/context`, "json"), p.id);
      return [];
    })().catch(() => []),
    p.articulo ? textoDe(p.articulo).then((html) => ({ html, bloques: bloquesDeHtml(html) })).catch(() => null) : null,
  ]);
  const bloques = [...propia.bloques];
  let titulo;
  if (articulo?.bloques.length) {
    titulo = limpiarTexto(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(articulo.html)?.[1] ?? "") || undefined;
    bloques.push(...articulo.bloques);
  }
  // Los de Reddit ya vienen puestos (se piden aparte, despacio): no se pisan con la lista vacía.
  return { bloques, comentarios: comentarios.length ? comentarios : propia.comentarios, ...(titulo ? { titulo } : {}) };
}
let leidas = 0;
// Los comentarios de Reddit, de uno en uno y despacio: en ráfaga, Reddit contesta 429 (medido).
const deRedditElegidas = titulares.filter((p) => p.red === "reddit");
const conComentarios = (async () => {
  for (const [i, p] of deRedditElegidas.entries()) {
    if (i > 0) await espera(4000);
    try {
      const comentarios = comentariosReddit(await textoDe(`${p.url.replace(/\/$/, "")}/.rss?limit=12`));
      p.lectura = { ...(p.lectura ?? { bloques: [] }), comentarios };
    } catch { /* sin comentarios esta vez */ }
  }
})();
await conComentarios;
await Promise.all([
  ...titulares.map(async (p) => {
    p.lectura = await leer(p);
    if (p.lectura.bloques.length || p.lectura.comentarios.length) leidas++;
  }),
  ...repos.filter((r) => !r.lectura).map(async (r) => {
    try {
      r.lectura = { bloques: bloquesDeMarkdown(await textoDe(`https://raw.githubusercontent.com/${r.nombre}/HEAD/README.md`)), comentarios: [] };
      leidas++;
    } catch { /* sin README.md (o con otro nombre): se abre en el navegador */ }
  }),
]);
informe.push({ nombre: "lecturas (post entero, artículo, respuestas, README)", n: leidas });

const fallidas = informe.filter((f) => f.error);
for (const f of informe) console.log(`  ${f.error ? "falla " : "ok    "} ${f.nombre}: ${f.error ?? `${f.n}`}`);
if (titulares.length === 0) {
  // No se pisa lo que hubiera: mejor titulares de hace un rato que un palantír vacío.
  console.error(`noticias: nada que enseñar (${fallidas.length} de ${informe.length} fuentes fallaron)`);
  process.exit(1);
}
const datos = { generado: new Date(ahora).toISOString(), titulares, repos, fuentes: informe };
// Primero a un temporal y luego se renombra: el mundo nunca lee un fichero a medias.
const temporal = `${salida}.tmp`;
writeFileSync(temporal, "// Lo escribe tools/noticias.mjs (npm run noticias); no se versiona.\n" +
  `window.INFINITE_DESK_NOTICIAS = ${JSON.stringify(datos)};\n`);
renameSync(temporal, salida);
const porRed = Object.entries(REDES).map(([k, r]) => `${r.nombre} ${titulares.filter((t) => t.red === k).length}`).join(", ");
console.log(`${titulares.length} titulares (${porRed}) de ${todas.length} publicaciones y ${repos.length} repos, ${leidas} con lectura; ${fallidas.length} fuente(s) fallaron -> ${salida}`);
