// `npm run mundo`: sirve wallpaper/ en localhost y lo abre en el navegador.
// Alternativa para navegadores que no tratan file:// como contexto seguro (getDisplayMedia lo
// exige; localhost lo es). En Edge/Chrome basta con abrir wallpaper/index.html (ARCHITECTURE 3).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper");
const puerto = Number(process.env.PUERTO ?? 4173);
/** @type {Record<string, string>} */
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };

createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  const fichero = join(raiz, ruta === "\\" || ruta === "/" ? "index.html" : ruta);
  if (!fichero.startsWith(raiz)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const cuerpo = await readFile(fichero);
    res.writeHead(200, { "content-type": tipos[extname(fichero)] ?? "application/octet-stream" }).end(cuerpo);
  } catch {
    res.writeHead(404).end("no existe");
  }
}).listen(puerto, "127.0.0.1", () => {
  const url = `http://localhost:${puerto}/`;
  console.log(`infinitas en ${url} (Ctrl+C para parar)`);
  exec(process.platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`);
});
