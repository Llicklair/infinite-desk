# Evidencia — la libreta

Cada medición real: qué se probó, qué salió, qué cambió por ello.

**Los resultados negativos se escriben con el mismo detalle que los positivos, o más.**

## Formato

`## AAAA-MM-DD · qué se probó — VEREDICTO`, y debajo: montaje, resultado, consecuencia.

---

## 2026-09-26 · arrastrar una carpeta del escritorio giraba el fondo — ARREGLADO, confirmado con manos

Uso real: "movía una carpeta y a la vez se movía la preview aérea".

- **Por qué:** el fondo recibe el ratón crudo de todo el escritorio y solo miraba si el cursor
  estaba "sobre el escritorio". Los iconos también lo son, así que arrastrar un icono llegaba
  como arrastre y giraba la vista. El doble clic para abrir una carpeta volaba a una isla.
- **Arreglo:** al pulsar, se pregunta por MSAA (accesibilidad, solo lectura) a la lista de
  iconos del Explorador (`accHitTest`). Si hay un icono, ese gesto entero (bajar y subir) no
  llega al fondo. Con 200 ms de límite, por si el Explorador no contesta.
- **Medido con un script aparte:** en el centro de un icono ("nebular"), 1; en una zona vacía, 0;
  también con ventanas encima.
- **Con manos:** "funciona correctamente" (uso real).

## 2026-09-26 · mapas rehechos en masa y de uno en uno, varios a la vez — FUNCIONA sin manos

- **4 repos a la vez:** `npm run grafo` rehace las 19 islas en 48 s. Ahora solo espera a TTS
  pro, que tarda 31 s por sí mismo.
- **Parcial:** `npm run grafo -- galaxy-brain "TTS pro"` rehace esas dos y deja las otras 17
  como estaban (`fusionarGrafos`, con test).
- **El puente:** `regenerar` acepta `repos`, solo nombres de carpetas que existen en la de
  proyectos (probado: `..\Windows` y uno inexistente, ignorados). Corre node directamente, sin
  cmd, así que un nombre no puede colarse como orden.
- Si ya hay una regeneración en marcha, lo pedido se junta y corre al acabar.
- **Resultado:** repo-tour y handrail rehechas en 0,7 s.
- **En el mundo:** R apuntando a una isla (su base, un nodo o hacia ella) rehace solo esa; en
  otro sitio, todas. "Rebuild maps" en la pestaña Repos rehace las seleccionadas.
- Sin IA: `gb graph` es determinista y no gasta cupo.

## 2026-09-26 · instalar galaxy-brain desde el mundo — FUNCIONA sin manos

- **Detección:** galaxy-brain 0.7.0, instalado en modo editable desde `dev/galaxy-brain` con
  Python 3.11. El único Python registrado en `py` es el 3.11. Pide Python 3.9 o superior, y el
  repo es público en GitHub.
- **Instalación:** con pip, en modo editable desde la carpeta de galaxy-brain si está en la de
  proyectos (así sigue tu `git pull`); si no, desde GitHub. En macOS/Linux, con `--user`.
  - Probado aquí: 19 s, `gb --version` responde y queda apuntado en la actividad.
  - Desde el mundo: consola maestra → Accounts → Install. Al acabar, regenera las islas.
- **Aviso de Python:** con Python por debajo de 3.12, gb no lee la sintaxis nueva de Python
  (`def f[T]`, ya apuntado en papercuts por invest-ll). La tarjeta lo dice.
- **Pendiente:** rehacer una sola isla (ahora R rehace las 19, en alrededor de un minuto) y
  probarlo en una máquina sin gb con manos.

## 2026-09-26 · registro de actividad: commits, agentes, fallos nuevos y pulls — FUNCIONA sin manos

Montaje: `node tools/orquestador.mjs estado` dos veces y, para simular lo nuevo, el último commit
visto de infinite-desk puesto dos commits atrás y un fallo quitado de los vistos; capturas de la
pestaña Activity (demo) y del holograma (mundo real).

- **La primera pasada no vuelca la historia entera:** 0 eventos, y se apunta dónde está cada
  repo y qué fallos ya existían.
- **Después:** los 2 commits y el fallo "nuevo" salen como eventos, con hora, repo y texto.
- **Los agentes apuntan su propio inicio y final**, y el orquestador, los descartes y los pulls.
- **Dónde se guarda:** `actividad.jsonl`, una línea por evento, en los datos de infinite-desk
  fuera del repo. Se recorta a 3.000 eventos.
