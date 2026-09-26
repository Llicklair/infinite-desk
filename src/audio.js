// La voz de entrada, en un sitio: el permiso del micrófono, qué micrófono (se elige en Ajustes o en
// el panel de Kiri/Atlas y se recuerda), su nivel, y escuchar una frase con el reconocimiento de voz
// del navegador devolviendo lo entendido O el porqué exacto de no entender nada. Uso real: "pulso V,
// hablo y dice I didn't catch anything; quizás debamos configurar la entrada y la salida de audio".

const CLAVE_MIC = "infinite-desk.microfono";
/** El reconocimiento de voz del navegador (Chromium: webkitSpeechRecognition), o null. */
export const Reconocer = /** @type {any} */ (window).SpeechRecognition ?? /** @type {any} */ (window).webkitSpeechRecognition ?? null;

/**
 * El idioma para la voz, siempre con país ("es-ES", no "es"): el reconocimiento de Edge falla con
 * un idioma sin país, y lo dice como error de red (medido: "es" -> error:network; "es-ES" -> bien).
 * Era el porqué de "pulso V, hablo y dice I didn't catch anything". El primero con país de los del
 * navegador; si no hay, el propio del idioma (es -> es-ES); castellano si el navegador no lo es.
 */
export function idiomaDeVoz() {
  const base = navigator.language?.startsWith("es") ? "es" : (navigator.language ?? "es").slice(0, 2);
  const lista = navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
  return lista.find((l) => l.startsWith(`${base}-`)) ?? (base === "en" ? "en-US" : `${base}-${base.toUpperCase()}`);
}

/** El micrófono elegido ("" = el de Windows por defecto). */
export function micGuardado() { try { return localStorage.getItem(CLAVE_MIC) ?? ""; } catch { return ""; } }
/** @param {string} id */
export function guardarMic(id) { try { localStorage.setItem(CLAVE_MIC, id); } catch { /* solo esta vez */ } }
/** El nombre de un micrófono, sin el "(046d:0afe)" del final. @param {MediaDeviceInfo} d */
export function nombreDeMic(d) {
  const limpio = d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
  return d.deviceId === "default" ? `Windows default: ${limpio.replace(/^[^-]*-\s*/, "")}` : limpio;
}

/** Los micrófonos (con nombre solo si ya hay permiso). @returns {Promise<MediaDeviceInfo[]>} */
export async function micros() {
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId !== "communications");
}
/** Los altavoces (solo para decir cuál suena: las voces van por el de Windows por defecto). @returns {Promise<MediaDeviceInfo[]>} */
export async function altavoces() {
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications");
}

/**
 * ¿Hay permiso de micrófono? Si nunca se ha pedido, se pide (con el ratón suelto: a pantalla
 * completa y con el ratón capturado, el aviso no se veía). null si hay, o el porqué de que no.
 * @returns {Promise<string | null>}
 */
export async function permiso() {
  let estado = "prompt";
  try { estado = (await navigator.permissions.query(/** @type {any} */ ({ name: "microphone" }))).state; } catch { /* se prueba */ }
  if (estado === "granted") return null;
  if (estado === "denied") return "The microphone is blocked for infinite-desk: allow it in edge://settings/content/microphone";
  document.exitPointerLock?.();
  try {
    const f = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of f.getTracks()) t.stop();
    return null;
  } catch (e) {
    return /** @type {Error} */ (e).name === "NotFoundError" ? "No microphone found: check it's plugged in (Windows sound settings)"
      : "The microphone wasn't allowed: allow it in edge://settings/content/microphone";
  }
}

/** El audio de un micrófono ("" = el de Windows por defecto). @param {string} id */
export const abrirMic = (id) => navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true });

/**
 * Cómo suena: llama a `alNivel` (0..1) cada ~50 ms hasta que se pare. Devuelve con qué pararlo.
 * @param {MediaStream} flujo @param {(n: number) => void} alNivel
 */
export function medir(flujo, alNivel) {
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  ctx.createMediaStreamSource(flujo).connect(an);
  const buf = new Float32Array(an.fftSize);
  const reloj = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let max = 0;
    for (const x of buf) max = Math.max(max, Math.abs(x));
    alNivel(max);
  }, 50);
  return () => { clearInterval(reloj); void ctx.close(); };
}

/** Lo más alto que suena en `ms` (0: silencio absoluto, un micro apagado o muteado). @param {MediaStream} flujo @param {number} ms */
export function nivel(flujo, ms) {
  return new Promise((r) => {
    let max = 0;
    const parar = medir(flujo, (n) => { max = Math.max(max, n); });
    setTimeout(() => { parar(); r(max); }, ms);
  });
}

