import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CADUCA_HORAS, HORA, bloquesDeHtml, bloquesDeMarkdown, comentariosHN, deBluesky, deHN, deMastodon, deReddit, deTendencias,
  comentariosReddit, elegirTitulares, haceCuanto, limpiarTexto, puntosCortos, respuestasBluesky, respuestasMastodon,
} from "../src/noticias.js";

const AHORA = Date.parse("2026-09-26T12:00:00Z");
/** @param {number} horas */
const hace = (horas) => new Date(AHORA - horas * HORA).toISOString();

test("limpiar: sin etiquetas, con entidades, espacios juntos", () => {
  assert.equal(limpiarTexto("<p>Agency &gt; Intelligence&nbsp;&amp; <a href='x'>more</a></p><p>next</p>"), "Agency > Intelligence & more next");
  assert.equal(limpiarTexto("it&#39;s &#x1F680; here"), "it's 🚀 here");
});

test("Bluesky: búsqueda y perfil (sin respuestas ni reposts), con su enlace a bsky.app", () => {
  const post = { uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz", author: { handle: "simonwillison.net", displayName: "Simon Willison" },
    record: { text: "Trying the new model", createdAt: "2026-09-26T10:00:00Z" }, likeCount: 40, repostCount: 5 };
  const respuesta = { ...post, uri: "at://x/app.bsky.feed.post/r", record: { ...post.record, reply: {} } };
  const busqueda = deBluesky({ posts: [post, respuesta] }, "Bluesky · LLM");
  assert.equal(busqueda.length, 1);
  assert.equal(busqueda[0].url, "https://bsky.app/profile/simonwillison.net/post/3kxyz");
  assert.equal(busqueda[0].puntos, 50);
  const perfil = deBluesky({ feed: [{ post }, { post, reason: { $type: "repost" } }] }, "Bluesky · @simon");
  assert.equal(perfil.length, 1);
  const enJapones = { ...post, record: { ...post.record, langs: ["ja"] } };
  assert.equal(deBluesky({ posts: [enJapones] }, "Bluesky").length, 0, "solo en inglés");
});

test("Reddit: el Atom del top del día; los puntos, por la posición", () => {
  const entrada = (/** @type {string} */ t, /** @type {string} */ id) =>
    `<entry><author><name>/u/alguien</name></author><link href="https://www.reddit.com/r/LocalLLaMA/comments/${id}/"/>` +
    `<published>2026-09-26T08:00:00+00:00</published><title>${t}</title></entry>`;
  const r = deReddit(`<feed>${entrada("Qwen 4 released &amp; open", "a")}${entrada("Second", "b")}</feed>`, "LocalLLaMA");
  assert.equal(r.length, 2);
  assert.equal(r[0].texto, "Qwen 4 released & open");
  assert.equal(r[0].fuente, "r/LocalLLaMA");
  assert.ok(r[0].puntos > r[1].puntos);
});

test("Hacker News: el enlace va a la conversación; puntos = votos + comentarios", () => {
  const r = deHN({ hits: [{ objectID: "42", title: "Show HN: an LLM thing", author: "pg", created_at_i: AHORA / 1000, points: 300, num_comments: 120,
    url: "https://example.com/post" }] });
  assert.deepEqual(r[0], { red: "hn", fuente: "Hacker News", autor: "pg", texto: "Show HN: an LLM thing",
    url: "https://news.ycombinator.com/item?id=42", fecha: new Date(AHORA).toISOString(), puntos: 420, id: "42", articulo: "https://example.com/post" });
});

