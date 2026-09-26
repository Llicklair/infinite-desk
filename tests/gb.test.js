import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatosGb } from "../tools/gb.mjs";

test("gb: primero el PATH, luego las carpetas de scripts de Python, luego las de usuario de Windows", () => {
  const r = candidatosGb({
    win: true, path: "C:\\Windows;\"C:\\Tools\"", pathext: ".EXE;.CMD", home: "C:\\Users\\a",
    scripts: ["C:\\Py312\\Scripts"], appdata: "C:\\Users\\a\\AppData\\Roaming", pythons: ["Python313"],
  });
  assert.deepEqual(r, [
    "C:\\Windows\\gb.exe", "C:\\Windows\\gb.cmd",
    "C:\\Tools\\gb.exe", "C:\\Tools\\gb.cmd",
    "C:\\Py312\\Scripts\\gb.exe", "C:\\Py312\\Scripts\\gb.cmd",
    "C:\\Users\\a\\AppData\\Roaming\\Python\\Python313\\Scripts\\gb.exe", "C:\\Users\\a\\AppData\\Roaming\\Python\\Python313\\Scripts\\gb.cmd",
  ]);
});

test("gb: en Windows, una carpeta repetida (otras mayúsculas, barra al final) se mira una vez", () => {
  const r = candidatosGb({ win: true, path: "C:\\Py\\Scripts;c:\\py\\scripts\\", pathext: ".EXE", home: "", scripts: ["C:\\PY\\Scripts"] });
  assert.deepEqual(r, ["C:\\Py\\Scripts\\gb.exe"]);
});

test("gb: en macOS/Linux, sin extensión, y ~/.local/bin (pip --user, pipx) y Homebrew al final", () => {
  const r = candidatosGb({ win: false, path: "/usr/bin", home: "/home/a", scripts: ["/home/a/.local/bin"] });
  assert.deepEqual(r, ["/usr/bin/gb", "/home/a/.local/bin/gb", "/opt/homebrew/bin/gb", "/usr/local/bin/gb"]);
});
