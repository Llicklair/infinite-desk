# 0005 — Al escribir en una pantalla, su imagen la captura el puente (WGC), no Chromium

- Estado: aceptado (2026-09-26). Amplía [0002](0002-fase-2-puente-nativo.md).
- Fecha: 2026-09-26

## Contexto

Uso real: "hay bastante latencia a la hora de escribir con el teclado". Medido en la máquina de
uso (docs/evidencia.md, 2026-09-26), de la tecla al píxel en el monitor: ~340 ms (250-750). La
ventana real cambia en pantalla en ~16 ms y el mundo pinta en 24-48 ms; casi todo el resto es la
captura de ventanas de Chromium (`getDisplayMedia`): ~200 ms de la tecla al fotograma en la
página. Igual en Edge y en Chrome, a cualquier tamaño, con WGC forzado o quitado y leyendo el
track sin `<video>`. La misma captura hecha a mano con Windows Graphics Capture (WGC) tarda ~13 ms.

## Decisión

- Mientras se escribe en una pantalla (Enter), el puente la captura con WGC (`puente/Vista.cs`) y
  la manda por un WebSocket propio, `/vista?token&hwnd`, solo binario: por trozos de 64×64 que
  cambian respecto a lo ya enviado (al escribir, unos pocos), BGRA tal cual (el mundo intercambia
  los canales en el shader) y comprimidos con deflate cuando son grandes (la ventana entera: 14 MB
  sin comprimir le costaban al navegador 70-450 ms; comprimidos, ~0,2 MB).
- Control de flujo por créditos: la página confirma cada mensaje ya aplicado y nunca hay más de 3
  sin confirmar (con 2, la ventana entera cambiando se quedaba en ~40 fotogramas/s; con 3, 51-57). En
  la página, 3 Web Workers descomprimen a la vez y los mensajes se aplican en orden. Los fotogramas
  se leen siempre al llegar (con el pool lleno, Windows tiraría los nuevos y el último estado se
  perdería); lo que espera es el envío, que lleva lo último leído.
- El mundo (`src/pantallas.js`) pinta esos trozos en una textura de datos (subiendo solo las filas
  que cambian) y, hasta el primer trozo y al salir, la pantalla sigue con la captura de Chromium:
  WGC no manda nada de una ventana quieta, y un puente antiguo sin `/vista` no rompe nada.
- Fuera de Enter, todas las pantallas siguen con la captura de Chromium: de lejos no se nota y no
  hay un flujo por pantalla.
- El puente pasa a `net10.0-windows10.0.19041.0` (las proyecciones de WinRT de WGC).

## Consecuencias

- De la tecla al monitor: ~95 ms con la vista directa frente a ~340 ms (medido de extremo a
  extremo: `?pantallas=1&escribir`, y `&directa=0` para comparar).
- La ventana entera cambiando (scroll, vídeo): 51-57 fotogramas/s frente a ~60 con Chromium, pero
  mucho antes; el puente gasta ~1,2 núcleos mientras dura (0 en reposo) y el mundo sigue a 60 fps.
- Solo Windows (como todo el puente). En macOS, cuando haya puente, habrá que medir
  ScreenCaptureKit igual.
- Descartado: `desynchronized` en el contexto WebGL (~15 ms menos, pero puede rasgar la imagen) y
  poner la ventana real delante al escribir (latencia nativa, pero deja de verse en 3D; uso real:
  "modo actual").
