// El espacio de trabajo: qué pantallas había, dónde y de dónde venían, para que al volver al mundo
// esté como se dejó (uso real: "que se quede como lo dejaste"; antes, al salir, se perdía todo). Sin
// three ni DOM: se prueba en Node. Lo guarda el puente (DATOS/espacio.json); src/mundo.js lo
// rellena y lo restaura.
//
// Al restaurar, cada pantalla guardada se empareja con las ventanas abiertas ahora: si sigue
// abierta, se trae tal cual (captura nativa, sin el selector de N); si no, se vuelve a abrir lo que
// se sepa abrir (un repo en VS Code, una web); lo demás (una ventana cualquiera que ya se cerró), no.

/**
 * @typedef {{tipo: "vscode" | "web" | "ventana", titulo: string, repo: string | null, raiz?: string, url?: string,
 *   proceso?: string, pos: number[], giro: number[], escala: number}} Entrada
 *   `tipo`: de dónde vino (un repo abierto por Atlas, una web de Kiri o Atlas, una ventana traída con N)
 * @typedef {{hwnd: number, titulo: string, proceso: string}} Ventana una ventana abierta ahora
 * @typedef {{entrada: Entrada, hwnd: number | null, hacer: "traer" | "abrirRepo" | "abrirWeb" | "nada"}} Paso
 */

/** Versión del formato (por si cambia: lo de otra versión, se ignora). */
export const VERSION = 1;
/** Como mucho, tantas pantallas (las de más, fuera: nadie quiere 40 ventanas abriéndose de golpe). */
export const MAX_PANTALLAS = 16;

/** @param {string} s */
const sinArchivoAbierto = (s) => s.replace(/^.*? - (?=[^-]+ - Visual Studio Code$)/, "");

/**
 * ¿Es esta ventana la de un repo en VS Code? ("fichero - repo - Visual Studio Code", o "repo - Visual Studio Code").
 * @param {Ventana} v @param {string} repo
 */
function esVsCodeDe(v, repo) {
  if (!/^code$/i.test(v.proceso)) return false;
  const t = sinArchivoAbierto(v.titulo);
  return t.toLowerCase() === `${repo} - visual studio code`.toLowerCase();
}

/**
 * Qué hacer con cada pantalla guardada, dadas las ventanas abiertas ahora y las que ya son
 * pantallas en el mundo (sus HWND). Cada ventana se usa una vez.
 * @param {Entrada[]} entradas @param {Ventana[]} ventanas @param {number[]} yaEnMundo
 * @returns {Paso[]}
 */
export function planDeRestauracion(entradas, ventanas, yaEnMundo) {
  const usadas = new Set(yaEnMundo);
  const libres = () => ventanas.filter((v) => !usadas.has(v.hwnd));
  /** @param {(v: Ventana) => boolean} cumple */
  const tomar = (cumple) => {
    const v = libres().find(cumple);
    if (v) usadas.add(v.hwnd);
    return v ?? null;
  };
  return entradas.slice(0, MAX_PANTALLAS).map((e) => {
    // La misma ventana (mismo programa y mismo título) vale siempre, sea del tipo que sea.
    const exacta = tomar((v) => v.titulo === e.titulo && (!e.proceso || v.proceso.toLowerCase() === e.proceso.toLowerCase()));
    if (exacta) return { entrada: e, hwnd: exacta.hwnd, hacer: "traer" };
    if (e.tipo === "vscode" && e.repo) {
      const code = tomar((v) => esVsCodeDe(v, /** @type {string} */ (e.repo)));
      return code ? { entrada: e, hwnd: code.hwnd, hacer: "traer" } : { entrada: e, hwnd: null, hacer: e.raiz ? "abrirRepo" : "nada" };
    }
    if (e.tipo === "web") return { entrada: e, hwnd: null, hacer: e.url ? "abrirWeb" : "nada" };
    // Una ventana cualquiera: del mismo programa y del mismo repo (el título cambia con la pestaña o el fichero).
    if (e.repo && e.proceso) {
      const del = tomar((v) => v.proceso.toLowerCase() === /** @type {string} */ (e.proceso).toLowerCase() && v.titulo.toLowerCase().includes(/** @type {string} */ (e.repo).toLowerCase()));
      if (del) return { entrada: e, hwnd: del.hwnd, hacer: "traer" };
    }
    return { entrada: e, hwnd: null, hacer: "nada" };
  });
}

/**
 * El espacio como se guarda (y lo que se lee, validado: un fichero a medias o de otra versión, vacío).
 * @param {unknown} datos @returns {Entrada[]}
 */
export function leerEspacio(datos) {
  const d = /** @type {any} */ (datos);
  if (!d || d.version !== VERSION || !Array.isArray(d.pantallas)) return [];
  const numeros = (/** @type {unknown} */ a, /** @type {number} */ n) => Array.isArray(a) && a.length === n && a.every((x) => Number.isFinite(x));
  return d.pantallas.filter((/** @type {any} */ e) =>
    e && ["vscode", "web", "ventana"].includes(e.tipo) && typeof e.titulo === "string" && numeros(e.pos, 3) && numeros(e.giro, 4) && Number.isFinite(e.escala))
    .slice(0, MAX_PANTALLAS);
}

/** @param {Entrada[]} pantallas */
export const espacioParaGuardar = (pantallas) => ({ version: VERSION, guardado: new Date().toISOString(), pantallas: pantallas.slice(0, MAX_PANTALLAS) });
