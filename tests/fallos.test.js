import { test } from "node:test";
import assert from "node:assert/strict";
import { fallosDeRepos, fuerzaDeFallo, nodoDeFichero, partirDonde, repoDeRuta, tareaDeArreglo, trazaLegible } from "../src/fallos.js";

const repos = [
  { nombre: "galaxy-brain", ruta: "C:\\Users\\m\\dev\\galaxy-brain" },
  { nombre: "infinite-desk", ruta: "C:\\Users\\m\\dev\\infinite-desk" },
  { nombre: "galaxy", ruta: "C:\\Users\\m\\dev\\galaxy" },
];

test("dónde: fichero y línea, con la unidad de Windows", () => {
  assert.deepEqual(partirDonde("C:\\x\\cli.py:2489"), { fichero: "C:\\x\\cli.py", linea: 2489 });
  assert.deepEqual(partirDonde("/home/a.py"), { fichero: "/home/a.py", linea: null });
  assert.equal(partirDonde(null), null);
});

test("repo de una ruta: el que la contiene (no uno cuyo nombre empieza igual), sin mayúsculas", () => {
  assert.deepEqual(repoDeRuta("c:\\users\\m\\dev\\galaxy-brain\\src\\x.py", repos), { repo: "galaxy-brain", relativa: "src/x.py" });
  assert.deepEqual(repoDeRuta("C:/Users/m/dev/galaxy/a.js", repos), { repo: "galaxy", relativa: "a.js" });
  assert.equal(repoDeRuta("C:\\Temp\\scratchpad\\probe.py", repos), null);
});

test("fallos: del repo del FICHERO, no del proyecto desde el que se corrió; lo de fuera, fuera", () => {
  const f = fallosDeRepos([
    { type: "NameError", where: "C:\\Users\\m\\dev\\galaxy-brain\\src\\galaxybrain\\cli.py:2489", project: "C:\\Users\\m\\dev\\infinite-desk",
      count: 20, last_ts: "2026-09-25T18:28:20+02:00", last_id: "20260925T182820-6f6352", last_message: "name 're' is not defined", first_ts: "2026-09-20T10:00:00+02:00" },
    { type: "OSError", where: null, project: "C:\\Users\\m\\dev\\infinite-desk", count: 38, last_ts: "2026-09-25T17:50:30+02:00", last_id: "a", last_message: "[Errno 22]" },
    { type: "KeyError", where: "C:\\Temp\\scratchpad\\probe.py:21", project: "C:\\Temp", count: 6, last_ts: "2026-09-24T11:42:00+02:00", last_id: "b" },
  ], repos);
  assert.equal(f.length, 2);
  assert.deepEqual(f[0], { id: "20260925T182820-6f6352", repo: "galaxy-brain", tipo: "NameError", mensaje: "name 're' is not defined",
    fichero: "src/galaxybrain/cli.py", linea: 2489, veces: 20, ultimo: "2026-09-25T18:28:20+02:00", primero: "2026-09-20T10:00:00+02:00" });
  assert.equal(f[1].repo, "infinite-desk");
  assert.equal(f[1].fichero, null, "sin dónde: del proyecto, sin módulo");
});

test("módulo de un fichero: el sufijo más largo que es un módulo del grafo", () => {
  const ids = ["galaxybrain", "galaxybrain.cli", "mundo", "tools.agente", "src/a.js"];
  assert.equal(nodoDeFichero("src/galaxybrain/cli.py", ids), 1);
  assert.equal(nodoDeFichero("src/galaxybrain/__init__.py", ids), 0);
  assert.equal(nodoDeFichero("src/mundo.js", ids), 2);
  assert.equal(nodoDeFichero("tools/agente.mjs", ids), 3);
  assert.equal(nodoDeFichero("src/a.js", ids), 4, "árbol de carpetas: la ruta tal cual");
  assert.equal(nodoDeFichero("docs/x.md", ids), -1);
});

test("fuerza: reciente y repetido pesa más; pasada una semana, cero", () => {
  const ahora = Date.parse("2026-09-26T12:00:00Z");
  /** @param {number} dias @param {number} veces @returns {import("../src/fallos.js").Fallo} */
  const f = (dias, veces) => ({ id: "x", repo: "r", tipo: "E", mensaje: "", fichero: null, linea: null, veces, ultimo: new Date(ahora - dias * 86400000).toISOString(), primero: "" });
  assert.ok(fuerzaDeFallo(f(0.1, 20), ahora) > fuerzaDeFallo(f(0.1, 1), ahora));
  assert.ok(fuerzaDeFallo(f(0.1, 5), ahora) > fuerzaDeFallo(f(5, 5), ahora));
  assert.equal(fuerzaDeFallo(f(8, 50), ahora), 0);
  assert.ok(fuerzaDeFallo(f(0, 100), ahora) <= 1);
});

