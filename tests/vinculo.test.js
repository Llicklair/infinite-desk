import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_AGENTE_DE_MAS, COLORES_AGENTE, ONDA_FRESCA, ONDA_MUERTA, colorDeAgente, encendidosPorAgentes, lineasNuevas,
  repoDeTitulo, senalesDeAgentes, siguienteRepo, vigorOnda,
} from "../src/vinculo.js";

const repos = ["infinite-desk", "galaxy-brain", "galaxy", "TTS pro", "forja", "atalaya"];

test("título de VS Code: el repo es la carpeta del medio", () => {
  assert.equal(repoDeTitulo("escena.js - infinite-desk - Visual Studio Code", repos), "infinite-desk");
  assert.equal(repoDeTitulo("● cli.py - galaxy-brain - Visual Studio Code", repos), "galaxy-brain");
});

test("gana el nombre más largo, no el que es prefijo", () => {
  assert.equal(repoDeTitulo("graph.py - galaxy-brain - Visual Studio Code", repos), "galaxy-brain");
});

test("nombres con espacios y sin distinguir mayúsculas", () => {
  assert.equal(repoDeTitulo("main.py - tts pro - Visual Studio Code", repos), "TTS pro");
});

test("un nombre dentro de otra palabra no cuenta", () => {
  assert.equal(repoDeTitulo("notas - forja-web - Visual Studio Code", repos), null);
  assert.equal(repoDeTitulo("forjado.md - otra - Visual Studio Code", repos), null);
});

test("sin repo reconocible, null (la pantalla queda sin grafo hasta pulsar G)", () => {
  assert.equal(repoDeTitulo("window:132456:0", repos), null);
  assert.equal(repoDeTitulo("", repos), null);
});

test("G recorre los repos y vuelve a 'sin grafo'", () => {
  const n = ["a", "b"];
  assert.equal(siguienteRepo(null, n), "a");
  assert.equal(siguienteRepo("a", n), "b");
  assert.equal(siguienteRepo("b", n), null);
  assert.equal(siguienteRepo("x", n), "a");
  assert.equal(siguienteRepo(null, []), null);
});

test("agentes: encienden sus módulos, el commit se distingue y dos a la vez son cruce", () => {
  const ids = ["a", "b", "c", "d"];
  const r = encendidosPorAgentes(ids, [
    { nombre: "uno", nodos: ["a", "b"], commitados: ["d"] },
    { nombre: "dos", nodos: ["b"], commitados: ["a"] },
    { nombre: "tres", nodos: ["naciente.que.aun.no.es.nodo"] },
  ]);
  assert.deepEqual([...r.keys()].sort(), [0, 1, 3]);
  assert.deepEqual(r.get(1), { agentes: ["uno", "dos"], commit: false, cruce: true });
  assert.deepEqual(r.get(0), { agentes: ["uno", "dos"], commit: false, cruce: false }); // "dos" solo lo commiteó
  assert.deepEqual(r.get(3), { agentes: ["uno"], commit: true, cruce: false });
});

test("color de agente: la paleta de gb por orden de nombre, gris del quinto en adelante", () => {
  const todos = ["zeta", "alfa", "delta", "beta", "gamma"];
  assert.equal(colorDeAgente("alfa", todos), COLORES_AGENTE[0]);
  assert.equal(colorDeAgente("delta", todos), COLORES_AGENTE[2]);
  assert.equal(colorDeAgente("zeta", todos), COLOR_AGENTE_DE_MAS);
  assert.equal(colorDeAgente("alfa", ["alfa"]), colorDeAgente("alfa", ["alfa", "zz"])); // estable al llegar otro detrás
  assert.equal(colorDeAgente("fantasma", todos), COLOR_AGENTE_DE_MAS);
});

test("vigor: entero 3 minutos, se apaga en línea recta y a los 10 es cero", () => {
  assert.equal(vigorOnda(0), 1);
  assert.equal(vigorOnda(null), 1);
  assert.equal(vigorOnda(ONDA_FRESCA), 1);
  assert.equal(vigorOnda((ONDA_FRESCA + ONDA_MUERTA) / 2), 0.5);
  assert.equal(vigorOnda(ONDA_MUERTA), 0);
  assert.equal(vigorOnda(5000), 0);
});

test("señales: desde el nodo tocado hacia el otro extremo, solo en aristas con un extremo tocado", () => {
  const enc = new Map([[1, { agentes: ["uno"] }], [3, { agentes: ["dos"] }]]);
  const aristas = [
    { origen: 0, destino: 1 }, // tocado el destino: la señal sale de él
    { origen: 1, destino: 2 },
    { origen: 1, destino: 3 }, // los dos tocados: de origen a destino
    { origen: 0, destino: 2 }, // ninguno: nada
  ];
  assert.deepEqual(senalesDeAgentes(aristas, enc), [
    { desde: 1, hasta: 0, agentes: ["uno"] },
    { desde: 1, hasta: 2, agentes: ["uno"] },
    { desde: 1, hasta: 3, agentes: ["uno"] },
  ]);
});

test("consola: solo caen las líneas nuevas; si la vista se perdió, las últimas", () => {
  assert.deepEqual(lineasNuevas([], ["a", "b", "c"], 2), ["b", "c"]);
  assert.deepEqual(lineasNuevas(["a", "b"], ["a", "b", "c", "d"]), ["c", "d"]);
  assert.deepEqual(lineasNuevas(["a", "b"], ["a", "b"]), []);
  assert.deepEqual(lineasNuevas(["x"], ["a", "b", "c"], 2), ["b", "c"]);
  assert.deepEqual(lineasNuevas(["ok"], ["ok", "sigue", "ok", "fin"]), ["fin"]); // la última repetida: desde la más reciente
});