- **Dónde se ve:**
  - la pestaña Activity: por días, con filtros; un clic en un fallo lleva a su traza y en un
    agente, a la lista;
  - los 2 últimos eventos, en el holograma;
  - los 3 últimos de cada repo, en la ficha de su isla.
- **Retoque:** al crecer el holograma, su borde de abajo pisaba la tarjeta de repo de delante.
  Se subió medio metro.

## 2026-09-26 · fallos en rojo en su isla, pestaña Errors con "mandar un agente" y resumen del README — FUNCIONA sin manos

Montaje: `gb list --json --all` y `gb show <id> --json --all` de verdad, más capturas del mundo
real (aérea) y de la demo (`&maestra=errores`, `&isla=galaxy-brain`).

- **Un fallo es del repo del fichero donde salta**, no del proyecto desde el que se corrió.
  Medido: el `NameError: name 're' is not defined` de `galaxy-brain/cli.py:2489` (20 veces) salía
  como de infinite-desk, porque gb se ejecutó desde allí. Lo de carpetas temporales queda fuera.
- **Resultado:** 20 fallos repartidos por repo. galaxy-brain sale con "⚠ 8 errors" y sus módulos
  en rojo; invest-ll, infinite-desk y repo-tour, con uno cada uno. Solo se pinta en la isla lo de
  la última semana; lo anterior sigue en la consola.
- **La traza, sin variables locales** (pueden llevar datos). El código de la línea que falla
  viene de `source` con `is_fail`: el formato se había supuesto mal y se corrigió contra una
  captura real.
- **"Send an agent to fix it"** lanza un agente con la traza como tarea, en su rama. Sin probar
  con manos.
- **Resumen del README al hacer clic en la base de una isla:** su primer párrafo de verdad, sin
  título ni insignias. 17 de las 19 islas tienen README.

## 2026-09-26 · Chispas y la consola maestra: agentes de Claude de verdad en worktrees — FUNCIONA sin manos, falta con manos

**Chispas** (clic en la esfera del palantír), probado con `?vista=demo&chispas`, una ronda que se
juega sola: racha ×10 con el marcador en "fuego", 170 puntos, el hito avisado y el palantír
avivado. Sin errores de JavaScript.

**Consola maestra.** Los proveedores son Anthropic, OpenAI y Google DeepMind (Ollama no, decisión
del uso real). Qué dejan consultar por programa:

- `claude auth status` da JSON con sesión, correo y plan (max).
- `codex login status` dice si hay sesión.
- Gemini CLI no está instalado.
- `gh auth status`, la cuenta de GitHub.
- El cupo de una suscripción no se puede leer: se cuentan los agentes y los minutos lanzados desde
  aquí.

Un agente de Claude de verdad, con una tarea inofensiva sobre infinite-desk:

- En 12 s creó su worktree y su rama, escribió el fichero, su consola salió en el formato de
  galaxy-brain y `gb who` lo listó con sus 6 líneas de consola.
- **El commit falló**: el hook de pre-commit corre `tsc` y el worktree no tenía `node_modules`.
  Además, la consola decía "Committed" igualmente.
  - Arreglo, sin saltarse el hook: el agente enlaza `node_modules` y `.venv` del repo principal
    (uniones, no copias) y el hook pasa (50 tests y gate).
  - Si aun así no se puede commitear, lo dice y deja los cambios en el worktree.
- **Al descartarlo, git dejó atrás la unión a `node_modules`.** Un borrado recursivo que entrara
  por ella habría vaciado el `node_modules` real. Ahora se quita primero la unión, sin seguirla,
  y la carpeta solo si queda vacía. Comprobado: `node_modules` intacto.

Por el puente (operación `orquestador`, en segundo plano), `estado` tarda 1,3 s. Se rechazan:

- una orden fuera de la lista;
- un repo fuera de la carpeta de proyectos;
- un proveedor que no es de los tres.

Además, los envíos del puente van con un cerrojo por conexión: un WebSocket no admite dos a la
vez, y las respuestas de fondo se cruzaban con los avisos de agentes.

Sin probar con manos: lanzar desde el panel, pull en masa y Codex (sin sesión) o Gemini (sin
instalar).

## 2026-09-26 · leer dentro del mundo: el post, el artículo, las respuestas o el README — FUNCIONA sin manos

Montaje: `npm run noticias` contra las redes de verdad, y capturas con `?vista=demo&leer=N`, que
abre el lector en la tarjeta N.

Qué se lee de cada cosa (lo baja la misma pasada cada 30 minutos, unas 20 peticiones más):

