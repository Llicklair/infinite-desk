# Registros de decision (ADR)

Un fichero por decision: `0001-titulo-corto.md`. Formato
[MADR](https://adr.github.io/): contexto, decision, consecuencias.

## Cuando se escribe uno

Solo si la decision cambia **arquitectura, operacion, postura de seguridad o coste de
mantenimiento a largo plazo**. Con ese disparador salen pocos y se leen; sin el salen
doscientos y no se lee ninguno, que es la forma elegante de no tener ninguno.

## Por que

Sin registro del porque, la arquitectura se vuelve folklore: el siguiente que llegue
—persona o agente— repite los mismos debates, reabre lo cerrado y a veces elimina la
restriccion que mantenia el sistema en pie. Eso ultimo es lo caro.
