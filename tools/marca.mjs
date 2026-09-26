// npm run marca -- --nombre "Empresa" --colores "#rrggbb,#rrggbb" [--logo ruta.png]
// npm run marca -- --quitar
//
// La capa de marca del mundo (tecla B): el logo de una empresa flotando sobre el palantír, sus
// colores en el cielo y en el fuego. Para enseñársela a quien
// tenga que decidir si se usa ("así se vería con vuestra marca si decís que sí"). Se guarda en
// wallpaper/marca.js, que NO se versiona: la marca es de la empresa, no de este repo. El logo va
// dentro como data: URL (una imagen de file:// no se puede usar en WebGL desde file://).
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper", "marca.js");
const args = process.argv.slice(2);
/** @param {string} nombre */
const valor = (nombre) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? args[i + 1] : undefined; };

if (args.includes("--quitar")) {
  rmSync(destino, { force: true });
  console.log("branding removed: B does nothing until `npm run marca` again");
  process.exit(0);
}

const nombre = valor("nombre")?.trim();
const colores = (valor("colores") ?? "").split(",").map((c) => c.trim()).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
if (!nombre || !colores.length) {
  console.error('usage: npm run marca -- --nombre "Company" --colores "#rrggbb[,#rrggbb]" [--logo logo.png]');
  process.exit(1);
}
/** @type {{nombre: string, colores: string[], logo?: string}} */
const marca = { nombre, colores };
const logo = valor("logo");
if (logo) {
  if (!existsSync(logo)) { console.error(`no logo at ${logo}`); process.exit(1); }
  const tipos = /** @type {Record<string, string>} */ ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" });
  const tipo = tipos[extname(logo).toLowerCase()];
  if (!tipo) { console.error("the logo has to be png, jpg, webp or svg"); process.exit(1); }
  const datos = readFileSync(logo);
  if (datos.length > 2 * 1024 * 1024) { console.error("the logo is over 2 MB: use a smaller one"); process.exit(1); }
  marca.logo = `data:${tipo};base64,${datos.toString("base64")}`;
}
writeFileSync(destino, "// Lo escribe tools/marca.mjs (npm run marca); no se versiona: la marca es de la empresa.\n" +
  `window.INFINITE_DESK_MARCA = ${JSON.stringify(marca)};\n`);
console.log(`branding ready: ${nombre} (${colores.join(", ")})${logo ? " with its logo" : ", logo drawn from its name"} -> press B in the space`);
