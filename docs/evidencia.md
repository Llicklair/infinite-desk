# Evidencia — la libreta

Cada medición real: qué se probó, qué salió, qué cambió por ello.

**Los resultados negativos se escriben con el mismo detalle que los positivos, o más.**

## Formato

`## AAAA-MM-DD · qué se probó — VEREDICTO`, y debajo: montaje, resultado, consecuencia.

---

## 2026-09-25 · Enter: "no está conectado al bridge" y la ventana "a full" delante — ARREGLADO a medias

- **Negativo:** con el puente ya en marcha, la página se presentaba nada más conectar y Edge aún no
  había puesto el título en su ventana: "mundo … NO ENCONTRADO" y todo Enter fallaba ("the space
  hasn't connected to the bridge yet"). Antes no pasaba porque el puente arrancaba después.
  Ahora el puente reintenta cada 250 ms hasta 5 s. **Medido:** "ok tras 250 ms".
- **Negativo:** a veces, tras Enter, la ventana real salía delante del mundo, a pantalla completa
  ("tengo que salir y volver a darle Enter"). Hipótesis: Chromium quita el siempre-encima a su
  ventana a pantalla completa al perder la activación, y a veces lo hace después de que el
  puente se lo ponga. Mientras se escribe, el puente lo comprueba cada 200 ms y lo devuelve.
- Uso real: "ahora sí, está perfecto". **Sin confirmar la hipótesis:** en la sesión de prueba el
  vigilante no tuvo que actuar ni una vez; si vuelve a pasar, el registro lo dirá
  ("el mundo había perdido el siempre-encima…").

## 2026-09-25 · el fondo rompe Windows: rehecho con WebView2 en composición — FUNCIONA

- **Negativo 1 (uso real, varias veces):** con Chrome en la `WorkerW`, buscador y barra de tareas
  sordos "cada dos por tres". Ni cachear la `WorkerW` ni `AttachThreadInput(false)` tras
  `SetParent`. Aislado parando el fondo (mundo y puente en marcha): 20 min sin un fallo.
- **Negativo 2:** WebView2 en composición con `SendMouseInput` desde el mismo hilo dueño de la
  ventana de la `WorkerW`: "no reacciona nada de Windows, ni el clic izquierdo". Separado en dos
  hilos (anfitrión que nunca espera, pintor con WebView2): igual.
- **Negativo 3:** el ratón no llegaba al fondo del monitor principal: `WindowFromPoint` no se salta
  las ventanas de opacidad 0 (la de WebView2, el overlay de NVIDIA). Ahora se recorren las de
  primer nivel saltando las que atraviesa el ratón.
- **Aislado con dos pruebas** (`--fondo --solo-ventanas` / `--solo-webview`): nuestras ventanas
  vacías en la `WorkerW`, todo responde; WebView2 sin nada en la `WorkerW`, deja de responder.
  Culpable: WebView2 crea una ventana de opacidad 0 del tamaño de su padre, donde esté su padre,
  y se queda con los clics. Arreglo: padre en (-32000, -32000) y sus ventanas "atraviesa clics";
  el ratón llega a la página como mensajes, no como entrada.
- Resultado (uso real): "sí, todo responde"; gira con el ratón en los dos monitores.
- Laterales del mismo día: un Discord minimizado se restauraba a 314×50 al entrar (recuadro
  blanco en el escritorio): `entrar.ps1` ya solo restaura ventanas de 300×200 o más. Y la foto
  del primer intento se había quedado como fondo de Windows: devuelto el anterior del historial.

## 2026-09-25 · agentes de gb como en su mapa: halos, señales y consolas — FUNCIONA sin manos

- Pedido: "animaciones de galaxy-brain más fidedignas: nodos encendiéndose por agente, las
  consolas de los agentes y las señales de los nodos comunicándose". Copiado de `viz.py` de gb:
  paleta de agentes por orden de nombre, halo que late (sin(t/380 ms + i·0,7)), anillo quieto si
  solo commiteó, blanco en cruce, apagado entero 3 min → nada a los 10, señal por arista con un
  extremo tocado (1,3 s por recorrido, desde el nodo tocado), terminal por agente con las líneas
  de `<worktree>.consola.log` cayendo cada 700 ms.
- Montaje: `index.html?vista=demo&agentes` con Chrome headless (SwiftShader), 1600×900.
- Resultado: halos rosa y verde, cruce en blanco, las dos terminales legibles y apiladas por
  encima del rótulo, con su hilo hasta el nodo.
- **Negativos:** la demo se conectaba al puente real, que le pisaba los agentes de mentira con
  los de verdad (y le presentaba otra ventana del mundo): la demo va sin puente. El único
  "agente" real encontrado (el repo principal de Automatiza-Core, sin tocar nada desde hace 29
  días) salía anunciado como "working": ahora solo se anuncia lo que toca algo y sigue vivo.
- **Sin probar:** con un agente real escribiendo en su consola (el movimiento de las señales y
  la caída de líneas en tiempo real).

## 2026-09-25 · fondo animado sin Lively (puente --fondo) — FUNCIONA en Windows, macOS sin hacer

- Motivo: el portátil de empresa es un Mac y no admite apps de terceros sin aprobación (ADR 0004).
- **Negativo:** primero una foto con Chrome headless (6 s, nítida). Uso real: "tiene que tener
  animaciones también". Fuera.
- Montaje: Chrome `--kiosk --app=fondo.html` por monitor, `SetParent` a la `WorkerW`; Windows 10,
  principal 2560×1440 al 200 % y otro 1920×1080 al 100 % a la izquierda.
- Resultado: dentro de la `WorkerW` y anima (dos capturas con 3 s de diferencia, distintas); con
  el mundo delante, 0,33 s de CPU en 5 s para los 8 procesos del fondo (pausado).
- **Negativos, uno por uso real:** barra de título visible (sin kiosco); borroso y descentrado
  (una sola ventana para dos escalas); botón en la barra de tareas (hay que esconderla antes de
  marcarla `WS_EX_TOOLWINDOW`); parpadeo en blanco (pausar escondiendo la ventana); blanco fijo
  (pausado antes de pintar el primer fotograma); segundo monitor a un cuarto (el puente no era
  PerMonitorV2 pese al manifiesto); **barra de tareas y buscador sordos** (0x052C cada 2 s, y
  colas de entrada enganchadas por `SetParent` entre procesos: se desenganchan).
- Lateral: `entrar.ps1` buscaba el puente por nombre de proceso y el fondo es el mismo `.exe`:
  el Enter "dejó de funcionar". Ahora mira el puerto.
- **Sin probar:** si el buscador aguanta con el desenganche; todo lo de macOS.

## 2026-09-24 · render del fondo con el grafo real de galaxy-brain — FUNCIONA (en navegador)

- Montaje: `npm run terminado` sobre `../galaxy-brain`; captura con Edge headless (SwiftShader)
  a 1600×900 abriendo `wallpaper/index.html` desde `file://`.
- Resultado: 142 módulos, 250 aristas, 0 ciclos; disposición en 53 ms en Node; bundle 558 KB.
  Carga en `file://` sin servidor. Primera versión encuadraba por el nodo más lejano y el
  núcleo quedaba diminuto y apagado por la niebla: se encuadra por el percentil 85 y la niebla
  escala con el tamaño del grafo.
- Consecuencia: la parte web está lista. **Falta la mitad que no mide ningún comando.**

## 2026-09-24 · el mundo con 14 islas y una pantalla enganchada — FUNCIONA (en navegador)

- Montaje: `npm run terminado` sin argumentos (todos los repos de `dev/`); capturas con Edge
  headless: `?vista=aerea` y `?vista=demo`, esta última con puppeteer-core en tiempo real.
- Resultado: 14 islas, 1288 módulos; 4 repos saltados por 0 módulos (Automatiza-Core_landing,
  forja, Llicklair, Llicklair.github.io). Exportar tarda ~50 s, casi todo gb en TTS pro (25 s)
  y Automatiza-Core (11 s). `file://` es contexto seguro en Edge (`isSecureContext=true`,
  `getDisplayMedia` presente): se puede capturar sin servidor.
- La pantalla de demo reconoce `galaxy-brain` por el título y le engancha el grafo detrás y
  encima. **Negativo:** la primera versión salía negra — `captureStream` solo emite fotogramas
  cuando el canvas cambia, y se pintaba una vez antes de crear el stream. Un headless con
  `--virtual-time-budget` lo habría escondido como "cosa del headless"; en tiempo real seguía
  negra, y eso lo delató.
- Consecuencia: falta la mitad manual — ver abajo.

## PENDIENTE · a mano, con ratón y teclado reales

- Clic para entrar, WASD, agarrar una pantalla con el clic mantenido, Q/E sobre un grafo.
- Enter sobre una isla abre VS Code en esa carpeta (`vscode://file/...`); N captura su ventana
  y el título real (no el de la demo) engancha el repo correcto.
- Tras elegir la ventana, el mundo se queda delante y VS Code detrás (`setFocusBehavior`
  `"no-focus-change"`). Primer uso real: sin eso, Chromium enfocaba VS Code y "se abría en el
  escritorio, no dentro de la ventana".
- Consumo de GPU con 3–4 pantallas capturadas a la vez.

## 2026-09-24 · el mundo como fondo en Lively — MONTADO, falta usarlo

- Montaje: Lively 2.2.1 (winget). `wallpaper/fondo.html` = mismo bundle con `data-vista="fondo"`:
  órbita en vez de primera persona (arrastrar gira, rueda acerca, doble clic vuela a la isla,
  gira sola tras 30 s quieto), se apunta con el cursor. `npm run fondo` lo pone.
- **Negativo:** `Lively setwp --file wallpaper/fondo.html` no hace nada (solo acepta fondos de su
  biblioteca), y en el primer arranque de Lively el encargo se pierde. Importar copiaría la
  carpeta y cada build exigiría reimportar: se enlaza con `IsAbsolutePath` al fichero del repo.
- Captura headless de `fondo.html`: las 14 islas desde lo alto, ayuda de ratón abajo.

## 2026-09-24 · "no puedo meterme dentro" — clic derecho del escritorio abre el mundo

- Primer uso real del fondo: se ve, pero no se puede entrar. Detrás de los iconos no llega el
  teclado ni el pointer lock, así que no hay "modo" que cambiar en el propio fondo.
- Montaje: `npm run fondo` añade "Entrar en infinite-desk" al clic derecho del escritorio (HKCU,
  `DesktopBackground\Shell`): Edge `--app` a pantalla completa con `index.html?vista=dentro`.
  Esc suelta el ratón; otro Esc cierra y vuelve el fondo. Adelanta a pelo la parte "clic
  derecho" de la fase 2, sin app nativa. Quitar: `npm run fondo -- --quitar`.
- Por medir: que la entrada aparezca con Lively encima del escritorio, y cuánto tarda en abrir.
- **Negativo (primer uso):** dentro no se podía capturar ninguna ventana. Reproducido con CDP
  sobre Edge `--app`: `displaySurface: "window"` en las constraints da `NotReadableError: Could
  not start video source`, y el mundo lo enseñaba como "Captura cancelada.". Fuera esa
  preferencia; ahora un fallo se enseña con su nombre. N dentro del mundo ya coloca la pantalla
  (probado con el selector automático; falta con el selector real y una ventana de VS Code).
- Lively dejaba su panel en la barra de tareas: `IsFirstRun: true` en su Settings.json.
- **Negativo (segundo uso):** VS Code no se dejaba elegir. Edge no ofrece ventanas minimizadas
  (probado: la misma ventana se captura restaurada y no minimizada), y para llegar al clic
  derecho del escritorio se minimiza todo. `tools/entrar.ps1` las restaura sin activarlas antes
  de abrir el mundo encima.
- **Hallazgo:** en este Edge la etiqueta de la pista de una ventana es `window:<id>:0`, NO su
  título. `repoDeTitulo` (ARCHITECTURE 6) no puede casar nunca con capturas reales; solo engancha
  "lo último que abriste con Enter" o G a mano. Pendiente de decidir cómo saber el título.

## 2026-09-24 · agentes de gb, islas solas y alternar vistas — FUNCIONA sin manos

- Montaje: repo desechable `dev/zz-agentes` (a.py -> b.py, un commit); puente con log; mundo en
  Edge headless por CDP. Después, `gb graph .` en infinite-desk.
- El puente regenera al arrancar: a los 58 s "Isla nueva: zz-agentes". b.py modificado sin
  commitear (un agente para `gb who`): a los 42 s el mundo avisa "🤖 zz-agentes trabajando en
  zz-agentes". De paso salió un agente REAL: Automatiza-Core tiene cambios sin commitear.
- "Levanta el grafo aquí": gb no dice el repo en `~/.galaxy-brain/usos.jsonl`, pero sí el
  `graph`. `gb graph .` a las 22:29:02 -> "regenerando grafos: se levantó un grafo con gb" a
  las 22:29:05. Margen de 2 min: los hooks de gb también lanzan `graph`.
- infinite-desk ya tiene isla (el exportador lo excluía por ser él mismo): 23 módulos.
- Sin probar con manos: nodos encendidos de cerca, ficha al hacer clic, T, V, Esc en el fondo
  (Lively solo pasa el ratón por defecto: Esc no llega; doble clic en el vacío, sí).

## 2026-09-24 · "me has roto la barra de tareas" (dos veces) — NEGATIVO, arreglado en el puente

- Síntoma: la búsqueda de la barra de tareas no reacciona al ratón ni al teclado. Reiniciar
  SearchApp no basta; reiniciar explorer.exe sí.
- Causas del puente: (1) activaba ventanas enganchando la cola de entrada del programa de
  delante (AttachThreadInput), que podía ser el Explorador; (2) si la página del mundo no se
  había presentado, tomaba la ventana de delante como "mundo": si era la barra, la dejaba no
  activable y le quitaba el siempre-encima al salir.
- Arreglo: activar con F24 + SetForegroundWindow, sin enganches; solo el mundo presentado por
  su título; nunca tocar ventanas de Windows (Shell_TrayWnd, Progman, WorkerW, CoreWindow).
- **Lección:** las pruebas que cambian el foco sobre el escritorio real del usuario rompen cosas
  suyas; se prueba con ventanas propias.

## 2026-09-24 · "los vídeos de YouTube no se reproducen": Chromium y las ventanas tapadas — CAMBIA ADR 0002

- Montaje: ventana testigo (Edge `--app`) cuyo título dice `visibilityState` y fps de rAF; una
  "tapa" (otra Edge) encima. Todo en una esquina, sin tapar al usuario.
- Testigo inactivo tapado por ventana normal: `hidden`, 0 fps. Por una siempre-encima: igual.
  Aparcado fuera de la pantalla (lo que hacía el puente al escribir): `hidden`. Detrás de otras
  ventanas del usuario: `hidden`. Así se congelaba el vídeo en la pantalla del mundo.
- Tapa **en capas con alfa 254** (tras moverla 1 px para que Chromium recalcule): testigo
  `visible` a 60 fps, activo o no; y la tapa, también Chromium, sigue pintando a 60 fps.
- **Negativo:** sin el movimiento de 1 px, en capas seguía `hidden`: Chromium recalcula con
  eventos de ventana, no al cambiar el estilo.
- Consecuencia: el puente ya no aparca; el mundo es en capas (alfa 254) y siempre-encima solo
  mientras escribes; la ventana se activa en su sitio, debajo. Prueba: VS Code en su sitio
  (-2596,432, 1598x1812) y el teclado llega ("uno | dos |  | tres"). Falta con manos: el vídeo.
- **Por medir:** Discord "no me deja interactuar" (no se probó sobre el Discord real del usuario).

## 2026-09-24 · islas nuevas sin salir del mundo (R, solas, fondo) — FUNCIONA sin manos

- Montaje: puente recién arrancado + mundo por CDP; R; `dev/zz-prueba-isla` con `a.py -> b.py` y
  `git init`. Después, `fondo.html` abierto, repo borrado y `npm run grafo`.
- Mundo: el puente regenera al arrancar (56 s); R durante esa pasada -> "se repite al acabar"; el
  repo nació a mitad, así que la primera pasada no lo vio ("nada nuevo") y la pendiente sí: a los
  110 s "Isla nueva: zz-prueba-isla", 14 -> 15 islas, sin recargar la página.
- Fondo (sin puente): de 15 a 14 islas solo, 60 s después de regenerar ("Islas al día").
- **Negativo lateral:** `npm run puente` falla si el puente está en marcha (el .exe queda
  bloqueado). Pararlo solo si no hay ventana aparcada fuera de la pantalla.

## 2026-09-24 · escribir dentro de una pantalla, con manos — FUNCIONA

- Montaje: clic derecho del escritorio -> Entrar en infinite-desk; N sobre VS Code; Enter sobre la
  pantalla, sin mover la cámara.
- Resultado: "ahora sí funciona, 10". Se escribe y se hace clic en la VS Code real desde el mundo.
- Sigue por medir: arrastre con selección, menús desplegables, IME, GPU con 3–4 pantallas.

## 2026-09-24 · "se me agranda delante": Enter no debe cambiar la vista — ARREGLADO sin manos

- Enter ponía la cámara de frente a la pantalla (`encarar`) y, con VS Code maximizada, el puente
  la restauraba a su tamaño normal: la pantalla cambiaba de forma. Lo que se quiere es pulsar
  Enter y seguir viendo lo mismo.
- Fuera `encarar` (el ratón se traduce por rayo sobre la pantalla 3D, vale de lado). El puente
  aparca la maximizada con su tamaño: probado 2586x1466 antes, aparcada y al salir (vuelve
  maximizada), con el teclado llegando ("uno | dos |  | tres").

## 2026-09-24 · primer uso del puente: "Enter me abre un VS Code nuevo" — ARREGLADO sin manos

- La página del mundo ya estaba abierta antes que el puente, y solo buscaba el puente al cargar;
  además `puente-config.js` tenía el token de una prueba anterior. Sin puente, Enter sobre una
  pantalla caía en lo de la fase 1: `vscode://`, que abrió otra ventana.
- Arreglo: token persistente (`%LOCALAPPDATA%\infinite-desk\puente-token`), la página reintenta cada
  3 s releyendo la config, y Enter sobre una pantalla real nunca abre otra ventana: sin puente, avisa.
- Probado por CDP: página abierta sin puente, puente arrancado 6 s después -> se conecta sola y
  la captura trae el título real.

## 2026-09-24 · el puente (ADR 0002) de extremo a extremo — FUNCIONA sin manos; falta con manos

- Montaje: `infinite-desk-bridge.exe` + VS Code desechable (`espiga2/prueba.txt`, "uno
dos") + una
  consola haciendo de mundo; cliente WebSocket desde PowerShell. Página: Edge por CDP.
- Seguridad: sin token o con `Origin: https://ejemplo.com` no conecta; con token, sí.
- `entrar`: VS Code aparcada en x=5520 y activa; el mundo, no activable. Teclas reales
  (Ctrl+End, Enter, "tres", Ctrl+S) -> fichero "uno | dos |  | tres". Rueda y clic por el
  puente sin perder el foco. `salir`: mundo delante otra vez, VS Code a su sitio.
- Página: carga `puente-config.js`, conecta desde `file://` (origen `null`) y la pantalla lleva el
  título real («prueba.txt - espiga2 - Visual Studio Code»), no `window:<HWND>:0`.
- **Negativo:** Ctrl+Alt+M (el atajo pensado) ya lo tenía otro programa: el puente prueba una
  lista y la página enseña el que consiguió (aquí Ctrl+Alt+Esc).
- Falta con manos: encarar la pantalla, que el clic caiga donde se ve, que el clic sobre Edge
  no le devuelva el foco (Chromium podría ignorar WS_EX_NOACTIVATE), arrastre y menús.

## 2026-09-24 · espiga fase 2: ¿cómo llega la entrada a una ventana de VS Code? — DECIDE ADR 0002

- Montaje: `code -n` sobre una carpeta temporal con `prueba.txt`; PowerShell + Win32; se
  comprueba con el fichero guardado en disco, el título y fotogramas (PrintWindow y captura
  de Edge por CDP).
- **Negativo:** WM_CHAR / WM_KEYDOWN posteados a VS Code inactivo — nada, ni a la ventana
  principal ni al hijo `Chrome_RenderWidgetHostHWND` (captura: editor vacío).
- Teclas reales (`keybd_event`) con VS Code ACTIVO y aparcado a la derecha del escritorio
  virtual (x=2760 con el monitor acabando en 2560): llegan, y Ctrl+S guarda ("hola infinite-desk").
- Captura de Edge de esa ventana aparcada: en directo (el fotograma 2 muestra lo tecleado
  después del 1). Etiqueta de la pista: `window:96799178:0`, el HWND.
- Clics posteados (WM_MOUSEMOVE/LBUTTONDOWN/UP, coordenadas de cliente en píxeles físicos):
  abren ficheros del explorador con la ventana aparcada, activa o INACTIVA.
- **Negativo lateral:** el truco de pulsar Alt para poder llamar a SetForegroundWindow abre la
  barra de menús de VS Code. En el puente no hará falta: el mundo tendrá el foco al hacer clic.
- Una ventana minimizada no se ofrece ni se captura (ya visto): aparcar ≠ minimizar.

## PENDIENTE · arrastrar sobre el escritorio gira el grafo dentro de Lively

- Por medir: instalar Lively, importar `wallpaper/`, y comprobar (1) arrastre = giro, (2) rueda
  = zoom, (3) hover muestra etiqueta, (4) consumo de GPU en reposo con una ventana maximizada.
- Si la rueda no llega al fondo (Lively no garantiza reenviarla), se apunta aquí y la
  navegación pasa a arrastre + doble clic.
