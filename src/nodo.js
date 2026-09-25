// La ficha de un nodo al hacer clic, como en el mapa de galaxy-brain: qué es, quién lo importa,
// a quién importa, si está en un ciclo y qué agentes lo están tocando. Todo sale del grafo
// exportado y de `gb who` (vía el puente): aquí no se calcula nada nuevo (ARCHITECTURE 2).

const MAX = 14; // más nombres que esto no se leen; se dice cuántos faltan

/**
 * @param {string} titulo
 * @param {string[]} nombres
 */
function lista(titulo, nombres) {
  if (!nombres.length) return null;
  const d = document.createElement("div");
  const h = document.createElement("h3");
  h.textContent = `${titulo} (${nombres.length})`;
  const ul = document.createElement("ul");
  for (const n of nombres.slice(0, MAX)) ul.append(Object.assign(document.createElement("li"), { textContent: n }));
  if (nombres.length > MAX) ul.append(Object.assign(document.createElement("li"), { textContent: `… y ${nombres.length - MAX} más`, className: "mas" }));
  d.append(h, ul);
  return d;
}

/**
 * Pinta la ficha del nodo `i` de `grafo` en `panel` y la enseña.
 * @param {HTMLElement} panel
 * @param {import("./grafo3d.js").GrafoExportado} grafo
 * @param {number} i
 * @param {import("./vinculo.js").Agente[]} agentes los de su repo ahora mismo (puede ir vacío)
 */
export function mostrarNodo(panel, grafo, i, agentes) {
  const n = grafo.nodos[i];
  const entran = grafo.aristas.filter((a) => a.destino === i).map((a) => grafo.nodos[a.origen].id);
  const salen = grafo.aristas.filter((a) => a.origen === i).map((a) => grafo.nodos[a.destino].id);

  const titulo = document.createElement("h2");
  titulo.textContent = n.id;
  const sub = document.createElement("p");
  sub.className = "sub";
  const partes = [grafo.nombre];
  if (grafo.fuente === "carpetas") partes.push(salen.length ? "carpeta" : "fichero", "árbol de carpetas (sin gb)");
  else partes.push(`grupo ${n.grupo}`, `lo importan ${n.fanIn}`, `importa ${n.fanOut}`);
  sub.textContent = partes.join(" · ");

  const bloques = [titulo, sub];
  if (n.enCiclo) bloques.push(Object.assign(document.createElement("p"), { className: "ciclo", textContent: "En un ciclo de imports" }));

  const tocan = agentes.filter((a) => (a.nodos ?? []).includes(n.id) || (a.commitados ?? []).includes(n.id));
  if (tocan.length) {
    const h = document.createElement("h3");
    h.textContent = tocan.length > 1 ? `Agentes (${tocan.length}) — cruce` : "Agente";
    const ul = document.createElement("ul");
    for (const a of tocan) {
      const vivo = (a.nodos ?? []).includes(n.id);
      const sims = (a.simbolos ?? []).filter((s) => s.startsWith(`${n.id}.`)).map((s) => s.slice(n.id.length + 1));
      const hace = a.hace_seg == null ? "" : ` · hace ${a.hace_seg < 90 ? `${a.hace_seg} s` : `${Math.round(a.hace_seg / 60)} min`}`;
      ul.append(Object.assign(document.createElement("li"), {
        textContent: `🤖 ${a.nombre}: ${vivo ? "lo está tocando" : "lo acaba de commitear"}${sims.length ? ` (${sims.join(", ")})` : ""}${hace}`,
      }));
    }
    const d = document.createElement("div");
    d.className = "agentes";
    d.append(h, ul);
    bloques.push(d);
  }

  if (grafo.fuente === "carpetas") {
    const hijos = lista("Contiene", salen.map((s) => s.slice(s.lastIndexOf("/") + 1)));
    if (hijos) bloques.push(hijos);
  } else {
    for (const b of [lista("Lo importan", entran), lista("Importa", salen)]) if (b) bloques.push(b);
  }
  bloques.push(Object.assign(document.createElement("p"), { className: "pie", textContent: "Clic en otro nodo o en el vacío para cerrar" }));
  panel.replaceChildren(...bloques);
  panel.hidden = false;
}
