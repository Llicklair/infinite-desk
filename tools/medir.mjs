// npm run medir [-- --pantallas 0,1,2,4,8,12,16] [--res 1920x1080] [--fps 60] [--segundos 8]
//
// Cuánto gasta el mundo y cuántas pantallas aguanta, en la GPU de verdad (no en SwiftShader, como
// el humo). Abre Edge en una ventana de 1920x1080 con `?vista=demo&pantallas=N`, y getDisplayMedia
// devuelve la cámara de mentira de Chromium a la resolución pedida: el mismo camino que una ventana
// capturada (vídeo -> VideoTexture -> subida a la GPU en cada fotograma nuevo). Por cada N:
// fotogramas pintados por segundo, ms de CPU por fotograma (p50/p95), draw calls, subidas de
// textura, y de los contadores de Windows el % de GPU 3D y la VRAM del proceso de GPU de Edge y la
// CPU de todo el navegador. Solo Windows (los contadores); la ventana se ve mientras mide: no la tapes.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
/** @param {string} nombre @param {string} porDefecto */
const valor = (nombre, porDefecto) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? args[i + 1] : porDefecto; };
const cuantas = valor("pantallas", "0,1,2,4,8,12,16").split(",").map(Number);
const [ancho, alto] = valor("res", "1920x1080").split("x").map(Number);
const fps = Number(valor("fps", "60"));
const segundos = Number(valor("segundos", "8"));

const carpeta = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper");
const navegador = join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe");
if (process.platform !== "win32" || !existsSync(navegador)) {
  console.error("medir: needs Windows and Edge (it reads the GPU from Windows performance counters).");
  process.exit(1);
}

// Lo que se inyecta en la página: la captura de mentira y los contadores de fotogramas.
const inyectado = `(() => {
  // El fondo tapado no pinta (a propósito), y el puente del fondo, si está en marcha, lo marca tapado
  // en cuanto esta ventana lo cubre: aquí se mide como si se viera.
  Object.defineProperty(window, "INFINITE_DESK_FONDO", { get: () => ({ tapado: [] }), set() {} });
  let abiertas = 0;
  navigator.mediaDevices.getDisplayMedia = () => (abiertas++, navigator.mediaDevices.getUserMedia({
    video: { width: { exact: ${ancho} }, height: { exact: ${alto} }, frameRate: { ideal: ${fps} } } }));
  let draws = 0, subidas = 0, gl = null;
  const obtener = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
    const c = obtener.call(this, tipo, ...resto);
    if (c && /webgl/.test(tipo) && !gl) {
      gl = c;
      for (const f of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
        const o = c[f]; if (o) c[f] = function (...a) { draws++; return o.apply(this, a); };
      }
      for (const f of ["texImage2D", "texSubImage2D"]) {
        const o = c[f]; c[f] = function (...a) { if (a.some((x) => x instanceof HTMLVideoElement)) subidas++; return o.apply(this, a); };
      }
    }
    return c;
  };
  let marcos = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const d0 = draws, s0 = subidas, t0 = performance.now();
    cb(t);
    if (draws > d0) marcos.push({ t, ms: performance.now() - t0, draws: draws - d0, subidas: subidas - s0 });
  });
  window.__medida = {
    reset() { marcos = []; },
    leer() {
      const ms = marcos.map((m) => m.ms).sort((a, b) => a - b);
      const q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : 0;
      const dur = marcos.length > 1 ? (marcos[marcos.length - 1].t - marcos[0].t) / 1000 : 1;
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        fps: (marcos.length - 1) / dur,
        p50: q(0.5), p95: q(0.95), max: ms[ms.length - 1] ?? 0,
        draws: marcos.length ? marcos.reduce((s, m) => s + m.draws, 0) / marcos.length : 0,
        subidas: marcos.reduce((s, m) => s + m.subidas, 0) / dur,
        gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "?",
        heap: (performance.memory?.usedJSHeapSize ?? 0) / 1048576,
        abiertas,
      };
    },
  };
})();`;

const perfil = mkdtempSync(join(tmpdir(), "infinite-desk-medir-"));
const puerto = 9300 + Math.floor(Math.random() * 90);
const proceso = spawn(navegador, [
  `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check",
  "--use-fake-ui-for-media-stream", `--use-fake-device-for-media-stream=fps=${fps}`,
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--window-position=0,0", "--window-size=1920,1080", "--start-fullscreen", "about:blank",
], { stdio: "ignore" });
const espera = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El proceso de GPU de ESTE Edge (por su carpeta de perfil) y todos los suyos, para los contadores.
 * @returns {{gpu: number, todos: number[]}}
 */
function procesos() {
  const ps = spawnSync("powershell", ["-NoProfile", "-Command",
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -like '*${perfil.replace(/'/g, "''")}*' } | % { "$($_.ProcessId)|$($_.CommandLine -match '--type=gpu-process')" }`],
  { encoding: "utf8" });
  const filas = ps.stdout.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split("|"));
  return { gpu: Number(filas.find((f) => f[1] === "True")?.[0] ?? 0), todos: filas.map((f) => Number(f[0])) };
}

