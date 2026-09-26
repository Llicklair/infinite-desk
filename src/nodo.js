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
  if (nombres.length > MAX) ul.append(Object.assign(document.createElement("li"), { textContent: `… and ${nombres.length - MAX} more`, className: "mas" }));
  d.append(h, ul);
  return d;
}

/**
 * Pinta la ficha del nodo `i` de `grafo` en `panel` y la enseña.
 * @param {HTMLElement} panel
 * @param {import("./grafo3d.js").GrafoExportado} grafo
 * @param {number} i
 * @param {import("./vinculo.js").Agente[]} agentes los de su repo ahora mismo (puede ir vacío)
 * @param {import("./fallos.js").Fallo[]} [fallos] los de este módulo (gb list), los más recientes primero
 */
export function mostrarNodo(panel, grafo, i, agentes, fallos = []) {
  const n = grafo.nodos[i];
  const entran = grafo.aristas.filter((a) => a.destino === i).map((a) => grafo.nodos[a.origen].id);
  const salen = grafo.aristas.filter((a) => a.origen === i).map((a) => grafo.nodos[a.destino].id);

  const titulo = document.createElement("h2");
  titulo.textContent = n.id;
  const sub = document.createElement("p");
  sub.className = "sub";
  const partes = [grafo.nombre];
  if (grafo.fuente === "carpetas") partes.push(salen.length ? "folder" : "file", "folder tree (no gb)");
  else partes.push(`group ${n.grupo}`, `imported by ${n.fanIn}`, `imports ${n.fanOut}`);
  sub.textContent = partes.join(" · ");

  const bloques = [titulo, sub];
  if (n.enCiclo) bloques.push(Object.assign(document.createElement("p"), { className: "ciclo", textContent: "In an import cycle" }));

  const tocan = agentes.filter((a) => (a.nodos ?? []).includes(n.id) || (a.commitados ?? []).includes(n.id));
  if (tocan.length) {
    const h = document.createElement("h3");
    h.textContent = tocan.length > 1 ? `Agents (${tocan.length}) — overlap` : "Agent";
    const ul = document.createElement("ul");
    for (const a of tocan) {
      const vivo = (a.nodos ?? []).includes(n.id);
      const sims = (a.simbolos ?? []).filter((s) => s.startsWith(`${n.id}.`)).map((s) => s.slice(n.id.length + 1));
      const hace = a.hace_seg == null ? "" : ` · ${a.hace_seg < 90 ? `${a.hace_seg} s` : `${Math.round(a.hace_seg / 60)} min`} ago`;
      ul.append(Object.assign(document.createElement("li"), {
        textContent: `🤖 ${a.nombre}: ${vivo ? "editing it" : "just committed it"}${sims.length ? ` (${sims.join(", ")})` : ""}${hace}`,
      }));
    }
    const d = document.createElement("div");
    d.className = "agentes";
    d.append(h, ul);
    bloques.push(d);
  }

  const f = listaDeFallos(fallos);
  if (f) bloques.push(f);

  if (grafo.fuente === "carpetas") {
    const hijos = lista("Contains", salen.map((s) => s.slice(s.lastIndexOf("/") + 1)));
    if (hijos) bloques.push(hijos);
  } else {
    for (const b of [lista("Imported by", entran), lista("Imports", salen)]) if (b) bloques.push(b);
  }
  bloques.push(Object.assign(document.createElement("p"), { className: "pie", textContent: "Click another node, or empty space to close" }));
  panel.replaceChildren(...bloques);
  panel.hidden = false;
}

/**
 * La ficha de una isla (clic en su base): qué es el proyecto en corto (su README, resumido al
 * exportar), su tamaño, cuándo se tocó por última vez y qué agentes trabajan en él ahora.
 * @param {HTMLElement} panel
 * @param {import("./grafo3d.js").GrafoExportado} grafo
 * @param {import("./vinculo.js").Agente[]} agentes los de su repo ahora mismo
 * @param {import("./fallos.js").Fallo[]} [fallos] los de su repo (gb list), los más recientes primero
 */
export function mostrarIsla(panel, grafo, agentes, fallos = []) {
  const titulo = document.createElement("h2");
  titulo.textContent = grafo.nombre;
  const sub = document.createElement("p");
  sub.className = "sub";
  const partes = grafo.fuente === "carpetas"
    ? [`${grafo.nodos.length} folders and files`]
    : [`${grafo.nodos.length} modules`, `${grafo.aristas.length} imports`, ...(grafo.ciclos ? [`${grafo.ciclos} cycle${grafo.ciclos === 1 ? "" : "s"}`] : [])];
  if (grafo.ultimoCommit) {
    const dias = (Date.now() / 1000 - grafo.ultimoCommit) / 86400;
    partes.push(`last commit ${dias < 1 ? "today" : dias < 2 ? "yesterday" : `${Math.round(dias)} days ago`}`);
  }
  sub.textContent = partes.join(" · ");
  const resumen = document.createElement("p");
  resumen.className = grafo.resumen ? "resumen" : "resumen vacio";
  resumen.textContent = grafo.resumen ?? "No README to summarize.";
  const bloques = [titulo, sub, resumen];
  const trabajando = agentes.filter((a) => (a.nodos ?? []).length || (a.commitados ?? []).length);
  if (trabajando.length) {
    const d = lista("Agents working here", trabajando.map((a) => `🤖 ${a.nombre}`));
    if (d) bloques.push(d);
  }
  const f = listaDeFallos(fallos);
  if (f) bloques.push(f);
  bloques.push(Object.assign(document.createElement("p"), { className: "pie", textContent: "Enter: open it in VS Code · click empty space to close" }));
  panel.replaceChildren(...bloques);
  panel.hidden = false;
}

/**
 * Los fallos capturados por galaxy-brain, en rojo: qué, dónde y cuántas veces. El detalle y
 * "mandar un agente a arreglarlo", en la pestaña Errors de la consola maestra (O).
 * @param {import("./fallos.js").Fallo[]} fallos
 */
function listaDeFallos(fallos) {
  if (!fallos.length) return null;
  const d = lista(`Errors (${fallos.length})`, fallos.map((f) =>
    `⚠ ${f.tipo}: ${f.mensaje.slice(0, 80)}${f.fichero ? ` — ${f.fichero.split("/").pop()}${f.linea ? `:${f.linea}` : ""}` : ""} ×${f.veces}`));
  if (d) {
    d.className = "fallos";
    d.append(Object.assign(document.createElement("p"), { className: "pie", textContent: "Details and a fix-it agent: O → Errors" }));
  }
  return d;
}
