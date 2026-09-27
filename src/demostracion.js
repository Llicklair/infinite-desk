// Datos de mentira para comprobar el mundo sin manos (`?vista=demo&maestra`): el estado de la
// consola maestra y la revisión de un agente.

/**
 * La revisión de un agente de mentira (`?vista=demo&maestra=agentes`, Review): para verla sin manos.
 * @param {string[]} repos
 */
export function revisionDeDemostracion(repos) {
  return {
    id: "b", repo: repos[1] ?? "repo", rama: "agente/20260926-1150-add-a-readme-section", tarea: "Add a README section about the architecture",
    estado: "hecho", enRama: "main", limpio: true, commits: ["3f2a91c docs: architecture section in the README"],
    stat: " README.md | 14 ++++++++++++--\n 1 file changed, 12 insertions(+), 2 deletions(-)",
    diff: ["diff --git a/README.md b/README.md", "--- a/README.md", "+++ b/README.md", "@@ -40,6 +40,16 @@ How to run it",
      " npm run terminado", "-## Notes", "-Work in progress.", "+## Architecture", "+", "+A pure core (tested in Node), the 3D world (Three.js) and a native bridge (C#).",
      "+The bridge captures windows with WGC and talks to the world over a local WebSocket."].join("\n"),
    consola: "Reading README.md…\nWriting the architecture section…\nCommitted: docs: architecture section in the README",
  };
}

/**
 * Un estado de mentira para `?vista=demo&maestra`: las islas como repos, con cambios y agentes
 * inventados (capturas sin manos, sin puente).
 * @param {string[]} repos
 * @returns {import("./maestra.js").EstadoMaestra}
 */
export function estadoDeDemostracion(repos) {
  const ahora = Date.now();
  return {
    carpeta: "C:/dev",
    cuentas: {
      claude: { instalado: true, sesion: true, cuenta: "you@example.com", plan: "max" },
      codex: { instalado: true, sesion: false, detalle: "Not logged in" },
      gemini: { instalado: false, sesion: false, detalle: "not installed" },
      github: { instalado: true, sesion: true, cuenta: "you" },
    },
    repos: repos.map((nombre, i) => ({ nombre, rama: i % 7 === 3 ? "feature/x" : "main", cambios: i % 4 === 0 ? i + 1 : 0, delante: i % 5 === 1 ? 2 : 0, detras: i % 6 === 2 ? 1 : 0, sinRemoto: i % 9 === 8, ultimoCommit: Math.round(ahora / 1000 - i * 36000) })),
    agentes: [
      { id: "a", repo: repos[0] ?? "repo", proveedor: "claude", tarea: "Update the dependencies and make the tests pass", rama: "agente/20260926-1210-update-the-dependencies", worktree: "", inicio: new Date(ahora - 4 * 60000).toISOString(), estado: "trabajando" },
      { id: "b", repo: repos[1] ?? "repo", proveedor: "claude", tarea: "Add a README section about the architecture", rama: "agente/20260926-1150-add-a-readme-section", worktree: "", inicio: new Date(ahora - 30 * 60000).toISOString(), fin: new Date(ahora - 22 * 60000).toISOString(), estado: "hecho", cambios: 2, commit: true },
    ],
    uso: { claude: { trabajando: 1, hoy: 2, minutosHoy: 12 }, codex: { trabajando: 0, hoy: 0, minutosHoy: 0 }, gemini: { trabajando: 0, hoy: 0, minutosHoy: 0 } },
    galaxyBrain: { instalado: false, python: "3.11", avisoPython: "Python 3.11: repos using Python 3.12+ syntax may not parse", local: null },
    actividad: [
      { ts: new Date(ahora - 4 * 60000).toISOString(), tipo: "agente", repo: repos[0] ?? "repo", texto: "Claude Code: Update the dependencies and make the tests pass", ref: "a" },
      { ts: new Date(ahora - 22 * 60000).toISOString(), tipo: "agente-hecho", repo: repos[1] ?? "repo", texto: "Claude Code finished: 2 file(s) committed on agente/20260926-1150-add-a-readme-section", ref: "b" },
      { ts: new Date(ahora - 60 * 60000).toISOString(), tipo: "fallo", repo: repos.includes("galaxy-brain") ? "galaxy-brain" : repos[0] ?? "repo", texto: "NameError: name 're' is not defined (cli.py:2489)", ref: "d1" },
      { ts: new Date(ahora - 3 * 3600000).toISOString(), tipo: "commit", repo: repos[2] ?? "repo", texto: "Marcos: feat: something new" },
      { ts: new Date(ahora - 30 * 3600000).toISOString(), tipo: "pull", repo: repos[3] ?? "repo", texto: "Fast-forward 3 files changed" },
    ],
    fallos: [
      { id: "d1", repo: repos.includes("galaxy-brain") ? "galaxy-brain" : repos[0] ?? "repo", tipo: "NameError", mensaje: "name 're' is not defined", fichero: "src/galaxybrain/cli.py", linea: 2489, veces: 20, ultimo: new Date(ahora - 3600000).toISOString(), primero: new Date(ahora - 5 * 86400000).toISOString() },
      { id: "d2", repo: repos[0] ?? "repo", tipo: "OSError", mensaje: "[Errno 22] Invalid argument", fichero: null, linea: null, veces: 38, ultimo: new Date(ahora - 7200000).toISOString(), primero: new Date(ahora - 20 * 86400000).toISOString() },
      // Uno de cada: su fichero cambió después (quizás arreglado) y otro marcado a mano.
      { id: "d3", repo: repos[0] ?? "repo", tipo: "KeyError", mensaje: "'config'", fichero: "src/ajustes.py", linea: 42, veces: 3, ultimo: new Date(ahora - 86400000).toISOString(), primero: new Date(ahora - 2 * 86400000).toISOString(), tocado: new Date(ahora - 3 * 3600000).toISOString(), estado: "quizas" },
      { id: "d4", repo: repos[0] ?? "repo", tipo: "TypeError", mensaje: "'NoneType' object is not iterable", fichero: "src/lista.py", linea: 7, veces: 1, ultimo: new Date(ahora - 2 * 86400000).toISOString(), primero: new Date(ahora - 2 * 86400000).toISOString(), estado: "arreglado" },
    ],
  };
}
