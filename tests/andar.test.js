import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCALON, IMPULSO, caer, choca, colocarCaja, deslizar, sueloBajo } from "../src/andar.js";

const pared = { x0: 0, x1: 0.3, z0: -5, z1: 5, y0: 0, y1: 3 };
const escalon = { x0: 2, x1: 4, z0: -1, z1: 1, y0: 0, y1: 0.3 };
const mesa = { x0: 6, x1: 7, z0: -0.5, z1: 0.5, y0: 0, y1: 0.8 };
const cajas = [pared, escalon, mesa];

test("andar: una pared para; un escalón se sube; una mesa, solo saltando", () => {
  assert.equal(choca(0.1, 0, 0, cajas), true);
  assert.equal(choca(3, 0, 0, cajas), false, "el escalón no para: se sube");
  assert.equal(sueloBajo(3, 0, 0, 0, cajas), 0.3);
  assert.equal(choca(6.5, 0, 0, cajas), true, "la mesa es más alta que un escalón");
  assert.equal(choca(6.5, 0, 0.8 - ESCALON + 0.01, cajas), false, "saltando por encima, ya no");
  assert.equal(sueloBajo(6.5, 0, 0.7, 0, cajas), 0.8, "y se queda de pie encima");
  assert.equal(choca(0.1, 0, 3.1, cajas), false, "por encima de la pared, no choca");
});

test("andar: contra una pared en diagonal, se desliza a lo largo de ella", () => {
  const r = deslizar({ x: -1, z: 0 }, { x: 0.2, z: 1 }, 0, cajas);
  assert.equal(r.x, -1);
  assert.equal(r.z, 1);
});

test("saltar: sube, cae y aterriza en el suelo; sin escalones de por medio, a saltitos no", () => {
  let e = { pies: 0, vy: IMPULSO };
  let alto = 0;
  let pasos = 0;
  let r = { pies: 0, vy: IMPULSO, enSuelo: false };
  while (pasos++ < 400) {
    r = caer(e, 1 / 60, 0);
    alto = Math.max(alto, r.pies);
    e = r;
    if (r.enSuelo) break;
  }
  assert.ok(alto > 1 && alto < 1.5, `sube ${alto} m`);
  assert.ok(r.enSuelo && r.pies === 0 && r.vy === 0);
  assert.ok(pasos > 30, "no aterriza en el acto");
  // Bajando una cuesta suave, se queda pegado al suelo.
  assert.deepEqual(caer({ pies: 0.05, vy: 0 }, 1 / 60, 0), { pies: 0, vy: 0, enSuelo: true });
});

test("cajas: girar un cuarto de vuelta cambia x por z (como rotation.y de three)", () => {
  const local = { x0: -1, x1: 1, z0: 2, z1: 3, y0: 0, y1: 1 };
  assert.deepEqual(colocarCaja(local, 10, 0, 0, 0), { x0: 9, x1: 11, z0: 2, z1: 3, y0: 0, y1: 1 });
  // Un cuarto de vuelta (π/2): (x, z) -> (z, -x)
  assert.deepEqual(colocarCaja(local, 0, 5, 0, 1), { x0: 2, x1: 3, z0: -1, z1: 1, y0: 5, y1: 6 });
  assert.deepEqual(colocarCaja(local, 0, 0, 0, 2), { x0: -1, x1: 1, z0: -3, z1: -2, y0: 0, y1: 1 });
});