- **El post entero.** De Reddit, su texto, del Atom.
- **El artículo que enlaza.** El texto de su `<article>`, `<main>` o `<body>`, hasta 12.000
  caracteres, sin menús, scripts ni botones de compartir. Estos últimos se colaban como lista
  ("Share on Facebook", "Email"…) en un artículo de Mother Jones: ahora se filtran.
- **Las respuestas**, las 8 mejores de cada red:
  - HN: su API de ítems.
  - Bluesky: getPostThread.
  - Mastodon: el contexto del estado.
  - Reddit: el Atom del post. Uno a uno y despacio, y aun así da 429 a veces: solo 1 de 3 los
    trajo.
- **El README de cada repo.** Markdown pasado a títulos, párrafos, listas y código, sin
  insignias.

Resultado: 19 de 20 con lectura. El que no, un post de Reddit que es una imagen: el lector lo
dice y ofrece abrirlo en el navegador. noticias.js pesa unos 180 KB.

Seguridad: todo lo de fuera se pone con textContent, nunca como HTML.

Cuando el mundo relee noticias.js con el lector abierto, se repinta lo que se está leyendo sin
perder el scroll.

## 2026-09-26 · el palantír sin X, con el top de GitHub del mes y el fuego del color del cielo — FUNCIONA sin manos

- **X, fuera.** Con el widget de cada perfil no hay forma de tenerla al día (ver la entrada
  siguiente), y lo que se pidió es que esté actualizado. Quedan Bluesky, Reddit, Hacker News y
  Mastodon.
- **Arriba, los repos del mes.** Salen de `github.com/trending?since=monthly`: sin API, se lee
  su HTML (22 repos con las estrellas ganadas en el mes). Un test con una entrada real recortada
  avisa si GitHub cambia la página. Si falla, se quedan los de la vez anterior.
  Resultado: 8 repos, de +56 k a +18 k estrellas en el mes.
- **Colocación.** La esfera queda entre dos carruseles: los titulares abajo, a la altura de los
  ojos, y los repos arriba, girando al revés. A 15 de distancia el anillo de arriba quedaba
  fuera del encuadre al entrar; ahora se aparece a 20 (menos si el círculo de islas es pequeño).
- **El fuego.** Toma el tono de la nebulosa de la hora (morado de noche, coral al atardecer). A
  su intensidad real era casi negro, medido en captura: se lleva el tono a plena intensidad.

## 2026-09-26 · el palantír: lo último sobre IA en las redes, en el centro del mundo — FUNCIONA, X a medias

Montaje:

- `npm run noticias` contra las redes de verdad, sin cuentas ni claves.
- Capturas del mundo en primera persona y del fondo.
- `abrirUrl` probado contra el puente real.

Qué se puede leer sin cuenta (probado una a una):

- **Bluesky**: búsqueda y perfiles, en `api.bsky.app`. En `public.api.bsky.app`, la búsqueda
  da 403.
- **Reddit**: por RSS. El JSON da 403. De subreddit en subreddit corta enseguida con 429, así que
  va una sola petición con todos juntos (`r/a+b+c`), y cada entrada dice su subreddit.