test("traza legible: el error y los marcos propios con su código, sin librerías ni variables", () => {
  const t = trazaLegible({
    exception: { type: "NameError", message: "name 're' is not defined" },
    frames: [
      { file: "<frozen runpy>", line: 198, function: "_run_module_as_main", source: [] },
      { file: "C:\\py\\argparse.py", line: 10, function: "parse", is_library: true, source: [] },
      { file: "C:\\gb\\cli.py", line: 2489, function: "main", is_library: false, locals: { secreto: "x" }, source: [{ n: 2488, text: "# antes", is_fail: false }, { n: 2489, text: "  m = re.match(x)", is_fail: true }] },
    ],
  });
  assert.equal(t, "NameError: name 're' is not defined\n  at main (C:\\gb\\cli.py:2489)\n      m = re.match(x)");
  assert.ok(!t.includes("secreto"));
});

test("tarea de arreglo: qué, dónde, cuántas veces, la traza y cómo trabajar", () => {
  const t = tareaDeArreglo({ id: "x", repo: "gb", tipo: "NameError", mensaje: "name 're' is not defined", fichero: "src/cli.py", linea: 2489, veces: 20, ultimo: "2026-09-25", primero: "" }, "TRAZA");
  assert.match(t, /captured 20 times/);
  assert.match(t, /Where: src\/cli\.py:2489/);
  assert.match(t, /TRAZA/);
  assert.match(t, /smallest correct fix/);
});

test("arreglado: la clave no depende del id ni del mensaje (cambian con cada captura)", async () => {
  const { claveDeFallo } = await import("../src/fallos.js");
  const f = { id: "a1", repo: "gb", tipo: "NameError", mensaje: "name 'x' is not defined", fichero: "cli.py", linea: 10, veces: 1, ultimo: "2026-09-20T10:00:00Z", primero: "2026-09-20T10:00:00Z" };
  assert.equal(claveDeFallo(f), claveDeFallo({ ...f, id: "b2", mensaje: "name 'y' is not defined" }));
  assert.notEqual(claveDeFallo(f), claveDeFallo({ ...f, linea: 11 }));
});

test("arreglado: a mano hasta que vuelve a saltar; con commit en su fichero después, quizás; si no, abierto", async () => {
  const { claveDeFallo, estadoDeFallo, fuerzaDeFallo } = await import("../src/fallos.js");
  const f = { id: "a1", repo: "gb", tipo: "NameError", mensaje: "m", fichero: "cli.py", linea: 10, veces: 3, ultimo: "2026-09-20T10:00:00Z", primero: "2026-09-19T10:00:00Z" };
  const marcados = { [claveDeFallo(f)]: f.ultimo };
  assert.equal(estadoDeFallo(f, {}), "abierto");
  assert.equal(estadoDeFallo(f, marcados), "arreglado");
  assert.equal(estadoDeFallo({ ...f, ultimo: "2026-09-21T10:00:00Z" }, marcados), "abierto", "saltó otra vez después de marcarlo");
  assert.equal(estadoDeFallo({ ...f, tocado: "2026-09-20T13:00:00+02:00" }, {}), "quizas");
  assert.equal(estadoDeFallo({ ...f, tocado: "2026-09-20T12:00:00+02:00" }, {}), "abierto", "a la vez (otra zona horaria) no es después");
  assert.equal(estadoDeFallo({ ...f, desaparecido: true }, {}), "quizas", "su fichero ya no existe (un worktree borrado)");
  assert.equal(estadoDeFallo({ ...f, tocado: "2026-09-19T12:00:00Z" }, {}), "abierto", "el commit es de antes del fallo");
  const ahora = Date.parse("2026-09-20T12:00:00Z");
  assert.ok(fuerzaDeFallo(f, ahora) > 0);
  assert.equal(fuerzaDeFallo({ ...f, estado: "arreglado" }, ahora), 0);
  assert.equal(fuerzaDeFallo({ ...f, estado: "quizas" }, ahora), 0);
});
