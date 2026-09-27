// Los ambientes de la zona zen (tecla L): el cielo, las luces, la niebla y el agua de cada uno.
// Solo datos; los aplica src/zen.js.

/** @typedef {"dia" | "atardecer" | "noche" | "lluvia"} Ambiente */
/**
 * @typedef {{cenit: string, horizonte: string, sol: string, solDir: [number, number, number], estrellas: number, nubes: number,
 *   niebla: string, densidad: number, cieloLuz: string, sueloLuz: string, hemi: number, luz: string, intensidad: number,
 *   hondo: string, somero: string, luciernagas: number, brillo: number, farolillos: number, motas: string, cuantasMotas: number,
 *   exposicion: number, vineta: string, lluvia: number, ventanas: number}} Preset
 *   `farolillos`: cuánto lucen (0-1); `motas`: su color (polen al sol, pétalos al atardecer); `vineta`: el borde de la pantalla;
 *   `lluvia`: cuánto llueve (0-1); `ventanas`: cuánto se ve desde fuera la luz de la cabaña
 */
/** @type {Record<Ambiente, Preset>} */
export const AMBIENTES = {
  dia: {
    cenit: "#4a98e3", horizonte: "#f8e6cc", sol: "#ffe7bd", solDir: [0.7, 0.55, 0.4], estrellas: 0, nubes: 1,
    niebla: "#e9dfca", densidad: 0.004, cieloLuz: "#dcecff", sueloLuz: "#6f9a46", hemi: 1.15, luz: "#ffe2b0", intensidad: 2.6,
    hondo: "#1ba7b8", somero: "#86e8d8", luciernagas: 0, brillo: 1, farolillos: 0.15, motas: "#fff0b3", cuantasMotas: 0.7,
    exposicion: 0.9, vineta: "rgba(90, 55, 20, 0.28)", lluvia: 0, ventanas: 0.1,
  },
  atardecer: {
    cenit: "#34357a", horizonte: "#f5a064", sol: "#ffb46c", solDir: [-0.55, 0.1, -0.8], estrellas: 0.15, nubes: 0.8,
    niebla: "#dc9372", densidad: 0.006, cieloLuz: "#ffc08e", sueloLuz: "#3b4a30", hemi: 1.35, luz: "#ffa060", intensidad: 2,
    hondo: "#1f4f6e", somero: "#7c8fa0", luciernagas: 0.4, brillo: 0.8, farolillos: 0.8, motas: "#ffb6c8", cuantasMotas: 1,
    exposicion: 1, vineta: "rgba(80, 25, 30, 0.35)", lluvia: 0, ventanas: 0.55,
  },
  noche: {
    cenit: "#040817", horizonte: "#172a4d", sol: "#dce6ff", solDir: [0.3, 0.55, -0.75], estrellas: 1, nubes: 0.25,
    niebla: "#0d172a", densidad: 0.009, cieloLuz: "#7c93c8", sueloLuz: "#0c1a12", hemi: 0.8, luz: "#a9bdff", intensidad: 0.75,
    hondo: "#0a2a48", somero: "#1f6a86", luciernagas: 1, brillo: 0.5, farolillos: 1, motas: "#ffffff", cuantasMotas: 0,
    exposicion: 1.25, vineta: "rgba(5, 10, 30, 0.45)", lluvia: 0, ventanas: 1,
  },
  // Lluvia: gris y húmedo fuera, para estar a gusto dentro de la cabaña con el fuego (uso real: "un
  // nuevo modo que es lluvia para estar cozy dentro de la cabaña").
  lluvia: {
    cenit: "#56657a", horizonte: "#95a2af", sol: "#c7d0da", solDir: [0.25, 0.8, 0.3], estrellas: 0, nubes: 1.8,
    niebla: "#8794a2", densidad: 0.013, cieloLuz: "#aab8c6", sueloLuz: "#3b4a37", hemi: 1.05, luz: "#cdd6e0", intensidad: 0.55,
    hondo: "#2a5363", somero: "#4d7c84", luciernagas: 0, brillo: 0.75, farolillos: 0.75, motas: "#ffffff", cuantasMotas: 0,
    exposicion: 1.05, vineta: "rgba(20, 30, 45, 0.4)", lluvia: 1, ventanas: 0.9,
  },
};
export const ORDEN_AMBIENTES = /** @type {Ambiente[]} */ (["dia", "atardecer", "noche", "lluvia"]);
