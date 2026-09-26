// Un grafo de gb como objeto 3D: esferas instanciadas + aristas. Se usa en las islas y
// detrás de cada pantalla enganchada a un repo.
import * as THREE from "three";
import { escalaAjuste } from "./islas.js";

export const ROJO_CICLO = new THREE.Color("#ff4d5e");
const esfera = new THREE.SphereGeometry(1, 12, 8);

/** @param {string} grupo @param {string[]} grupos */
function colorDeGrupo(grupo, grupos) {
  const tono = (grupos.indexOf(grupo) * 0.618034 + 0.12) % 1; // razón áurea: tonos separados
  // Tests y bancos van apagados: son satélites, no el núcleo.
  const apagado = /^(tests?|bancos|bench|spec|__tests__)$/i.test(grupo);
  return new THREE.Color().setHSL(tono, apagado ? 0.25 : 0.75, apagado ? 0.45 : 0.62);
}

/**
 * @typedef {import("./datos.js").Grafo & {posiciones: number[]}} GrafoDispuesto
 * @typedef {GrafoDispuesto & {nombre: string, alt?: GrafoDispuesto, ultimoCommit?: number, resumen?: string}} GrafoExportado
 *   `alt`: el árbol de carpetas de un repo que tiene grafo de gb (tecla T);
 *   `ultimoCommit`: segundos desde 1970 del último commit (la vida de la isla, ambiente.js);
 *   `resumen`: lo que cuenta su README, en corto (la ficha de la isla)
 */

/**
 * @param {GrafoExportado} grafo
 * @param {number} radio el 90 % de los nodos cabe en esta esfera (unidades del mundo)
 */
