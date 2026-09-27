// Kiri y Atlas en el mundo. Kiri, el espíritu de la zona zen (src/apoyo.js): E sobre él abre su
// panel y V le habla por voz; pone música o algo para distraerse (YouTube, como pantalla) y cambia el
// cielo. Atlas, el asistente de trabajo del mundo normal (src/asistente.js): un dron que te acompaña;
// K abre su panel y V le habla por voz (fuera de la zona zen). Sabe de tus repos (y lee su código),
// de las noticias y de los repos top, y abre cosas: VS Code, islas, el lector, webs, la consola.
// El panel de los dos es src/charla.js; aquí, su figura, sus datos y lo que hacen en el mundo.
import * as THREE from "three";
import { KIRI, crearCharla } from "./charla.js";
import { crearAtlas } from "./atlas3d.js";
import { NOMBRE_ATLAS } from "./asistente.js";
import { base64 } from "./apoyo.js";

/**
 * @typedef {import("./pantallas.js").Pantalla} Pantalla
 * @typedef {import("./grafo3d.js").GrafoExportado} GrafoExportado
 */

/**
 * @param {{
 *   ui: {charla?: HTMLElement | null, atlas?: HTMLElement | null}, escena: THREE.Scene, camara: THREE.Camera,
 *   puente: ReturnType<typeof import("./puente.js").crearPuente> | null, zen: import("./zen.js").Zen | null,
 *   palantir: ReturnType<typeof import("./palantir.js").crearPalantir>, fondo: boolean,
 *   orquestador: (args: string[]) => Promise<any>, avisar: (t: string) => void, alCerrar: () => void, soltarRaton: () => void,
 *   nombres: () => string[], mirando: () => {isla: string | null, pantalla: string | null},
 *   alternarZen: () => void, nuevaPantalla: () => Promise<void>, consola: (pestana: string) => void, refrescarConsola: () => void,
 *   leer: (enlace: import("./palantir.js").Enlace) => void, regenerar: (repos: string[]) => void,
 *   grafoDe: (nombre: string) => GrafoExportado | null, isla: (repo: string) => THREE.Vector3 | null,
 *   abrirComoPantalla: (url: string, nombre: string) => Promise<Pantalla | null>,
 *   abrirRepoComoPantalla: (g: GrafoExportado) => Promise<Pantalla | null>,
 *   cambioEnEspacio: () => void, volar: (pos: THREE.Vector3, mira: THREE.Vector3) => void,
 * }} m lo del mundo que hace falta; `isla`: dónde está la isla de un repo; `volar`: la cámara, hasta allí
 */
