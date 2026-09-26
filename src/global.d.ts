interface Window {
  /** Lo escribe tools/exportar.mjs en wallpaper/grafos.js: un grafo por repo. */
  GB_GRAFOS: import("./grafo3d.js").GrafoExportado[];
  /** Lo escribe infinite-desk-bridge al arrancar en wallpaper/puente-config.js (ADR 0002). */
  INFINITE_DESK_PUENTE?: { puerto: number; token: string; atajo: string | null };
  /** Lo escribe `infinite-desk-bridge --fondo` en wallpaper/fondo-estado.js (ADR 0004). */
  INFINITE_DESK_FONDO?: { tapado: boolean[] };
  /** Lo escribe tools/noticias.mjs en wallpaper/noticias.js: los titulares del palantír. */
  INFINITE_DESK_NOTICIAS?: import("./palantir.js").Noticias;
}
