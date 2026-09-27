import { test } from "node:test";
import assert from "node:assert/strict";
import { conoRedondo, elipsoide, piel, unionSuave } from "../src/malla-sdf.js";

test("piel de una esfera: los vértices, en su radio; normales hacia fuera; triángulos que existen", () => {
  const esfera = elipsoide([0, 0, 0], [0.5, 0.5, 0.5]);
  const { posiciones, normales, indices } = piel(esfera, [-0.7, -0.7, -0.7], [0.7, 0.7, 0.7], 0.05);
  assert.ok(posiciones.length / 3 > 300);
  for (let i = 0; i < posiciones.length; i += 3) {
    const r = Math.hypot(posiciones[i], posiciones[i + 1], posiciones[i + 2]);
    assert.ok(Math.abs(r - 0.5) < 0.03, `radio ${r}`);
    const dot = (posiciones[i] * normales[i] + posiciones[i + 1] * normales[i + 1] + posiciones[i + 2] * normales[i + 2]) / r;
    assert.ok(dot > 0.95, `normal hacia dentro (${dot})`);
  }
  assert.equal(indices.length % 3, 0);
  assert.ok(indices.every((i) => i >= 0 && i < posiciones.length / 3));
});

test("piel: los triángulos miran hacia fuera (la cara, del mismo lado que la normal)", () => {
  const esfera = elipsoide([0, 0, 0], [0.4, 0.4, 0.4]);
  const { posiciones: p, indices: t } = piel(esfera, [-0.6, -0.6, -0.6], [0.6, 0.6, 0.6], 0.05);
  let bien = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    if (nx * p[a] + ny * p[a + 1] + nz * p[a + 2] > 0) bien++;
  }
  assert.ok(bien / (t.length / 3) > 0.99, `${bien} de ${t.length / 3}`);
});

test("unión suave: dos piezas se funden en una (sin hueco entre ellas)", () => {
  const a = elipsoide([-0.2, 0, 0], [0.2, 0.2, 0.2]), b = conoRedondo([0.1, 0, 0], [0.4, 0, 0], 0.12, 0.04);
  const junto = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => unionSuave(a(x, y, z), b(x, y, z), 0.08);
  assert.ok(junto(0.02, 0, 0) < 0, "el cuello entre las dos, dentro");
  assert.ok(junto(0, 0.25, 0) > 0);
});
