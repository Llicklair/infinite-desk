import { test } from "node:test";
import assert from "node:assert/strict";
import { corregirNombres, sonido } from "../src/dictado.js";

const NOMBRES = ["Kiri", "Atlas", "palantír", "galaxy-brain", "infinite-desk", "Automatiza-Core", "TTS pro", "forja", "consejo-7-sabios", "invest-ll"];

test("sonido: lo que se pronuncia igual, igual", () => {
  assert.equal(sonido("quiri"), sonido("Kiri"));
  assert.equal(sonido("Kirí"), sonido("kiri"));
  assert.equal(sonido("palantir"), sonido("palantír"));
});

test("dictado: los nombres mal oídos vuelven a su sitio", () => {
  assert.equal(corregirNombres("hola quiri ponme música", NOMBRES), "hola Kiri ponme música");
  assert.equal(corregirNombres("Atlas qué es galaxy brain", NOMBRES), "Atlas qué es galaxy-brain");
  assert.equal(corregirNombres("ábreme infinite desk, porfa", NOMBRES), "ábreme infinite-desk, porfa");
  assert.equal(corregirNombres("qué hay en el palantir hoy", NOMBRES), "qué hay en el palantír hoy");
  assert.equal(corregirNombres("llévame a automatiza core", NOMBRES), "llévame a Automatiza-Core");
});

test("dictado: lo normal no se toca (ni palabras que solo se parecen un poco)", () => {
  for (const f of ["hoy ha sido un día largo", "me gusta la fruta", "abre el correo", "quiero ir a la playa", "tengo frío", "la forma de hacerlo", "atrás no"]) {
    assert.equal(corregirNombres(f, NOMBRES), f, f);
  }
});
