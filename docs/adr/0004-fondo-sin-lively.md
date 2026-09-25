# 0004 — El fondo animado lo pinta el puente, sin Lively; Windows y macOS

- Estado: aceptado (2026-09-25). Sustituye a [0001](0001-fondo-web-en-lively.md).
- Fecha: 2026-09-25

## Contexto

infinite-desk tiene que correr en un portátil de empresa (macOS) además de en Windows, y ahí
no se pueden instalar aplicaciones de terceros sin aprobación de seguridad. Lenguajes y
librerías (Node, .NET, Three.js) sí; Chrome está aprobado. Lively Wallpaper es una aplicación
de terceros y solo existe para Windows. Lo único que aportaba era el fondo animado: el clic
derecho, el mundo a pantalla completa y el puente nunca dependieron de él.

Primer intento (descartado el mismo día): una foto del mundo con Chrome headless como fondo
estático. Uso real: "no, tiene que tener animaciones también".

## Decisión

- **Windows:** `infinite-desk-bridge --fondo` hace lo que hacía Lively. Abre `fondo.html` en un
  Chrome por monitor (perfil propio, kiosco, a la escala de ese monitor) y mete cada ventana en
  la `WorkerW` del Explorador, entre el fondo y los iconos. Un hook de ratón de bajo nivel le pasa
  el ratón cuando el cursor está sobre el escritorio vacío. Se pausa (deja de pintar) cuando
  algo tapa su monitor entero. `npm run fondo` lo copia a `%LOCALAPPDATA%` y lo deja arrancando
  al iniciar sesión.
- "Entrar" sigue en el clic derecho del escritorio, con Edge: viene con Windows y con él se
  midió todo el puente (ADR 0002). En Chrome el Enter sobre una pantalla dejó de funcionar.
- **macOS:** "Entrar" es una app de AppleScript (`osacompile`, viene con el sistema) en
  `~/Applications`. El fondo animado de macOS queda pendiente: una ventana propia con WebKit al
  nivel del escritorio (JavaScript for Automation), sin probar todavía.

## Consecuencias

- Cero aplicaciones de terceros aparte del navegador, en los dos sistemas.
- Lo aprendido a la fuerza, todo en `docs/evidencia.md`: mandar `0x052C` a Progman más de una
  vez, y dejar a Chrome con las colas de entrada enganchadas al Explorador (lo hace `SetParent`
  entre procesos), dejan sordos la barra de tareas y el buscador. Esconder la ventana para
  pausar la hace parpadear en blanco. El puente tiene que ser PerMonitorV2 por código: el del
  manifiesto no se aplicaba y el segundo monitor salía al doble.
- El puente sigue siendo solo de Windows; llevarlo a macOS es otra decisión (otro ADR).
