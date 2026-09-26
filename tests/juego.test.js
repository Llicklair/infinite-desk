import { test } from "node:test";
import assert from "node:assert/strict";
import { DURACION_S, esHito, intervaloDeAparicion, notaDeRacha, puntos, vidaDeChispa } from "../src/juego.js";

test("puntos: la racha multiplica (×1, ×2 desde 5, ×3 desde 10, ×5 desde 20)", () => {
  assert.deepEqual([1, 4, 5, 9, 10, 19, 20, 99].map(puntos), [10, 10, 20, 20, 30, 30, 50, 50]);
});

test("nota: sube con la racha, una octava cada 5, y tiene techo", () => {
  const notas = Array.from({ length: 30 }, (_, i) => notaDeRacha(i + 1));
  for (let i = 1; i < 20; i++) assert.ok(notas[i] > notas[i - 1], `la ${i + 1} sube`);
  assert.ok(Math.abs(notaDeRacha(6) / notaDeRacha(1) - 2) < 1e-9, "5 aciertos más, una octava");
  assert.equal(notaDeRacha(25), notaDeRacha(20), "techo");
  assert.equal(notaDeRacha(0), notaDeRacha(1), "sin racha, la primera nota");
});

test("ritmo: salen más deprisa y viven menos al final; fuera de la ronda, los extremos", () => {
  assert.ok(intervaloDeAparicion(DURACION_S) < intervaloDeAparicion(0));
  assert.ok(vidaDeChispa(DURACION_S) < vidaDeChispa(0));
  assert.equal(intervaloDeAparicion(-5), intervaloDeAparicion(0));
  assert.equal(vidaDeChispa(DURACION_S * 2), vidaDeChispa(DURACION_S));
  assert.ok(intervaloDeAparicion(DURACION_S) > 0.2, "nunca una lluvia imposible");
});

test("hitos: 5, 10, 20, 35 y 50", () => {
  assert.deepEqual([4, 5, 10, 11, 20, 35, 50].map(esHito), [false, true, true, false, true, true, true]);
});
