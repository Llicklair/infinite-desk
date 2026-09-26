import { montarMundo } from "./mundo.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

montarMundo(
  document.body,
  window.GB_GRAFOS,
  { portada: $("portada"), info: $("info"), aviso: $("aviso"), ayuda: $("ayuda"), ficheros: document.getElementById("ficheros"), nodo: document.getElementById("nodo"), ajustes: document.getElementById("ajustes"), lector: document.getElementById("lector"), juego: document.getElementById("juego"), maestra: document.getElementById("maestra"), tutorial: document.getElementById("tutorial") },
  // fondo.html fija la suya en <body data-vista> (el fondo animado, ADR 0004).
  { vista: new URLSearchParams(location.search).get("vista") ?? document.body.dataset.vista ?? null },
);