export function crearGrafo3D(grafo, radio) {
  const { nodos, aristas } = grafo;
  const k = escalaAjuste(grafo.posiciones, radio);
  const pos = nodos.map(
    (_, i) => new THREE.Vector3(grafo.posiciones[i * 3], grafo.posiciones[i * 3 + 1], grafo.posiciones[i * 3 + 2]).multiplyScalar(k),
  );
  const tamano = radio / 6;

  const objeto = new THREE.Group();
  objeto.userData.grafo3d = true;
  const grupos = [...new Set(nodos.map((n) => n.grupo))].sort();
  const colores = nodos.map((n) => (n.enCiclo ? ROJO_CICLO.clone() : colorDeGrupo(n.grupo, grupos)));

  const esferas = new THREE.InstancedMesh(
    esfera,
    new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, emissive: "#20264d" }),
    nodos.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const radios = nodos.map((n) => (0.13 + Math.sqrt(n.fanIn) * 0.075) * tamano);
  /** @param {number} i @param {number} escala */
  function colocar(i, escala) {
    m.compose(pos[i], q, v.setScalar(radios[i] * escala));
    esferas.setMatrixAt(i, m);
  }
  nodos.forEach((_, i) => {
    colocar(i, 1);
    esferas.setColorAt(i, colores[i]);
  });
  esferas.computeBoundingSphere();
  objeto.add(esferas);

  /** @param {typeof aristas} lista @param {number} opacidad */
  function lineas(lista, opacidad) {
    const p = new Float32Array(lista.length * 6);
    const c = new Float32Array(lista.length * 6);
    lista.forEach((a, j) => {
      const ca = a.enCiclo ? ROJO_CICLO : colores[a.origen];
      const cb = a.enCiclo ? ROJO_CICLO : colores[a.destino];
      p.set([...pos[a.origen].toArray(), ...pos[a.destino].toArray()], j * 6);
      c.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], j * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: opacidad,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  }
  objeto.add(lineas(aristas.filter((a) => !a.enCiclo), 0.35));
  objeto.add(lineas(aristas.filter((a) => a.enCiclo), 0.9));

  // --- agentes, como el mapa de gb (viz.py): halo que late, anillo si solo commiteó, señales ---
  // Halos: esferas grandes con mezcla aditiva; con mezcla aditiva, oscurecer el color es bajar
  // su opacidad, así cada halo lleva su propia "alfa" sin un material por nodo.
  const halos = new THREE.InstancedMesh(esfera, new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), Math.max(1, nodos.length));
  halos.count = 0;
  halos.frustumCulled = false;
  objeto.add(halos);
  // Señales: un punto por arista, del nodo tocado hacia el otro extremo (la "sinapsis" de gb).
  const puntos = new THREE.InstancedMesh(esfera, new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), Math.max(1, aristas.length));
  puntos.count = 0;
  puntos.frustumCulled = false;
  objeto.add(puntos);
  // Fallos (gb list): un halo rojo en los módulos donde algo se rompe, que late despacio.
  const rojos = new THREE.InstancedMesh(esfera, new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), Math.max(1, nodos.length));
  rojos.count = 0;
  rojos.frustumCulled = false;
  objeto.add(rojos);
  // El color por instancia tiene que existir antes del primer fotograma: si no, el material se
  // compila sin él y todo sale blanco.
  halos.setColorAt(0, new THREE.Color(0));
  rojos.setColorAt(0, new THREE.Color(0));
  puntos.setColorAt(0, new THREE.Color(0));
  /** @type {THREE.LineSegments | null} las aristas con señal, teñidas del color del agente */
  let tenidas = null;

  /** @type {THREE.Object3D | null} */
  let resaltado = null;
  /** @type {{i: number, color: THREE.Color, pulso: boolean, vigor: number}[]} */
  let encendidos = [];
  /** @type {{desde: number, hasta: number, color: THREE.Color, vigor: number, fase: number}[]} */
  let senales = [];
  /** @type {{i: number, fuerza: number}[]} los módulos con fallos, y cuánto (0..1) */
  let conFallos = [];
  const rojo = new THREE.Color("#ff3344");
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  return {
    grafo,
    objeto,
    esferas,
    /** El 90 % de los nodos cabe en esta esfera (unidades del mundo). */
    radio,
    /** Dónde está un nodo, en coordenadas del grafo. @param {number} i */
    posicion(i) { return pos[i].clone(); },
    /**
     * Enciende estos nodos (los que tocan los agentes de gb) y apaga el resto. `pulso`: late (sin
     * commitear); si no, anillo quieto (lo commiteó hace poco). `vigor` 0..1: se va apagando.
     * @param {{i: number, color: THREE.Color, pulso: boolean, vigor: number}[]} lista
     */
    iluminar(lista) {
      for (const { i } of encendidos) esferas.setColorAt(i, colores[i]);
      encendidos = lista.filter((e) => e.vigor > 0);
      for (const { i, color, vigor } of encendidos) esferas.setColorAt(i, colores[i].clone().lerp(color, 0.6 * vigor));
      if (esferas.instanceColor) esferas.instanceColor.needsUpdate = true;
      halos.count = encendidos.length;
    },
    /**
     * Las señales por las aristas: cada una va de `desde` a `hasta` en 1,3 s, con su propio
     * desfase para que no latan todas a la vez (como en gb).
     * @param {{desde: number, hasta: number, color: THREE.Color, vigor: number}[]} lista
     */
    senalar(lista) {
      senales = lista.filter((s) => s.vigor > 0).map((s) => ({ ...s, fase: ((s.desde * 31 + s.hasta * 17) * 0.013) % 1 }));
      puntos.count = senales.length;
      if (tenidas) {
        objeto.remove(tenidas);
        tenidas.geometry.dispose();
        tenidas = null;
      }
      if (!senales.length) return;
      const pp = new Float32Array(senales.length * 6);
      const cc = new Float32Array(senales.length * 6);
      senales.forEach((s, j) => {
        pp.set([...pos[s.desde].toArray(), ...pos[s.hasta].toArray()], j * 6);
        const k = 0.3 * s.vigor; // alfa 0,3·vigor, en aditivo
        cc.set([s.color.r * k, s.color.g * k, s.color.b * k, s.color.r * k, s.color.g * k, s.color.b * k], j * 6);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      tenidas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      objeto.add(tenidas);
    },
    /**
     * Los módulos con fallos (gb list): un halo rojo que late despacio, más fuerte cuanto más
     * reciente y repetido (`fuerza` 0..1). Lista vacía: se apagan.
     * @param {{i: number, fuerza: number}[]} lista
     */
    marcarFallos(lista) {
      conFallos = lista.filter((f) => f.fuerza > 0 && f.i >= 0 && f.i < nodos.length);
      rojos.count = conFallos.length;
    },
    /** Halos que laten y señales que viajan; se llama en cada fotograma. @param {number} t segundos */
    latir(t) {
      conFallos.forEach(({ i, fuerza }, j) => {
        const pu = 0.5 + 0.5 * Math.sin(t * 2.2 + i);
        m.compose(pos[i], q, v.setScalar(radios[i] * (2.4 + 0.8 * pu)));
        rojos.setMatrixAt(j, m);
        rojos.setColorAt(j, c.copy(rojo).multiplyScalar((0.25 + 0.35 * pu) * (0.4 + 0.6 * fuerza)));
      });
      if (conFallos.length) {
        rojos.instanceMatrix.needsUpdate = true;
        if (rojos.instanceColor) rojos.instanceColor.needsUpdate = true;
      }
      encendidos.forEach(({ i, color, pulso, vigor }, j) => {
        // gb: pu = 0.5 + 0.5·sin(reloj/380 + i·0.7); alfa (0.22 + 0.5·pu)·vigor; radio +8+5·pu.
        const pu = pulso ? 0.5 + 0.5 * Math.sin(t / 0.38 + i * 0.7) : 0;
        const alfa = (pulso ? 0.22 + 0.5 * pu : 0.45) * vigor;
        m.compose(pos[i], q, v.setScalar(radios[i] * (pulso ? 2.1 + 0.6 * pu : 1.5)));
        halos.setMatrixAt(j, m);
        halos.setColorAt(j, c.copy(color).multiplyScalar(alfa));
      });
      if (encendidos.length) {
        halos.instanceMatrix.needsUpdate = true;
        if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
      }
      const r = tamano * 0.1; // el punto de la señal: visible, pero menor que el nodo más pequeño
      senales.forEach((s, j) => {
        let fase = t / 1.3 + s.fase;
        fase -= Math.floor(fase);
        p.lerpVectors(pos[s.desde], pos[s.hasta], fase);
        m.compose(p, q, v.setScalar(r));
        puntos.setMatrixAt(j, m);
        puntos.setColorAt(j, c.copy(s.color).multiplyScalar(0.9 * s.vigor));
      });
      if (senales.length) {
        puntos.instanceMatrix.needsUpdate = true;
        if (puntos.instanceColor) puntos.instanceColor.needsUpdate = true;
      }
    },
    /** Enciende las aristas de un nodo (o apaga todo con null). @param {number | null} i */
    resaltar(i) {
      if (resaltado) {
        objeto.remove(resaltado);
        resaltado = null;
      }
      if (i === null) return;
      resaltado = lineas(aristas.filter((a) => a.origen === i || a.destino === i), 1);
      objeto.add(resaltado);
    },
  };
}

/** @typedef {ReturnType<typeof crearGrafo3D>} Grafo3D */
