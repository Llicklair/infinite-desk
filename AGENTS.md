# mirador

Mundo 3D en primera persona: una isla por repo con su grafo de gb, y ventanas capturadas
como pantallas flotantes con el grafo de su repo detrás.
Alcance y criterio de terminado en [SCOPE.md](SCOPE.md); reglas en [ARCHITECTURE.md](ARCHITECTURE.md).

## Comandos

Lo de esta sección se EJECUTA, así que no puede pudrirse en silencio: si miente, falla.

```bash
npm test                    # node --test, núcleo puro (datos, disposición, islas, vínculo)
npm run tipos               # tsc --checkJs estricto sobre src/ y tools/
npm run grafo [-- repo ...] # gb graph --json por repo -> wallpaper/grafos.js (por defecto: hermanos en dev/)
npm run build               # esbuild -> wallpaper/mirador.js (script clásico, sin módulos)
npm run terminado           # todo lo anterior + tools/comprobar.mjs: el criterio de la fase 1
npm run mundo               # servidor en localhost (solo si el navegador no captura desde file://)
npm run puente              # dotnet build del puente nativo (ADR 0002): escribir dentro de las pantallas
npm run fondo               # fondo en Lively (fondo.html) + "Entrar en mirador" en el clic derecho del escritorio
```

Vistas para comprobar sin manos: `index.html?vista=aerea` (todas las islas) y
`index.html?vista=demo` (una pantalla falsa de VS Code enganchada a galaxy-brain).

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

Núcleo puro (`datos`, `disposicion`, `islas`, `vinculo`), probado en Node; `tools/exportar.mjs`
lo usa en tiempo de export. Mundo con Three.js: `grafo3d` (un grafo como objeto), `pantallas`
(captura + grafo enganchado), `rotulo` (texto en el mundo), `mundo` (cámara, islas, acciones);
`main` lo monta con `window.GB_GRAFOS`. `wallpaper/` es el mundo construido. `puente/` (C#, ADR 0002)
es lo nativo: activa y pasa el ratón a la ventana de una pantalla, regenera grafos, abre lo del
escritorio y pregunta `gb who` por los agentes; `src/puente.js` le habla. `nodo` (ficha al hacer
clic) y `ficheros` (panel F) son DOM. Sin gb, islas de carpetas (ADR 0003).

## Convenciones de commit y PR

`type: descripción corta` (`feat`, `fix`, `refactor`, `docs`, `chore`), un cambio lógico por
commit. Nada entra sin `npm run terminado` en verde.
