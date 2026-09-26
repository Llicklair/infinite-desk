// Hablar con un personaje del mundo: Kiri, el espíritu de la zona zen (para desahogarse, recuerda
// cosas de uno), o Atlas, el asistente de trabajo del mundo normal. El panel y la voz (V, sin abrir
// nada) son los mismos; cambian quién es, cómo suena y qué se le pide al puente. Se le habla
// escribiendo o de viva voz (reconocimiento de voz del navegador), contesta por escrito y en voz
// alta (las voces del sistema: en Edge, las naturales), y lo que recuerda (Kiri) está a la vista y
// se puede borrar. Si lo dicho suena a crisis, además de lo que diga, sale el 024. "Sígueme",
// "quédate aquí" y "vuelve" lo mueven (src/apoyo.js). La conversación vive solo aquí, en memoria.
import { NOMBRE, base64, ordenDeMovimiento, paraVoz, pareceCrisis } from "./apoyo.js";

/** @typedef {import("./apoyo.js").Turno} Turno */
/** @typedef {import("./apoyo.js").Recuerdo} Recuerdo */
/** @typedef {{seguir: () => void, quedarse: () => void, volver: () => void, hablando: boolean, escuchando: boolean}} Figura */
/**
 * Quién es: nombre, presentación, cómo suena y qué se le pide al puente para que conteste.
 * @typedef {{nombre: string, sub: string, saludo: (es: boolean) => string, pedir: (turnos: Turno[]) => string[],
 *   recuerda: boolean, voz: {ritmo: number, tono: number, volumen: number, pausaMs: number}, claveVoz: string,
 *   vocesPreferidas: RegExp, volver: string, pie: string, clase: string}} Persona
 */

/**
 * Kiri: la voz, más lenta y algo más grave que la de serie, frase a frase con una pausa entre ellas
 * (uso real: "¿la voz puede ser relajante y zen?"). La que se elige se recuerda en este equipo.
 * @type {Persona}
 */
export const KIRI = {
  nombre: NOMBRE,
  sub: `A little fox spirit born from the waterfall's mist, here to listen. ${NOMBRE} is an AI (Claude): what you say goes to Anthropic to answer; what ${NOMBRE} remembers stays on this computer.`,
  saludo: (es) => (es ? `Hola, soy ${NOMBRE}. Aquí estoy. ¿Cómo estás, de verdad?` : `Hi, I'm ${NOMBRE}. I'm here. How are you, really?`),
  pedir: (turnos) => ["hablar", base64(JSON.stringify(turnos))],
  recuerda: true,
  voz: { ritmo: 0.86, tono: 0.94, volumen: 0.9, pausaMs: 380 },
  claveVoz: "infinite-desk.voz-de-kiri",
  vocesPreferidas: /elvira|ximena|dalia|vera|jenny|aria/i,
  volver: "Back to the bench",
  pie: `Esc: close · in the zone, V talks to ${NOMBRE} by voice without opening this`,
  clase: "kiri",
};

/**
 * @param {HTMLElement} panel
 * @param {Persona} persona
 * @param {{
 *   orquestador: (args: string[]) => Promise<{ok: boolean, datos?: any, error?: string}>,
 *   figura: () => Figura | null,
 *   avisar: (texto: string) => void,
 *   alCerrar: () => void,
 *   hacer: (accion: any) => void,
 * }} op `hacer`: lo que decide hacer (Kiri: música, un vídeo, el cielo; Atlas: abrir repos, ventanas…)
 */