test("Mastodon: sin impulsos, ni respuestas, ni otros idiomas; el HTML limpio", () => {
  const r = deMastodon([
    { url: "https://m.s/@a/1", content: "<p>New <b>paper</b> on agents</p>", created_at: hace(1), language: "en", favourites_count: 3, reblogs_count: 1, account: { acct: "a" } },
    { url: "https://m.s/@a/2", content: "<p>x</p>", created_at: hace(1), reblog: {}, language: "en", account: { acct: "a" } },
    { url: "https://m.s/@a/3", content: "<p>AI-SQLエンジン公開</p>", created_at: hace(1), language: "ja", account: { acct: "a" } },
  ], "Mastodon · #LLM");
  assert.equal(r.length, 1, "ni impulsos ni lo que no está en inglés");
  assert.equal(r[0].texto, "New paper on agents");
  assert.equal(r[0].puntos, 5);
});

/** @param {Partial<import("../src/noticias.js").Publicacion>} p @returns {import("../src/noticias.js").Publicacion} */
const pub = (p) => ({ red: "bluesky", fuente: "@a", autor: "a", texto: "A long enough headline about AI models", url: `https://u/${Math.random()}`, fecha: hace(1), puntos: 10, ...p });

test("titulares: como mucho N y porRed de cada red, lo más valorado primero", () => {
  const muchas = [
    ...Array.from({ length: 6 }, (_, i) => pub({ red: "bluesky", fuente: "@a", puntos: 100 - i, texto: `Bluesky headline number ${i} about models` })),
    ...Array.from({ length: 6 }, (_, i) => pub({ red: "reddit", fuente: "r/b", puntos: 50 - i, texto: `Reddit headline number ${i} about models` })),
  ];
  const r = elegirTitulares(muchas, AHORA, { n: 4, porRed: 2 });
  assert.equal(r.length, 4);
  assert.deepEqual(r.map((p) => p.red).sort(), ["bluesky", "bluesky", "reddit", "reddit"]);
  assert.equal(r.filter((p) => p.red === "bluesky")[0].puntos, 100);
});

test("titulares: los puntos cuentan relativos a su fuente, no en bruto", () => {
  // 5 me gusta, lo mejor de su fuente, gana a 5000 que son la mitad de lo mejor de la suya.
  const r = elegirTitulares([
    pub({ fuente: "@grande", puntos: 10000, texto: "The most popular big account post" }),
    pub({ fuente: "@grande", puntos: 5000, texto: "Half as popular big account post" }),
    pub({ fuente: "Mastodon", red: "mastodon", puntos: 5, texto: "Small network best post today" }),
  ], AHORA, { n: 3, porRed: 3 });
  assert.equal(r[1].texto, "Small network best post today");
});

test("titulares: nada caducado, ni repetido, ni vacío; si falta una red, se rellena", () => {
  const r = elegirTitulares([
    pub({ texto: "Too old but very popular post here", puntos: 1e6, fecha: hace(CADUCA_HORAS + 1) }),
    pub({ texto: "Same news, told by two accounts!!", url: "https://u/1" }),
    pub({ texto: "same news told by two accounts", url: "https://u/2", fuente: "@b" }),
    pub({ texto: "short" }),
    pub({ texto: "Another decent post about agents", url: "https://u/3" }),
  ], AHORA, { n: 12, porRed: 1 });
  const urls = r.map((p) => p.url);
  assert.equal(r.length, 2, urls.join(" "));
  assert.ok(urls.includes("https://u/3"));
  assert.equal(urls.filter((u) => u === "https://u/1" || u === "https://u/2").length, 1, "de las dos repetidas, solo una");
});

test("cuánto hace y puntos cortos", () => {
  assert.equal(haceCuanto(hace(0), AHORA), "now");
  assert.equal(haceCuanto(hace(0.5), AHORA), "30m");
  assert.equal(haceCuanto(hace(5), AHORA), "5h");
  assert.equal(haceCuanto(hace(72), AHORA), "3d");
  assert.deepEqual([950, 1200, 1000, 34567].map(puntosCortos), ["950", "1.2k", "1k", "35k"]);
});

