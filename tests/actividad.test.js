import { test } from "node:test";
import assert from "node:assert/strict";
import { SEPARADOR, commitsDeLog, fallosNuevos, filtrarActividad, porDias } from "../src/actividad.js";

test("commits: sha, hora, autor y asunto de git log; líneas rotas, fuera", () => {
  const log = [["abc123", "1790000000", "Marcos", "feat: algo | con barras"].join(SEPARADOR), "", "roto"].join("\n");
  const r = commitsDeLog(log, "infinite-desk");
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { ts: new Date(1790000000 * 1000).toISOString(), tipo: "commit", repo: "infinite-desk", texto: "Marcos: feat: algo | con barras", ref: "abc123" });
});

/** @param {string} id @returns {import("../src/fallos.js").Fallo} */
const fallo = (id) => ({ id, repo: "gb", tipo: "NameError", mensaje: "x", fichero: "src/cli.py", linea: 3, veces: 1, ultimo: "2026-09-26T10:00:00Z", primero: "" });

test("fallos nuevos: la primera vez nada (no se vuelca la historia); después, solo los no vistos", () => {
  const primera = fallosNuevos([fallo("a"), fallo("b")], undefined);
  assert.deepEqual(primera.eventos, []);
  assert.deepEqual(primera.vistos, ["a", "b"]);
  const luego = fallosNuevos([fallo("c"), fallo("a")], primera.vistos);
  assert.deepEqual(luego.eventos.map((e) => e.ref), ["c"]);
  assert.equal(luego.eventos[0].texto, "NameError: x (cli.py:3)");
  assert.ok(luego.vistos.includes("b"), "lo visto antes se sigue recordando");
});

test("filtrar: por repo y por grupo, el más reciente primero", () => {
  /** @type {import("../src/actividad.js").Evento[]} */
  const ev = [
    { ts: "2026-09-26T09:00:00Z", tipo: "commit", repo: "a", texto: "1" },
    { ts: "2026-09-26T11:00:00Z", tipo: "agente-hecho", repo: "a", texto: "2" },
    { ts: "2026-09-26T10:00:00Z", tipo: "commit", repo: "b", texto: "3" },
  ];
  assert.deepEqual(filtrarActividad(ev).map((e) => e.texto), ["2", "3", "1"]);
  assert.deepEqual(filtrarActividad(ev, { repo: "a" }).map((e) => e.texto), ["2", "1"]);
  assert.deepEqual(filtrarActividad(ev, { grupo: "commits" }).map((e) => e.texto), ["3", "1"]);
  assert.deepEqual(filtrarActividad(ev, { repo: "a", grupo: "agentes" }).map((e) => e.texto), ["2"]);
});

test("por días: hoy, ayer y la fecha, en orden", () => {
  const ahora = new Date(2026, 8, 26, 15, 0).getTime();
  /** @param {number} d @param {number} h */
  const ts = (d, h) => new Date(2026, 8, d, h, 0).toISOString();
  const g = porDias([
    { ts: ts(26, 14), tipo: "commit", repo: "a", texto: "1" },
    { ts: ts(26, 9), tipo: "commit", repo: "a", texto: "2" },
    { ts: ts(25, 20), tipo: "commit", repo: "a", texto: "3" },
    { ts: ts(22, 8), tipo: "commit", repo: "a", texto: "4" },
  ], ahora);
  assert.deepEqual(g.map((x) => [x.dia, x.eventos.length]), [["Today", 2], ["Yesterday", 1], [new Date(2026, 8, 22).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }), 1]]);
});