export function crearCharla(panel, persona, op) {
  /** @type {Turno[]} */
  const turnos = [];
  /** @type {Recuerdo[]} */
  let recuerdos = [];
  let sinRecordar = 0; // turnos nuevos desde la última vez que se guardó lo que recuerda
  let pensando = false;
  let voz = true;
  const idioma = navigator.language?.startsWith("es") ? navigator.language : "es-ES";
  // El país de la voz: el del navegador, o el "propio" del idioma si no lo dice (es -> es-ES).
  const pais = idioma.includes("-") ? idioma : `${idioma}-${idioma.toUpperCase()}`;

  // --- el panel ---------------------------------------------------------------------------------
  /** @param {string} etiqueta @param {string} [clase] @param {string} [texto] */
  const el = (etiqueta, clase, texto) => {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };
  const cabecera = el("div", "cabecera");
  panel.classList.add("charla", persona.clase);
  cabecera.append(el("h2", "", persona.nombre), el("p", "sub", persona.sub));
  const crisis = el("div", "crisis");
  crisis.hidden = true;
  crisis.append(el("b", "", "You matter. "), "If you're in danger or thinking of hurting yourself, call ", el("b", "", "024"), " (free, 24 h, Spain) or ", el("b", "", "112"), ". Talking to someone you trust helps too.");
  const mensajes = el("div", "mensajes");
  const entrada = /** @type {HTMLTextAreaElement} */ (el("textarea"));
  entrada.rows = 2;
  entrada.placeholder = `Tell ${persona.nombre} anything… (Enter to send)`;
  const microfono = /** @type {HTMLButtonElement} */ (el("button", "mic", "🎙"));
  microfono.title = "Talk (click, speak, and it sends by itself)";
  const enviarBoton = /** @type {HTMLButtonElement} */ (el("button", "enviar", "Send"));
  const fila = el("div", "fila");
  fila.append(entrada, microfono, enviarBoton);
  const mover = el("div", "mover");
  /** @type {[string, "seguir" | "quedarse" | "volver"][]} */
  const botonesMover = [["Follow me", "seguir"], ["Stay here", "quedarse"], [persona.volver, "volver"]];
  for (const [texto, que] of botonesMover) {
    const b = el("button", "", texto);
    b.addEventListener("click", () => moverse(que));
    mover.append(b);
  }
  const vozBoton = /** @type {HTMLButtonElement} */ (el("button", "voz"));
  const pintarVoz = () => { vozBoton.textContent = voz ? "🔊 Voice on" : "🔈 Voice off"; };
  pintarVoz();
  vozBoton.addEventListener("click", () => { voz = !voz; if (!voz) callar(); pintarVoz(); });
  // Qué voz: las del idioma, las naturales primero (en Edge suenan mucho mejor).
  const selectorVoz = /** @type {HTMLSelectElement} */ (el("select", "elegir-voz"));
  selectorVoz.title = `${persona.nombre}'s voice`;
  selectorVoz.addEventListener("change", () => {
    laVoz = speechSynthesis.getVoices().find((v) => v.name === selectorVoz.value) ?? laVoz;
    try { localStorage.setItem(persona.claveVoz, selectorVoz.value); } catch { /* sin almacenamiento: solo esta vez */ }
    decir(idioma.startsWith("es") ? "Así sueno ahora." : "This is how I sound now.");
  });
  mover.append(vozBoton, selectorVoz);
  const memoria = /** @type {HTMLDetailsElement} */ (el("details", "memoria"));
  const resumen = el("summary");
  const lista = el("ul");
  const olvidarTodo = /** @type {HTMLButtonElement} */ (el("button", "olvidar", "Forget everything"));
  olvidarTodo.addEventListener("click", async () => {
    if (!confirm(`Forget everything ${persona.nombre} remembers about you?`)) return;
    const r = await op.orquestador(["olvidar", "todo"]);
    if (r.ok) ponerRecuerdos(r.datos?.recuerdos ?? []);
  });
  memoria.append(resumen, lista, olvidarTodo);
  memoria.hidden = !persona.recuerda;
  const pie = el("p", "pie", persona.pie);
  panel.replaceChildren(cabecera, crisis, mensajes, fila, mover, memoria, pie);

  /** @param {Recuerdo[]} r */
  function ponerRecuerdos(r) {
    recuerdos = r;
    resumen.textContent = `What ${persona.nombre} remembers about you (${r.length})`;
    lista.replaceChildren(...(r.length ? r.map((x) => {
      const li = el("li");
      const b = el("button", "quitar", "×");
      b.title = "Forget this";
      b.addEventListener("click", async () => {
        const res = await op.orquestador(["olvidar", x.id]);
        if (res.ok) ponerRecuerdos(res.datos?.recuerdos ?? []);
      });
      li.append(el("span", "", x.texto), el("span", "fecha", ` · ${x.fecha}`), b);
      return li;
    }) : [el("li", "vacio", "Nothing yet. After you talk, it keeps what a good friend would remember.")]));
    olvidarTodo.hidden = !r.length;
  }

  function pintarMensajes() {
    mensajes.replaceChildren(...turnos.map((t) => el("div", t.quien === "yo" ? "yo" : "espiritu", t.texto)));
    if (pensando) mensajes.append(el("div", "espiritu pensando", "…"));
    if (!turnos.length && !pensando) mensajes.append(el("div", "espiritu", persona.saludo(idioma.startsWith("es"))));
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  // --- la voz: oír y hablar ---------------------------------------------------------------------
  /** @type {SpeechSynthesisVoice | null} */
  let laVoz = null;
  function elegirVoz() {
    const natural = (/** @type {SpeechSynthesisVoice} */ v) => /natural|online/i.test(v.name);
    const todas = speechSynthesis.getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(idioma.slice(0, 2).toLowerCase()))
      .sort((a, b) => Number(natural(b)) - Number(natural(a)) || Number(b.lang === pais) - Number(a.lang === pais));
    let guardada = null;
    try { guardada = localStorage.getItem(persona.claveVoz); } catch { /* sin almacenamiento */ }
    // Por defecto, una natural y suave del país (Edge: Elvira, Ximena…), si la hay.
    laVoz = todas.find((v) => v.name === guardada) ?? todas.find((v) => natural(v) && v.lang === pais && persona.vocesPreferidas.test(v.name))
      ?? todas.find((v) => natural(v) && v.lang === pais) ?? todas.find(natural) ?? todas[0] ?? null;
    selectorVoz.replaceChildren(...todas.map((v) => {
      const o = /** @type {HTMLOptionElement} */ (el("option", "", v.name.replace(/^Microsoft\s+/, "").replace(/\s+-\s+.*$/, "")));
      o.value = v.name;
      o.selected = v === laVoz;
      return o;
    }));
    selectorVoz.hidden = todas.length < 2;
  }
  if (typeof speechSynthesis !== "undefined") {
    elegirVoz();
    speechSynthesis.addEventListener("voiceschanged", elegirVoz);
  }
  let turnoDeVoz = 0; // cada respuesta nueva corta la anterior
  function callar() {
    turnoDeVoz++;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    const e = op.figura();
    if (e) e.hablando = false;
  }
  /** Lo dice despacio, frase a frase, con una pausa entre ellas. @param {string} texto */
  function decir(texto) {
    if (!voz || typeof speechSynthesis === "undefined") return;
    callar();
    const mio = turnoDeVoz;
    const frases = paraVoz(texto).split(/(?<=[.!?…;:])\s+/).filter((f) => f.trim());
    const e = op.figura();
    const siguiente = (/** @type {number} */ i) => {
      if (mio !== turnoDeVoz) return;
      if (i >= frases.length) { if (e) e.hablando = false; return; }
      const u = new SpeechSynthesisUtterance(frases[i]);
      if (laVoz) u.voice = laVoz;
      u.lang = laVoz?.lang ?? idioma;
      u.rate = persona.voz.ritmo;
      u.pitch = persona.voz.tono;
      u.volume = persona.voz.volumen;
      u.onstart = () => { if (e) e.hablando = true; };
      u.onend = () => { if (e) e.hablando = false; setTimeout(() => siguiente(i + 1), persona.voz.pausaMs); };
      u.onerror = () => { if (e) e.hablando = false; };
      speechSynthesis.speak(u);
    };
    siguiente(0);
  }

  const Reconocer = /** @type {any} */ (window).SpeechRecognition ?? /** @type {any} */ (window).webkitSpeechRecognition;
  /** @type {any} */
  let oido = null;
  /**
   * Escucha una frase y la devuelve (o null si no se oyó nada o no se puede).
   * @param {(parcial: string) => void} mientras lo que va entendiendo
   * @returns {Promise<string | null>}
   */
  function escuchar(mientras) {
    if (!Reconocer) {
      op.avisar("This browser can't listen (no speech recognition): type instead");
      return Promise.resolve(null);
    }
    oido?.abort();
    callar(); // si le hablas, se calla
    const e = op.figura();
    return new Promise((resolver) => {
      const r = new Reconocer();
      oido = r;
      r.lang = idioma;
      r.interimResults = true;
      r.continuous = false;
      let final = "";
      r.onstart = () => { if (e) e.escuchando = true; microfono.classList.add("oyendo"); };
      r.onresult = (/** @type {any} */ ev) => {
        let parcial = "";
        for (const res of ev.results) (res.isFinal ? (final += res[0].transcript) : (parcial += res[0].transcript));
        mientras(final + parcial);
      };
      r.onerror = (/** @type {any} */ ev) => {
        if (ev.error === "not-allowed") op.avisar("The microphone is blocked: allow it for this page to talk by voice");
        else if (ev.error === "network") op.avisar("Speech recognition needs internet (the browser sends the audio to its service)");
      };
      r.onend = () => {
        if (e) e.escuchando = false;
        microfono.classList.remove("oyendo");
        oido = null;
        resolver(final.trim() || null);
      };
      r.start();
    });
  }

  // --- hablar -------------------------------------------------------------------------------------
  /** @param {"seguir" | "quedarse" | "volver"} que @param {boolean} [avisando] */
  function moverse(que, avisando = true) {
    const e = op.figura();
    if (!e) return;
    if (que === "seguir") e.seguir();
    else if (que === "quedarse") e.quedarse();
    else e.volver();
    if (avisando) op.avisar(que === "seguir" ? `${persona.nombre} follows you` : que === "quedarse" ? `${persona.nombre} stays here` : `${persona.nombre} goes back`);
  }

  /**
   * Lo que uno dice: se apunta, se mira si hay que moverse o dar el 024, y contesta el espíritu.
   * @param {string} texto @returns {Promise<string | null>} lo que contestó
   */
  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || pensando) return null;
    turnos.push({ quien: "yo", texto });
    sinRecordar++;
    if (pareceCrisis(texto)) crisis.hidden = false;
    const orden = ordenDeMovimiento(texto);
    if (orden) moverse(orden, false);
    pensando = true;
    pintarMensajes();
    const r = await op.orquestador(persona.pedir(turnos));
    pensando = false;
    const respuesta = r.ok && r.datos?.texto ? String(r.datos.texto) : null;
    if (respuesta) {
      turnos.push({ quien: "espiritu", texto: respuesta });
      sinRecordar++;
      decir(respuesta);
      // Lo que decide hacer (poner música, un vídeo, cambiar el cielo): lo hace el mundo.
      for (const a of /** @type {any[]} */ (r.datos?.acciones ?? [])) op.hacer(a);
    } else {
      turnos.pop();
      sinRecordar--;
      op.avisar(`${persona.nombre} can't answer right now: ${r.error ?? "no reply"}`);
      if (!panel.hidden) entrada.value = texto;
    }
    pintarMensajes();
    return respuesta;
  }

  enviarBoton.addEventListener("click", () => { const t = entrada.value; entrada.value = ""; void enviar(t); });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const t = entrada.value;
      entrada.value = "";
      void enviar(t);
    }
  });
  microfono.addEventListener("click", async () => {
    if (oido) { oido.stop(); return; }
    const dicho = await escuchar((p) => (entrada.value = p));
    entrada.value = "";
    if (dicho) void enviar(dicho);
  });

  /** Guardar lo que merece recordar de lo hablado (en segundo plano). */
  function recordar() {
    if (!persona.recuerda || sinRecordar === 0 || !turnos.some((t) => t.quien === "yo")) return;
    sinRecordar = 0;
    void op.orquestador(["recordar", base64(JSON.stringify(turnos))]).then((r) => { if (r.ok) ponerRecuerdos(r.datos?.recuerdos ?? []); });
  }

  return {
    get abierto() { return !panel.hidden; },
    async abrir() {
      panel.hidden = false;
      pintarMensajes();
      entrada.focus();
      if (!persona.recuerda) return;
      const r = await op.orquestador(["recuerdos"]);
      ponerRecuerdos(r.ok ? r.datos?.recuerdos ?? [] : recuerdos);
    },
    cerrar() {
      if (panel.hidden) return;
      panel.hidden = true;
      oido?.abort();
      recordar();
      op.alCerrar();
    },
    /** V en la zona: escucha una frase y contesta en voz alta, sin abrir el panel (subtítulos en el aviso). */
    async hablarPorVoz() {
      if (oido) { oido.stop(); return; }
      op.avisar("🎙 Listening… (V again to stop)");
      const dicho = await escuchar((p) => op.avisar(`🎙 ${p}`));
      if (!dicho) { op.avisar("I didn't catch anything"); return; }
      op.avisar(`You: ${dicho}`);
      const r = await enviar(dicho);
      if (r) op.avisar(`${persona.nombre}: ${r}`);
    },
    /** Al salir de la zona: que recuerde lo hablado y se calle. */
    terminar() {
      oido?.abort();
      callar();
      recordar();
    },
  };
}