// Una entrada de github.com/trending tal cual (recortada), para que un cambio de su HTML se note aquí.
const articulo = (/** @type {string} */ nombre, /** @type {string} */ mes, /** @type {string} */ total) => `<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a data-hydro-click="{}" href="/${nombre}" data-view-component="true" class="Link"><svg aria-hidden="true"><path d="M2"></path></svg>
      <span data-view-component="true" class="text-normal">${nombre.split("/")[0]} /</span>${nombre.split("/")[1]}</a>  </h2>
    <p class="col-9 color-fg-muted my-1 tmp-pr-4">
      Agent skill for beautiful diagrams&mdash;self-contained &amp; crisp.
    </p>
  <div class="f6 color-fg-muted mt-2">
  <span class="repo-language-color" style="background-color: #f1e05a"></span>
  <span itemprop="programmingLanguage">JavaScript</span>
      <a href="/${nombre}/stargazers" data-view-component="true" class="Link"><svg aria-label="star"><path d="M8"></path></svg>
        ${total}</a>
      <span class="d-inline-block float-sm-right"><svg aria-hidden="true"><path d="M8"></path></svg>
        ${mes} stars this month
      </span>
  </div>
</article>`;

test("GitHub: los repos del mes, de más a menos estrellas ganadas", () => {
  const r = deTendencias(`<html>${articulo("small/one", "2,725", "3,100")}${articulo("tt-a1i/archify", "56,232", "71,972")}</html>`);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], {
    nombre: "tt-a1i/archify", descripcion: "Agent skill for beautiful diagrams—self-contained & crisp.", lenguaje: "JavaScript",
    color: "#f1e05a", estrellas: 71972, estrellasMes: 56232, url: "https://github.com/tt-a1i/archify",
  });
  assert.equal(r[1].nombre, "small/one");
  assert.deepEqual(deTendencias("<html>GitHub cambió su página</html>"), []);
});

test("Reddit: el texto del post (su div md) y, si enlaza fuera, la página", () => {
  const contenido = (/** @type {string} */ html) => `<content type="html">${html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</content>`;
  const entrada = (/** @type {string} */ html) => `<entry><link href="https://www.reddit.com/r/x/comments/1/"/><published>2026-09-26T08:00:00+00:00</published>` +
    `<title>A post title long enough</title>${contenido(html)}</entry>`;
  const [propio] = deReddit(entrada('<div class="md"><p>I tested the new model for a week and here is what I found out about it.</p></div><span><a href="https://www.reddit.com/r/x/comments/1/">[link]</a></span>'), "x");
  assert.equal(propio.lectura?.bloques[0].x, "I tested the new model for a week and here is what I found out about it.");
  assert.equal(propio.articulo, undefined, "un [link] a Reddit no es un artículo");
  const [enlace] = deReddit(entrada('<span><a href="https://blog.example.com/p">[link]</a></span>'), "x");
  assert.equal(enlace.articulo, "https://blog.example.com/p");
  assert.equal(enlace.lectura, undefined);
});

test("artículo: el texto de <article>, sin menús ni scripts ni párrafos de nada, en orden", () => {
  const html = `<html><body><nav><p>Home About Contact and many other menu links here</p></nav>
    <article><h1>The &amp; title</h1><p>Share</p><p>This is the first real paragraph of the article, long enough.</p>
    <script>var x = "<p>not text but a script that should never show up</p>";</script>
    <ul><li>First point</li><li>Second point</li></ul><blockquote><p>A quote that someone said about models.</p></blockquote>
    <pre><code>print(&quot;hi&quot;)</code></pre></article><footer><p>Copyright footer text that is long enough to count</p></footer></body></html>`;
  assert.deepEqual(bloquesDeHtml(html), [
    { t: "h", x: "The & title" },
    { t: "p", x: "This is the first real paragraph of the article, long enough." },
    { t: "li", x: "First point" }, { t: "li", x: "Second point" },
    { t: "cita", x: "A quote that someone said about models." },
    { t: "codigo", x: 'print("hi")' },
  ]);
  assert.deepEqual(bloquesDeHtml("<article><ul><li>Share on Facebook</li><li>Email</li><li>Comments</li><li>A real point</li></ul></article>"),
    [{ t: "li", x: "A real point" }], "sin los botones de compartir");
  const largo = bloquesDeHtml(`<article><p>${"word ".repeat(100)}</p><p>${"more ".repeat(100)}</p></article>`, 300);
  assert.ok(largo.map((b) => b.x).join("").length <= 301 && largo.at(-1)?.x.endsWith("…"), "se corta con puntos suspensivos");
});

