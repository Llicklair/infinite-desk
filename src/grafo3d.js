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
 * @typedef {GrafoDispuesto & {nombre: string, alt?: GrafoDispuesto}} GrafoExportado
 *   `alt`: el árbol de carpetas de un repo que tiene grafo de gb (tecla T)
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

  /** @type {THREE.Object3D | null} */
  let resaltado = null;
  /** @type {Map<number, THREE.Color>} nodos encendidos por agentes, con el color de cada uno */
  let encendidos = new Map();
  return {
    grafo,
    objeto,
    esferas,
    /** Dónde está un nodo, en coordenadas del grafo. @param {number} i */
    posicion(i) { return pos[i].clone(); },
    /**
     * Enciende estos nodos con estos colores (los agentes de gb que los tocan) y apaga el resto.
     * @param {Map<number, THREE.Color>} mapa
     */
    iluminar(mapa) {
      for (const i of encendidos.keys()) {
        esferas.setColorAt(i, colores[i]);
        colocar(i, 1);
      }
      encendidos = mapa;
      for (const [i, c] of mapa) esferas.setColorAt(i, c);
      if (esferas.instanceColor) esferas.instanceColor.needsUpdate = true;
      esferas.instanceMatrix.needsUpdate = true;
    },
    /** Hace latir los nodos encendidos; se llama en cada fotograma. @param {number} t segundos */
    latir(t) {
      if (!encendidos.size) return;
      const e = 1.8 + 0.6 * Math.sin(t * 4);
      for (const i of encendidos.keys()) colocar(i, e);
      esferas.instanceMatrix.needsUpdate = true;
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
