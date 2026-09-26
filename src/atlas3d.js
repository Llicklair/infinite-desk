// Atlas en el mundo: un dron holográfico pequeño (un núcleo de luz con dos anillos que giran y un
// "ojo" que te mira) que flota a tu lado, a la altura del hombro. Te sigue por defecto (es tu
// asistente); se le puede decir que se quede o que vuelva a su sitio, junto al palantír. Late más
// cuando habla y cuando escucha. Con quién habla y qué hace, en src/asistente.js y tools/asistente.mjs.
import * as THREE from "three";

/** @typedef {"sitio" | "sigue" | "quieto"} ModoAtlas */

/** @param {THREE.Vector3} sitio dónde espera cuando no te sigue (en el mundo) */
export function crearAtlas(sitio) {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group();
  grupo.add(cuerpo);
  const ambar = "#ffc56b", cian = "#7fe0ff";
  const nucleo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 3),
    new THREE.MeshStandardMaterial({ color: "#fff4df", emissive: ambar, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2 }));
  cuerpo.add(nucleo);
  // Una carcasa de cristal alrededor del núcleo, apenas visible.
  const carcasa = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16),
    new THREE.MeshStandardMaterial({ color: cian, emissive: cian, emissiveIntensity: 0.25, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }));
  cuerpo.add(carcasa);
  // El ojo: una ranura que mira hacia delante.
  const ojo = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 8), new THREE.MeshBasicMaterial({ color: cian }));
  ojo.rotation.z = Math.PI / 2;
  ojo.position.set(0, 0.02, 0.2);
  cuerpo.add(ojo);
  // Dos anillos finos que giran en planos distintos.
  const anilloMat = new THREE.MeshStandardMaterial({ color: cian, emissive: cian, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.5 });
  const anillo1 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 8, 64), anilloMat);
  const anillo2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.008, 8, 64), anilloMat);
  anillo1.rotation.x = Math.PI / 2.4;
  anillo2.rotation.y = Math.PI / 3;
  cuerpo.add(anillo1, anillo2);
  const luz = new THREE.PointLight(ambar, 0.6, 5, 1.8);
  cuerpo.add(luz);
  // Una caja invisible para apuntarle (por si algún día se le hace clic).
  const toque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  grupo.add(toque);
  grupo.position.copy(sitio);
  cuerpo.scale.setScalar(0.62); // pequeño: acompaña sin tapar la vista

  /** @type {ModoAtlas} */
  let modo = "sigue";
  const destino = sitio.clone();
  let hablando = false, escuchando = false, intensidad = 1;
  const delante = new THREE.Vector3(), lado = new THREE.Vector3();

  return {
    grupo,
    get modo() { return modo; },
    /** @param {boolean} si */
    set hablando(si) { hablando = si; },
    /** @param {boolean} si */
    set escuchando(si) { escuchando = si; },
    seguir() { modo = "sigue"; },
    quedarse() { modo = "quieto"; destino.copy(grupo.position); },
    volver() { modo = "sitio"; destino.copy(sitio); },
    /** Se le pone al lado sin volar (al llegar al mundo, al volver de la zona zen). @param {THREE.Camera} camara */
    aparecer(camara) {
      if (modo !== "sigue") return;
      camara.getWorldDirection(delante);
      lado.crossVectors(delante, camara.up).normalize();
      grupo.position.copy(camara.position).addScaledVector(lado, 0.9).addScaledVector(delante, 1.4).add(new THREE.Vector3(0, -0.3, 0));
    },
    /** @param {number} t @param {number} dt @param {THREE.Camera} camara */
    tick(t, dt, camara) {
      if (modo === "sigue") {
        // A la derecha y un poco por delante, a la altura del hombro: se ve sin tapar la vista.
        camara.getWorldDirection(delante);
        delante.y = 0;
        delante.normalize();
        lado.crossVectors(delante, new THREE.Vector3(0, 1, 0)).normalize();
        destino.copy(camara.position).addScaledVector(lado, 1.5).addScaledVector(delante, 2.6);
        destino.y = camara.position.y - 0.45;
        // Si uno se aleja mucho (vuela rápido, cruza el mundo), se le pone al lado sin más.
        if (grupo.position.distanceTo(destino) > 40) grupo.position.copy(destino);
      }
      grupo.position.lerp(destino, 1 - Math.exp(-dt * (modo === "sigue" ? 4 : 1.5)));
      // Te mira (el ojo, hacia la cámara), sin volcar.
      const giro = Math.atan2(camara.position.x - grupo.position.x, camara.position.z - grupo.position.z);
      let dg = giro - grupo.rotation.y;
      dg = Math.atan2(Math.sin(dg), Math.cos(dg));
      grupo.rotation.y += dg * Math.min(1, dt * 5);
      cuerpo.position.y = Math.sin(t * 1.8) * 0.03;
      anillo1.rotation.z = t * 0.9;
      anillo2.rotation.x = t * 0.6;
      const quiere = hablando ? 1.8 + Math.sin(t * 12) * 0.4 : escuchando ? 1.45 + Math.sin(t * 4) * 0.15 : 1 + Math.sin(t * 1.2) * 0.06;
      intensidad += (quiere - intensidad) * Math.min(1, dt * 6);
      /** @type {THREE.MeshStandardMaterial} */ (nucleo.material).emissiveIntensity = 1.4 * intensidad;
      anilloMat.emissiveIntensity = 0.9 * intensidad;
      luz.intensity = 0.6 * intensidad;
      ojo.scale.y = escuchando ? 1.4 : 1;
    },
  };
}
