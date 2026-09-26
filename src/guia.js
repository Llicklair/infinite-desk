// El tutorial (Settings -> Start the tutorial): los pasos y cuándo se da cada uno por hecho, sin
// DOM ni three (se prueba en Node). Uso real: "estaría bien en settings meter la opción de un
// tutorial que te explique un poco cómo funciona todo". Cada paso cuenta una parte del mundo, con
// sus teclas, y pide hacer una cosa: al hacerla se pasa solo al siguiente (Tab lo salta).

/**
 * Lo que el mundo cuenta al tutorial cada poco (src/mundo.js).
 * @typedef {{andado: number, girado: number, apuntaIsla: boolean, pantallas: number, escribiendo: boolean,
 *   ficheros: boolean, lector: boolean, maestra: boolean, atlas: boolean, zen: boolean}} Foto
 *   `andado`: metros recorridos desde que empezó el tutorial; `girado`: radianes girados mirando
 */

/**
 * @typedef {{id: string, titulo: string, texto: string, teclas: [string, string][], pide: string,
 *   hecho: ((ahora: Foto, alEmpezar: Foto) => boolean) | null}} Paso
 *   `teclas`: [tecla, qué hace]; `pide`: lo que hay que hacer para seguir; `hecho`: si ya se hizo,
 *   comparando con cómo estaba todo al empezar el paso (null: se sigue con Tab)
 */

/** @type {Paso[]} */
export const PASOS = [
  {
    id: "bienvenida",
    titulo: "Welcome to infinite-desk",
    texto: "Your projects folder, as a world. Every repo is an island, and the constellation floating over it is its code: modules and their dependencies, from galaxy-brain. Your real windows come in as screens, with their repo's graph behind them.",
    teclas: [["Tab", "next step"], ["Shift+Tab", "back"], ["Backspace", "close the tutorial"]],
    pide: "Press Tab to start.",
    hecho: null,
  },
  {
    id: "moverse",
    titulo: "Moving around",
    texto: "You fly in first person. Look around with the mouse and move with the keyboard.",
    teclas: [["WASD", "move"], ["mouse", "look"], ["Space / C", "up / down"], ["Shift", "run"]],
    pide: "Look around and fly a few metres.",
    hecho: (a, b) => a.andado - b.andado > 8 && a.girado - b.girado > 0.6,
  },
  {
    id: "islas",
    titulo: "Islands and their graphs",
    texto: "Each island has its repo's name. Its graph shows how the code is wired: click a node to see what it is and who depends on it. Red means a dependency cycle.",
    teclas: [["Enter", "open the repo in VS Code"], ["click a node", "its details"], ["Q / E", "rotate the graph"], ["T", "folder tree instead"], ["R", "rebuild the graph"]],
    pide: "Fly to an island and look at it.",
    hecho: (a) => a.apuntaIsla,
  },
  {
    id: "pantallas",
    titulo: "Your windows, as screens",
    texto: "Bring any open window (VS Code, a browser, a terminal) into the world. If it belongs to one of your repos, that repo's graph goes behind it.",
    teclas: [["N", "bring a window"], ["hold click", "move a screen"], ["wheel", "resize it"], ["G", "change its graph"], ["V", "hide/show the graph"], ["X", "close it"]],
    pide: "Press N and choose a window.",
    hecho: (a, b) => a.pantallas > b.pantallas,
  },
  {
    id: "trabajar",
    titulo: "Working inside a screen",
    texto: "A screen is the real window, not a picture: look at it and press Enter to type and click in it. Click outside the screen to come back to the world.",
    teclas: [["Enter", "work in the screen you look at"], ["click outside", "come back"]],
    pide: "Look at a screen and press Enter (or Tab if you have none).",
    hecho: (a) => a.escribiendo,
  },
  {
    id: "ficheros",
    titulo: "Things from your desktop",
    texto: "Open files, folders and apps from your desktop without leaving: they open as windows you can bring in with N.",
    teclas: [["F", "open something from the desktop"]],
    pide: "Press F (Esc closes it).",
    hecho: (a) => a.ficheros,
  },
  {
    id: "palantir",
    titulo: "The palantír",
    texto: "The glowing sphere in the middle: the latest on AI from Bluesky, Reddit, Hacker News and Mastodon below, and the month's top GitHub repos above. Click the sphere itself for Chispas, a small game.",
    teclas: [["click a card", "read it whole"], ["click the sphere", "play Chispas"]],
    pide: "Fly to the centre and click a card.",
    hecho: (a) => a.lector,
  },
  {
    id: "maestra",
    titulo: "The master console",
    texto: "Everything in one place: your AI accounts (Claude, Codex, Gemini), your repos in bulk (pull, build their graphs), agents working on a repo in their own branch, and the errors your tools caught.",
    teclas: [["O", "open the master console"]],
    pide: "Press O.",
    hecho: (a) => a.maestra,
  },
  {
    id: "atlas",
    titulo: "Atlas, your work assistant",
    texto: "The little drone by your side. Ask it about your repos (it can read their code), the news or the top repos, and it opens things for you: a repo in VS Code, an island, an article, a web page as a screen, the master console.",
    teclas: [["K", "talk to Atlas"], ["V", "just talk, by voice"]],
    pide: "Press K and ask it something (\"what is galaxy-brain?\").",
    hecho: (a) => a.atlas,
  },
  {
    id: "zen",
    titulo: "The zen zone",
    texto: "When you need a break: a waterfall, a pool to skip stones on, a cabin with a fire and hot chocolate, and Kiri, a fox spirit to talk to. Z takes you there and back.",
    teclas: [["Z", "go / come back"], ["hold click", "throw a stone"], ["E", "use things"], ["L", "day, sunset, night, rain"]],
    pide: "Press Z (and Z again to come back).",
    hecho: (a) => a.zen,
  },
  {
    id: "final",
    titulo: "That's it",
    texto: "Settings has your projects folder (its repos are the islands) and this tutorial. The key list stays at the bottom left.",
    teclas: [["P", "settings"], ["H", "hide/show the key list"], ["Esc", "release the mouse (twice: back to the desktop)"]],
    pide: "Press Tab to finish.",
    hecho: null,
  },
];

/**
 * Por dónde va el tutorial: el paso, y cómo estaba el mundo al empezarlo (para los "desde entonces").
 * @param {Foto} foto cómo está todo al empezar
 */
export function empezarGuia(foto) {
  let i = 0;
  let base = foto;
  let hechoEn = -1; // cuándo se cumplió el paso actual (ms), para dejar ver el ✓ antes de pasar
  return {
    get paso() { return PASOS[i]; },
    get numero() { return i; },
    get total() { return PASOS.length; },
    get cumplido() { return hechoEn >= 0; },
    /**
     * Con la foto de ahora: si el paso se cumplió, se marca, y al rato se pasa al siguiente.
     * @param {Foto} ahora @param {number} ms reloj en milisegundos @returns {"sigue" | "hecho" | "fin"}
     */
    mirar(ahora, ms) {
      const p = PASOS[i];
      if (hechoEn < 0 && p.hecho?.(ahora, base)) hechoEn = ms;
      if (hechoEn >= 0 && ms - hechoEn > 1500) return this.ir(1, ahora);
      return hechoEn >= 0 ? "hecho" : "sigue";
    },
    /** Tab / Shift+Tab. @param {1 | -1} paso @param {Foto} ahora @returns {"sigue" | "fin"} */
    ir(paso, ahora) {
      if (i + paso >= PASOS.length) return "fin";
      i = Math.max(0, i + paso);
      base = ahora;
      hechoEn = -1;
      return "sigue";
    },
  };
}
