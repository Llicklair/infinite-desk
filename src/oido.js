// El oído (wallpaper/oido.html): corre en un Chrome pequeño fuera de la pantalla que abre el puente
// (Program.cs, /oido), y solo transcribe. El reconocimiento de voz de Edge, donde vive el mundo,
// devuelve texto vacío en este equipo; el de Chrome, ya instalado, entiende (medido con una frase
// grabada). El mundo le pide "escucha" por el puente, con qué micrófono (por su nombre: los ids no
// valen de un navegador a otro) y en qué idioma; esto devuelve lo parcial y lo final.

/** @type {any} */
const Reconocer = /** @type {any} */ (window).SpeechRecognition ?? /** @type {any} */ (window).webkitSpeechRecognition;
/** @type {Map<string, any>} las escuchas en marcha, por si llega "parar" */
const enMarcha = new Map();

function conectar() {
  const config = /** @type {any} */ (window).INFINITE_DESK_PUENTE;
  if (!config) { setTimeout(() => location.reload(), 3000); return; }
  const ws = new WebSocket(`ws://127.0.0.1:${config.puerto}/oido?token=${config.token}`);
  /** @param {object} m */
  const enviar = (m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.t === "escuchar") void escuchar(m.escucha, m.micro ?? "", m.idioma ?? "es-ES", enviar);
    if (m.t === "parar") enMarcha.get(m.escucha)?.stop();
  });
  ws.addEventListener("close", () => setTimeout(conectar, 2000));
  document.title = "infinite-desk · oído";
}

/**
 * Una frase del micrófono llamado `micro` ("" o sin coincidencia: el de Windows por defecto).
 * @param {string} escucha @param {string} micro @param {string} idioma @param {(m: object) => void} enviar
 */
async function escuchar(escucha, micro, idioma, enviar) {
  const eventos = /** @type {string[]} */ ([]);
  /** @param {string} texto @param {string | null} error */
  const fin = (texto, error) => enviar({ t: "fin", escucha, texto, error, eventos: eventos.join(" ") });
  if (!Reconocer) return fin("", "no speech recognition in this browser");
  /** @type {MediaStream | null} */
  let flujo = null;
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then((f) => f.getTracks().forEach((t) => t.stop())); // para ver los nombres
    const d = (await navigator.mediaDevices.enumerateDevices()).find((x) => x.kind === "audioinput" && micro && x.label === micro);
    flujo = await navigator.mediaDevices.getUserMedia({ audio: d ? { deviceId: { exact: d.deviceId } } : true });
    eventos.push(d ? "micro-elegido" : "micro-por-defecto");
  } catch (e) {
    return fin("", `microphone: ${/** @type {Error} */ (e).name}`);
  }
  const r = new Reconocer();
  enMarcha.set(escucha, r);
  r.lang = idioma;
  r.interimResults = true;
  // Continuo: una pausa al respirar no corta la frase. Se acaba tras 1,5 s sin nada nuevo después de
  // haber hablado, al pulsar V otra vez (parar) o a los 30 s.
  r.continuous = true;
  let final = "", parcial = "", error = /** @type {string | null} */ (null);
  let ultimo = 0;
  const inicio = performance.now();
  const vigia = setInterval(() => {
    const ahora = performance.now();
    if ((ultimo && ahora - ultimo > 1500) || ahora - inicio > 30000) r.stop();
  }, 200);
  for (const ev of ["start", "audiostart", "soundstart", "speechstart", "speechend"]) r.addEventListener(ev, () => eventos.push(ev));
  r.onresult = (/** @type {any} */ e) => {
    // e.results trae TODO lo reconocido hasta ahora: se rehace entero (sumándolo, se repetía).
    final = "";
    parcial = "";
    for (const res of e.results) (res.isFinal ? (final += res[0].transcript) : (parcial += res[0].transcript));
    if (!eventos.includes("result")) eventos.push("result");
    ultimo = performance.now();
    enviar({ t: "parcial", escucha, texto: final + parcial });
  };
  r.onerror = (/** @type {any} */ e) => { error = e.error; eventos.push(`error:${e.error}`); };
  r.onend = () => {
    clearInterval(vigia);
    eventos.push("end");
    enMarcha.delete(escucha);
    for (const t of flujo?.getTracks() ?? []) t.stop();
    const texto = (final || parcial).trim();
    fin(texto, texto ? null : error ?? (eventos.includes("speechstart") ? "nomatch" : "no-speech"));
  };
  const pista = flujo.getAudioTracks()[0];
  try { r.start(pista); } catch { r.start(); }
}

conectar();
