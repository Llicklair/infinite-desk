// El espíritu de luz de la zona zen: un zorrito hecho de luz suave, sentado en el banco de la poza.
// Te mira cuando estás cerca, respira, mueve la cola, brilla más cuando habla y escucha, y si se lo
// pides te sigue flotando a tu lado (o se queda donde estás, o vuelve a su banco). Con quién habla y
// qué recuerda, en src/apoyo.js y tools/espiritu.mjs; aquí, solo cómo se ve y cómo se mueve.
import * as THREE from "three";
import { conoRedondo, elipsoide, piel, unionSuave } from "./malla-sdf.js";

/** @typedef {"banco" | "sigue" | "quieto"} Modo */

/** Un halo redondo (degradado en un lienzo), para el resplandor. */
function halo() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, "rgba(255,255,255,0.9)");
  d.addColorStop(0.25, "rgba(190,235,255,0.45)");
  d.addColorStop(1, "rgba(120,200,255,0)");
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dónde se doblan la cabeza (el cuello) y la cola (su arranque), en el espacio del zorro.
const PIVOTE_CABEZA = [0, 0.66, 0.12];
const PIVOTE_COLA = [0, 0.16, -0.24];

/**
 * El zorro sentado, de una pieza: cuerpo, pecho, cabeza con mofletes, hocico, orejas, patas y una
 * cola gorda que se curva hacia delante; y en cada vértice cuánto es cabeza y cuánto cola.
 */
function mallaDeZorro() {
  const k = 0.06; // lo suave de las uniones
  const cuerpo = elipsoide([0, 0.24, -0.04], [0.24, 0.22, 0.27]);
  const pecho = elipsoide([0, 0.47, 0.08], [0.16, 0.24, 0.16]);
  const partesCabeza = [
    elipsoide([0, 0.76, 0.15], [0.15, 0.135, 0.14]),
    elipsoide([0, 0.71, 0.16], [0.17, 0.08, 0.12]), // los mofletes
    conoRedondo([0, 0.74, 0.22], [0, 0.71, 0.37], 0.07, 0.022), // el hocico
  ];
  const orejas = [-1, 1].map((l) => conoRedondo([0.07 * l, 0.84, 0.12], [0.12 * l, 1.0, 0.1], 0.055, 0.012));
  const patas = [-1, 1].flatMap((l) => [
    conoRedondo([0.075 * l, 0.36, 0.15], [0.08 * l, 0.03, 0.21], 0.045, 0.034),
    elipsoide([0.08 * l, 0.028, 0.24], [0.045, 0.03, 0.06]),
    elipsoide([0.13 * l, 0.13, -0.02], [0.09, 0.12, 0.16]), // las ancas
  ]);
  const puntosCola = [[0, 0.12, -0.26], [0.12, 0.1, -0.44], [0.3, 0.12, -0.4], [0.4, 0.14, -0.18], [0.4, 0.16, 0.02]];
  const radiosCola = [0.075, 0.11, 0.12, 0.09, 0.035];
  const cola = puntosCola.slice(1).map((p, i) => conoRedondo(puntosCola[i], p, radiosCola[i], radiosCola[i + 1]));
  /** @type {import("./malla-sdf.js").Distancia} */
  const forma = (x, y, z) => {
    let d = unionSuave(cuerpo(x, y, z), pecho(x, y, z), k);
    for (const p of partesCabeza) d = unionSuave(d, p(x, y, z), k);
    for (const o of orejas) d = unionSuave(d, o(x, y, z), 0.025);
    for (const p of patas) d = unionSuave(d, p(x, y, z), 0.04);
    for (const c of cola) d = unionSuave(d, c(x, y, z), 0.05);
    return d;
  };
  const { posiciones, normales, indices } = piel(forma, [-0.32, -0.04, -0.62], [0.58, 1.06, 0.46], 0.014);
  // Cuánto es cabeza (por encima del cuello y fuera del pecho) y cuánto cola (fuera del cuerpo, detrás y abajo).
  const n = posiciones.length / 3;
  const pesoCabeza = new Float32Array(n), pesoCola = new Float32Array(n);
  const suave = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3], y = posiciones[i * 3 + 1], z = posiciones[i * 3 + 2];
    pesoCabeza[i] = suave(0.58, 0.68, y) * suave(-0.02, 0.05, pecho(x, y, z) + (y - 0.66) * 0.5);
    pesoCola[i] = suave(0.0, 0.07, Math.min(cuerpo(x, y, z), patas[2](x, y, z), patas[5](x, y, z))) * (1 - suave(0.3, 0.42, y)) * suave(-0.12, -0.2, z + x * 0.3);
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute("normal", new THREE.BufferAttribute(normales, 3));
  geometria.setAttribute("pesoCabeza", new THREE.BufferAttribute(pesoCabeza, 1));
  geometria.setAttribute("pesoCola", new THREE.BufferAttribute(pesoCola, 1));
  geometria.setIndex(indices);
  const uniformes = { uYaw: { value: 0 }, uPitch: { value: 0 }, uColaY: { value: 0 }, uColaX: { value: 0 } };
  return { geometria, uniformes };
}

