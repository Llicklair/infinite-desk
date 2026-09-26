# infinite-desk

Mundo 3D en primera persona: una isla por repo con su grafo de gb, y ventanas capturadas
como pantallas flotantes con el grafo de su repo detrás.
Alcance y criterio de terminado en [SCOPE.md](SCOPE.md); reglas en [ARCHITECTURE.md](ARCHITECTURE.md).

## Comandos

Lo de esta sección se EJECUTA, así que no puede pudrirse en silencio: si miente, falla.

```bash
npm test                    # node --test, núcleo puro (datos, disposición, islas, vínculo, ambiente, noticias, juego, orquesta, fallos, actividad)
npm run tipos               # tsc --checkJs estricto sobre src/ y tools/
npm run carpeta [-- ruta]   # la carpeta de proyectos de esta máquina (selector del sistema) -> infinite-desk.local.json
npm run grafo [-- repo ...] # gb graph --json por repo, 4 a la vez -> wallpaper/grafos.js (sin argumentos, todos; con nombres o rutas, solo esas islas y el resto se queda)
npm run noticias            # lo último sobre IA en Bluesky, Reddit, HN y Mastodon + top de GitHub del mes -> wallpaper/noticias.js (el palantír; el puente lo corre cada 30 min)
node tools/orquestador.mjs estado # la consola maestra por debajo: cuentas (Claude, Codex, Gemini, gh, galaxy-brain), repos, agentes, fallos y actividad (también accion/lanzar/descartar/abrir/traza/instalarGb)
npm run build               # esbuild -> wallpaper/infinite-desk.js (script clásico, sin módulos)
npm run terminado           # todo lo anterior + tools/comprobar.mjs + tools/humo.mjs (el mundo corre sin errores de JS): el criterio
npm run mundo               # servidor en localhost (solo si el navegador no captura desde file://)
npm run puente              # dotnet build del puente nativo (ADR 0002): escribir dentro de las pantallas
npm run fondo               # fondo animado (puente --fondo, Windows) + "Entrar": clic derecho en Windows, app en macOS (ADR 0004)
npm run alternar-fondo [-- on|off] # enciende o apaga el fondo animado (también al iniciar sesión); o doble clic en tools/alternar-fondo.cmd
npm run parar [-- --explorador] # lo para todo y devuelve las ventanas escondidas; con --explorador, reinicia el Explorador
npm run diagnostico         # foto de Windows e infinite-desk (barra de tareas, foco, qué la tapa) ANTES de reiniciar nada
npm run probar-puente       # pruebas de extremo a extremo con el puente y el mundo abiertos (rueda, esconder, Esc, N)
```

Vistas para comprobar sin manos: `index.html?vista=aerea` (todas las islas),
`index.html?vista=demo` (una pantalla falsa de VS Code enganchada a galaxy-brain) y
`index.html?vista=demo&agentes` (dos agentes de mentira en galaxy-brain: halos, señales, cruce y consolas) e
`index.html?vista=demo&leer=N` (el lector del palantír abierto en la tarjeta N: 0-11 titulares, 12-19 repos) y
`index.html?vista=demo&chispas` (una ronda de Chispas, el minijuego del palantír, que se juega sola) y
`index.html?vista=demo&maestra` (la consola maestra abierta con repos y agentes de mentira) y
`index.html?vista=demo&isla=<repo>` (la ficha de esa isla: el resumen de su README); `&maestra=errores` (o `=actividad`) abre la consola en esa pestaña.

## Gates

- `npm run tipos` — tipos estrictos vía JSDoc; no hay TypeScript en fuente.
- `gb graph . --gate` — ciclos y fronteras de [.gb-boundaries](.gb-boundaries).
- Ambas, más los tests, en [.githooks/pre-commit](.githooks/pre-commit).

## Cuando algo pete (contrato con gb)

- Si muere un script (`tools/*.mjs`): lee el estado YA capturado — `gb show <id>` o `gb last` —
  antes de re-ejecutar con prints.
- Para saber quién llama a un símbolo o qué rompes al tocarlo: `gb calls <símbolo> [--depth 2]`
  antes de grepear.
- De vez en cuando, `gb list`: no usar gb también es dato: se investiga, no se esconde.

## Arquitectura

Núcleo puro (`datos`, `disposicion`, `islas`, `vinculo`, `ambiente`, `noticias`, `juego`, `orquesta`, `fallos`, `actividad`), probado en Node; `tools/exportar.mjs`
lo usa en tiempo de export. Mundo con Three.js: `grafo3d` (un grafo como objeto), `pantallas`
(captura + grafo enganchado), `rotulo` (texto en el mundo), `decorado` (cielo por la hora, cristales por la vida del repo, faro de
agentes), `palantir` (la esfera del centro: titulares de IA abajo, repos del mes arriba; clic en ella, `chispas`, el minijuego), `mundo` (cámara, islas, acciones);
`main` lo monta con `window.GB_GRAFOS`. `wallpaper/` es el mundo construido. `puente/` (C#, ADR 0002)
es lo nativo: activa y pasa el ratón a la ventana de una pantalla, regenera grafos, abre lo del
escritorio y pregunta `gb who` por los agentes; `src/puente.js` le habla. `consola3d` (la terminal
flotante de cada agente de gb) va en el mundo; `nodo` (ficha al hacer clic), `ficheros` (panel F) `lector` (el post, artículo o README entero de una tarjeta del palantír) y `maestra` (la consola maestra: cuentas de IA, repos en masa y agentes; su holograma, `maestra3d`, flota sobre el palantír) son DOM. Los agentes (`tools/agente.mjs`) son worktrees en su rama, fuera de la carpeta de proyectos, que commitean ahí y nunca hacen push; `gb who` los ve y su consola es `<worktree>.consola.log`. Sin gb, islas de carpetas (ADR 0003).

## Convenciones de commit y PR

`type: descripción corta` (`feat`, `fix`, `refactor`, `docs`, `chore`), un cambio lógico por
commit. Nada entra sin `npm run terminado` en verde.
