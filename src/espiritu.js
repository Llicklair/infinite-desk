// El espíritu de luz de la zona zen: un zorrito hecho de luz suave, sentado en el banco de la poza.
// Te mira cuando estás cerca, respira, mueve la cola, brilla más cuando habla y escucha, y si se lo
// pides te sigue flotando a tu lado (o se queda donde estás, o vuelve a su banco). Con quién habla y
// qué recuerda, en src/apoyo.js y tools/espiritu.mjs; aquí, solo cómo se ve y cómo se mueve.
import * as THREE from "three";

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
  /** @param {THREE.BufferGeometry} g @param {number} x @param {number} y @param {number} z @param {THREE.Object3D} [padre] */
  const parte = (g, x, y, z, padre = cuerpo) => { const m = new THREE.Mesh(g, luz); m.position.set(x, y, z); padre.add(m); return m; };
  // Sentado: cadera, pecho, patas delanteras.
  parte(new THREE.SphereGeometry(0.26, 20, 14), 0, 0.26, -0.02).scale.set(1, 0.9, 1.1);
  parte(new THREE.SphereGeometry(0.2, 20, 14), 0, 0.5, 0.1).scale.set(0.9, 1.25, 0.9);
  for (const x of [-0.08, 0.08]) parte(new THREE.CylinderGeometry(0.035, 0.03, 0.32, 8), x, 0.16, 0.2);
  // La cabeza (gira hacia ti): hocico, orejas y ojos.
  const cabeza = new THREE.Group();
  cabeza.position.set(0, 0.78, 0.16);
  cuerpo.add(cabeza);
  parte(new THREE.SphereGeometry(0.16, 20, 14), 0, 0, 0, cabeza).scale.set(1, 0.92, 0.95);
  const hocico = parte(new THREE.ConeGeometry(0.075, 0.2, 14), 0, -0.04, 0.17, cabeza);
  hocico.rotation.x = Math.PI / 2;
  for (const x of [-0.085, 0.085]) {
    const oreja = parte(new THREE.ConeGeometry(0.055, 0.17, 10), x, 0.15, -0.02, cabeza);
    oreja.rotation.z = -x * 2.2;
  }
  const ojo = new THREE.MeshBasicMaterial({ color: "#1d3b66" });
  for (const x of [-0.06, 0.06]) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), ojo);
    o.position.set(x, 0.035, 0.13);
    cabeza.add(o);
  }
  // La cola: bolas cada vez más pequeñas por una curva, que se mece.
  const cola = new THREE.Group();
  cola.position.set(0, 0.14, -0.22);
  cuerpo.add(cola);
  const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, 0.02, -0.18), new THREE.Vector3(0.32, 0.06, -0.12), new THREE.Vector3(0.4, 0.1, 0.1)]);
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const p = curva.getPoint(k);
    parte(new THREE.SphereGeometry(0.11 * (1 - k * 0.55) + 0.02, 14, 10), p.x, p.y, p.z, cola);
  }
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
      // Respira, flota (más si va volando), mueve la cola; brilla más al hablar y al escuchar.
      const vuela = modo !== "banco" ? 0.06 : 0.015;
      cuerpo.position.y = Math.sin(t * 1.6) * vuela;
      cuerpo.scale.setScalar(1 + Math.sin(t * 1.6) * 0.015);
      cola.rotation.y = Math.sin(t * 1.1) * 0.35;
      cola.rotation.x = Math.sin(t * 0.8) * 0.1;
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
