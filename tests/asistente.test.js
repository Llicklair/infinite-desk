import { test } from "node:test";
import assert from "node:assert/strict";
import { NOMBRE_ATLAS, contextoDelMundo, instruccionesAtlas, validarAtlas } from "../src/asistente.js";
import { separarAccionesCon } from "../src/apoyo.js";

const AHORA = Date.UTC(2026, 8, 26, 12);
const grafos = [
  { nombre: "galaxy-brain", raiz: "C:\\dev\\galaxy-brain", resumen: "Take the model out of your architecture diagram.", ultimoCommit: AHORA / 1000 - 86400 * 3,
    nodos: [{ id: "gb.cli", fanIn: 0 }, { id: "gb.graph", fanIn: 7 }, { id: "gb.core", fanIn: 12 }], aristas: [{}, {}], ciclos: [["a", "b"]] },
  { nombre: "forja", raiz: "C:\\dev\\forja", nodos: [], aristas: [] },
];
const noticias = {
  titulares: [{ fuente: "r/OpenAI", puntos: 35, texto: "Something   big\nhappened", url: "https://reddit.com/x" }],
  repos: [{ nombre: "owner/cool", lenguaje: "Rust", estrellasMes: 900, descripcion: "A cool thing", url: "https://github.com/owner/cool" }],
};

test("contexto: cada repo con qué es, tamaño, núcleo, ciclos, último commit y carpeta; noticias numeradas como tarjetas", () => {
  const c = contextoDelMundo(grafos, noticias, AHORA);
  assert.match(c, /- galaxy-brain: Take the model out.* \| 3 módulos, 2 dependencias, 1 ciclo\(s\) \| núcleo: gb\.core \(<-12\), gb\.graph \(<-7\) \| último commit: hace 3 días \| carpeta: C:\\dev\\galaxy-brain/);
  assert.match(c, /- forja: sin README \| 0 módulos, 0 dependencias \| último commit: sin commits/);
  assert.match(c, /\[0\] \(r\/OpenAI, 35 pts\) Something big happened — https:\/\/reddit\.com\/x/);
  assert.match(c, /\[1\] owner\/cool \(Rust, \+900★ este mes\): A cool thing — https:\/\/github\.com\/owner\/cool/);
  assert.ok(contextoDelMundo([], null, AHORA).includes("Sin titulares"));
});

test("Atlas: laboral, breve, no se inventa nada, conoce sus acciones y lo que uno mira", () => {
  const s = instruccionesAtlas("CONTEXTO", { isla: "forja" }, "hoy");
  assert.ok(s.startsWith(`Eres ${NOMBRE_ATLAS}`));
  for (const debe of ["jefe de gabinete", "nunca te lo inventas", "Read, Grep y Glob", '"tipo": "vscode"', '"tipo": "leer"', "hasta DOS", "Kiri", "la isla de forja", "CONTEXTO"]) assert.ok(s.includes(debe), debe);
  assert.ok(instruccionesAtlas("", { pantalla: "README.md - Visual Studio Code" }, "hoy").includes('pantalla: "README.md - Visual Studio Code"'));
});

test("acciones de Atlas: solo repos que existen (con su nombre exacto), tarjetas que hay, webs http(s); dos como mucho", () => {
  const validar = validarAtlas({ repos: ["galaxy-brain", "forja"], tarjetas: 2 });
  const r = separarAccionesCon([
    "Te lo abro y te llevo.",
    'ACCION: {"tipo": "vscode", "repo": "Galaxy-Brain"}',
    'ACCION: {"tipo": "ir", "repo": "forja"}',
    'ACCION: {"tipo": "zen"}',
  ].join("\n"), validar, 2);
  assert.equal(r.texto, "Te lo abro y te llevo.");
  assert.deepEqual(r.acciones, [{ tipo: "vscode", repo: "galaxy-brain" }, { tipo: "ir", repo: "forja" }]);
  for (const mala of [{ tipo: "vscode", repo: "no-existe" }, { tipo: "leer", tarjeta: 2 }, { tipo: "leer", tarjeta: "1" }, { tipo: "web", url: "javascript:alert(1)" }, { tipo: "web", url: "file:///C:/x" }, { tipo: "borrar" }]) {
    assert.equal(validar(mala), null, JSON.stringify(mala));
  }
  assert.deepEqual(validar({ tipo: "consola", pestana: "errores" }), { tipo: "consola", pestana: "errores" });
  assert.deepEqual(validar({ tipo: "consola", pestana: "inventada" }), { tipo: "consola", pestana: "repos" });
  assert.deepEqual(validar({ tipo: "web", url: " https://github.com/owner/cool " }), { tipo: "web", url: "https://github.com/owner/cool" });
});
