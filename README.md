# infinitas

**Trabajas en un portátil y te faltan pantallas.** El editor en una, la documentación en otra,
el navegador con la app corriendo en una tercera, el chat del equipo en una cuarta… y solo tienes
una de 14 pulgadas. Alternas ventanas sin parar.

**infinitas convierte tu portátil en un puesto con todas las pantallas que quieras.** Entras en
un espacio 3D y cada ventana de tu escritorio se vuelve una pantalla flotante que colocas donde
quieras: una delante, otra a la izquierda, otra arriba. Giras la cabeza para mirar otra. Y no son
fotos: son las ventanas de verdad, en directo, y **puedes escribir y hacer clic en ellas**.

## Qué puedes hacer

- **Tantas pantallas como ventanas.** VS Code, el navegador, Discord, un vídeo, el explorador de
  archivos: cada una es una pantalla que mueves, acercas y agrandas. Los vídeos siguen
  reproduciéndose.
- **Trabajar dentro.** Apuntas a una pantalla, pulsas Enter y el teclado y el ratón van a esa
  ventana real. Clic fuera y vuelves a moverte por el espacio.
- **Abrir cosas sin salir.** F abre tu escritorio (ficheros, carpetas, programas, webs) y lo que
  abras aparece como pantalla nueva.
- **Ver tus proyectos.** Cada repositorio de tu carpeta de trabajo es una isla con su mapa de
  código: módulos y dependencias si tienes [galaxy-brain](https://github.com/Llicklair/galaxy-brain), o su
  árbol de carpetas si no. Con galaxy-brain, además, ves a los agentes trabajando: los módulos que
  tocan se encienden en directo.
- **Como fondo de escritorio.** El mismo espacio, girando despacio detrás de tus iconos; clic
  derecho en el escritorio → *Entrar en infinitas* para meterte.

## Requisitos

- Windows 10 u 11, con Microsoft Edge (viene con Windows).
- [Node.js](https://nodejs.org) 20 o superior.
- [.NET 10 SDK](https://dotnet.microsoft.com/download) para escribir dentro de las pantallas.
- Opcional: [Lively Wallpaper](https://github.com/rocksdanister/lively) para tenerlo de fondo
  (`winget install rocksdanister.LivelyWallpaper`), y galaxy-brain (`gb`) para los mapas de código.

## Empezar

Clona el repo **dentro de tu carpeta de proyectos** (sus carpetas hermanas serán las islas):

```bash
npm install
npm run terminado   # comprueba, genera las islas, construye el espacio y el puente
npm run fondo       # lo pone de fondo en Lively y añade "Entrar en infinitas" al clic derecho
```

Clic derecho en el escritorio → **Entrar en infinitas**. Haz clic para entrar y pulsa **N** para
traer tu primera ventana.

Sin Lively también funciona: abre `wallpaper/index.html` en Edge.

## Controles

| Tecla | Qué hace |
|---|---|
| **WASD** + ratón | moverse y mirar · **Espacio** subir · **C** bajar · **Shift** correr |
| **N** | traer una ventana como pantalla nueva |
| **F** | abrir algo del escritorio (y traer su ventana) |
| **Enter** sobre una pantalla | escribir en ella; clic fuera de la pantalla para volver |
| mantener **clic** | mover una pantalla · **rueda** tamaño · **X** cerrarla |
| **G** · **V** | qué mapa lleva una pantalla · quitárselo o ponérselo |
| **clic** en un nodo | su ficha: qué es, quién lo usa, qué agentes lo tocan |
| **T** · **R** | mapa de código ↔ árbol de carpetas · regenerar las islas |
| **H** · **Esc** | ocultar la ayuda · soltar el ratón (dos veces: volver al escritorio) |

Como fondo de escritorio: arrastra para girar, rueda para acercar, doble clic en una isla para ir
a ella y doble clic en el vacío para volver a la vista de arriba.

## Cómo funciona

El espacio es una página web (Three.js) que abre Edge a pantalla completa. Las ventanas se
capturan con la API de captura del navegador (la primera vez eliges cuál, con un clic). Un
programa pequeño en C# (`puente/`), que solo escucha en tu propio equipo y con un token, hace lo
que una web no puede: pasar el teclado y el ratón a la ventana real, abrir ficheros y regenerar
las islas. Los detalles y el porqué de cada decisión están en [ARCHITECTURE.md](ARCHITECTURE.md)
y [docs/adr/](docs/adr/); lo medido, bueno y malo, en [docs/evidencia.md](docs/evidencia.md).

## Límites honestos

- **Solo Windows** por ahora: el puente usa la API de ventanas de Windows.
- **Cada ventana nueva pide un clic** en el selector del navegador: una web no puede capturar
  ventanas sin que las elijas tú.
- **Escribir en una pantalla es un modo**: mientras escribes, WASD es de la ventana, no del
  espacio.
- Una ventana **minimizada no se puede capturar**; al entrar, infinitas las restaura.