/**
 * % de GPU 3D y VRAM del proceso de GPU, y CPU de todo el navegador, durante `s` segundos.
 * @param {{gpu: number, todos: number[]}} p @param {number} s
 */
function contadores(p, s) {
  const script = `
    $ids = @(${p.todos.join(",")})
    $c0 = (Get-Process -Id $ids -ErrorAction SilentlyContinue | % { $_.TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum
    $m = Get-Counter -Counter '\\GPU Engine(pid_${p.gpu}_*engtype_3D)\\Utilization Percentage','\\GPU Engine(*engtype_3D)\\Utilization Percentage' -SampleInterval 1 -MaxSamples ${s} -ErrorAction SilentlyContinue
    $c1 = (Get-Process -Id $ids -ErrorAction SilentlyContinue | % { $_.TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum
    $propio = @(); $total = @()
    foreach ($x in $m) {
      $propio += ($x.CounterSamples | ? { $_.Path -like '*pid_${p.gpu}_*' } | Measure-Object CookedValue -Sum).Sum
      $total += ($x.CounterSamples | ? { $_.Path -notlike '*pid_${p.gpu}_*' } | Measure-Object CookedValue -Sum).Sum
    }
    $vram = (Get-Counter '\\GPU Process Memory(pid_${p.gpu}_*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object CookedValue -Sum
    $cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
    '{0}|{1}|{2}|{3}' -f ($propio | Measure-Object -Average).Average, ($total | Measure-Object -Average).Average, ($vram.Sum / 1MB), (($c1 - $c0) / (${s} * 1000) * 100 / $cores)
  `;
  return new Promise((r) => {
    const h = spawn("powershell", ["-NoProfile", "-Command", script]);
    let out = "";
    h.stdout.on("data", (d) => { out += d; });
    h.on("close", () => {
      const [gpu, otros, vram, cpu] = out.trim().split(/\r?\n/).pop()?.split("|").map((x) => Number(x.replace(",", "."))) ?? [];
      r({ gpu, otros, vram, cpu });
    });
  });
}

try {
  /** @type {any[] | null} */
  let paginas = null;
  for (let i = 0; i < 50 && !paginas; i++) {
    await espera(200);
    try { paginas = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); } catch { /* aún arrancando */ }
  }
  if (!paginas) throw new Error("Edge did not open its debugging port");
  const ws = new WebSocket(paginas.find((p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((r, f) => { ws.addEventListener("open", r); ws.addEventListener("error", f); });
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  });
  /** @param {string} method @param {object} [params] @returns {Promise<any>} */
  const cmd = (method, params = {}) => new Promise((r) => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  /** @param {string} expresion */
  const evaluar = async (expresion) => (await cmd("Runtime.evaluate", { expression: expresion, returnByValue: true })).result?.result?.value;
  await cmd("Page.enable");
  await cmd("Page.addScriptToEvaluateOnNewDocument", { source: inyectado });

  const indice = pathToFileURL(join(carpeta, "index.html")).href;
  const escenas = [
    ...cuantas.map((n) => ({ nombre: n === 0 ? "world, no screens" : `${n} screen${n > 1 ? "s" : ""}`, url: `${indice}?vista=demo&pantallas=${n}`, n })),
    { nombre: "wallpaper (idle)", url: pathToFileURL(join(carpeta, "fondo.html")).href + "?monitor=0", n: 0 },
  ];
  console.log(`measuring ${segundos} s per scene; screens are fake ${ancho}x${alto} video at ${fps} fps\n`);
  console.log("scene                 fps   cpu ms p50/p95   draws   uploads/s   GPU 3D %   rest of GPU %   VRAM MB   browser CPU %");
  for (const e of escenas) {
    await cmd("Page.navigate", { url: e.url });
    await espera(5000 + e.n * 500);
    await evaluar("window.__medida?.reset()");
    const c = await contadores(procesos(), segundos);
    const m = await evaluar("window.__medida?.leer()");
    if (!m) { console.log(`${e.nombre.padEnd(20)} (no measurement)`); continue; }
    const f = (/** @type {number} */ x, /** @type {number} */ d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "?");
    console.log(`${e.nombre.padEnd(20)} ${f(m.fps).padStart(4)}   ${f(m.p50, 1).padStart(6)} / ${f(m.p95, 1).padEnd(6)}  ${f(m.draws).padStart(5)}   ${f(m.subidas).padStart(9)}   ${f(c.gpu).padStart(8)}   ${f(c.otros).padStart(13)}   ${f(c.vram).padStart(7)}   ${f(c.cpu).padStart(13)}` +
      (e.n && m.abiertas < e.n ? `   (only ${m.abiertas} opened)` : ""));
    if (e === escenas[0]) console.log(`  (${m.gpu})`);
  }
  ws.close();
} finally {
  proceso.kill();
  await espera(500);
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Edge aún lo suelta */ }
}
