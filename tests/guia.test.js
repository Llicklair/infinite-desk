import { test } from "node:test";
import assert from "node:assert/strict";
import { PASOS, empezarGuia } from "../src/guia.js";

/** @param {Partial<import("../src/guia.js").Foto>} [cambios] */
const foto = (cambios = {}) => ({ andado: 0, girado: 0, apuntaIsla: false, pantallas: 0, escribiendo: false, ficheros: false, lector: false, maestra: false, atlas: false, zen: false, ...cambios });

test("guía: empieza en la bienvenida y acaba en el final; cada paso con título, texto, teclas y qué pide", () => {
  assert.equal(PASOS[0].id, "bienvenida");
  assert.equal(PASOS.at(-1)?.id, "final");
  for (const p of PASOS) assert.ok(p.titulo && p.texto && p.teclas.length && p.pide, p.id);
  assert.equal(new Set(PASOS.map((p) => p.id)).size, PASOS.length);
});

test("guía: la bienvenida no se cumple sola; Tab pasa, Shift+Tab vuelve y no baja de la primera", () => {
  const g = empezarGuia(foto());
  assert.equal(g.mirar(foto({ andado: 100, girado: 9 }), 0), "sigue");
  assert.equal(g.ir(-1, foto()), "sigue");
  assert.equal(g.numero, 0);
  g.ir(1, foto());
  assert.equal(g.paso.id, "moverse");
});

test("guía: moverse cuenta desde que empezó el paso, se marca hecho y al rato pasa al siguiente", () => {
  const g = empezarGuia(foto());
  g.ir(1, foto({ andado: 50, girado: 5 })); // lo andado antes no cuenta
  assert.equal(g.mirar(foto({ andado: 55, girado: 5.2 }), 0), "sigue");
  assert.equal(g.mirar(foto({ andado: 60, girado: 6 }), 1000), "hecho");
  assert.ok(g.cumplido);
  assert.equal(g.mirar(foto({ andado: 60, girado: 6 }), 1800), "hecho");
  assert.equal(g.mirar(foto({ andado: 60, girado: 6 }), 2600), "sigue");
  assert.equal(g.paso.id, "islas");
});

test("guía: una pantalla nueva cumple el paso de pantallas; las que ya había, no", () => {
  const g = empezarGuia(foto());
  while (g.paso.id !== "pantallas") g.ir(1, foto({ pantallas: 2 }));
  assert.equal(g.mirar(foto({ pantallas: 2 }), 0), "sigue");
  assert.equal(g.mirar(foto({ pantallas: 3 }), 10), "hecho");
});

test("guía: Tab en el último paso termina", () => {
  const g = empezarGuia(foto());
  for (let i = 0; i < PASOS.length - 1; i++) assert.equal(g.ir(1, foto()), "sigue");
  assert.equal(g.paso.id, "final");
  assert.equal(g.ir(1, foto()), "fin");
});
