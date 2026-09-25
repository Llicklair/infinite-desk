// npm run diagnostico: una foto del estado de Windows y de infinite-desk (tools/diagnostico.ps1)
// para cuando la barra de tareas o el buscador se quedan sordos. ANTES de reiniciar nada.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("npm run diagnostico is for Windows (the taskbar issue it looks into is Windows-only).");
  process.exit(0);
}
const script = join(dirname(fileURLToPath(import.meta.url)), "diagnostico.ps1");
execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: "inherit" });
