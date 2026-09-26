// Atlas, el asistente de trabajo del mundo normal, por fuera: sabe lo que sabe el mundo (los grafos
// de wallpaper/grafos.js y las noticias de wallpaper/noticias.js, leídos aquí: no viajan por la
// línea de órdenes) y puede leer el código de los repos (Read, Grep y Glob en la carpeta de
// proyectos; nada que escriba ni ejecute). Contesta con `claude -p` (tools/espiritu.mjs) y separa
// las acciones que el mundo hace (src/asistente.js). La conversación no se guarda.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conversacion, separarAccionesCon } from "../src/apoyo.js";
import { contextoDelMundo, instruccionesAtlas, validarAtlas } from "../src/asistente.js";
import { claude } from "./espiritu.mjs";
import { DATOS } from "./orquestador-datos.mjs";
import { carpetaDeProyectos } from "./proyectos.mjs";

const MUNDO = join(dirname(fileURLToPath(import.meta.url)), "..", "wallpaper");

/** Lo que un script del mundo deja en window (`window.X = {...};`), o null. @param {string} fichero */
function leerScript(fichero) {
  try {
    const s = readFileSync(join(MUNDO, fichero), "utf8");
    return JSON.parse(s.slice(s.indexOf("=") + 1).trim().replace(/;\s*$/, ""));
  } catch {
    return null;
  }
}

/**
 * Un turno: lo que contesta Atlas (y lo que hace).
 * @param {{turnos: import("../src/apoyo.js").Turno[], mirando?: import("../src/asistente.js").Mirando}} peticion
 */
export async function hablarAtlas(peticion) {
  const turnos = peticion?.turnos;
  if (!Array.isArray(turnos) || !turnos.length) throw new Error("nothing to answer");
  const grafos = leerScript("grafos.js") ?? [];
  const noticias = leerScript("noticias.js");
  const hoy = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const sistema = instruccionesAtlas(contextoDelMundo(grafos, noticias, Date.now()), peticion.mirando ?? {}, hoy);
  const salida = await claude(sistema, conversacion(turnos).replace(/como el espíritu/, "como Atlas").replace(/Tú \(espíritu\)/g, "Tú (Atlas)"), {
    casa: join(DATOS, "atlas"),
    leer: [carpetaDeProyectos()],
  });
  const tarjetas = (noticias?.titulares?.length ?? 0) + (noticias?.repos?.length ?? 0);
  return separarAccionesCon(salida, validarAtlas({ repos: grafos.map((/** @type {any} */ g) => g.nombre), tarjetas }), 2);
}