test("README: títulos, párrafos, listas y código; sin insignias ni imágenes; enlaces, su texto", () => {
  const md = ["# archify", "[![stars](https://img.shields.io/x.svg)](https://x)", "", "An **agent skill** for", "beautiful [diagrams](https://d).",
    "", "## Install", "- run `npm i archify`", "1. then use it", "> note: beta", "```bash", "npx archify", "```", "<p align=\"center\">", "| a | b |"].join("\n");
  assert.deepEqual(bloquesDeMarkdown(md), [
    { t: "h", x: "archify" },
    { t: "p", x: "An agent skill for beautiful diagrams." },
    { t: "h", x: "Install" },
    { t: "li", x: "run npm i archify" }, { t: "li", x: "then use it" },
    { t: "cita", x: "note: beta" },
    { t: "codigo", x: "npx archify" },
  ]);
});

test("comentarios: HN en su orden; Bluesky y Mastodon, los más votados, solo respuestas directas", () => {
  assert.deepEqual(comentariosHN({ children: [{ author: "a", text: "First &amp; best<p>second paragraph" }, { author: null, text: null }, { author: "b", text: "Second" }] }),
    [{ autor: "a", texto: "First & best second paragraph" }, { autor: "b", texto: "Second" }], "los <p> sin cerrar de HN no pegan palabras");
  const r = respuestasBluesky({ thread: { replies: [
    { post: { author: { handle: "x" }, record: { text: "meh" }, likeCount: 1 } },
    { post: { author: { displayName: "Y" }, record: { text: "great point" }, likeCount: 9 } },
  ] } });
  assert.deepEqual(r.map((c) => c.texto), ["great point", "meh"]);
  const m = respuestasMastodon({ descendants: [
    { id: "2", in_reply_to_id: "1", content: "<p>direct</p>", favourites_count: 2, account: { acct: "a" } },
    { id: "3", in_reply_to_id: "2", content: "<p>nested</p>", favourites_count: 50, account: { acct: "b" } },
  ] }, "1");
  assert.deepEqual(m.map((c) => c.texto), ["direct"]);
  const esc = (/** @type {string} */ h) => h.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rss = `<feed><entry><author><name>/u/op</name></author><content type="html">${esc("<p>the post</p>")}</content></entry>` +
    `<entry><author><name>/u/fan</name></author><content type="html">${esc('<div class="md"><p>Nice &amp; clean</p></div>')}</content></entry></feed>`;
  assert.deepEqual(comentariosReddit(rss), [{ autor: "fan", texto: "Nice & clean" }], "Reddit: sin el propio post, sin /u/");
});

test("resumen de README: el primer párrafo de verdad, sin título ni insignias; corto se completa", async () => {
  const { resumenDeReadme } = await import("../src/noticias.js");
  const md = "# gb\n\n[![ci](https://x/ci.svg)](https://x)\n\n> beta\n\nMaps your code.\n\ngalaxy-brain reads a repo and draws its module graph, so you can see what depends on what.\n\nIt also tracks agents.\n\n## Install\n\npip install gb";
  assert.equal(resumenDeReadme(md), "galaxy-brain reads a repo and draws its module graph, so you can see what depends on what.");
  const largo = resumenDeReadme(`# x\n\n${"word ".repeat(200)}`, 60);
  assert.ok(largo.length <= 61 && largo.endsWith("…"));
  assert.equal(resumenDeReadme("# x\n\n- one feature here\n- another one"), "· one feature here · another one");
  assert.equal(resumenDeReadme(""), "");
});