- **Hacker News**: la búsqueda de Algolia.
- **Mastodon**: las etiquetas. Mezclan idiomas (la mitad de #LLM, en japonés), así que se filtra
  a inglés. #AI es demasiado revuelta y se quitó.
- **X**: no hay API sin pagar. xcancel da 451 y nitter no responde. El widget público de cada
  perfil (`syndication.twitter.com`) sí trae hasta 100 tuits, pero:
  - para algunas cuentas son copias viejas (Karpathy y Altman: lo más reciente, de hace 316 días;
    Anthropic, de ayer);
  - a la tercera petición contesta 429, aun de una en una y con pausa.

  Por eso cada pasada lee solo 2 cuentas, guarda lo de la última semana y rota: todas se
  refrescan en unas horas.

Resultado:

- 12 titulares de 266 a 423 publicaciones, como mucho 3 por red. Cada publicación pesa por sus
  puntos relativos a su fuente y por lo reciente que es.
- El puente lo corre al arrancar y cada 30 minutos (log: "noticias: 12 titulares…"). El mundo
  relee el fichero cada 5.
- Primera versión, con sprites: las 12 tarjetas se amontonaban delante de la esfera. Ahora son
  un carrusel de planos mirando hacia fuera: se leen las de tu lado, y las de detrás no se ven.
- En el fondo, el palantír crece con el círculo de islas, hasta ×3; si no, era una mota.
- `abrirUrl` solo abre http y https. Rechazados: `file:`, `javascript:`, una ruta de Windows y
  `--disable-web-security`. Un enlace https se abrió en una ventana nueva del navegador.

Pendiente:

- X, hasta que se vea en uso cuántas cuentas dan tuits recientes.
- Clic en una tarjeta desde el fondo animado: el fondo no tiene puente, así que remite a Entrar.

## 2026-09-26 · decoración que cuenta cosas: cielo por la hora, cristales por la vida del repo, faro de agentes — FUNCIONA sin manos

Montaje: capturas del mundo construido con Edge sin ventana, con la hora falseada, en las vistas
aérea, demo y demo con agentes. Para medir, la página del fondo con y sin decoración en una
ventana de Edge de 1600×900 delante, 15-20 s cada una, varias rondas.

Resultado: sin errores de JavaScript.

- El cielo es un degradado con una nebulosa y estrellas que titilan, y cambia con la hora real:
  noche, amanecer, un día azul profundo (nunca claro, por el contraste de las pantallas) y
  atardecer.
- Cada isla tiene de 3 a 14 cristales, y su anillo se apaga según la edad de su último commit.
- Una isla con agentes trabajando tiene un faro del color del agente.

Tres fallos que salieron por el camino:

- **La niebla y el faro se veían más claros de lo pedido.** Three trata los colores como
  lineales y el shader pinta sRGB tal cual. Ahora los colores se pasan en sRGB.
- **Las estrellas eran rayas.** Se salían de su celda de la rejilla. Ahora son más pequeñas y
  quedan dentro.
- **Donde acaba el suelo se veía una raya recta contra el cielo.** Ahora, cerca del horizonte y
  por debajo, el cielo es del color de la niebla.

Coste:

| | sin decoración | nebulosa en vivo | nebulosa horneada |
|---|---|---|---|
| CPU | 27-29 % | 27-29 % | igual |
| GPU 3D | 11,3 % | 16 % | 12,6 % |

Con la nebulosa calculada en cada fotograma, la GPU subía unos 5 puntos. Se hornea en un cubo de
textura una vez por minuto, cuando cambia la paleta, y en vivo solo quedan las estrellas. El
coste queda en +1,3 puntos de GPU y nada de CPU.

## 2026-09-25 · afinado con el puente de verdad: rueda, esconder, Esc y N — FUNCIONA sin manos

Montaje: `npm run probar-puente`. Una página larga en una ventana de Edge aparte hace de
pantalla, y el puente se maneja como lo haría el mundo. Resultado: 10 de 10. Por el camino
salieron cuatro fallos:

- **La rueda no llegaba a una pantalla escondida** ("el scroll vuelve a fallar": VS Code se
  minimiza solo, así que sus pantallas acaban escondidas). Chromium manda la rueda a la ventana
  que hay bajo el punto, y una ventana en capas con alfa 0 no está bajo ningún punto. Probé a
  quitarle el atraviesa-clics y a subirle el alfa a 1 durante el envío, con esperas de 20 a 100
  ms: en el mejor caso funcionó 1 de 3 veces. Arreglo: mientras se escribe en ella, vuelve a
  la normalidad detrás del mundo, y al salir se esconde otra vez. Resultado: 300 -> 600.
- **Al esconderla otra vez, perdía el siempre-encima.** Se escondía cuando aún era la ventana
  activa, y al perder el foco Chromium se lo quita. Ahora se esconde después de activar el mundo.
- **Cualquier conexión al puente que se cerraba sacaba de la pantalla** en la que se escribía,
  aunque no fuera un mundo (una prueba, una herramienta). Ahora solo lo hace si era un mundo.
- **Tras Esc y Entrar, lo escondido volvía visible** detrás del mundo: entrar.ps1 restaura lo
  minimizado antes de volver al mundo, y al siguiente Esc aparecía en el escritorio. Ahora el
  puente recuerda qué estaba escondido al salir y lo vuelve a esconder.

N avisa ahora de las ventanas sin escritorio virtual. La comprobación no da falsos avisos, y
una ventana a la que se le quita el escritorio a propósito sale en el aviso. El vigilante de
escritorios (una ventana nueva cada 15 s) no ha visto el fallo desde las 17:19.

## 2026-09-25 · N no lista una ventana nueva de Chrome — CAUSA: Windows, no el puente

Montaje: un selector de Edge de prueba leído por UI Automation, más IVirtualDesktopManager
sobre cada ventana. Resultado:

- El selector lista "9GAG - Google Chrome" y no "Google - Google Chrome". Descartados el orden
  de apilado, lo tapada que esté, el estilo en capas, que no responda, el cloaking y la display
  affinity.
- La diferencia: la ventana que no sale no tiene escritorio virtual (GUID 0000…). Las que salen
  están en el actual. El selector de Edge/Chrome filtra por escritorio actual.
- Desde que el Explorador se reinició (11:37), NINGUNA ventana nueva recibe escritorio: ni un
  Chrome abierto sin el puente, ni un WinForms propio, y tampoco el propio mundo ni las apps UWP.
  Ocultar y mostrar, minimizar y restaurar o activar no lo cambian.

Consecuencia: el puente no puede arreglarlo, porque MoveWindowToDesktop solo vale para
ventanas propias y ni esas reciben escritorio. `npm run diagnostico` tiene ahora una sección
"escritorios virtuales" que lo detecta. Reiniciar el Explorador (14:59) lo arregla: las ventanas
nuevas reciben escritorio, y los Chrome que no lo tenían, también. Queda
por confirmar si el bloqueo de la barra y esto son el mismo fallo del Explorador.

## 2026-09-25 · el mundo en otra máquina y en el día a día — MONTADO, a medias con manos

- **Carpeta de proyectos por máquina:** "en una máquina limpia la ruta puede ser distinta".
  `npm run carpeta [-- ruta]` y la **P** en el mundo (selector de Windows por encima del mundo)
  la guardan en `infinite-desk.local.json`; export y puente la leen. Medido: carpeta de prueba
  (1 repo) y vuelta a dev/ (19). El selector, por el puente: 3 de 3 veces activo y siempre-encima.
- **Enter: la ventana real a pantalla completa delante del mundo.** Medido: Edge le quita al mundo
  el siempre-encima cada 200 ms mientras no es la activa ("perdido… devuelto" sin parar). Ahora la
  ventana real se queda activa pero DETRÁS del mundo (y el clic que la reactiva la devuelve detrás).
- **N no ofrecía lo recién abierto con F:** VS Code crea la ventana y la MINIMIZA él mismo a
  destiempo (medido: WS_MINIMIZE tras ~1 s, y otra vez más tarde). Al pulsar N, el puente restaura
  lo minimizado (300×200 o más) detrás del mundo; y avisa "… is ready: press N" al abrir con F.
- **"Open Folder" de VS Code no se puede usar dentro:** su diálogo se abrió una vez (registro:
  `#32770 "Open Folder"`) pero nadie lo vio; otras veces ni se abrió. Se esquiva: F → "Open a
  folder in VS Code…" (selector del puente + `code.cmd`) y Enter sobre una isla.
- **Esc dos veces perdía todo** ("sin querer… perdí lo que tenía abierto"): ahora minimiza el
  mundo (el puente) y el clic derecho → Enter vuelve a ESE mundo; Shift+Esc lo cierra.
- `npm run parar [-- --explorador]`: lo para todo y devuelve las ventanas escondidas.
- **Sin identificar:** la barra de tareas se bloqueó a las 11:36 con el mundo cerrado; parar el
  fondo no la arregló (descartado). La próxima vez, diagnosticar antes de reiniciar el Explorador.
- **Sin probar con manos:** Esc que minimiza y Enter que vuelve; "Open a folder in VS Code…"; P.

## 2026-09-25 · VS Code dentro del mundo: ventanas nuevas, minimizadas y menús — FUNCIONA a medias

- **Negativo:** F → Visual Studio Code "no abría" ventana nueva. Medido: `Code.exe --new-window`
  arranca otro VS Code entero que luego se lo pasa al abierto, y la ventana tardaba más de 6 s;
  `bin\code.cmd --new-window`, al momento (2 → 3 ventanas en menos de 6 s). Ahora, para VS Code,
  el puente usa `code.cmd` (panel F y Enter sobre una isla).
- **Negativo:** Enter sobre una pantalla minimizada (escondida) la devolvía al escritorio: "cada vez
  que interactúo con una pantalla, la abre". Ya no: sigue escondida (el teclado le llega por estar
  activa, los clics van por mensajes) y se minimiza de verdad al cerrar el mundo.
- **Negativo:** "Open Folder" no dejaba abrir nada: el diálogo y los menús son ventanas aparte y
  se abrían detrás del mundo. El puente sube por encima del mundo las ventanas nuevas del mismo
  programa mientras se escribe (en el registro salieron varias sin título al abrir menús), pero
  aparecen donde está la ventana real, no sobre la pantalla 3D. Lo robusto es que VS Code lo pinte
  dentro: `"window.menuStyle": "custom"` en la configuración del usuario (elegido: solo menús;
  `files.simpleDialog.enable` y `window.dialogStyle` se descartaron por cambiar su VS Code de siempre).
- **Sin probar:** los menús con `menuStyle: custom` desde el mundo (hace falta recargar VS Code).

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
