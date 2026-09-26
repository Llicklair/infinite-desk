// El menú de ajustes (P): la carpeta de proyectos, cuyos repos son las islas; el audio (qué
// micrófono oye a Kiri y a Atlas, cómo suena y una prueba de voz); y el tutorial. Cada
// máquina tiene la suya (uso real: "en una máquina limpia la ruta puede ser distinta"); el
// puente abre el selector de carpetas del sistema, la guarda en infinite-desk.local.json y rehace
// las islas. Sin puente, `npm run carpeta` hace lo mismo desde la terminal. Y el tutorial, que
// enseña el mundo paso a paso (src/tutorial.js).
import { PORQUE, Reconocer, abrirMic, altavoces, guardarMic, idiomaDeVoz, medir, micGuardado, micros, nombreDeMic, oidoDelPuente, permiso, sinChrome, unaFrase } from "./audio.js";

/**
 * @param {HTMLElement} panel
 * @param {() => import("./puente.js").Puente | null} puente
 * @param {(texto: string) => void} avisar
 * @param {() => void} alCerrar
 * @param {(() => void) | null} [empezarTutorial]
 */
export function crearPanelAjustes(panel, puente, avisar, alCerrar, empezarTutorial = null) {
  const cabecera = document.createElement("h2");
  cabecera.textContent = "Settings";
  const titulo = document.createElement("h3");
  titulo.textContent = "Projects folder";
  const ruta = document.createElement("code");
  const detalle = document.createElement("p");
  const cambiar = document.createElement("button");
  cambiar.textContent = "Change…";
  const pie = document.createElement("p");
  pie.className = "pie";
  pie.textContent = "Every repo inside this folder is an island · Esc or P: close";
  const tituloTutorial = document.createElement("h3");
  tituloTutorial.textContent = "Tutorial";
  const textoTutorial = document.createElement("p");
  textoTutorial.textContent = "A short guided tour: moving, islands and their graphs, screens, the palantír, the master console and the zen zone. It moves on as you try each thing.";
  const botonTutorial = document.createElement("button");
  botonTutorial.textContent = "Start the tutorial";
  botonTutorial.addEventListener("click", () => {
    cerrar();
    empezarTutorial?.();
  });
  const tutorial = empezarTutorial ? [tituloTutorial, textoTutorial, botonTutorial] : [];

  // --- Audio: qué micrófono, cuánto suena, y una prueba de voz ------------------------------------
  // Uso real: "pulso V, hablo y dice I didn't catch anything; quizás debamos configurar la entrada y
  // la salida de audio". El reconocimiento del navegador escuchaba el micro de Windows por defecto,
  // que era uno en silencio.
  const tituloAudio = document.createElement("h3");
  tituloAudio.textContent = "Audio";
  const filaMic = document.createElement("div");
  filaMic.className = "fila-audio";
  const selectorMic = document.createElement("select");
  const permitir = document.createElement("button");
  permitir.textContent = "Allow the microphone";
  filaMic.append(selectorMic, permitir);
  const medidor = document.createElement("div");
  medidor.className = "medidor";
  const barra = document.createElement("div");
  medidor.append(barra);
  const estadoMic = document.createElement("p");
  const probar = document.createElement("button");
  probar.textContent = "Test: say something (5 s)";
  const resultado = document.createElement("p");
  resultado.className = "prueba";
  const salida = document.createElement("p");
  const audio = [tituloAudio, filaMic, medidor, estadoMic, probar, resultado, salida];
  const idioma = idiomaDeVoz();
  /** @type {MediaStream | null} */
  let flujo = null;
  /** @type {(() => void) | null} */
  let pararMedidor = null;
  let silencioDesde = 0;

  function soltarMic() {
    pararMedidor?.();
    pararMedidor = null;
    for (const t of flujo?.getTracks() ?? []) t.stop();
    flujo = null;
  }
  /** El micrófono elegido, con su barra de nivel en vivo (y si está en silencio absoluto, se dice). */
  async function escucharMic() {
    soltarMic();
    flujo = await abrirMic(micGuardado()).catch(() => null);
    if (!flujo) { estadoMic.textContent = "That microphone couldn't be opened (in use, or unplugged)."; return; }
    silencioDesde = performance.now();
    pararMedidor = medir(flujo, (n) => {
      barra.style.width = `${Math.min(100, Math.round(Math.sqrt(n) * 140))}%`;
      if (n > 0) silencioDesde = performance.now();
      estadoMic.textContent = performance.now() - silencioDesde > 1500
        ? "⚠ Total silence from this microphone: it's muted, off, or not the one you're using. Pick another above."
        : "Talk and watch the bar move. Kiri and Atlas listen through this microphone.";
    });
  }
  async function pintarAudio() {
    const lista = await micros();
    const conNombre = lista.some((d) => d.label);
    permitir.hidden = conNombre;
    selectorMic.hidden = !conNombre;
    medidor.hidden = !conNombre;
    probar.hidden = !conNombre || !Reconocer;
    if (!conNombre) { estadoMic.textContent = "To choose a microphone, allow it first."; return; }
    const elegido = micGuardado();
    selectorMic.replaceChildren(...lista.map((d) => {
      const o = document.createElement("option");
      o.value = d.deviceId === "default" ? "" : d.deviceId;
      o.textContent = nombreDeMic(d);
      o.selected = o.value === elegido;
      return o;
    }));
    const porDefecto = (await altavoces()).find((d) => d.deviceId === "default");
    salida.textContent = `Voices play through Windows' default output${porDefecto ? `: ${nombreDeMic(porDefecto).replace(/^Windows default: /, "")}` : ""} (change it in Windows sound settings).`;
    await escucharMic();
  }
  permitir.addEventListener("click", async () => {
    const no = await permiso();
    if (no) estadoMic.textContent = no;
    else await pintarAudio();
  });
  selectorMic.addEventListener("change", () => { guardarMic(selectorMic.value); resultado.textContent = ""; void escucharMic(); });
  probar.addEventListener("click", async () => {
    if (!flujo) return;
    probar.disabled = true;
    resultado.textContent = "Listening… say a sentence.";
    // Por el oído del puente (un Chrome escondido que transcribe), como Kiri y Atlas; sin puente, el navegador.
    const p = oidoDelPuente.hay ? puente() : null;
    /** @param {string} t */
    const mientras = (t) => (resultado.textContent = `“${t}”`);
    const frase = p?.conectado
      ? p.escuchar({ micro: flujo.getAudioTracks()[0]?.label ?? "", idioma }, mientras)
      : unaFrase({ idioma, flujo: flujo.clone(), mientras });
    if (p?.conectado) resultado.textContent = "Listening… say a sentence (the first time, the listener takes a few seconds to start).";
    const corte = setTimeout(() => frase.parar(), p?.conectado ? 9000 : 5000);
    let r = await frase.promesa;
    clearTimeout(corte);
    if (p?.conectado && sinChrome(r.error)) { // sin Chrome: el del navegador, y ya para siempre
      oidoDelPuente.hay = false;
      const otra = unaFrase({ idioma, flujo: flujo.clone(), mientras });
      const corte2 = setTimeout(() => otra.parar(), 5000);
      r = await otra.promesa;
      clearTimeout(corte2);
    }
    probar.disabled = false;
    resultado.textContent = r.texto ? `✓ Understood: “${r.texto}”` : `✗ ${PORQUE[r.error ?? ""] ?? r.error} · (${r.eventos.join(" → ")})`;
    puente()?.anotar(`voz (prueba en Ajustes, ${p?.conectado ? "oído Chrome" : "navegador"}, ${selectorMic.selectedOptions[0]?.textContent ?? "?"}): ${r.texto ? "entendido" : `nada: ${r.error}`} [${r.eventos.join(" ")}]`);
  });

  panel.replaceChildren(cabecera, titulo, ruta, detalle, cambiar, ...audio, ...tutorial, pie);

  /** @param {import("./puente.js").Carpeta} c */
  function pintar(c) {
    ruta.textContent = c.ruta; // textContent: una ruta no es HTML
    detalle.textContent = `${c.repos} repo${c.repos === 1 ? "" : "s"} with git → ${c.repos} island${c.repos === 1 ? "" : "s"}`;
  }

  cambiar.addEventListener("click", async () => {
    const p = puente();
    if (!p?.conectado) return;
    cambiar.disabled = true;
    cambiar.textContent = "The folder picker is open…";
    const r = await p.elegirCarpeta();
    cambiar.disabled = false;
    cambiar.textContent = "Change…";
    if (typeof r === "string") {
      if (r !== "cancelled") avisar(`Couldn't change the projects folder: ${r}`);
      return;
    }
    pintar(r);
    avisar(`Projects folder: ${r.ruta} · rebuilding the islands (about a minute; keep going)`);
  });

  async function abrir() {
    panel.hidden = false;
    void pintarAudio();
    const p = puente();
    const c = p?.conectado ? await p.carpeta() : null;
    cambiar.hidden = !c;
    if (c) pintar(c);
    else {
      ruta.textContent = "";
      detalle.textContent = "No bridge: from a terminal, npm run carpeta chooses it (then npm run grafo).";
    }
  }

  function cerrar() {
    if (panel.hidden) return;
    soltarMic();
    panel.hidden = true;
    alCerrar();
  }

  return {
    get abierto() { return !panel.hidden; },
    abrir,
    cerrar,
  };
}
