import { test } from "node:test";
import assert from "node:assert/strict";
import { ANGULO_MAXIMO, fuerzaDeCarga, posicionEn, recorrido } from "../src/lago.js";

test("lago: plana y fuerte, hace la rana (varios botes y al final se hunde)", () => {
  const r = recorrido({ altura: 1.2, velocidad: 20, angulo: -3 });
  const botes = r.contactos.filter((c) => c.tipo === "bote").length;
  assert.ok(botes >= 3, `solo ${botes} botes`);
  assert.equal(r.contactos.at(-1)?.tipo, "hundir");
  // Cada vez más lejos y más tarde, y cada salto más corto que el anterior.
  for (let i = 1; i < r.contactos.length; i++) {
    assert.ok(r.contactos[i].d > r.contactos[i - 1].d && r.contactos[i].t > r.contactos[i - 1].t);
  }
  const saltos = r.contactos.map((c, i) => c.d - (r.contactos[i - 1]?.d ?? 0)).slice(1);
  for (let i = 1; i < saltos.length; i++) assert.ok(saltos[i] < saltos[i - 1] + 1e-9, `salto ${i} más largo`);
});

test("lago: empinada o floja, se hunde al primer contacto", () => {
  assert.deepEqual(recorrido({ altura: 1.2, velocidad: 20, angulo: 50 }).contactos.map((c) => c.tipo), ["hundir"]);
  assert.deepEqual(recorrido({ altura: 1.2, velocidad: 4, angulo: -2 }).contactos.map((c) => c.tipo), ["hundir"]);
  assert.deepEqual(recorrido({ altura: 3, velocidad: 20, angulo: -(ANGULO_MAXIMO + 10) }).contactos.map((c) => c.tipo), ["hundir"]);
});

test("lago: la posición sale de la mano, toca el agua en cada contacto y acaba hundida", () => {
  const r = recorrido({ altura: 1.2, velocidad: 18, angulo: -2 });
  assert.deepEqual(posicionEn(r, 0), { d: 0, y: 1.2, fin: false });
  for (const c of r.contactos.slice(0, -1)) {
    const p = posicionEn(r, c.t - 1e-6);
    assert.ok(Math.abs(p.d - c.d) < 1e-3 && p.y < 1e-3, `en ${c.t}: ${JSON.stringify(p)}`);
  }
  const fin = posicionEn(r, 999);
  assert.equal(fin.fin, true);
  assert.equal(fin.d, r.contactos.at(-1)?.d);
});

test("lago: la carga va de floja a fuerte y tiene techo", () => {
  assert.equal(fuerzaDeCarga(0), 7);
  assert.ok(fuerzaDeCarga(500) > 7 && fuerzaDeCarga(500) < 22);
  assert.equal(fuerzaDeCarga(5000), 22);
});