export function crearAsistentes(m) {
  const nombres = () => ["Kiri", "Atlas", "palantír", "galaxy-brain", ...m.nombres()];
  const kiri = m.ui.charla && m.zen
    ? crearCharla(m.ui.charla, KIRI, {
      orquestador: m.orquestador,
      figura: () => m.zen?.espiritu ?? null,
      avisar: (t) => m.avisar(t),
      alCerrar: m.alCerrar,
      hacer: (a) => void hacerDeKiri(a),
      anotar: (t) => m.puente?.anotar(t),
      oido: () => (m.puente?.conectado ? m.puente.escuchar : null),
      nombres,
    })
    : null;
  /**
   * Lo que Kiri decide hacer: música o algo para distraerse (el primer vídeo de YouTube para su
   * búsqueda, abierto directamente como pantalla en vivo), o el cielo.
   * @param {import("./apoyo.js").Accion} a
   */
  async function hacerDeKiri(a) {
    if (a.tipo === "ambiente") {
      m.zen?.ponerAmbiente(a.valor);
      return;
    }
    if (!m.puente?.conectado) { m.avisar("No bridge, so it can't open YouTube"); return; }
    const r = await m.puente.orquestador(["video", base64(a.busqueda)]);
    if (!r.ok || !r.datos?.url) { m.avisar(`Couldn't find it on YouTube: ${r.error ?? "no result"}`); return; }
    await m.abrirComoPantalla(r.datos.url, `"${r.datos.titulo}" on YouTube`);
  }

  const figuraAtlas = !m.fondo ? crearAtlas(m.palantir.esfera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(3, 0, 3))) : null;
  if (figuraAtlas) m.escena.add(figuraAtlas.grupo);
  /** @type {import("./charla.js").Persona} */
  const ATLAS = {
    nombre: NOMBRE_ATLAS,
    sub: "Your work assistant: it knows your repos (and can read their code), the palantír's news and the month's top GitHub repos, opens things for you and sends agents to change code. It's an AI (Claude): what you say goes to Anthropic to answer. It remembers work things about you on this computer, apart from Kiri.",
    saludo: (es) => (es ? `Hola, soy ${NOMBRE_ATLAS}. ¿En qué andamos hoy?` : `Hi, I'm ${NOMBRE_ATLAS}. What are we working on?`),
    pedir: (turnos) => ["atlas", base64(JSON.stringify({ turnos, mirando: m.mirando() }))],
    recuerda: true,
    memoria: {
      recordar: (turnos) => ["atlasRecordar", base64(JSON.stringify(turnos))],
      recuerdos: ["recuerdos", "atlas"],
      olvidar: (id) => ["olvidar", id, "atlas"],
    },
    voz: { ritmo: 1.03, tono: 1, volumen: 1, pausaMs: 160 },
    claveVoz: "infinite-desk.voz-de-atlas",
    vocesPreferidas: /alvaro|jorge|guy|davis|andrew/i,
    volver: "Back to the palantír",
    pie: `Esc: close · K opens this · V talks to ${NOMBRE_ATLAS} by voice without opening it`,
    clase: "atlas",
  };
  const atlas = m.ui.atlas && figuraAtlas
    ? crearCharla(m.ui.atlas, ATLAS, {
      orquestador: m.orquestador,
      figura: () => figuraAtlas,
      avisar: (t) => m.avisar(t),
      alCerrar: m.alCerrar,
      hacer: (a) => void hacerDeAtlas(a),
      anotar: (t) => m.puente?.anotar(t),
      oido: () => (m.puente?.conectado ? m.puente.escuchar : null),
      nombres,
    })
    : null;

  /** A su isla, volando y mirándola (de la zona zen, primero de vuelta). @param {THREE.Vector3} objetivo */
  function volarA(objetivo) {
    if (m.zen?.activa) m.alternarZen();
    const desde = m.camara.position.clone().sub(objetivo).setY(0).normalize();
    const pos = objetivo.clone().addScaledVector(desde, 22).setY(objetivo.y + 5);
    m.volar(pos, objetivo);
    return { pos, desde };
  }
  /**
   * Lo que Atlas decide hacer en el mundo.
   * @param {import("./asistente.js").AccionAtlas} a
   */
  async function hacerDeAtlas(a) {
    if (a.tipo === "zen") { if (!m.zen?.activa) m.alternarZen(); return; }
    if (a.tipo === "ventana") { await m.nuevaPantalla(); return; }
    if (a.tipo === "consola") { m.consola(a.pestana); return; }
    if (a.tipo === "leer") {
      const t = m.palantir.tarjetas[a.tarjeta];
      const enlace = t && m.palantir.enlaceDe(t);
      if (enlace) m.leer(enlace);
      return;
    }
    if (a.tipo === "web") { await m.abrirComoPantalla(a.url, new URL(a.url).hostname); return; }
    if (a.tipo === "grafo") { m.regenerar([a.repo]); return; }
    const g = m.grafoDe(a.repo);
    if (a.tipo === "vscode") { if (g) await m.abrirRepoComoPantalla(g); return; }
    if (a.tipo === "trabajar") {
      // A su isla, y su VS Code como pantalla delante de ella (uso real: "prepárame para trabajar en X").
      const objetivo = m.isla(a.repo);
      if (!objetivo || !g) return;
      const { pos, desde } = volarA(objetivo);
      const p = await m.abrirRepoComoPantalla(g);
      if (p) {
        p.objeto.position.copy(objetivo).addScaledVector(desde, 12).setY(objetivo.y + 5);
        p.objeto.lookAt(pos);
        m.cambioEnEspacio();
      }
      return;
    }
    if (a.tipo === "agente") {
      // Un agente de Claude en su rama y su worktree (tools/agente.mjs): commitea ahí, nunca hace push.
      const r = await m.puente?.orquestador(["lanzar", "claude", base64(a.tarea), a.repo]);
      m.avisar(r?.ok ? `Agent sent to ${a.repo}: it works on its own branch; watch it on the island (O → Agents)` : `Couldn't send the agent: ${r?.error ?? "no bridge"}`);
      if (r?.ok) m.refrescarConsola();
      return;
    }
    // "ir": volando hasta su isla, mirándola.
    const objetivo = m.isla(a.repo);
    if (objetivo) volarA(objetivo);
  }

  return {
    kiri,
    atlas,
    figuraAtlas,
    abrirKiri() {
      if (!kiri) return;
      void kiri.abrir();
      m.soltarRaton();
    },
    abrirAtlas() {
      if (!atlas) return;
      void atlas.abrir();
      m.soltarRaton();
    },
  };
}
