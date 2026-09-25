import { test } from "node:test";
import assert from "node:assert/strict";
import { encendidosPorAgentes, repoDeTitulo, siguienteRepo, tonoDeAgente } from "../src/vinculo.js";

const repos = ["mirador", "galaxy-brain", "galaxy", "TTS pro", "forja", "atalaya"];

test("título de VS Code: el repo es la carpeta del medio", () => {
  assert.equal(repoDeTitulo("escena.js - mirador - Visual Studio Code", repos), "mirador");
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

test("el tono de un agente es estable y está en 0..1", () => {
  assert.equal(tonoDeAgente("worktree-a"), tonoDeAgente("worktree-a"));
  assert.notEqual(tonoDeAgente("worktree-a"), tonoDeAgente("worktree-b"));
  for (const n of ["x", "mirador", "agente-7"]) assert.ok(tonoDeAgente(n) >= 0 && tonoDeAgente(n) < 1);
});