/**
 * @param {{asiento: THREE.Vector3, mirando: number}} banco dónde se sienta (en la zona) y hacia dónde mira (giro en y)
 */
export function crearEspiritu(banco) {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group(); // lo que respira y flota
  grupo.add(cuerpo);
  const luz = new THREE.MeshStandardMaterial({
    color: "#e6f8ff", emissive: "#8fdcff", emissiveIntensity: 1.1, roughness: 0.35, transparent: true, opacity: 0.88,
  });
  // Una sola pieza (uso real: "está construido con figuras esféricas; que sea una única pieza"): la
  // forma del zorro, fundida con uniones suaves, y su piel sacada de una vez (malla-sdf.js). La
  // cabeza y la cola se mueven doblando la malla en el shader, con pesos por vértice: el cuello y el
  // arranque de la cola se doblan suave, como con esqueleto, sin piezas sueltas.
  const { geometria, uniformes } = mallaDeZorro();
  luz.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformes);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uYaw, uPitch, uColaY, uColaX;
        attribute float pesoCabeza;
        attribute float pesoCola;
        mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
        mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
        mat3 kiriCabeza() { return rotX(uPitch * pesoCabeza) * rotY(uYaw * pesoCabeza); }
        mat3 kiriCola() { return rotY(uColaY * pesoCola) * rotX(uColaX * pesoCola); }`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        objectNormal = kiriCola() * (kiriCabeza() * objectNormal);`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed = vec3(${PIVOTE_CABEZA.join(", ")}) + kiriCabeza() * (transformed - vec3(${PIVOTE_CABEZA.join(", ")}));
        transformed = vec3(${PIVOTE_COLA.join(", ")}) + kiriCola() * (transformed - vec3(${PIVOTE_COLA.join(", ")}));`);
  };
  luz.customProgramCacheKey = () => "kiri";
  const piel = new THREE.Mesh(geometria, luz);
  cuerpo.add(piel);
  // La cabeza, para lo que va encima de la piel (ojos y nariz): gira igual que la malla.
  const cabeza = new THREE.Group();
  cabeza.position.fromArray(PIVOTE_CABEZA);
  cuerpo.add(cabeza);
  const oscuro = new THREE.MeshBasicMaterial({ color: "#1d3b66" });
  for (const x of [-0.055, 0.055]) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), oscuro);
    o.position.set(x, 0.135, 0.172);
    o.scale.set(1, 1.3, 0.8);
    cabeza.add(o);
  }
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), oscuro);
  nariz.position.set(0, 0.05, 0.262);
  cabeza.add(nariz);
  // El resplandor y unas motas que giran alrededor.
  const resplandor = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: "#bfeaff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  resplandor.scale.setScalar(1.8);
  resplandor.position.y = 0.5;
  cuerpo.add(resplandor);
  const NM = 14;
  const motas = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(NM * 3), 3)),
    new THREE.PointsMaterial({ color: "#d8f4ff", size: 0.04, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  motas.frustumCulled = false;
  cuerpo.add(motas);
  const brillo = new THREE.PointLight("#9fe4ff", 0.7, 4.5, 1.6);
  brillo.position.y = 0.6;
  cuerpo.add(brillo);
  // Una caja invisible para apuntarle con la E (las bolas sueltas son difíciles de acertar).
  const toque = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  toque.position.y = 0.5;
  grupo.add(toque);

  grupo.position.copy(banco.asiento);
  grupo.rotation.y = banco.mirando;

  /** @type {Modo} */
  let modo = "banco";
  const destino = new THREE.Vector3().copy(banco.asiento);
  let hablando = false, escuchando = false;
  let intensidad = 1;
  const local = new THREE.Vector3();
  const quiero = new THREE.Vector3();

  return {
    grupo,
    get modo() { return modo; },
    /** Mientras habla, brilla más y late. @param {boolean} si */
    set hablando(si) { hablando = si; },
    /** Mientras te escucha, brilla un poco más. @param {boolean} si */
    set escuchando(si) { escuchando = si; },
    /** Que te siga (flotando a tu lado). */
    seguir() { modo = "sigue"; },
    /** Que se quede donde está ahora. */
    quedarse() { modo = "quieto"; destino.copy(grupo.position); },
    /** Que vuelva a su banco. */
    volver() { modo = "banco"; destino.copy(banco.asiento); },
    /**
     * @param {number} t @param {number} dt
     * @param {THREE.Vector3} ojos dónde está uno (en la zona) @param {number} pies a qué altura pisa
     */
    tick(t, dt, ojos, pies) {
      // A dónde va: a tu lado (un poco detrás y a la derecha, a la altura del pecho), o a donde toca.
      if (modo === "sigue") {
        const lejos = Math.hypot(grupo.position.x - ojos.x, grupo.position.z - ojos.z);
        if (lejos > 2.2) {
          quiero.set(grupo.position.x - ojos.x, 0, grupo.position.z - ojos.z).normalize().multiplyScalar(1.6);
          destino.set(ojos.x + quiero.x, pies + 0.55, ojos.z + quiero.z);
        } else destino.y = pies + 0.55;
      }
      const antes = grupo.position.clone();
      grupo.position.lerp(destino, 1 - Math.exp(-dt * (modo === "sigue" ? 2.2 : 1.5)));
      const va = grupo.position.clone().sub(antes);
      // Mira hacia donde va, o hacia ti si estás cerca (y en el banco, al lago).
      const cerca = grupo.position.distanceTo(ojos) < 6;
      let giro = modo === "banco" && va.lengthSq() < 1e-6 ? banco.mirando : grupo.rotation.y;
      if (va.lengthSq() > 1e-5) giro = Math.atan2(va.x, va.z);
      else if (modo !== "banco" && cerca) giro = Math.atan2(ojos.x - grupo.position.x, ojos.z - grupo.position.z);
      let dg = giro - grupo.rotation.y;
      dg = Math.atan2(Math.sin(dg), Math.cos(dg));
      grupo.rotation.y += dg * Math.min(1, dt * 3);
      // La cabeza, hacia ti (con límite, que no gire como un búho).
      local.copy(ojos);
      grupo.worldToLocal(local.add(grupo.parent ? grupo.parent.position : new THREE.Vector3()));
      const yaw = cerca ? THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1) : 0;
      const pitch = cerca ? THREE.MathUtils.clamp(-Math.atan2(local.y - 0.8, Math.hypot(local.x, local.z)), -0.5, 0.4) : 0;
      cabeza.rotation.y += (yaw - cabeza.rotation.y) * Math.min(1, dt * 4);
      cabeza.rotation.x += (pitch - cabeza.rotation.x) * Math.min(1, dt * 4);
      uniformes.uYaw.value = cabeza.rotation.y;
      uniformes.uPitch.value = cabeza.rotation.x;
      // Respira, flota (más si va volando), mueve la cola; brilla más al hablar y al escuchar.
      const vuela = modo !== "banco" ? 0.06 : 0.015;
      cuerpo.position.y = Math.sin(t * 1.6) * vuela;
      cuerpo.scale.setScalar(1 + Math.sin(t * 1.6) * 0.015);
      uniformes.uColaY.value = Math.sin(t * 1.1) * 0.3;
      uniformes.uColaX.value = Math.sin(t * 0.8) * 0.08;
      const quiere = hablando ? 1.9 + Math.sin(t * 9) * 0.35 : escuchando ? 1.5 + Math.sin(t * 3) * 0.15 : 1 + Math.sin(t * 0.9) * 0.08;
      intensidad += (quiere - intensidad) * Math.min(1, dt * 6);
      luz.emissiveIntensity = 1.1 * intensidad;
      brillo.intensity = 0.7 * intensidad;
      resplandor.material.opacity = 0.55 + (intensidad - 1) * 0.35;
      resplandor.scale.setScalar(1.7 + (intensidad - 1) * 0.5);
      const pm = /** @type {THREE.BufferAttribute} */ (motas.geometry.attributes.position);
      for (let i = 0; i < NM; i++) {
        const a = t * (0.4 + (i % 4) * 0.12) + i * 2.1;
        const r = 0.45 + (i % 3) * 0.12;
        pm.setXYZ(i, Math.cos(a) * r, 0.3 + ((i * 0.37 + t * 0.15) % 1) * 0.8, Math.sin(a) * r);
      }
      pm.needsUpdate = true;
    },
  };
}
