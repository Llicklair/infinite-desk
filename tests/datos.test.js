import { test } from "node:test";
import assert from "node:assert/strict";
import { desdeCarpetas, desdeGbGraph, grupoDe, TOPE_CARPETAS } from "../src/datos.js";

const muestra = {
  root: "/repo",
  fan_in: { "pkg.a": 0, "pkg.b": 2, "tests.t": 0 },
  fan_out: { "pkg.a": 1, "pkg.b": 1, "tests.t": 1, "pkg.c": 1 },
  edge_list: [["pkg.a", "pkg.b"], ["pkg.b", "pkg.c"], ["pkg.c", "pkg.b"], ["tests.t", "fuera.x"]],
  cycles: [["pkg.b", "pkg.c"]],
};

test("el grupo es el primer tramo del módulo", () => {
  assert.equal(grupoDe("galaxybrain.cli"), "galaxybrain");
  assert.equal(grupoDe("suelto"), "suelto");
});

test("los nodos son la unión de fan_in y fan_out, ordenados", () => {
  const g = desdeGbGraph(muestra);
  assert.deepEqual(g.nodos.map((n) => n.id), ["pkg.a", "pkg.b", "pkg.c", "tests.t"]);
  assert.equal(g.nodos[1].fanIn, 2);
  assert.equal(g.nodos[2].fanIn, 0); // pkg.c no está en fan_in: 0, no undefined
});

test("una arista a un módulo desconocido se omite, no se inventa el nodo", () => {
  const g = desdeGbGraph(muestra);
  assert.equal(g.aristas.length, 3);
  assert.ok(!g.nodos.some((n) => n.id === "fuera.x"));
});

test("los ciclos marcan sus nodos y solo las aristas dentro del ciclo", () => {
  const g = desdeGbGraph(muestra);
  assert.deepEqual(g.nodos.filter((n) => n.enCiclo).map((n) => n.id), ["pkg.b", "pkg.c"]);
  assert.deepEqual(g.aristas.map((a) => a.enCiclo), [false, true, true]);
  assert.equal(g.ciclos, 1);
});

test("un JSON vacío da un grafo vacío, no una excepción", () => {
  assert.deepEqual(desdeGbGraph({}), { raiz: "", nodos: [], aristas: [], ciclos: 0, fuente: "gb" });
});

test("sin gb: carpetas y ficheros, cada uno colgando de su carpeta y todo de la raíz", () => {
  const g = desdeCarpetas("/repo", ["README.md", "src/a.js", "src/util/b.js", "./src/a.js"]);
  assert.equal(g.fuente, "carpetas");
  assert.deepEqual(g.nodos.map((n) => n.id), [".", "README.md", "src", "src/a.js", "src/util", "src/util/b.js"]);
  const nombre = (i) => g.nodos[i].id;
  const aristas = g.aristas.map((a) => `${nombre(a.origen)}>${nombre(a.destino)}`).sort();
  assert.deepEqual(aristas, [".>README.md", ".>src", "src/util>src/util/b.js", "src>src/a.js", "src>src/util"]);
  assert.equal(g.nodos.find((n) => n.id === "src").fanOut, 2);
  assert.equal(g.nodos.find((n) => n.id === "src").grupo, "src");
});

test("sin gb y demasiados ficheros: solo las carpetas, para que la isla se pueda leer", () => {
  const muchos = Array.from({ length: TOPE_CARPETAS + 10 }, (_, i) => `d${i % 5}/f${i}.txt`);
  const g = desdeCarpetas("/repo", muchos);
  assert.deepEqual(g.nodos.map((n) => n.id), [".", "d0", "d1", "d2", "d3", "d4"]);
});

test("fusionar: las rehechas sustituyen a las suyas, las nuevas se añaden, en el orden de la carpeta", async () => {
  const { fusionarGrafos } = await import("../src/datos.js");
  const viejos = [{ nombre: "a", v: 1 }, { nombre: "b", v: 1 }, { nombre: "c", v: 1 }];
  const r = fusionarGrafos(viejos, [{ nombre: "b", v: 2 }, { nombre: "d", v: 2 }], ["a", "b", "c", "d"]);
  assert.deepEqual(r, [{ nombre: "a", v: 1 }, { nombre: "b", v: 2 }, { nombre: "c", v: 1 }, { nombre: "d", v: 2 }]);
  assert.deepEqual(fusionarGrafos([], [{ nombre: "x" }, { nombre: "y" }], ["y"]).map((g) => g.nombre), ["y", "x"], "lo que no está en el orden, al final");
});

test("queHay: por tipo, de más a menos, sin ficheros sin extensión", async () => {
  const { queHay } = await import("../src/datos.js");
  assert.equal(queHay(["index.html", "privacy.html", "terms.html", "logo.png", "demo.gif", "LICENSE", ".gitignore"]), "3 HTML · 2 images");
  assert.equal(queHay(["a/SKILL.md", "b.md", "c.json", "d.yml", "e.md"], 2), "3 Markdown · 1 JSON");
  assert.equal(queHay([]), "");
});
