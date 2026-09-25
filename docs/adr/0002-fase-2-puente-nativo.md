# 0002 — Fase 2: el mundo sigue siendo web; un puente nativo lleva la entrada a las ventanas

- Estado: aceptado (2026-09-24)
- Fecha: 2026-09-24

## Contexto

Primer uso real de la fase 1: "no puedo interactuar con las ventanas de VS Code". Es el
disparador de la fase 2 (SCOPE). Antes de elegir motor se midió lo que decide la arquitectura
(espiga del 2026-09-24 en `docs/evidencia.md`), con una ventana de VS Code desechable:

- Teclado **simulado** (PostMessage) a VS Code **inactivo**: no llega, ni a la ventana ni a su
  hijo `Chrome_RenderWidgetHostHWND`. Reenviar teclas a una ventana de fondo no funciona.
- Teclado **real** a VS Code **activo pero colocado fuera de la pantalla**: llega, atajos
  incluidos (Ctrl+S guardó el fichero).
- La captura de Edge (`getDisplayMedia`) de esa ventana fuera de la pantalla **sigue en
  directo**.
- Clics **simulados** (PostMessage con coordenadas de cliente) llegan con la ventana fuera de la
  pantalla, **esté activa o no**.
- La etiqueta de la pista capturada es `window:<HWND>:0`: el identificador de la ventana, con
  el que se puede leer su título y actuar sobre ella.

## Decisión

El mundo sigue siendo la web de la fase 1 (Three.js, sin motor de juego). Se añade un **puente
nativo** local (`puente/`, C#/.NET 10: Win32 directo y un solo ejecutable) al que la página habla por WebSocket en
`127.0.0.1`. Por HWND, el puente:

1. da el título de una ventana capturada (y así `repoDeTitulo` vuelve a funcionar, regla 6);
2. al "entrar" en una pantalla: pone el mundo siempre-encima y no activable, y activa la
   ventana real EN SU SITIO, debajo del mundo (el teclado va a ella de verdad). Primera versión:
   la aparcaba fuera de la pantalla; eso la da por oculta y Chromium congela vídeos (revisión
   del 2026-09-24, abajo);
3. traduce cada clic, arrastre y rueda sobre la pantalla 3D a coordenadas de la ventana y los
   envía como mensajes;
4. al "salir" (clic fuera de la pantalla, o el primer atajo global libre de Ctrl+Alt+Esc,
   Ctrl+Alt+M, Ctrl+Alt+Q, Ctrl+Alt+F12): devuelve la ventana a su sitio y el foco al mundo.

Solo escucha en 127.0.0.1, exige origen `null` (página abierta desde disco) y un token nuevo
en cada arranque que escribe en `wallpaper/puente-config.js`: una web no puede leer ese fichero.

El mundo se presenta al puente con un título único y el puente lo hace ventana **en capas con
alfa 254**: Chromium no cuenta como tapa una ventana en capas no opaca, así que lo capturado
debajo sigue vivo (vídeos, animaciones), escribas en ello o no.

## Consecuencias

- Se reutiliza todo lo de la fase 1; lo nativo es pequeño y solo hace Win32.
- Escribir dentro exige un modo explícito, el de "entrar en una pantalla". Mientras dura,
  WASD es de la ventana, no del mundo.
- Por medir con manos: la rueda y el arrastre con selección por mensajes, los menús
  contextuales y desplegables (son ventanas aparte), el IME, y qué pasa si la ventana
  aparcada se maximiza o cambia de monitor.
- `WorkerW` (el mundo detrás de los iconos en vez de Lively) queda fuera de esta decisión.
