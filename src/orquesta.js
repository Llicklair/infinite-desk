// La consola maestra (núcleo puro, probado en Node; lo usan tools/orquestador.mjs y el mundo): los
// proveedores de IA, el estado git de cada repo, los nombres de las ramas de los agentes, su consola
// y el uso. Un agente es un worktree de git (convención de galaxy-brain: `gb who` lo ve y su terminal
// es `<worktree>.consola.log`), en su propia rama, que nunca hace push: se revisa y se fusiona a mano.

/** @typedef {"claude" | "codex" | "gemini"} Proveedor */
/**
 * @typedef {{nombre: string, empresa: string, comando: string, instalar: string, entrar: string}} DatosProveedor
 *   `comando`: el ejecutable; `instalar` y `entrar`: qué hacer si falta o no hay sesión
 */

/** @type {Record<Proveedor, DatosProveedor>} */
export const PROVEEDORES = {
  claude: { nombre: "Claude Code", empresa: "Anthropic", comando: "claude", instalar: "npm i -g @anthropic-ai/claude-code", entrar: "claude (and /login)" },
  codex: { nombre: "Codex", empresa: "OpenAI", comando: "codex", instalar: "npm i -g @openai/codex", entrar: "codex login" },
  gemini: { nombre: "Gemini CLI", empresa: "Google DeepMind", comando: "gemini", instalar: "npm i -g @google/gemini-cli", entrar: "gemini (sign in with Google)" },
};

/** @param {unknown} p @returns {p is Proveedor} */
export const esProveedor = (p) => typeof p === "string" && Object.hasOwn(PROVEEDORES, p);

/**
 * @typedef {{rama: string, cambios: number, delante: number, detras: number, sinRemoto: boolean}} EstadoGit
 *   `cambios`: ficheros modificados, nuevos o borrados sin commitear; `delante`/`detras`: commits
 *   respecto a su rama remota (sin push / sin pull); `sinRemoto`: la rama no sigue a ninguna
 */

/**
 * El estado de un repo desde `git status --porcelain=v2 --branch`.
 * @param {string} salida
 * @returns {EstadoGit}
 */
export function estadoDeGit(salida) {
  let rama = "?";
  let delante = 0;
  let detras = 0;
  let sinRemoto = true;
  let cambios = 0;
  for (const linea of salida.split(/\r?\n/)) {
    if (linea.startsWith("# branch.head ")) rama = linea.slice(14).trim();
    else if (linea.startsWith("# branch.upstream ")) sinRemoto = false;
    else if (linea.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(linea);
      if (m) { delante = Number(m[1]); detras = Number(m[2]); }
    } else if (/^[12u?] /.test(linea)) cambios++;
  }
  return { rama, cambios, delante, detras, sinRemoto };
}

/**
 * El nombre de un agente (su rama es `agente/<nombre>` y su carpeta, `<nombre>`): la fecha y hora
 * y unas palabras de la tarea, en minúsculas y sin nada raro, para reconocerlo en `git branch`.
 * @param {string} tarea @param {Date} cuando
 */
export function nombreDeAgente(tarea, cuando) {
  const dos = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const fecha = `${cuando.getFullYear()}${dos(cuando.getMonth() + 1)}${dos(cuando.getDate())}-${dos(cuando.getHours())}${dos(cuando.getMinutes())}`;
  const palabras = tarea.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5).join("-");
  return `${fecha}-${(palabras || "tarea").slice(0, 40)}`;
}

/**
 * Una línea de la consola del agente a partir de un evento de `claude -p --output-format
 * stream-json`: lo que dice, las herramientas que usa ("> Edit src/x.js") y el final. null si el
 * evento no dice nada que merezca una línea.
 * @param {any} evento
 * @returns {string | null}
 */
export function lineaDeClaude(evento) {
  if (evento?.type === "assistant") {
    /** @type {any[]} */
    const partes = evento.message?.content ?? [];
    const lineas = partes.map((p) => {
      if (p.type === "text" && p.text?.trim()) return p.text.trim().split("\n")[0].slice(0, 160);
      if (p.type === "tool_use") {
        const i = p.input ?? {};
        const que = i.file_path ?? i.path ?? i.command ?? i.pattern ?? i.description ?? "";
        return `> ${p.name} ${String(que).split("\n")[0].slice(0, 120)}`.trimEnd();
      }
      return null;
    }).filter(Boolean);
    return lineas.length ? lineas.join("\n") : null;
  }
  if (evento?.type === "result") {
    const ok = evento.subtype === "success" && !evento.is_error;
    const texto = String(evento.result ?? "").trim().split("\n")[0].slice(0, 160);
    return `= ${ok ? "Done" : "Failed"}${texto ? `: ${texto}` : ""}`;
  }
  return null;
}

/**
 * @typedef {{id: string, repo: string, proveedor: Proveedor, tarea: string, rama: string, worktree: string,
 *   inicio: string, fin?: string, estado: "trabajando" | "hecho" | "fallo" | "descartado", cambios?: number, commit?: boolean, pid?: number}} Agente
 *   `cambios`: ficheros que tocó; `commit`: si se pudieron commitear en su rama (el hook del repo
 *   puede no dejar: entonces se quedan en el worktree)
 */

/**
 * El uso por proveedor, lo único que se puede contar sin que los proveedores lo digan (el cupo de
 * una suscripción no se puede consultar por programa): cuántos agentes trabajan ahora, cuántos se
 * lanzaron hoy y cuántos minutos de agente van hoy.
 * @param {Agente[]} agentes @param {Date} ahora
 * @returns {Record<Proveedor, {trabajando: number, hoy: number, minutosHoy: number}>}
 */
export function usoPorProveedor(agentes, ahora) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  /** @type {Record<Proveedor, {trabajando: number, hoy: number, minutosHoy: number}>} */
  const r = { claude: { trabajando: 0, hoy: 0, minutosHoy: 0 }, codex: { trabajando: 0, hoy: 0, minutosHoy: 0 }, gemini: { trabajando: 0, hoy: 0, minutosHoy: 0 } };
  for (const a of agentes) {
    const u = r[a.proveedor];
    if (!u) continue;
    if (a.estado === "trabajando") u.trabajando++;
    const inicio = Date.parse(a.inicio);
    if (inicio < hoy) continue;
    u.hoy++;
    const fin = a.fin ? Date.parse(a.fin) : ahora.getTime();
    u.minutosHoy += Math.max(0, Math.round((fin - inicio) / 60000));
  }
  return r;
}
