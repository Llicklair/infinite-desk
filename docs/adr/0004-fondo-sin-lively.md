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

- **Windows:** `infinite-desk-bridge --fondo` hace lo que hacía Lively. Por monitor, una ventana
  del propio puente en la `WorkerW` del Explorador (entre el fondo y los iconos), y dentro el
  motor de Edge que trae Windows (WebView2, librería `Microsoft.Web.WebView2`) pintando
  `fondo.html` en modo composición (DirectComposition), a la escala de ese monitor. Dos hilos:
  el anfitrión solo es dueño de las ventanas de la `WorkerW` y nunca espera a nada (el
  Explorador queda enganchado a él); el pintor lleva WebView2, con una ventana oculta FUERA de la
  pantalla como padre. El ratón se lee con entrada cruda (RegisterRawInputDevices) y llega a la
  página como mensajes (`PostWebMessageAsJson`), nunca como entrada. Se pausa (deja de pintar)
  cuando algo tapa su monitor entero.
  `npm run fondo` lo copia a `%LOCALAPPDATA%` y lo deja arrancando al iniciar sesión.
- Segunda versión, descartada: ventanas de Chrome (kiosco) metidas en la `WorkerW` y un hook de
  ratón. Padre e hija de procesos distintos enganchan sus colas de entrada y no se puede
  deshacer: cada vez que Chrome se entretenía, el buscador y la barra de tareas se quedaban
  sordos. Parado el fondo, no volvió a pasar. Ahora del Explorador solo cuelga una ventana nuestra,
  cuyo hilo no hace más que responder, y WebView2 en composición no crea ventanas hijas.
- "Entrar" sigue en el clic derecho del escritorio, con Edge: viene con Windows y con él se
  midió todo el puente (ADR 0002). En Chrome el Enter sobre una pantalla dejó de funcionar.
- **macOS:** "Entrar" es una app de AppleScript (`osacompile`, viene con el sistema) en
  `~/Applications`. El fondo animado de macOS queda pendiente: una ventana propia con WebKit al
  nivel del escritorio (JavaScript for Automation), sin probar todavía.

## Consecuencias

- Cero aplicaciones de terceros aparte del navegador, en los dos sistemas.
- Lo aprendido a la fuerza, todo en `docs/evidencia.md`: mandar `0x052C` a Progman más de una
  vez, y colgar del Explorador ventanas de otro proceso que no responda al instante, dejan
  sordos la barra de tareas y el buscador. WebView2 en composición crea por su cuenta una ventana
  de opacidad 0 donde esté su padre, y esa ventana se queda con los clics: su padre va fuera de
  la pantalla y sus ventanas se marcan "atraviesa clics". `--fondo --solo-ventanas` y
  `--fondo --solo-webview` aíslan las dos mitades si vuelve a pasar algo así. Esconder la ventana para
  pausar la hace parpadear en blanco. El puente tiene que ser PerMonitorV2 por código: el del
  manifiesto no se aplicaba y el segundo monitor salía al doble.
- El puente sigue siendo solo de Windows; llevarlo a macOS es otra decisión (otro ADR).
