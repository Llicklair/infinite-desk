// npm run probar-puente (Windows): pruebas de extremo a extremo contra el puente y el mundo DE
// VERDAD, como las haría una persona, sin manos. Hacen falta los dos en marcha (clic derecho →
// Entrar): el mundo se pone delante mientras dura (~40 s) y no hay que tocar nada. Cada caso es
// algo que falló en uso real (docs/evidencia.md, 2026-09-25):
//   - la rueda en modo Enter, en una pantalla normal y en una escondida (minimizada con el mundo);
//   - al salir de una escondida, vuelve a esconderse (y sigue siempre encima, o Chromium la congela);
//   - Esc y Entrar otra vez: lo escondido se minimiza de verdad y vuelve a esconderse al volver;
//   - N avisa de las ventanas sin escritorio virtual (el selector no las ofrece).
// La pantalla de prueba es una página larga en una ventana de Edge aparte, que dice en su título
// cuánto se ha desplazado.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

if (process.platform !== "win32") {
  console.log("npm run probar-puente is for Windows (the bridge on macOS isn't built yet).");
  process.exit(0);
}
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const EDGE = join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe");
const config = join(raiz, "wallpaper", "puente-config.js");
if (!existsSync(config)) {
  console.error("probar-puente: no wallpaper/puente-config.js: start the bridge first (right-click → Enter infinite-desk).");
  process.exit(1);
}
const token = /token: "([0-9a-f]+)"/.exec(readFileSync(config, "utf8"))?.[1];

/** @param {string[]} a */
const ps = (...a) => execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(aqui, "probar-puente.ps1"), ...a], { encoding: "utf8" }).trim();
const espera = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
/** @type {string[]} */
const fallos = [];
/** @param {string} que @param {boolean} bien @param {string} detalle */
function comprobar(que, bien, detalle) {
  console.log(`${bien ? "  ok  " : "  FAIL"} ${que}: ${detalle}`);
  if (!bien) fallos.push(que);
}

const mundo = ps("buscar", "infinite-desk ");
if (!mundo) {
  console.error("probar-puente: the space isn't open: right-click the desktop → Enter infinite-desk, then run it again.");
  process.exit(1);
}
const ws = new WebSocket(`ws://127.0.0.1:47800/?token=${token}`);
await new Promise((r, f) => { ws.addEventListener("open", r); ws.addEventListener("error", () => f(new Error("the bridge isn't listening"))); })
  .catch((e) => { console.error(`probar-puente: ${e.message}`); process.exit(1); });
let id = 0;
/** @type {Map<number, (m: any) => void>} */
const pendientes = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pendientes.has(m.id)) pendientes.get(m.id)?.(m);
});
/** @param {object} o @returns {Promise<any>} */
const op = (o) => new Promise((r) => {
  const n = ++id;
  pendientes.set(n, r);
  ws.send(JSON.stringify({ ...o, id: n }));
  setTimeout(() => r({ ok: false, error: "no answer in 5 s" }), 5000);
});

// La pantalla de prueba.
const dir = mkdtempSync(join(tmpdir(), "infinite-desk-probar-"));
writeFileSync(join(dir, "larga.html"), '<!doctype html><title>probar-puente scroll 0</title><body style="height:20000px;background:linear-gradient(#fff,#888)">' +
  '<script>addEventListener("scroll",()=>document.title="probar-puente scroll "+Math.round(scrollY))</script>');
const edge = spawn(EDGE, [`--user-data-dir=${join(dir, "perfil")}`, "--no-first-run", `--app=${pathToFileURL(join(dir, "larga.html")).href}`], { stdio: "ignore" });
let h = "";
for (let i = 0; i < 60 && !h; i++) { await espera(250); h = ps("buscar", "probar-puente scroll"); }
if (!h) { console.error("probar-puente: the test window didn't open"); process.exit(1); }
await espera(1500);
const hwnd = Number(h);
const desplazado = () => Number(/scroll (\d+)/.exec(ps("titulo", h))?.[1] ?? -1);
async function rueda() {
  for (let i = 0; i < 3; i++) {
    ws.send(JSON.stringify({ op: "raton", hwnd, tipo: "rueda", u: 0.5, v: 0.5, boton: 0, botones: 0, delta: -120 }));
    await espera(150);
  }
  await espera(900);
}
// Delante de verdad: si mientras tanto se usó otra ventana (uso real: Chrome encima del mundo), se
// quedaba la rueda y la prueba fallaba sin que el puente tuviera la culpa.
async function mundoDelante() { ps("delante", mundo); await espera(1200); }

