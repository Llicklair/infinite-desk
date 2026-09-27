// El sonido de la zona zen: el rumor de la cascada, la lluvia, el fuego, la puerta y el plop de las
// piedras (sintetizados, sin ficheros).

export function crearSonido() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let cascada = null;
  /** @type {GainNode | null} */
  let lluvia = null;
  /** @type {BiquadFilterNode | null} */
  let filtroLluvia = null;
  /** @type {AudioBuffer | null} */
  let ruido = null;
  function preparar() {
    if (ctx) return ctx;
    try { ctx = new AudioContext(); } catch { return null; }
    // Ruido rosado filtrado: agua que cae, de lejos.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const fuente = ctx.createBufferSource();
    fuente.buffer = buf;
    fuente.loop = true;
    const paso = ctx.createBiquadFilter();
    paso.type = "lowpass";
    paso.frequency.value = 1100;
    cascada = ctx.createGain();
    cascada.gain.value = 0;
    fuente.connect(paso).connect(cascada).connect(ctx.destination);
    fuente.start();
    // La lluvia: el mismo ruido, más rápido (más agudo); dentro de la cabaña, amortiguada.
    const fuenteL = ctx.createBufferSource();
    fuenteL.buffer = buf;
    fuenteL.loop = true;
    fuenteL.playbackRate.value = 1.8;
    filtroLluvia = ctx.createBiquadFilter();
    filtroLluvia.type = "lowpass";
    filtroLluvia.frequency.value = 4500;
    lluvia = ctx.createGain();
    lluvia.gain.value = 0;
    fuenteL.connect(filtroLluvia).connect(lluvia).connect(ctx.destination);
    fuenteL.start();
    ruido = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const r = ruido.getChannelData(0);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    return ctx;
  }
  /** Un golpe corto de ruido filtrado (una chispa, un sorbo). @param {number} dur @param {number} vol @param {BiquadFilterType} tipo @param {number} f */
  function golpe(dur, vol, tipo, f) {
    if (!ctx || !ruido) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = ruido;
    const fl = ctx.createBiquadFilter();
    fl.type = tipo;
    fl.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(fl).connect(g).connect(ctx.destination);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur);
  }
  return {
    /** @param {boolean} si */
    ambiente(si) {
      const c = si ? preparar() : ctx;
      if (!c || !cascada) return;
      if (si) void c.resume();
      cascada.gain.cancelScheduledValues(c.currentTime);
      // Bajita, de fondo (uso real: "baja el volumen de la cascada"; con 0,3 tapaba la música).
      cascada.gain.setTargetAtTime(si ? 0.1 : 0, c.currentTime, 0.6);
      if (!si && lluvia) lluvia.gain.setTargetAtTime(0, c.currentTime, 0.4);
    },
    /** @param {number} nivel 0-1 @param {boolean} dentro en la cabaña: más apagada, como en el tejado */
    lluvia(nivel, dentro) {
      if (!ctx || !lluvia || !filtroLluvia) return;
      const t = ctx.currentTime;
      lluvia.gain.setTargetAtTime(nivel * (dentro ? 0.3 : 0.2), t, 0.5);
      filtroLluvia.frequency.setTargetAtTime(dentro ? 650 : 4500, t, 0.3);
    },
    /** El fuego crepita. @param {number} vol */
    chispa(vol) { golpe(0.05 + Math.random() * 0.05, vol, "bandpass", 1800 + Math.random() * 1800); },
    sorbo() { golpe(0.35, 0.05, "lowpass", 700); },
    puerta() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const fl = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(190, t);
      o.frequency.linearRampToValueAtTime(120, t + 0.45);
      fl.type = "lowpass";
      fl.frequency.value = 700;
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      o.connect(fl).connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.5);
    },
    /** El agua al recibir una piedra: grave y redondo si se hunde, corto y agudo si rebota. @param {"bote" | "hundir"} tipo */
    agua(tipo) {
      const c = ctx;
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      const [f0, f1, dur, vol] = tipo === "hundir" ? [520, 150, 0.22, 0.22] : [950, 480, 0.08, 0.1];
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.6);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur * 1.7);
    },
  };
}