/**
 * El audio del micrófono elegido; si da silencio absoluto, el primero que suene (se guarda y se dice).
 * @param {(aviso: string) => void} contar lo que conviene saber (se cambió de micrófono)
 * @returns {Promise<{flujo: MediaStream, nombre: string}>}
 */
export async function micQueOye(contar) {
  const lista = await micros();
  const nombre = (/** @type {string} */ id) => {
    const d = lista.find((x) => x.deviceId === (id || "default"));
    return d ? nombreDeMic(d) : "the default microphone";
  };
  const elegido = micGuardado();
  const flujo = await abrirMic(elegido).catch(() => abrirMic(""));
  if ((await nivel(flujo, 300)) > 0) return { flujo, nombre: nombre(elegido) };
  for (const d of lista) {
    if (d.deviceId === "default" || d.deviceId === elegido) continue;
    const otro = await abrirMic(d.deviceId).catch(() => null);
    if (!otro) continue;
    if ((await nivel(otro, 300)) > 0) {
      for (const t of flujo.getTracks()) t.stop();
      guardarMic(d.deviceId);
      contar(`${nombre(elegido)} gave only silence (muted or off?): using ${nombreDeMic(d)} (change it in Settings → Audio)`);
      return { flujo: otro, nombre: nombreDeMic(d) };
    }
    for (const t of otro.getTracks()) t.stop();
  }
  return { flujo, nombre: `${nombre(elegido)} (silent!)` };
}

/** Por qué no entendió nada, para cada error del reconocimiento. @type {Record<string, string>} */
export const PORQUE = {
  "not-allowed": "The microphone is blocked for infinite-desk: allow it in edge://settings/content/microphone",
  "service-not-allowed": "The browser won't let this page use speech recognition",
  "network": "Speech recognition needs internet (the browser sends the audio to its service), and it couldn't reach it",
  "audio-capture": "The microphone couldn't be opened (in use by another app, or unplugged)",
  "no-speech": "It heard no speech: check the level bar in Settings → Audio while you talk",
  "language-not-supported": "Speech recognition doesn't support this language here",
  "nomatch": "It heard you but couldn't make out the words: try again, a bit closer to the microphone",
  "aborted": "Stopped",
};

/**
 * Una frase: lo entendido, o el error; y los eventos por los que pasó (para el registro).
 * @param {{idioma: string, flujo: MediaStream | null, mientras?: (parcial: string) => void, alEmpezar?: () => void}} op
 * @returns {{promesa: Promise<{texto: string | null, error: string | null, eventos: string[]}>, parar: () => void, abortar: () => void}}
 */
export function unaFrase(op) {
  const r = new Reconocer();
  r.lang = op.idioma;
  r.interimResults = true;
  r.continuous = false;
  const eventos = /** @type {string[]} */ ([]);
  let final = "", ultimoParcial = "", error = /** @type {string | null} */ (null);
  const promesa = new Promise((resolver) => {
    for (const ev of ["audiostart", "soundstart", "speechstart", "speechend", "nomatch"]) r.addEventListener(ev, () => eventos.push(ev));
    r.onstart = () => { eventos.push("start"); op.alEmpezar?.(); };
    r.onresult = (/** @type {any} */ ev) => {
      let parcial = "";
      final = ""; // ev.results trae todo lo reconocido: se rehace entero
      for (const res of ev.results) (res.isFinal ? (final += res[0].transcript) : (parcial += res[0].transcript));
      ultimoParcial = parcial;
      if (!eventos.includes("result")) eventos.push("result");
      op.mientras?.(final + parcial);
    };
    r.onerror = (/** @type {any} */ ev) => { error = ev.error; eventos.push(`error:${ev.error}`); };
    r.onend = () => {
      eventos.push("end");
      // Si se corta antes de que el servicio cierre la frase, lo provisional vale (mejor que nada).
      if (!final.trim() && ultimoParcial.trim()) final = ultimoParcial;
      resolver({ texto: final.trim() || null, error: final.trim() ? null : error ?? (eventos.includes("speechstart") ? "nomatch" : "no-speech"), eventos });
    };
    // Del micrófono elegido (no del de Windows por defecto), si el navegador deja darle la pista.
    const pista = op.flujo?.getAudioTracks()[0];
    try { if (pista) { r.start(pista); eventos.push("con-pista"); } else r.start(); } catch { r.start(); eventos.push("sin-pista"); }
  });
  return { promesa, parar: () => r.stop(), abortar: () => r.abort() };
}
