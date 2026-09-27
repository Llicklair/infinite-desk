// Parte de `npm run terminado`: la extensión que salta los anuncios de YouTube que lo permiten
// (extensiones/saltar-anuncios, la carga el Edge de las pantallas de Kiri y Atlas) pulsa el botón
// de "Saltar" cuando aparece y está a la vista, y no pulsa uno escondido. Sin YouTube ni anuncios de
// verdad: una página local que imita el reproductor, servida aquí mismo, y una copia de la extensión
// que solo se abre en ella (la de verdad solo va a youtube.com). El mismo saltar.js, sin tocar.
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const navegador = [
  join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((r) => r && existsSync(r));
if (!navegador) {
  console.error("probar-anuncios: no Edge or Chrome to run it with.");
  process.exit(1);
}

// El reproductor de mentira: un botón de saltar escondido desde el principio (no se debe pulsar) y
// otro que aparece a los 1,5 s, como en un anuncio que se puede saltar a los 5 s.
const PAGINA = `<!doctype html><title>esperando</title>
<div class="ytp-ad-skip-button-slot" style="display:none"><button class="ytp-skip-ad-button" onclick="document.title='mal: pulsado el escondido'">Skip</button></div>
<div id="reproductor" style="width:640px;height:360px;background:#000;position:relative"></div>
<script>
  setTimeout(() => {
    const b = document.createElement("button");
    b.className = "ytp-skip-ad-button";
    b.textContent = "Skip";
    b.style.cssText = "position:absolute;right:0;bottom:40px";
    b.addEventListener("click", () => { if (document.title === "esperando") document.title = "saltado"; });
    document.getElementById("reproductor").append(b);
  }, 1500);
</script>`;
const servidor = createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGINA); });
await new Promise((r) => servidor.listen(0, "127.0.0.1", () => r(null)));
const direccion = servidor.address();
const puerto = typeof direccion === "object" && direccion ? direccion.port : 0;

const temporal = mkdtempSync(join(tmpdir(), "infinite-desk-anuncios-"));
const extension = join(temporal, "extension");
cpSync(join(raiz, "extensiones", "saltar-anuncios"), extension, { recursive: true });
const manifiesto = JSON.parse(readFileSync(join(extension, "manifest.json"), "utf8"));
manifiesto.content_scripts[0].matches = ["http://127.0.0.1/*"];
writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifiesto));

let dom = "";
try {
  // Lo mismo que pone el puente (Ventanas.Web.cs): --load-extension, con la función que lo apaga apagada.
  ({ stdout: dom } = await promisify(execFile)(navegador, [
    "--headless=new", `--user-data-dir=${join(temporal, "perfil")}`, "--no-first-run",
    `--load-extension=${extension}`, "--disable-features=DisableLoadExtensionCommandLineSwitch",
    "--virtual-time-budget=6000", "--timeout=20000", "--dump-dom", `http://127.0.0.1:${puerto}/`,
  ], { encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 }));
} finally {
  servidor.close();
  try { rmSync(temporal, { recursive: true, force: true }); } catch { /* el navegador aún suelta ficheros */ }
}
const titulo = /<title>([^<]*)<\/title>/.exec(dom)?.[1] ?? "(no page)";
if (titulo !== "saltado") {
  console.error(`probar-anuncios: the skip button wasn't pressed as it should (title: "${titulo}")`);
  process.exit(1);
}
console.log("probar-anuncios: the visible Skip button gets pressed, the hidden one doesn't");
