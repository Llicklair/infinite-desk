import { test } from "node:test";
import assert from "node:assert/strict";
import { H_LABIO, RISCO_Z, X_RISCO, Z_LABIO, alto, cajasRisco, cima, columna, frente, hendidura, mallaRisco } from "../src/risco.js";

test("risco: dos lóbulos más altos que la hendidura, y las colas se hunden en la hierba", () => {
  assert.equal(hendidura(0), 1);
  assert.equal(hendidura(4), 0);
  assert.ok(Math.abs(alto(0) - H_LABIO) < 0.1);
  assert.ok(alto(-4.5) > H_LABIO + 2 && alto(4.5) > H_LABIO + 1.5, "los lóbulos encajonan el agua");
  assert.ok(alto(-X_RISCO) < 0 && alto(X_RISCO) < 0);
  // De cada lóbulo hacia fuera, siempre bajando.
  for (let x = 6; x < X_RISCO; x += 1) assert.ok(alto(x + 1) <= alto(x) + 1e-9 && alto(-x - 1) <= alto(-x) + 1e-9, `x = ${x}`);
});

test("risco: el agua sale del labio, en voladizo por delante de la pared mojada", () => {
  const col = columna(0);
  const labio = col.filter(([y]) => Math.abs(y - (H_LABIO - 0.3)) < 0.3);
  assert.ok(labio.some(([, z]) => Math.abs(z - Z_LABIO) < 0.4), "el labio llega a Z_LABIO");
  const pared = col.filter(([y, z]) => y > 1 && y < 8 && z > RISCO_Z - 2); // la de delante, no la de detrás
  for (const [, z] of pared) assert.ok(Math.abs(z - RISCO_Z) < 0.3, `pared en z = ${z}`);
  // La cima de la hendidura queda bajo el agua del canal (a H_LABIO + 0.02) hasta la roca de atrás.
  const canal = col.filter(([, z]) => z < Z_LABIO - 0.4 && z > RISCO_Z - 3.2);
  for (const [y] of canal) assert.ok(y < H_LABIO + 0.02, `el lecho del canal asoma: y = ${y}`);
});

test("risco: la malla es una sola pieza, sin agujeros ni valores raros", () => {
  const { posiciones, indices, columnas, filas } = mallaRisco();
  assert.equal(posiciones.length, columnas * filas * 3);
  assert.ok(posiciones.every(Number.isFinite));
  assert.equal(indices.length, (columnas - 1) * (filas - 1) * 6);
  assert.ok(indices.every((i) => i >= 0 && i < columnas * filas));
});

test("risco: las cajas paran a la altura de la cara y no invaden la poza", () => {
  const cajas = cajasRisco();
  assert.ok(cajas.length > 30);
  for (const c of cajas) {
    const x = (c.x0 + c.x1) / 2;
    assert.ok(c.z1 >= frente(x) - 1e-9, `x = ${x}`);
    assert.ok(Math.hypot(x, c.z1) > 15, `x = ${x}: la caja entra en la poza (z1 = ${c.z1})`);
  }
  const { y, z } = cima(-6);
  assert.ok(y > 12 && z < RISCO_Z + 1.5, `cima(-6) = ${y}, ${z}`);
});
