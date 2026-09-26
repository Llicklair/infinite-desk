// Chispas: el minijuego del palantír. Clic en la esfera y durante 45 s salen de ella chispas de luz
// que vuelan por el mundo; se cazan con la mira y clic. Cada acierto estalla en partículas y suena
// una nota más aguda que la anterior mientras dure la racha (src/juego.js lleva las cuentas).
// Pensado para el TDAH ("un minijuego full dopaminérgico", uso real): corto, recompensa en el acto,
// hitos que se celebran y ningún castigo más que cortar la racha. El sonido lo genera el navegador
// (Web Audio): nada que descargar. Fuera de la ronda no existe: ni pinta ni gasta.
import * as THREE from "three";
import { DURACION_S, esHito, intervaloDeAparicion, notaDeRacha, puntos, vidaDeChispa } from "./juego.js";

const MAX_CHISPAS = 6;
const RADIO_CHISPA = 0.8; // vuelan lejos, hacia el cielo: más grandes para que se vean
const RADIO_ACIERTO = 0.9; // generoso: se apunta con la mira, en movimiento
const MARGEN_POR_METRO = 0.045; // de lejos, el margen de acierto es un ángulo (~2,6°)
const ALTURA_MINIMA = 10; // m: por encima de las pantallas
const GRACIA_MS = 1000; // tras la ronda, los clics no hacen nada: la inercia no coge una pantalla
const CLAVE_RECORD = "infinite-desk.chispas.record";

/** @typedef {{malla: THREE.Mesh, origen: THREE.Vector3, destino: THREE.Vector3, curva: THREE.Vector3, nace: number, vive: number, tono: number}} Chispa */
/** @typedef {{puntos: THREE.Points, vel: Float32Array, nace: number}} Estallido */

const esfera = new THREE.SphereGeometry(RADIO_CHISPA, 20, 12);

/**
 * @param {THREE.Scene} escena
 * @param {HTMLElement} hud el marcador (DOM): racha, puntos y tiempo
 * @param {{origen: () => THREE.Vector3, alHito: () => void, avisar: (t: string) => void}} op
 *   `origen`: de dónde salen (el centro de la esfera del palantír); `alHito`: una racha redonda
 *   (el palantír se aviva)
 */
