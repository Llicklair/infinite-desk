import { test } from "node:test";
import assert from "node:assert/strict";
import { colocarIslas, escalaAjuste, firmaGrafos, islasNuevas } from "../src/islas.js";

test("la primera isla queda enfrente (-Z) y todas a la misma distancia del centro", () => {
  const islas = colocarIslas(5);
  assert.equal(islas[0].x, 0);
  assert.ok(islas[0].z < 0);
  const r = Math.hypot(islas[0].x, islas[0].z);
  for (const i of islas) assert.ok(Math.abs(Math.hypot(i.x, i.z) - r) < 0.01);
});

test("con muchos repos el círculo crece y las islas no se pisan", () => {
  const islas = colocarIslas(30, { separacion: 20 });
  for (let i = 0; i < islas.length; i++) {
    const s = islas[(i + 1) % islas.length];
    assert.ok(Math.hypot(islas[i].x - s.x, islas[i].z - s.z) > 19, `isla ${i} pisa a la siguiente`);
  }
});

test("cada isla mira al centro", () => {
  for (const { x, z, angulo } of colocarIslas(7)) {
    // El frente de un objeto girado `angulo` en Y es (-sin, -cos): debe apuntar al origen.
    const fx = -Math.sin(angulo);
    const fz = -Math.cos(angulo);
    const haciaCentro = [-x, -z].map((v) => v / Math.hypot(x, z));
    assert.ok(fx * haciaCentro[0] + fz * haciaCentro[1] > 0.99);
  }
});

test("cero repos, cero islas", () => {
  assert.deepEqual(colocarIslas(0), []);
});

test("la escala mete el 90 % de los nodos en el radio pedido, ignorando al satélite", () => {
  const pos = [];
  for (let i = 1; i <= 9; i++) pos.push(i, 0, 0);
  pos.push(1000, 0, 0); // satélite suelto
  const k = escalaAjuste(pos, 6);
  assert.ok(Math.abs(9 * k - 6) < 1e-9, `el nodo 9 debería caer justo en el radio, cae en ${9 * k}`);
});

test("grafo vacío o de un punto: escala neutra", () => {
  assert.equal(escalaAjuste([], 6), 1);
  assert.equal(escalaAjuste([0, 0, 0], 6), 1);
});

test("la firma cambia si cambia un repo, sus módulos o sus aristas, y no si no cambia nada", () => {
  const g = (nombre, n, a) => ({ nombre, nodos: Array(n), aristas: Array(a) });
  const base = firmaGrafos([g("a", 3, 2), g("b", 5, 4)]);
  assert.equal(firmaGrafos([g("a", 3, 2), g("b", 5, 4)]), base);
  assert.notEqual(firmaGrafos([g("a", 3, 2), g("b", 6, 4)]), base);
  assert.notEqual(firmaGrafos([g("a", 3, 2), g("b", 5, 5)]), base);
  assert.notEqual(firmaGrafos([g("a", 3, 2), g("b", 5, 4), g("c", 2, 1)]), base);
});

test("islas nuevas: solo las que no estaban, en el orden de ahora", () => {
  assert.deepEqual(islasNuevas(["a", "b"], ["a", "c", "b", "d"]), ["c", "d"]);
  assert.deepEqual(islasNuevas(["a", "b"], ["a"]), []);
});
