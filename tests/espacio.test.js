import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PANTALLAS, espacioParaGuardar, leerEspacio, planDeRestauracion } from "../src/espacio.js";

const sitio = { pos: [1, 2, 3], giro: [0, 0, 0, 1], escala: 1 };
/** @param {Partial<import("../src/espacio.js").Entrada>} e @returns {import("../src/espacio.js").Entrada} */
const entrada = (e) => ({ tipo: "ventana", titulo: "", repo: null, ...sitio, ...e });

test("restaurar: lo que sigue abierto se trae (mismo programa y título); cada ventana, una vez", () => {
  const plan = planDeRestauracion(
    [entrada({ titulo: "Notas - Bloc de notas", proceso: "notepad" }), entrada({ titulo: "Notas - Bloc de notas", proceso: "notepad" })],
    [{ hwnd: 10, titulo: "Notas - Bloc de notas", proceso: "notepad" }],
    [],
  );
  assert.deepEqual(plan.map((p) => [p.hwnd, p.hacer]), [[10, "traer"], [null, "nada"]]);
});

test("restaurar: VS Code de un repo, aunque tenga otro fichero abierto; si no está, se vuelve a abrir", () => {
  const plan = planDeRestauracion(
    [entrada({ tipo: "vscode", titulo: "README.md - forja - Visual Studio Code", repo: "forja", raiz: "C:/dev/forja" }),
      entrada({ tipo: "vscode", titulo: "x - galaxy-brain - Visual Studio Code", repo: "galaxy-brain", raiz: "C:/dev/galaxy-brain" })],
    [{ hwnd: 7, titulo: "main.py - forja - Visual Studio Code", proceso: "Code" }, { hwnd: 8, titulo: "forja-notes - Visual Studio Code", proceso: "Code" }],
    [],
  );
  assert.deepEqual(plan.map((p) => [p.hwnd, p.hacer]), [[7, "traer"], [null, "abrirRepo"]]);
});

test("restaurar: las webs se reabren; las ventanas cerradas sin forma de abrirlas, no; lo que ya está, no se duplica", () => {
  const plan = planDeRestauracion(
    [entrada({ tipo: "web", titulo: "Piano - YouTube", url: "https://youtube.com/watch?v=x" }),
      entrada({ titulo: "Discord", proceso: "Discord" }),
      entrada({ titulo: "Doc - Word", proceso: "WINWORD" })],
    [{ hwnd: 3, titulo: "Doc - Word", proceso: "WINWORD" }],
    [3],
  );
  assert.deepEqual(plan.map((p) => p.hacer), ["abrirWeb", "nada", "nada"]);
});

test("restaurar: una ventana del mismo programa y del mismo repo vale aunque cambie el título (otra pestaña)", () => {
  const plan = planDeRestauracion(
    [entrada({ titulo: "Issues · Llicklair/forja - Google Chrome", proceso: "chrome", repo: "forja" })],
    [{ hwnd: 5, titulo: "Pull requests · Llicklair/forja - Google Chrome", proceso: "chrome" }, { hwnd: 6, titulo: "YouTube - Google Chrome", proceso: "chrome" }],
    [],
  );
  assert.deepEqual(plan.map((p) => [p.hwnd, p.hacer]), [[5, "traer"]]);
});

test("guardar y leer: ida y vuelta; lo roto o de otra versión, vacío; con techo", () => {
  const e = [entrada({ titulo: "a", proceso: "p" })];
  assert.deepEqual(leerEspacio(JSON.parse(JSON.stringify(espacioParaGuardar(e)))), e);
  assert.deepEqual(leerEspacio({ version: 99, pantallas: e }), []);
  assert.deepEqual(leerEspacio(null), []);
  assert.deepEqual(leerEspacio({ version: 1, pantallas: [{ tipo: "ventana", titulo: "x", pos: [1, 2], giro: [0, 0, 0, 1], escala: 1 }] }), []);
  assert.equal(leerEspacio(espacioParaGuardar(Array.from({ length: 40 }, () => e[0]))).length, MAX_PANTALLAS);
});
