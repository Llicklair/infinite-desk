// npm run parar [-- --explorador]: para todo lo de infinite-desk y deja las ventanas como estaban
// (el mundo, el puente, lo que escondió y el fondo animado). Con --explorador, además reinicia el
// Explorador de Windows (barra de tareas o buscador sordos). La lógica, en tools/parar.ps1.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") {
  const script = join(dirname(fileURLToPath(import.meta.url)), "parar.ps1");
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script];
  if (process.argv.includes("--explorador")) args.push("-Explorador");
  execFileSync("powershell", args, { stdio: "inherit" });
} else {
  // macOS: aún no hay fondo animado ni ventanas escondidas; solo el puente, si lo hubiera.
  try { execFileSync("pkill", ["-f", "infinite-desk-bridge"], { stdio: "inherit" }); } catch { /* no había ninguno */ }
  console.log("done: nothing of infinite-desk running");
}
