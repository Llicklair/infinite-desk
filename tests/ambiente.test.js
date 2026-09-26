import { test } from "node:test";
import assert from "node:assert/strict";
import { DIA, PALETAS, VIDA_MINIMA, paletaDeHora, vidaDeRepo } from "../src/ambiente.js";

test("paleta: a la hora exacta de una, esa; entre dos, a medio camino", () => {
  for (const [h, p] of PALETAS) assert.deepEqual(paletaDeHora(h), p);
  const [h0, p0] = PALETAS[3];
  const [h1, p1] = PALETAS[4];
  const medio = paletaDeHora((h0 + h1) / 2);
  assert.ok(Math.abs(medio.estrellas - (p0.estrellas + p1.estrellas) / 2) < 1e-9);
  medio.cenit.forEach((c, i) => assert.ok(Math.abs(c - (p0.cenit[i] + p1.cenit[i]) / 2) < 1e-9));
});

test("paleta: el día da la vuelta sin saltos (23:59 ≈ 00:00) y acepta horas fuera de 0..24", () => {
  const casi = paletaDeHora(23.999);
  const cero = paletaDeHora(0);
  casi.horizonte.forEach((c, i) => assert.ok(Math.abs(c - cero.horizonte[i]) < 0.01));
  assert.deepEqual(paletaDeHora(24 + 11), paletaDeHora(11));
  assert.deepEqual(paletaDeHora(-13), paletaDeHora(11));
});

test("paleta: siempre oscura, para no comerse el contraste de las pantallas", () => {
  for (let h = 0; h < 24; h += 0.25) {
    const { cenit, horizonte } = paletaDeHora(h);
    for (const c of [...cenit, ...horizonte]) assert.ok(c <= 0.4, `a las ${h} hay un componente de ${c}`);
  }
});

test("vida: entera el primer día, se apaga despacio y nunca del todo", () => {
  const ahora = 1_800_000_000;
  assert.equal(vidaDeRepo(ahora - 3600, ahora), 1);
  const semana = vidaDeRepo(ahora - 7 * DIA, ahora);
  const mes = vidaDeRepo(ahora - 30 * DIA, ahora);
  const anio = vidaDeRepo(ahora - 365 * DIA, ahora);
  assert.ok(semana < 1 && mes < semana && anio < mes, `${semana} ${mes} ${anio}`);
  assert.equal(anio, VIDA_MINIMA);
  assert.equal(vidaDeRepo(ahora + 1000, ahora), 1, "un commit con el reloj adelantado cuenta como de hoy");
});

test("vida: sin fecha de commit, a medias", () => {
  assert.equal(vidaDeRepo(undefined, 1_800_000_000), 0.5);
  assert.equal(vidaDeRepo(Number.NaN, 1_800_000_000), 0.5);
});

test("marca: la nebulosa, del color principal; el cénit, un poco hacia el secundario; el horizonte, igual", async () => {
  const { paletaConMarca } = await import("../src/ambiente.js");
  const p = paletaDeHora(23);
  const m = paletaConMarca(p, ["#ff0000", "#0000ff"]);
  assert.deepEqual(m.nebulosa, [1, 0, 0]);
  assert.deepEqual(m.horizonte, p.horizonte);
  assert.ok(m.cenit[2] > p.cenit[2] && m.cenit[2] < 0.3, "hacia el azul, sin aclarar el cielo");
  assert.deepEqual(paletaConMarca(p, ["rojo"]), p, "un color que no es #rrggbb no cambia nada");
  assert.deepEqual(paletaConMarca(p, []), p);
});
