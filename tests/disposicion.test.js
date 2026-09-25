import { test } from "node:test";
import assert from "node:assert/strict";
import { disponer } from "../src/disposicion.js";

const grafo = {
  nodos: ["a", "a", "a", "b", "b", "c"].map((grupo) => ({ grupo })),
  aristas: [{ origen: 0, destino: 1 }, { origen: 1, destino: 2 }, { origen: 3, destino: 4 }],
};

const distancia = (p, i, j) =>
  Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1], p[i * 3 + 2] - p[j * 3 + 2]);

test("es determinista: mismo grafo, mismas posiciones", () => {
  assert.deepEqual(disponer(grafo), disponer(grafo));
});

test("da tres coordenadas finitas por nodo, centradas en el origen", () => {
  const p = disponer(grafo);
  assert.equal(p.length, grafo.nodos.length * 3);
  assert.ok(p.every(Number.isFinite));
  for (let k = 0; k < 3; k++) {
    const media = grafo.nodos.reduce((s, _, i) => s + p[i * 3 + k], 0) / grafo.nodos.length;
    assert.ok(Math.abs(media) < 0.05, `eje ${k} descentrado: ${media}`);
  }
});

test("ningún par de nodos queda encima del otro", () => {
  const p = disponer(grafo);
  for (let i = 0; i < grafo.nodos.length; i++)
    for (let j = i + 1; j < grafo.nodos.length; j++)
      assert.ok(distancia(p, i, j) > 1, `${i} y ${j} se solapan`);
});

test("los conectados quedan más cerca que los de grupos distintos sin arista", () => {
  const p = disponer(grafo);
  assert.ok(distancia(p, 0, 1) < distancia(p, 0, 5));
});

test("un grafo vacío no revienta", () => {
  assert.deepEqual(disponer({ nodos: [], aristas: [] }), []);
});
