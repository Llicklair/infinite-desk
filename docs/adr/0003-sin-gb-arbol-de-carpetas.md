# 0003 — Sin galaxy-brain, la isla es el árbol de carpetas

- Estado: aceptado
- Fecha: 2026-09-24

## Contexto

La regla 2 decía que el grafo viene de gb y nunca se calcula aquí. Primer uso real: "¿qué
ocurre si un usuario no tiene galaxy-brain? No podrá ver los grafos; hay que poner otra
alternativa". Además, repos donde gb no ve módulos (sin código, o en lenguajes que no lee) se
quedaban sin isla.

## Decisión

Si gb no está instalado, falla, o ve menos de 2 módulos en un repo, `tools/exportar.mjs` hace su
isla con el **árbol de carpetas**: nodos = carpetas y ficheros (de `git ls-files`, o recorriendo
sin `node_modules`, `.git`, `dist`...), aristas = de cada carpeta a lo que contiene; con más de
700 nodos, solo carpetas. Es `desdeCarpetas` en `src/datos.js`, puro y con tests. El grafo lleva
`fuente: "carpetas"` y la isla lo dice ("N carpetas y ficheros · sin gb").

Se eligió frente a aproximar imports con expresiones regulares: eso es inventar dependencias
(y fallar en silencio en casos raros), justo lo que la regla 2 quería evitar. El árbol de
carpetas es un hecho, no una inferencia, y vale para cualquier repo.

## Consecuencias

- Quien no tenga gb tiene mundo; con gb, nada cambia en los repos que gb ve.
- Una isla de carpetas no tiene ciclos ni fan-in real: el rótulo del nodo dice "contiene N".
- La regla 2 pasa a: el grafo de dependencias viene de gb; sin gb, solo estructura.
