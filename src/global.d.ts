interface Window {
  /** Lo escribe tools/exportar.mjs en wallpaper/grafos.js: un grafo por repo. */
  GB_GRAFOS: import("./grafo3d.js").GrafoExportado[];
  /** Lo escribe infinite-desk-bridge al arrancar en wallpaper/puente-config.js (ADR 0002). */
  INFINITE_DESK_PUENTE?: { puerto: number; token: string; atajo: string | null };
}
