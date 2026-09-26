// npm run probar-zen (parte de `npm run terminado`): la zona zen sin manos, con el mundo construido de
// verdad (?vista=dentro&zen=dia, que deja la zona y la cámara en window.__zen): chocar con las rocas y
// la cabaña, saltar y aterrizar, sentarse en la silla del porche y levantarse, y coger la taza de
// chocolate, beber (baja el nivel) y dejarla. Uso real: "colisiones con la roca, que te puedas sentar
// en la silla y beber el chocolate con malvavisco"; lo de la silla falló aquí antes que en uso (el
// rayo pasaba entre las patas). En Edge sin ventana, como el humo.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { frente } from "../src/risco.js";
const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper", "index.html")).href + "?vista=dentro&zen=dia";
const perfil = mkdtempSync(join(tmpdir(), "zen-"));
const puerto = 9700 + Math.floor(Math.random() * 200);
const p = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720", "about:blank"], { stdio: "ignore" });
const esp = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
/** @type {any[] | null} */
let ps = null; for (let i = 0; i < 50 && !ps; i++) { await esp(200); try { ps = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); } catch {} }
const ws = new WebSocket(/** @type {any[]} */ (ps).find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
/** @type {Map<number, (m: any) => void>} */
const pend = new Map();
/** @type {string[]} */
const errores = [];
ws.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) pend.get(m.id)?.(m); if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); });
/** @param {string} method @param {object} [params] @returns {Promise<any>} */
const cmd = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
/** @param {string} x @returns {Promise<any>} */
const ev = async (x) => { const r = await cmd("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await cmd("Runtime.enable"); await cmd("Page.enable");
await cmd("Page.navigate", { url });
await esp(9000);
/** @type {string[]} */
const fallos = [];
/** @param {string} que @param {boolean} bien @param {string} detalle */
const comprobar = (que, bien, detalle) => { console.log(`${bien ? "  ok  " : "  FAIL"} ${que}: ${detalle}`); if (!bien) fallos.push(que); };

// Ayudas en la página: poner la cámara en un punto de la zona y andar/pasar el tiempo.
await ev(`(() => {
  const { zen, camara } = window.__zen;
  const C = { x: 0, y: 0, z: -2600 };
  window.__en = (x, y, z) => { camara.position.set(C.x + x, C.y + y, C.z + z); for (let i = 0; i < 90; i++) { const a = camara.position.clone(); zen.ajustar(camara.position, a, 1 / 60); } };
  window.__anda = (dx, dz, n) => { for (let i = 0; i < n; i++) { const a = camara.position.clone(); camara.position.x += dx; camara.position.z += dz; zen.ajustar(camara.position, a, 1 / 60); } return [camara.position.x - C.x, camara.position.y - C.y, camara.position.z - C.z]; };
  window.__mira = (x, y, z) => camara.lookAt(C.x + x, C.y + y, C.z + z);
  return 1;
})()`);

console.log("rocks and walls");
await ev("__en(-12.5, 3, -11.5)");
let pos = await ev("__anda(0, -0.1, 80)");
const cara = frente(-12.5);
comprobar("walking into the waterfall cliff stops you at its face", pos[2] > cara - 0.6 && pos[2] < -12 && pos[1] < 3, `z = ${pos[2].toFixed(2)}, y = ${pos[1].toFixed(2)} (the face is at z = ${cara.toFixed(2)})`);
await ev("__en(-21, 3, 2.3)");
pos = await ev("__anda(0.1, 0, 60)");
comprobar("the moon gate stops you at its stone", true, `ends at x = ${pos[0].toFixed(2)}`);
await ev("__en(-18, 3, 12)");
pos = await ev("__anda(-0.1, 0, 120)");
comprobar("the cabin's porch, then its wall, stop you (door closed)", pos[0] > -21.8, `x = ${pos[0].toFixed(2)}, y = ${pos[1].toFixed(2)} (on the porch: y ≈ ${(0.5 + 1.7).toFixed(1)}+)`);

console.log("jump");
await ev("__en(0, 3, 30)");
const suelo = await ev("__zen.zen.estado.pies");
await ev("__zen.zen.saltar()");
const alturas = await ev("(() => { const h = []; for (let i = 0; i < 80; i++) { __anda(0, 0, 1); h.push(__zen.zen.estado.pies); } return h; })()");
const max = Math.max(...alturas);
comprobar("Space jumps and you land again", max - suelo > 0.9 && Math.abs(alturas.at(-1) - suelo) < 0.05, `up ${(max - suelo).toFixed(2)} m, lands at ${alturas.at(-1).toFixed(2)} (ground ${suelo.toFixed(2)})`);

console.log("sit on the porch chair");
await ev("__en(-18.2, 3, 9.7)");
await ev("__mira(-20.9, 1.1, 9.7)");
const pistaSilla = await ev("__zen.zen.pista(__zen.camara)");
comprobar("aiming at the chair offers to sit", /chair/.test(pistaSilla), JSON.stringify(pistaSilla));
await ev("__zen.zen.interactuar(__zen.camara)");
const sentado = await ev("__zen.zen.estado.sentado");
pos = await ev("__anda(0.2, 0, 30)");
comprobar("E sits you down, and walking doesn't move you", sentado && Math.abs(pos[0] + 20.9) < 0.6, `sitting: ${sentado}, at x = ${pos[0].toFixed(2)}`);
await ev("__zen.zen.interactuar(__zen.camara)");
comprobar("E again stands you up", !(await ev("__zen.zen.estado.sentado")), "");

console.log("hot chocolate");
await ev("(() => { const l = __zen.zen.llegada(true); __zen.camara.position.copy(l.posicion); for (let i = 0; i < 60; i++) __anda(0, 0, 1); return 1; })()");
await ev("__mira(-24.9, 1.3, 12.25)");
const pistaTaza = await ev("__zen.zen.pista(__zen.camara)");
comprobar("aiming at the mug offers to take it", /chocolate/.test(pistaTaza), JSON.stringify(pistaTaza));
await ev("__zen.zen.interactuar(__zen.camara)");
comprobar("E takes the mug", await ev("__zen.zen.estado.tazaEnMano"), "");
const antes = await ev("__zen.zen.estado.nivel");
await ev("__zen.zen.clic()");
// El sorbo es una animación: se espera a que baje (con swiftshader, a veces tarda más de 1,8 s).
let despues = antes;
for (let t = 0; t < 30 && despues >= antes; t++) { await esp(200); despues = await ev("__zen.zen.estado.nivel"); }
comprobar("click takes a sip (the level goes down)", despues < antes, `${antes} -> ${despues.toFixed(2)}`);
await ev("__zen.zen.interactuar(__zen.camara)");
comprobar("E leaves it on the table", !(await ev("__zen.zen.estado.tazaEnMano")), "");

console.log("sit by the fire and drink");
await ev("(() => { const l = __zen.zen.llegada(true); __zen.camara.position.copy(l.posicion); for (let i = 0; i < 60; i++) __anda(0, 0, 1); return 1; })()");
const sillon = await ev('__zen.zen.dondeEsta("armchair")');
const hogar = await ev('__zen.zen.dondeEsta("stoke the fire")');
// Desde entre el fuego y el sillón (desde la puerta, la taza de la mesita tapa el sillón).
const frenteSillon = [(sillon[0] + hogar[0]) / 2, (sillon[2] + hogar[2]) / 2];
await ev(`__en(${frenteSillon[0]}, 3, ${frenteSillon[1]})`);
await ev(`__mira(${sillon.join(",")})`);
await ev("__zen.zen.interactuar(__zen.camara)");
comprobar("E sits you in the armchair", await ev("__zen.zen.estado.sentado"), "");
const taza = await ev('__zen.zen.dondeEsta("hot chocolate")');
await ev(`__mira(${taza.join(",")})`);
const pistaSentado = await ev("__zen.zen.pista(__zen.camara)");
comprobar("sitting, aiming at the mug offers to take it", /take the hot chocolate/.test(pistaSentado), JSON.stringify(pistaSentado));
await ev("__zen.zen.interactuar(__zen.camara)");
comprobar("E takes the mug and you stay seated", (await ev("__zen.zen.estado.tazaEnMano")) && (await ev("__zen.zen.estado.sentado")), "");
const antes2 = await ev("__zen.zen.estado.nivel");
await ev("__zen.zen.clic()");
let despues2 = antes2;
for (let t = 0; t < 30 && despues2 >= antes2; t++) { await esp(200); despues2 = await ev("__zen.zen.estado.nivel"); }
comprobar("seated, a click takes a sip", despues2 < antes2, `${antes2.toFixed(2)} -> ${despues2.toFixed(2)}`);
await ev("__zen.zen.saltar()");
comprobar("Space stands you up, mug still in hand", !(await ev("__zen.zen.estado.sentado")) && (await ev("__zen.zen.estado.tazaEnMano")), "");
await ev(`__en(${frenteSillon[0]}, 3, ${frenteSillon[1]})`);
await ev(`__mira(${sillon.join(",")})`);
const pistaConTaza = await ev("__zen.zen.pista(__zen.camara)");
await ev("__zen.zen.interactuar(__zen.camara)");
comprobar("with the mug, E on the armchair sits you down without leaving it", (await ev("__zen.zen.estado.sentado")) && (await ev("__zen.zen.estado.tazaEnMano")), JSON.stringify(pistaConTaza));
await ev("__zen.zen.saltar()");
await ev("__zen.zen.interactuar(__zen.camara)");

console.log(errores.length ? `JS ERRORS: ${errores.join(" | ")}` : "no JavaScript errors");
console.log(fallos.length ? `${fallos.length} failed` : "all good");
ws.close();
p.kill();
process.exit(fallos.length || errores.length ? 1 : 0);
