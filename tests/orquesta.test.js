import { test } from "node:test";
import assert from "node:assert/strict";
import { esProveedor, estadoDeGit, lineaDeClaude, nombreDeAgente, usoPorProveedor } from "../src/orquesta.js";

test("proveedores: los tres, y nada más (lo que llega del mundo se comprueba)", () => {
  assert.deepEqual(["claude", "codex", "gemini", "ollama", "__proto__", 3].map(esProveedor), [true, true, true, false, false, false]);
});

test("git: rama, cambios sin commitear y commits por delante/detrás del remoto", () => {
  const salida = ["# branch.oid abc", "# branch.head main", "# branch.upstream origin/main", "# branch.ab +2 -1",
    "1 .M N... 100644 100644 100644 a b src/x.js", "2 R. N... 100644 100644 100644 a b R100 new.js\told.js", "? nuevo.txt", ""].join("\n");
  assert.deepEqual(estadoDeGit(salida), { rama: "main", cambios: 3, delante: 2, detras: 1, sinRemoto: false });
  assert.deepEqual(estadoDeGit("# branch.head feature\n"), { rama: "feature", cambios: 0, delante: 0, detras: 0, sinRemoto: true });
});

test("nombre de agente: fecha y hora y unas palabras de la tarea, sin tildes ni símbolos", () => {
  const cuando = new Date(2026, 8, 26, 9, 5);
  assert.equal(nombreDeAgente("Actualiza las dependencias y arregla los tests rotos", cuando), "20260926-0905-actualiza-las-dependencias-y-arregla");
  assert.equal(nombreDeAgente("¡¡¡!!!", cuando), "20260926-0905-tarea");
  assert.equal(nombreDeAgente("Añade ñandú", cuando), "20260926-0905-anade-nandu");
});

test("consola de Claude: lo que dice, las herramientas que usa y cómo acaba", () => {
  assert.equal(lineaDeClaude({ type: "assistant", message: { content: [
    { type: "text", text: "Voy a mirar los tests\nmás cosas" },
    { type: "tool_use", name: "Edit", input: { file_path: "src/x.js" } },
    { type: "tool_use", name: "Bash", input: { command: "npm test\n--watch" } },
  ] } }), "Voy a mirar los tests\n> Edit src/x.js\n> Bash npm test");
  assert.equal(lineaDeClaude({ type: "result", subtype: "success", is_error: false, result: "Arreglado.\nDetalles" }), "= Done: Arreglado.");
  assert.equal(lineaDeClaude({ type: "result", subtype: "error_max_turns", is_error: true }), "= Failed");
  assert.equal(lineaDeClaude({ type: "system", subtype: "init" }), null);
});

test("uso: trabajando ahora, lanzados hoy y minutos de hoy, por proveedor", () => {
  const ahora = new Date(2026, 8, 26, 12, 0);
  /** @type {import("../src/orquesta.js").Agente[]} */
  const agentes = [
    { id: "1", repo: "a", proveedor: "claude", tarea: "t", rama: "r", worktree: "w", inicio: new Date(2026, 8, 26, 11, 30).toISOString(), estado: "trabajando" },
    { id: "2", repo: "b", proveedor: "claude", tarea: "t", rama: "r", worktree: "w", inicio: new Date(2026, 8, 26, 10, 0).toISOString(), fin: new Date(2026, 8, 26, 10, 20).toISOString(), estado: "hecho" },
    { id: "3", repo: "c", proveedor: "codex", tarea: "t", rama: "r", worktree: "w", inicio: new Date(2026, 8, 25, 10, 0).toISOString(), fin: new Date(2026, 8, 25, 11, 0).toISOString(), estado: "hecho" },
  ];
  const u = usoPorProveedor(agentes, ahora);
  assert.deepEqual(u.claude, { trabajando: 1, hoy: 2, minutosHoy: 50 });
  assert.deepEqual(u.codex, { trabajando: 0, hoy: 0, minutosHoy: 0 }, "lo de ayer no cuenta hoy");
});
