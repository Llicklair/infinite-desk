# 0001 — La fase 1 es un fondo web en Lively Wallpaper con Three.js

- Estado: aceptado
- Fecha: 2026-09-24

## Contexto

Se quiere un fondo de escritorio 3D navegable desde el propio escritorio, con ventanas
flotantes más adelante. Pintar detrás de los iconos exige engancharse a la ventana `WorkerW`
de Windows y reenviar la entrada de ratón al render; Lively Wallpaper (libre, open source) ya
resuelve ambas cosas para fondos web.

## Decisión

Fase 1 = página web (Three.js empaquetado con esbuild en un script clásico) que Lively carga
como fondo. Los datos salen de `gb graph --json` y se escriben en `wallpaper/grafo.js`.

## Consecuencias

- La experiencia se valida en horas, sin escribir código nativo.
- Se hereda el límite de Lively: reenvía el ratón al fondo, el teclado no está garantizado. La
  navegación de la fase 1 es solo con ratón.
- Las ventanas reales (fase 2) no caben aquí: obligan a una app nativa que haga el papel de
  Lively. Esta decisión se revisa entonces, no antes.