export function crearChispas(escena, hud, op) {
  /** @type {Chispa[]} */
  const chispas = [];
  /** @type {Estallido[]} */
  const estallidos = [];
  let activo = false;
  let inicio = 0;
  let acabo = -Infinity;
  let siguiente = 0;
  let racha = 0;
  let mejorRacha = 0;
  let total = 0;
  let aciertos = 0;
  /** @type {AudioContext | null} */
  let audio = null;

  let record = 0;
  try { record = Number(localStorage.getItem(CLAVE_RECORD)) || 0; } catch { /* sin almacenamiento: sin récord */ }

  // --- sonido ---------------------------------------------------------------------------------
  /** @param {number} frecuencia @param {number} dura @param {OscillatorType} [forma] @param {number} [volumen] */
  function tono(frecuencia, dura, forma = "triangle", volumen = 0.18) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gan = audio.createGain();
    osc.type = forma;
    osc.frequency.setValueAtTime(frecuencia, t);
    gan.gain.setValueAtTime(volumen, t);
    gan.gain.exponentialRampToValueAtTime(0.001, t + dura);
    osc.connect(gan).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dura);
  }
  /** Un arpegio corto hacia arriba: los hitos y el récord. @param {number} base */
  function arpegio(base) {
    [1, 1.25, 1.5, 2].forEach((k, i) => setTimeout(() => tono(base * k, 0.25, "square", 0.08), i * 70));
  }

  // --- efectos --------------------------------------------------------------------------------
  /** @param {THREE.Vector3} donde @param {THREE.Color} color @param {number} n */
  function estallar(donde, color, n) {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([donde.x, donde.y, donde.z], i * 3);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 5);
      vel.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({
      color, size: 0.18, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    escena.add(p);
    estallidos.push({ puntos: p, vel, nace: performance.now() });
  }

  /** @param {number} ahora */
  function soltar(ahora) {
    const origen = op.origen();
    // Hacia el cielo y lejos, curvándose por el camino: por encima de donde están las pantallas (a
    // la altura de los ojos). A su altura, las chispas volaban entre ellas y distraían ("puede dar
    // lugar a clicar pantallas sin querer", uso real).
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 16;
    const destino = new THREE.Vector3(origen.x + Math.cos(a) * r, ALTURA_MINIMA + Math.random() * 14, origen.z + Math.sin(a) * r);
    const curva = origen.clone().lerp(destino, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 6, (Math.random() - 0.5) * 10));
    const tonoColor = Math.random();
    const malla = new THREE.Mesh(esfera, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(tonoColor, 0.9, 0.62), transparent: true }));
    malla.position.copy(origen);
    escena.add(malla);
    chispas.push({ malla, origen, destino, curva, nace: ahora, vive: vidaDeChispa((ahora - inicio) / 1000) * 1000, tono: tonoColor });
  }

  /** @param {Chispa} c */
  function quitar(c) {
    escena.remove(c.malla);
    /** @type {THREE.Material} */ (c.malla.material).dispose();
    chispas.splice(chispas.indexOf(c), 1);
  }

  function pintarHud() {
    const quedan = Math.max(0, DURACION_S - (performance.now() - inicio) / 1000);
    hud.replaceChildren();
    const r = document.createElement("div");
    r.className = `racha${racha >= 10 ? " fuego" : ""}`;
    r.textContent = racha > 1 ? `×${racha}` : "";
    const p = document.createElement("div");
    p.className = "puntos";
    p.textContent = `${total} pts`;
    const barra = document.createElement("div");
    barra.className = "tiempo";
    barra.style.width = `${(quedan / DURACION_S) * 100}%`;
    hud.append(r, p, barra);
  }

  function terminar() {
    if (!activo) return;
    activo = false;
    acabo = performance.now();
    for (const c of [...chispas]) quitar(c);
    hud.hidden = true;
    const nuevo = total > record;
    if (nuevo) {
      record = total;
      try { localStorage.setItem(CLAVE_RECORD, String(record)); } catch { /* sin almacenamiento */ }
      // Confeti: varios estallidos grandes alrededor del palantír.
      const o = op.origen();
      for (let i = 0; i < 6; i++) estallar(o.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6)), new THREE.Color().setHSL(Math.random(), 0.9, 0.6), 80);
      arpegio(523);
      setTimeout(() => arpegio(784), 300);
    }
    op.avisar(`✨ ${total} points · best streak ×${mejorRacha} · ${aciertos} sparks${nuevo ? " · NEW RECORD!" : ` · record ${record}`}`);
  }

  return {
    get activo() { return activo; },
    /** El segundo justo después de la ronda: el mundo ignora los clics (la inercia de disparar). */
    get enGracia() { return performance.now() - acabo < GRACIA_MS; },
    /** Dónde están ahora las chispas (la demo sin manos dispara a ellas). */
    get objetivos() { return chispas.map((c) => c.malla.position.clone()); },
    empezar() {
      if (activo) return;
      // El audio solo puede arrancar tras un gesto del usuario: este clic lo es.
      try { audio ??= new AudioContext(); void audio.resume(); } catch { audio = null; }
      activo = true;
      inicio = performance.now();
      siguiente = inicio;
      racha = mejorRacha = total = aciertos = 0;
      hud.hidden = false;
      pintarHud();
      arpegio(392);
      op.avisar(`Sparks! Catch them with the crosshair and click · ${DURACION_S} s · record ${record}`);
    },
    terminar,
    /**
     * Un clic con la mira durante la ronda: ¿dio a alguna? Da a la más cercana al rayo que esté
     * dentro del radio de acierto.
     * @param {THREE.Ray} rayo
     */
    disparar(rayo) {
      if (!activo) return false;
      /** @type {Chispa | null} */
      let mejor = null;
      let holgura = Infinity;
      for (const c of chispas) {
        // El margen crece con la distancia (un ángulo, no metros): de lejos, igual de cazable.
        const margen = Math.max(RADIO_ACIERTO, rayo.origin.distanceTo(c.malla.position) * MARGEN_POR_METRO);
        const k = rayo.distanceToPoint(c.malla.position) / margen;
        if (k < 1 && k < holgura) { holgura = k; mejor = c; }
      }
      if (!mejor) {
        tono(140, 0.12, "sine", 0.1);
        return false;
      }
      racha++;
      aciertos++;
      mejorRacha = Math.max(mejorRacha, racha);
      total += puntos(racha);
      tono(notaDeRacha(racha), 0.22);
      estallar(mejor.malla.position.clone(), new THREE.Color().setHSL(mejor.tono, 0.9, 0.65), racha >= 10 ? 60 : 36);
      if (esHito(racha)) {
        arpegio(notaDeRacha(racha));
        op.alHito();
        op.avisar(`🔥 Streak ×${racha}!`);
      }
      quitar(mejor);
      pintarHud();
      return true;
    },
    /** @param {number} dt */
    tick(dt) {
      const ahora = performance.now();
      // Las partículas siguen aunque la ronda acabe (el confeti del récord).
      for (const e of [...estallidos]) {
        const edad = (ahora - e.nace) / 1000;
        const pos = /** @type {THREE.BufferAttribute} */ (e.puntos.geometry.getAttribute("position"));
        for (let i = 0; i < e.vel.length; i += 3) {
          e.vel[i + 1] -= 6 * dt; // caen un poco
          pos.array[i] += e.vel[i] * dt;
          pos.array[i + 1] += e.vel[i + 1] * dt;
          pos.array[i + 2] += e.vel[i + 2] * dt;
        }
        pos.needsUpdate = true;
        /** @type {THREE.PointsMaterial} */ (e.puntos.material).opacity = Math.max(0, 1 - edad / 0.9);
        if (edad > 0.9) {
          escena.remove(e.puntos);
          e.puntos.geometry.dispose();
          /** @type {THREE.Material} */ (e.puntos.material).dispose();
          estallidos.splice(estallidos.indexOf(e), 1);
        }
      }
      if (!activo) return;
      const transcurrido = (ahora - inicio) / 1000;
      if (transcurrido >= DURACION_S) return terminar();
      if (ahora >= siguiente && chispas.length < MAX_CHISPAS) {
        soltar(ahora);
        siguiente = ahora + intervaloDeAparicion(transcurrido) * 1000;
      }
      for (const c of [...chispas]) {
        const k = (ahora - c.nace) / c.vive;
        if (k >= 1) {
          // Se escapó: la racha se corta (sin más castigo).
          if (racha > 2) tono(196, 0.25, "sine", 0.12);
          racha = 0;
          quitar(c);
          pintarHud();
          continue;
        }
        // Curva de Bézier cuadrática origen -> curva -> destino, y latiendo.
        const u = 1 - k;
        c.malla.position.set(0, 0, 0)
          .addScaledVector(c.origen, u * u)
          .addScaledVector(c.curva, 2 * u * k)
          .addScaledVector(c.destino, k * k);
        c.malla.scale.setScalar(1 + 0.25 * Math.sin(ahora / 90 + c.tono * 10));
        /** @type {THREE.MeshBasicMaterial} */ (c.malla.material).opacity = k > 0.8 ? (1 - k) / 0.2 : 1;
      }
      // El tiempo del marcador, cada fotograma no: cada ~quinta parte de segundo basta.
      if (Math.floor(transcurrido * 5) !== Math.floor((transcurrido - dt) * 5)) pintarHud();
    },
  };
}
