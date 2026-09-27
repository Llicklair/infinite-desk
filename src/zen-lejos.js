// Lo lejano de la zona zen: islotes flotando en el cielo y colinas al fondo, redondos como el resto
// (uso real: "no me gusta que la cascada tenga bloques apilados"; lo mismo para las torres de losas y
// las pirámides). El color de las colinas lo pone el ambiente (src/zen.js).
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { piedra as texPiedra, triplanar } from "./texturas.js";
import { ruido } from "./risco.js";

/**
 * @param {THREE.Group} grupo
 * @param {{mecer: import("./zen-flora.js").Mecer, sombra: (o: THREE.Object3D) => THREE.Object3D, musgo: THREE.Material, tono: (n: number) => THREE.Material}} h
 * @returns {{monolitos: THREE.Group[], colinas: THREE.MeshStandardMaterial[]}}
 */
export function crearLejos(grupo, { mecer, sombra, musgo, tono }) {
  /**
   * Una bola abollada: cada vértice sale o entra según el ruido de donde está (bultos suaves).
   * @param {number} detalle @param {number} amp @param {number} frec @param {number} semilla
   */
  const bolaAbollada = (detalle, amp, frec, semilla) => {
    // Con los vértices compartidos (el icosaedro los repite por cara): si no, sale facetada.
    const suelta = new THREE.IcosahedronGeometry(1, detalle);
    suelta.deleteAttribute("normal");
    suelta.deleteAttribute("uv");
    const g = mergeVertices(suelta);
    suelta.dispose();
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = ruido(v.x * frec + semilla, v.y * frec + v.z * frec * 0.7) * 0.65 + ruido(v.z * frec * 2.1 + semilla, v.x * frec * 2.1 - v.y) * 0.35;
      v.multiplyScalar(1 + (n - 0.5) * 2 * amp);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  };
  /** @type {THREE.Group[]} */
  const monolitos = [];
  const rocaIslote = triplanar(new THREE.MeshStandardMaterial({ color: "#b3a58f", roughness: 1 }), texPiedra(), 0.25);
  const copaIslote = mecer(new THREE.MeshStandardMaterial({ color: "#6fae4c", roughness: 0.9 }), 0.05, -1.2);
  for (const [x, y, z, s] of [[-45, 38, -90, 1], [55, 44, -110, 1.3], [5, 55, -160, 1.6]]) {
    // Un islote: una roca redonda que cuelga (como una gota), su cojín de césped, una piedra
    // alta y lisa con musgo en la cabeza, y un árbol de copa redonda.
    const g = new THREE.Group();
    const roca = sombra(new THREE.Mesh(bolaAbollada(4, 0.14, 1.6, x), rocaIslote));
    roca.scale.set(6.2, 7.5, 6.2);
    roca.position.y = -1.2;
    const cesped = sombra(new THREE.Mesh(bolaAbollada(3, 0.08, 2, z), musgo));
    cesped.scale.set(6.6, 1.3, 6.6);
    cesped.position.y = 0.1;
    g.add(roca, cesped);
    const alta = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.2 + ruido(x, 1) * 2, 6, 14), tono(x)));
    alta.position.set(-1.8, 2.8, 0.6);
    alta.rotation.z = (ruido(x, 3) - 0.5) * 0.25;
    const gorro = sombra(new THREE.Mesh(bolaAbollada(2, 0.12, 2.5, y), musgo));
    gorro.scale.set(1.2, 0.45, 1.2);
    gorro.position.set(0, 1.6 + ruido(x, 1), 0);
    alta.add(gorro);
    const tronco = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 3, 7), new THREE.MeshStandardMaterial({ color: "#6b4f3a", roughness: 1 })));
    tronco.position.set(2.2, 2, -0.8);
    g.add(alta, tronco);
    for (let k = 0; k < 4; k++) {
      const copa = sombra(new THREE.Mesh(bolaAbollada(2, 0.1, 2, k + x), copaIslote));
      const e = 1.4 + ruido(k, x) * 0.7;
      copa.scale.set(e, e * 0.85, e);
      copa.position.set(2.2 + (ruido(k, 1) - 0.5) * 2.4, 4.4 + ruido(k, 2) * 1.4, -0.8 + (ruido(k, 3) - 0.5) * 2.4);
      g.add(copa);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    monolitos.push(g);
    grupo.add(g);
  }
  // Colinas al fondo: dos filas de lomas redondas; las de delante, verdes, las de atrás, azuladas
  // (la niebla hace el resto).
  /** Las dos filas de colinas; el color lo pone el ambiente (ponerAmbiente). @type {THREE.MeshStandardMaterial[]} */
  const colinas = [];
  for (const [fila, radio, cuantas] of [[0, 150, 9], [1, 210, 8]]) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    colinas.push(mat);
    for (let i = 0; i < cuantas; i++) {
      const a = -Math.PI * 0.92 + (i / (cuantas - 1)) * Math.PI * 0.84 + (ruido(i, 5 + fila) - 0.5) * 0.12;
      const ancho = (fila ? 55 : 38) + ruido(i, 7 + fila) * 30, alto = (fila ? 48 : 26) + ruido(i, 9 + fila) * (fila ? 40 : 20);
      const m = new THREE.Mesh(bolaAbollada(4, 0.08, 1.4, i * 7 + fila), mat);
      m.scale.set(ancho, alto, ancho * 0.8);
      m.position.set(Math.cos(a) * radio, -alto * 0.3, Math.sin(a) * radio);
      m.rotation.y = a;
      grupo.add(m);
    }
  }
  return { monolitos, colinas };
}