try {
  await mundoDelante();
  await op({ op: "titulo", hwnd });

  console.log("wheel in Enter mode");
  let antes = desplazado();
  const e1 = await op({ op: "entrar", hwnd });
  await rueda();
  comprobar("normal screen scrolls", e1.ok && desplazado() > antes, `${antes} -> ${desplazado()}${e1.ok ? "" : ` (enter: ${e1.error})`}`);
  // Con otra ventana tapando justo el punto (uso real: un Chrome por encima se quedaba la rueda).
  const tapa = spawn("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", join(aqui, "probar-puente.ps1"), "tapar", h], { stdio: "ignore" });
  await espera(2500);
  antes = desplazado();
  await rueda();
  comprobar("covered in the middle, it still scrolls", desplazado() > antes, `${antes} -> ${desplazado()}`);
  tapa.kill();
  // La vista directa (ADR 0005): al cambiar la ventana, llegan trozos con su tamaño.
  const vista = new WebSocket(`ws://127.0.0.1:47800/vista?token=${token}&hwnd=${hwnd}`);
  vista.binaryType = "arraybuffer";
  /** @type {ArrayBuffer[]} */
  const trozos = [];
  vista.addEventListener("message", (e) => { trozos.push(/** @type {ArrayBuffer} */ (e.data)); vista.send("1"); });
  await new Promise((r) => vista.addEventListener("open", r));
  await rueda();
  // Primer byte: 0 tal cual, 1 deflate (Vista.cs, Empaquetar); luego u16 ancho y alto.
  /** @param {ArrayBuffer} datos */
  const plano0 = (datos) => (new Uint8Array(datos)[0] === 1 ? inflateRawSync(new Uint8Array(datos, 1)) : Buffer.from(datos, 1));
  const plano = trozos[0] ? plano0(trozos[0]) : null;
  const [vw, vh] = plano ? [plano.readUInt16LE(0), plano.readUInt16LE(2)] : [0, 0];
  comprobar("the direct view sends what changes", trozos.length > 0 && vw > 100 && vh > 100, `${trozos.length} message(s), ${vw}x${vh}`);
  vista.close();
  await op({ op: "salir" });

  ps("minimizar", h);
  await espera(1200);
  comprobar("minimized with the space open: hidden", ps("estado", h).startsWith("atraviesa encima alfa0"), ps("estado", h));
  await mundoDelante();
  antes = desplazado();
  const e2 = await op({ op: "entrar", hwnd });
  await espera(300);
  await rueda();
  comprobar("hidden screen scrolls", e2.ok && desplazado() > antes, `${antes} -> ${desplazado()}${e2.ok ? "" : ` (enter: ${e2.error})`}`);
  await op({ op: "salir" });
  await espera(600);
  comprobar("leaving it: hidden again, still on top", ps("estado", h) === "atraviesa encima alfa0", ps("estado", h));

  console.log("Esc and back");
  await op({ op: "alEscritorio" });
  await espera(1200);
  comprobar("Esc minimizes the space", ps("estado", mundo).includes("minimizada"), ps("estado", mundo));
  comprobar("Esc really minimizes what was hidden", ps("estado", h) === "alfa255 minimizada", ps("estado", h));
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(aqui, "entrar.ps1"), "-Navegador", EDGE, "-Perfil", "sin-uso", "-Url", "sin-uso"]);
  await espera(1500);
  comprobar("Enter brings the same space back", !ps("estado", mundo).includes("minimizada"), ps("estado", mundo));
  comprobar("and hides that screen again", ps("estado", h) === "atraviesa encima alfa0", ps("estado", h));

  console.log("N and virtual desktops");
  const limpio = await op({ op: "antesDeCapturar" });
  comprobar("no false alarm", limpio.ok && Array.isArray(limpio.sinEscritorio), JSON.stringify(limpio.sinEscritorio));
  const sin = spawn("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", join(aqui, "probar-puente.ps1"), "sin-escritorio"], { stdio: "ignore" });
  await espera(4000);
  const conFalta = await op({ op: "antesDeCapturar" });
  comprobar("a window with no desktop is reported", (conFalta.sinEscritorio ?? []).includes("probar-puente sin escritorio"), JSON.stringify(conFalta.sinEscritorio));
  sin.kill();
} finally {
  await op({ op: "soltar", hwnd });
  ps("cerrar", h);
  ws.close();
  await espera(1000);
  edge.kill();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Edge aún suelta ficheros */ }
}

if (fallos.length) {
  console.error(`probar-puente: ${fallos.length} failed: ${fallos.join(" · ")}`);
  process.exit(1);
}
console.log("probar-puente: everything works with the real bridge and space");
process.exit(0);
