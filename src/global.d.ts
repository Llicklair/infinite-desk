interface Window {
  /** Lo escribe tools/exportar.mjs en wallpaper/grafos.js: un grafo por repo. */
  GB_GRAFOS: import("./grafo3d.js").GrafoExportado[];
  /** Lo escribe mirador-puente al arrancar en wallpaper/puente-config.js (ADR 0002). */
  MIRADOR_PUENTE?: { puerto: number; token: string; atajo: string | null };
}
