// Prueba de humo (parte de `npm run terminado`): abre el mundo construido en un navegador sin
// ventana y falla si la página lanza CUALQUIER error de JavaScript. Los tests del núcleo no ven
// errores que solo salen al ejecutar la página (un nombre repetido, algo usado antes de existir,
// un fallo al montar el fondo). Solo vistas que no hablan con el puente: la demo con agentes de
// mentira y la página del fondo; así no se toca el puente que esté en marcha.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const carpeta = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper");
const PAGINAS = [
  pathToFileURL(join(carpeta, "index.html")).href + "?vista=demo&agentes",
  pathToFileURL(join(carpeta, "index.html")).href + "?vista=demo",
  pathToFileURL(join(carpeta, "fondo.html")).href + "?monitor=0",
];
const ESPERA_MS = 5000;

const navegador = [
  join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((r) => r && existsSync(r));
if (!navegador) {
  console.error("humo: no Edge or Chrome to run the smoke test with.");
  process.exit(1);
}

const perfil = mkdtempSync(join(tmpdir(), "infinite-desk-humo-"));
const puerto = 9400 + Math.floor(Math.random() * 400);
const proceso = spawn(navegador, [
  "--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "--no-first-run",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720", "about:blank",
], { stdio: "ignore" });
const espera = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** @type {string[]} */
const fallos = [];
try {
  let paginas = null;
  for (let i = 0; i < 50 && !paginas; i++) {
    await espera(200);
    try { paginas = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); } catch { /* aún arrancando */ }
  }
  if (!paginas) throw new Error("the browser did not open its debugging port");
  const ws = new WebSocket(paginas.find((/** @type {{type: string}} */ p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((r, f) => { ws.addEventListener("open", r); ws.addEventListener("error", f); });
  let id = 0;
  /** @param {string} method @param {object} [params] */
  const enviar = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  let actual = "";
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      fallos.push(`${actual}: ${d.exception?.description ?? d.text}`.split("\n")[0]);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      fallos.push(`${actual}: console.error ${m.params.args.map((/** @type {{value?: unknown, description?: string}} */ a) => a.value ?? a.description).join(" ")}`);
  });
  enviar("Runtime.enable");
  for (const url of PAGINAS) {
    actual = url.slice(url.lastIndexOf("/") + 1);
    enviar("Page.navigate", { url });
    await espera(ESPERA_MS);
  }
  ws.close();
} catch (e) {
  fallos.push(`humo: ${/** @type {Error} */ (e).message}`);
} finally {
  proceso.kill();
  await espera(500);
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* el navegador aún suelta ficheros */ }
}

if (fallos.length) {
  console.error("humo: JavaScript errors in the built space:\n  - " + fallos.join("\n  - "));
  process.exit(1);
}
console.log(`humo: ${PAGINAS.length} pages ran ${ESPERA_MS / 1000} s each with no JavaScript errors`);
