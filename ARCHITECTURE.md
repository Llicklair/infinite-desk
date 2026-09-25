# mirador — la ley de diseño

Reglas **numeradas**, y lo de numeradas no es cosmético: una regla con número se cita
en una revisión ("esto viola la 3") y una cita decide.

1. **El núcleo no conoce Three.js.** `src/datos.js`, `src/disposicion.js`, `src/islas.js` y
   `src/vinculo.js` son funciones puras: entran JSON y texto, salen números y nombres. Así se
   prueban con `node --test` sin navegador. Gateado en `.gb-boundaries`.
2. **Las dependencias vienen de gb, nunca se calculan aquí.** mirador no parsea código ni
   infiere imports: consume `gb graph --json`. Si falta un dato, se pide a gb. Sin gb (o si gb
   no ve módulos), la isla es el árbol de carpetas, que es estructura, no dependencias, y lo
   dice ([ADR 0003](docs/adr/0003-sin-gb-arbol-de-carpetas.md)).
3. **El fondo funciona abriendo `index.html` desde disco.** Nada de `type="module"` ni `fetch`
   de ficheros locales (Chromium los bloquea en `file://`, y Lively carga así). Todo va en un
   bundle clásico más `grafo.js` con `window.GB_GRAFO`.
4. **La disposición es determinista.** Mismo grafo → mismas posiciones. Un fondo que se
   recoloca en cada arranque desorienta; y lo determinista se puede testear.
5. **Sin red en tiempo de ejecución.** Three.js va en el bundle, no por CDN: el mundo arranca
   con el equipo sin conexión.
6. **Una pantalla se engancha a un repo por un hecho, no por adivinar.** El título de la
   ventana (`repoDeTitulo`, que da el puente: Edge solo da su HWND) o lo último que abriste con Enter; si ninguno aplica, queda sin
   grafo y lo eliges tú con G. Nunca se engancha "el más parecido".

## Cómo se cambia esto

Una regla se cambia o retira con un ADR en `docs/adr/` que diga qué hecho lo motiva.
