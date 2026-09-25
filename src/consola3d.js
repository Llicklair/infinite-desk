// La terminal flotante de un agente de gb, como las del mapa de gb (viz.py, #terminales): encima
// de su primer módulo, unida a él por un hilo discontinuo, con su cabecera (● nombre · N nodos ·
// hace Xs) y sus últimas líneas cayendo de una en una cada 700 ms. El texto sale de
// `<worktree>.consola.log` vía `gb who --json` (campo `consola`); sin consola, los cambios de
// firma; sin eso, lo que toca. El cursor parpadea mientras el agente lleva menos de 2 min activo.
// Se puede agarrar y mover, como las de gb (que se arrastran): se queda donde la dejas.
import * as THREE from "three";
import { lineasNuevas } from "./vinculo.js";

const LINEAS = 6;
const CAIDA_MS = 700; // gb: una línea nueva cada 700 ms
const ATRASO_MAXIMO = 12; // gb: si se queda más atrás que esto, salta
const ANCHO = 1100;
const CABECERA = 64;
const ALTO_LINEA = 40;
const CARACTERES = 62;

/**
 * @param {string} nombre
 * @param {string} color el del agente (paleta de gb)
 */
export function crearConsola(nombre, color) {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = CABECERA + LINEAS * ALTO_LINEA + 24;
  const ctx = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext("2d"));
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const cartel = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false }));
  cartel.renderOrder = 2;
  const hilo = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
    color, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  const objeto = new THREE.Group();
  objeto.add(cartel, hilo);

  /** @type {string[]} */
  const vistas = [];
  /** @type {string[]} */
  const cola = [];
  let nodos = 0;
  let hace = /** @type {number | null} */ (null);
  let recibido = 0;
  let ultimaCaida = 0;
  let ultimoDibujo = -1;
  /** @type {THREE.Vector3} el nodo del que cuelga (coordenadas del grafo) */
  let nodoActual = new THREE.Vector3();
  /** @type {THREE.Vector3 | null} dónde la dejó el usuario (centro, coordenadas del grafo), o null */
  let fijada = null;

  function tenderHilo() {
    const abajo = cartel.position.clone().setY(cartel.position.y - cartel.scale.y / 2);
    hilo.geometry.setFromPoints([nodoActual, abajo]);
    hilo.computeLineDistances();
  }

  function dibujar(/** @type {number} */ ahora) {
    const segundos = hace == null ? null : Math.round(hace + (ahora - recibido) / 1000);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = "rgba(10, 13, 20, 0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(2, 2, lienzo.width - 4, lienzo.height - 4, 14);
    ctx.fill();
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.font = '600 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`● ${nombre}`, 22, CABECERA / 2 + 4);
    ctx.font = '26px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = "#8d96c8";
    ctx.textAlign = "right";
    ctx.fillText(`${nodos} node${nodos === 1 ? "" : "s"}${segundos == null ? "" : ` · ${segundos < 60 ? `${segundos}s` : `${Math.floor(segundos / 60)}m`} ago`}`, lienzo.width - 22, CABECERA / 2 + 4);
    ctx.textAlign = "left";
    ctx.font = '26px "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace';
    const ultimas = vistas.slice(-LINEAS);
    ultimas.forEach((l, j) => {
      const recortada = l.length > CARACTERES ? `${l.slice(0, CARACTERES - 1)}…` : l;
      ctx.fillStyle = j === ultimas.length - 1 ? "#e4e8ff" : "#a6b0d8";
      ctx.fillText(recortada, 22, CABECERA + 12 + j * ALTO_LINEA + ALTO_LINEA / 2);
    });
    // Cursor que parpadea (1 s) mientras el agente está vivo: menos de 2 min desde lo último.
    if (segundos != null && segundos < 120 && Math.floor(ahora / 500) % 2 === 0) {
      const j = Math.min(ultimas.length, LINEAS - 1);
      const x = ultimas.length === LINEAS ? 22 + Math.min(ctx.measureText(ultimas[LINEAS - 1]).width + 8, lienzo.width - 60) : 22;
      ctx.fillStyle = color;
      ctx.fillRect(x, CABECERA + 12 + j * ALTO_LINEA + 8, 14, ALTO_LINEA - 16);
    }
    textura.needsUpdate = true;
  }

  return {
    objeto,
    /** El sprite, para que la mira pueda apuntarla. */
    cartel,
    nombre,
    /**
     * Lo que dice ahora `gb who` de este agente. Solo se encola lo que no se había visto.
     * @param {import("./vinculo.js").Agente} agente
     * @param {number} ahora performance.now() al recibirlo
     */
    actualizar(agente, ahora) {
      nodos = (agente.nodos ?? []).length;
      hace = agente.hace_seg ?? null;
      recibido = ahora;
      const fuente = agente.consola?.length ? agente.consola
        : agente.cambios?.length ? agente.cambios.map((c) => `✎ ${c}`)
        : [`touching ${(agente.nodos ?? []).join(", ")}`];
      cola.push(...lineasNuevas([...vistas, ...cola], fuente, ATRASO_MAXIMO));
      if (cola.length > ATRASO_MAXIMO) cola.splice(0, cola.length - ATRASO_MAXIMO);
      ultimoDibujo = -1;
    },
    /**
     * Dónde va, en coordenadas del grafo: en la vertical de `nodo`, apilada desde la altura
     * `suelo` (por encima del grafo y de su rótulo) en el `piso` que le toque; así las de varios
     * agentes no se pisan aunque sus nodos estén a alturas distintas. El hilo baja hasta el nodo.
     * @param {THREE.Vector3} nodo @param {number} ancho @param {number} suelo @param {number} piso
     */
    colocar(nodo, ancho, suelo, piso) {
      const alto = ancho * lienzo.height / lienzo.width;
      const y = suelo + piso * alto * 1.12;
      nodoActual = nodo.clone();
      cartel.scale.set(ancho, alto, 1);
      if (fijada) cartel.position.copy(fijada); // la movió el usuario: ahí se queda
      else cartel.position.set(nodo.x, y + alto / 2, nodo.z);
      tenderHilo();
    },
    /** La mueve el usuario (arrastrándola): su centro, en coordenadas del grafo. @param {THREE.Vector3} centro */
    mover(centro) {
      fijada = centro.clone();
      cartel.position.copy(fijada);
      tenderHilo();
    },
    /** Cada fotograma: cae una línea cada 700 ms y se redibuja (como mucho 4 veces por segundo). @param {number} ahora */
    tick(ahora) {
      if (cola.length && ahora - ultimaCaida >= CAIDA_MS) {
        vistas.push(/** @type {string} */ (cola.shift()));
        if (vistas.length > 50) vistas.splice(0, vistas.length - 50);
        ultimaCaida = ahora;
        ultimoDibujo = -1;
      }
      if (ultimoDibujo < 0 || ahora - ultimoDibujo >= 250) {
        dibujar(ahora);
        ultimoDibujo = ahora;
      }
    },
    cerrar() {
      textura.dispose();
      cartel.material.dispose();
      hilo.geometry.dispose();
      hilo.material.dispose();
      objeto.removeFromParent();
    },
  };
}

/** @typedef {ReturnType<typeof crearConsola>} Consola */
