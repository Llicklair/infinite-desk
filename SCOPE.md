# infinitas — alcance

## En una frase

**Un mundo 3D tipo videojuego por el que te mueves en primera persona, donde cada repo es una
isla con su grafo de galaxy-brain y las ventanas del escritorio flotan como pantallas que
colocas, agrandas y cierras desde dentro.**

## Fases

1. **Fase 1 (esta): el mundo.** Página web (Three.js) que se abre desde disco:
   - moverse: WASD + ratón (pointer lock, como un shooter), volar con Espacio/C, correr con Shift;
   - una isla por repo con su grafo 3D (`gb graph --json`), que gira sola y con Q/E;
   - pantallas flotantes: `N` captura una ventana en vivo (`getDisplayMedia`), se agarra
     manteniendo el clic, la rueda cambia su tamaño, `X` la cierra.
2. **Fase 2: el mundo como fondo y ventanas usables.** Empezada el 2026-09-24 por el primer
   uso real ("no puedo interactuar"); cómo, en [ADR 0002](docs/adr/0002-fase-2-puente-nativo.md). App nativa que pinta el mundo detrás de
   los iconos (`WorkerW`), captura ventanas con `Windows.Graphics.Capture` y les reenvía ratón y
   teclado, más "modo office"/"modo escritorio" en el clic derecho. No empieza hasta que la
   fase 1 se haya usado de verdad (apuntado en `docs/evidencia.md`).

## Cambios de alcance

- **2026-09-24 · refresco de los grafos: entra.** Estaba fuera ("se regeneran con `npm run grafo`").
  El primer uso real preguntó "si levanto un grafo dentro, ¿se añade una isla?". Ahora: R en el
  mundo, solo al entrar y cuando aparece un repo en `dev/` (el puente corre `npm run grafo`), y el
  fondo relee `grafos.js` cada 2 min. Las islas se rehacen sin recargar: las pantallas siguen.

- **2026-09-24 · el grafo se consulta y gb se ve trabajar: entra.** "Abrir ficheros, consola de
  gb" estaba fuera. El uso real pidió la ficha de un nodo al hacer clic (como el mapa de gb), los
  agentes de gb encendiendo los nodos que tocan (`gb who --json`, vía el puente), abrir lo del
  escritorio (F), alternar gb / árbol de carpetas (T) y quitar el grafo de una pantalla (V).
  Sigue fuera editar código DESDE el grafo: se edita en la ventana real (Enter).

## Lo que NO entra

- **Escribir o hacer clic DENTRO de una pantalla flotante en la fase 1.** Un navegador captura
  una ventana pero no puede enviarle entrada. Es la razón de ser de la fase 2, no un parche aquí.
- **Recordar las pantallas entre sesiones.** Una captura de pantalla no sobrevive a recargar la
  página; guardar el sitio de algo que no se puede reabrir solo es mentir.
- **Motor de juego (Unity/Godot) ahora.** Three.js valida la experiencia en horas; el motor se
  decide en la fase 2 con lo aprendido.
- **Física, colisiones, avatares, multijugador.** Se vuela libre (noclip): nada de eso responde
  a la pregunta de la fase 1 (¿me gusta trabajar dentro de un mundo 3D?).

## Criterio de terminado

Fase 1 terminada = tipos limpios, tests verdes, mundo construido con al menos un repo real
dentro y todo cargable desde `file://`. Todo en un comando:

```gb:terminado
npm run terminado
```

Lo que el comando NO puede comprobar, y se comprueba a mano con una entrada en
`docs/evidencia.md`: moverse, agarrar una pantalla capturada y girar un grafo.
