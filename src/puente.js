// Cliente del puente nativo (ADR 0002): infinitas-puente escucha en 127.0.0.1 y actúa sobre las
// ventanas capturadas. Sin puente el mundo funciona como en la fase 1.
//
// El puente puede arrancar DESPUÉS que la página (primer uso real: el mundo ya estaba abierto y
// Enter abrió otro VS Code). Así que no se conecta una vez al cargar: reintenta mientras no
// haya conexión, releyendo puente-config.js por si aún no existía cuando cargó la página.

const REINTENTO_MS = 3000;

/**
 * @typedef {{
 *   readonly conectado: boolean,
 *   readonly atajo: string | null,
 *   titulo(hwnd: number): Promise<string | null>,
 *   entrar(hwnd: number): Promise<string | null>,
 *   salir(): void,
 *   raton(hwnd: number, tipo: "mover" | "bajar" | "doble" | "subir" | "rueda",
 *     u: number, v: number, e: {button?: number, buttons?: number}, delta?: number): void,
 *   alSalir(f: () => void): void,
 *   regenerar(): Promise<boolean>,
 *   alGrafos(f: (r: {ok: boolean, motivo: string, resumen: string}) => void): void,
 *   escritorio(): Promise<import("./ficheros.js").Cosa[]>,
 *   abrir(que: {ruta?: string, especial?: "explorador" | "navegador"}): Promise<string | null>,
 *   alAgentes(f: (m: EstadoAgentes) => void): void,
 * }} Puente
 * @typedef {{repo: string, agentes: import("./vinculo.js").Agente[], cruces: string[]}} EstadoAgentes
 *   quién toca qué en un repo, según `gb who --json` (lo pregunta el puente al ver cambios)
 */

/**
 * Vuelve a cargar un script clásico de wallpaper/ (puente-config.js, grafos.js): desde file://
 * no hay fetch de ficheros locales (ARCHITECTURE 3), pero un <script> nuevo sí vale.
 * @param {string} nombre
 * @returns {Promise<void>}
 */
export function releerScript(nombre) {
  return new Promise((listo) => {
    const s = document.createElement("script");
    s.src = `${nombre}?${Date.now()}`;
    s.onload = s.onerror = () => { s.remove(); listo(undefined); };
    document.head.appendChild(s);
  });
}

/**
 * @param {string} [tituloMundo] título único de la ventana del mundo: el puente la busca por él
 *   para hacerla "en capas" y que lo capturado debajo siga vivo (ADR 0002, vídeos).
 * @returns {Puente}
 */
export function crearPuente(tituloMundo) {
  /** @type {WebSocket | null} */
  let ws = null;
  let siguiente = 0;
  /** @type {Map<number, (r: any) => void>} */
  const esperando = new Map();
  /** @type {(() => void)[]} */
  const alSalir = [];
  /** @type {((r: {ok: boolean, motivo: string, resumen: string}) => void)[]} */
  const alGrafos = [];
  /** @type {((m: EstadoAgentes) => void)[]} */
  const alAgentes = [];

  async function conectar() {
    if (!window.INFINITAS_PUENTE) await releerScript("puente-config.js");
    const config = window.INFINITAS_PUENTE;
    if (!config) return setTimeout(conectar, REINTENTO_MS);
    const nuevo = new WebSocket(`ws://127.0.0.1:${config.puerto}/?token=${config.token}`);
    nuevo.addEventListener("open", () => {
      ws = nuevo;
      if (tituloMundo) pedir({ op: "mundo", titulo: tituloMundo });
      // Lo que ya se sabe de los agentes: sin esperar al próximo cambio en disco.
      pedir({ op: "agentes" }).then((r) => {
        for (const m of r.repos ?? []) for (const f of alAgentes) f(m);
      });
    });
    nuevo.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.evento === "salir") for (const f of alSalir) f();
      if (m.evento === "grafos") for (const f of alGrafos) f(m);
      if (m.evento === "agentes") for (const f of alAgentes) f(m);
      esperando.get(m.id)?.(m);
      esperando.delete(m.id);
    });
    nuevo.addEventListener("close", () => {
      if (ws === nuevo) ws = null;
      for (const r of esperando.values()) r({ ok: false, error: "puente desconectado" });
      esperando.clear();
      window.INFINITAS_PUENTE = undefined; // por si cambió: se relee en el siguiente intento
      setTimeout(conectar, REINTENTO_MS);
    });
  }
  conectar();

  /** @param {Record<string, unknown>} m @returns {Promise<any>} */
  function pedir(m) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, error: "puente desconectado" });
    const id = ++siguiente;
    ws.send(JSON.stringify({ ...m, id }));
    return new Promise((r) => esperando.set(id, r));
  }

  return {
    get conectado() { return ws !== null && ws.readyState === WebSocket.OPEN; },
    get atajo() { return window.INFINITAS_PUENTE?.atajo ?? null; }, // el atajo global de salir, si consiguió uno
    async titulo(hwnd) {
      const r = await pedir({ op: "titulo", hwnd });
      return r.ok ? r.titulo : null;
    },
    async entrar(hwnd) {
      const r = await pedir({ op: "entrar", hwnd });
      return r.ok ? null : r.error ?? "error desconocido";
    },
    salir() { pedir({ op: "salir" }); },
    raton(hwnd, tipo, u, v, e, delta = 0) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ op: "raton", hwnd, tipo, u, v, boton: e.button ?? 0, botones: e.buttons ?? 0, delta }));
    },
    alSalir(f) { alSalir.push(f); },
    /** @returns {Promise<boolean>} false si ya había una regeneración en marcha (se repetirá) */
    async regenerar() {
      const r = await pedir({ op: "regenerar" });
      return Boolean(r.ok && r.empezado);
    },
    alGrafos(f) { alGrafos.push(f); },
    async escritorio() {
      const r = await pedir({ op: "escritorio" });
      return r.ok ? r.cosas : [];
    },
    alAgentes(f) { alAgentes.push(f); },
    async abrir(que) {
      const r = await pedir({ op: "abrir", ...que });
      return r.ok ? null : r.error ?? "error desconocido";
    },
  };
}

/**
 * El HWND de una ventana capturada: Chromium etiqueta la pista como `window:<HWND>:<n>`.
 * @param {string} etiqueta
 */
export function hwndDeEtiqueta(etiqueta) {
  const m = /^window:(\d+):/.exec(etiqueta);
  return m ? Number(m[1]) : null;
}
