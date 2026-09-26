import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CONVERSACION, MAX_RECUERDOS, conversacion, fusionar, instrucciones, leerCambios, ordenDeMovimiento, paraVoz, pareceCrisis, pedirRecuerdos } from "../src/apoyo.js";

test("espíritu: amable, breve, honesto de que es una IA, con el 024, y con lo que recuerda", () => {
  const s = instrucciones([{ id: "a", texto: "Su perra se llama Luna", fecha: "2026-09-20" }], "sábado 26 de septiembre");
  for (const debe of ["Cálido", "Escuchas más", "eres una IA", "024", "112", "Su perra se llama Luna", "sábado 26"]) assert.ok(s.includes(debe), debe);
  assert.ok(instrucciones([], "hoy").includes("primera charla"));
});

test("conversación: por turnos, lo más reciente si es muy larga, y acaba pidiendo la respuesta", () => {
  const corta = conversacion([{ quien: "yo", texto: "hola" }, { quien: "espiritu", texto: "¡Hola!" }, { quien: "yo", texto: "estoy cansado" }]);
  assert.match(corta, /^Persona: hola\n\nTú \(espíritu\): ¡Hola!\n\nPersona: estoy cansado\n\nResponde ahora/);
  const larga = conversacion(Array.from({ length: 200 }, (_, i) => ({ quien: /** @type {"yo"} */ ("yo"), texto: `mensaje ${i} ${"x".repeat(200)}` })));
  assert.ok(larga.length < MAX_CONVERSACION + 300);
  assert.ok(larga.startsWith("(La charla empezó antes"));
  assert.ok(larga.includes("mensaje 199") && !larga.includes("mensaje 0 "));
});

test("recuerdos: se pide JSON con lo que ya hay, y se lee aunque venga envuelto", () => {
  const p = pedirRecuerdos([{ quien: "yo", texto: "mi hermana Ana se muda" }], [{ id: "r1", texto: "Trabaja en remoto", fecha: "x" }]);
  assert.ok(p.includes("[r1] Trabaja en remoto") && p.includes("mi hermana Ana") && !p.includes("Responde ahora"));
  const c = leerCambios('Claro:\n```json\n{"nuevos": ["Su hermana Ana se muda", ""], "cambiar": [{"id": "r1", "texto": "Ya trabaja en oficina"}, {"id": 3}], "olvidar": ["r9"]}\n```');
  assert.deepEqual(c, { nuevos: ["Su hermana Ana se muda"], cambiar: [{ id: "r1", texto: "Ya trabaja en oficina" }], olvidar: ["r9"] });
  assert.deepEqual(leerCambios("no sé"), {});
  assert.deepEqual(leerCambios("{roto"), {});
});

test("recuerdos: se cambian, se olvidan y se añaden sin repetir, con techo", () => {
  let n = 0;
  const id = () => `n${++n}`;
  const antes = [{ id: "a", texto: "Le gusta el té", fecha: "1" }, { id: "b", texto: "Tiene un examen", fecha: "1" }];
  const despues = fusionar(antes, { nuevos: ["le gusta el té VERDE", "Aprobó el examen"], cambiar: [{ id: "a", texto: "Le gusta el té verde" }], olvidar: ["b"] }, "2", id);
  assert.deepEqual(despues, [{ id: "a", texto: "Le gusta el té verde", fecha: "2" }, { id: "n1", texto: "Aprobó el examen", fecha: "2" }]);
  const muchos = fusionar([], { nuevos: Array.from({ length: MAX_RECUERDOS + 5 }, (_, i) => `r${i}`) }, "3", id);
  assert.equal(muchos.length, MAX_RECUERDOS);
  assert.equal(muchos.at(-1)?.texto, `r${MAX_RECUERDOS + 4}`);
});

test("crisis: se notan las señales claras, en castellano e inglés, y no salta con lo normal", () => {
  for (const t of ["a veces pienso en quitarme la vida", "no quiero seguir viviendo así", "Pienso en el suicidio", "I want to die", "me quiero hacer daño... hacerme daño"]) assert.ok(pareceCrisis(t), t);
  for (const t of ["hoy estoy cansado", "el trabajo me agobia", "me muero de risa", "este bug me mata"]) assert.ok(!pareceCrisis(t), t);
});

test("moverse: sígueme, quédate aquí y vuelve al banco, por voz o escrito; lo demás, nada", () => {
  for (const t of ["Sígueme, anda", "sigueme porfa", "ven conmigo a la cabaña", "¿me acompañas? acompáñame", "follow me"]) assert.equal(ordenDeMovimiento(t), "seguir", t);
  for (const t of ["quédate aquí", "quedate ahi un rato", "espérame aquí", "no me sigas", "stay here"]) assert.equal(ordenDeMovimiento(t), "quedarse", t);
  for (const t of ["vuelve a tu banco", "vete al banco", "go back to the bench", "vuelve a tu sitio"]) assert.equal(ordenDeMovimiento(t), "volver", t);
  for (const t of ["hoy me he quedado dormido", "sigue contándome", "el banco me ha llamado"]) assert.equal(ordenDeMovimiento(t), null, t);
});

test("voz: sin markdown, enlaces ni emojis", () => {
  assert.equal(paraVoz("**Hola** 🙂, mira [esto](http://x) y `aquello`\n\n# ya"), "Hola , mira esto y aquello ya");
});
