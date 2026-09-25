import { montarMundo } from "./mundo.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

montarMundo(
  document.body,
  window.GB_GRAFOS,
  { portada: $("portada"), info: $("info"), aviso: $("aviso"), ayuda: $("ayuda"), ficheros: document.getElementById("ficheros"), nodo: document.getElementById("nodo") },
  // fondo.html fija la suya en <body data-vista>: Lively carga un fichero, sin parámetros.
  { vista: new URLSearchParams(location.search).get("vista") ?? document.body.dataset.vista ?? null },
);
