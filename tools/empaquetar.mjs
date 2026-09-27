// npm run empaquetar: el zip para instalar infinite-desk en un Windows limpio, sin instalar nada
// más (uso real: "la instalación en una máquina limpia"; en el equipo de desarrollo no se pueden
// instalar programas de terceros, y en muchos de los que lo usen tampoco). Lleva:
//   - el mundo ya construido (wallpaper/, sin lo que es de cada máquina: grafos, noticias, marca…);
//   - el puente publicado autocontenido en un solo .exe (sin .NET instalado), en la misma ruta
//     que al compilarlo en el repo, para que fondo.mjs, entrar.ps1 y el propio puente lo encuentren;
//   - un Node portátil (el node.exe con el que se corre esto, con su licencia) en node\: el puente
//     corre con él las herramientas (grafos, noticias, la consola maestra, Kiri y Atlas);
//   - tools\ y src\ (las herramientas importan el núcleo puro), e Instalar.cmd, Desinstalar.cmd y Parar.cmd.
// Deja dist\infinite-desk-<versión>-win-x64.zip. No sube nada a ningún sitio.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("npm run empaquetar builds the Windows package: run it on Windows.");
  process.exit(1);
}
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
const dist = join(raiz, "dist");
const obra = join(dist, "infinite-desk");
const zip = join(dist, `infinite-desk-${version}-win-x64.zip`);
const TFM = "net10.0-windows10.0.19041.0";

/** @param {string} que @param {string} orden @param {string[]} args */
function paso(que, orden, args) {
  console.log(`- ${que}`);
  // npm es un .cmd: por cmd.exe, con los argumentos fijos de aquí.
  const [exe, todos] = orden === "npm" ? ["cmd.exe", ["/c", "npm", ...args]] : [orden, args];
  execFileSync(exe, todos, { cwd: raiz, stdio: ["ignore", "inherit", "inherit"] });
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(obra, { recursive: true });

paso("building the world", "npm", ["run", "build"]);
paso("publishing the bridge (self-contained, one .exe)", "dotnet", [
  "publish", "puente", "-c", "Release", "-r", "win-x64", "--self-contained", "true", "--nologo", "-v", "q",
  "-p:PublishSingleFile=true", "-p:IncludeNativeLibrariesForSelfExtract=true", "-p:EnableCompressionInSingleFile=true",
  "-p:DebugType=none", "-p:GenerateDocumentationFile=false",
  "-o", join(obra, "puente", "bin", "Release", TFM),
]);
// Lo que no hace falta para correr: la documentación XML de WebView2 y lo de IIS.
for (const f of readdirSync(join(obra, "puente", "bin", "Release", TFM))) {
  if (f.endsWith(".xml") || f === "web.config") rmSync(join(obra, "puente", "bin", "Release", TFM, f));
}

// Solo lo versionado o por versionar (git ls-files, sin lo ignorado): así no se cuela nada de esta
// máquina ni la marca (marca.js, ignorada hasta su visto bueno). Del mundo, además, lo construido.
console.log("- copying the world, the tools and the pure core");
const versionados = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "wallpaper", "tools", "src", "extensiones", "package.json", "LICENSE", "NOTICE", "README.md"], { cwd: raiz, encoding: "utf8" })
  .split("\n").filter(Boolean);
for (const f of [...versionados, "wallpaper/infinite-desk.js", "wallpaper/oido.js"]) {
  mkdirSync(dirname(join(obra, f)), { recursive: true });
  cpSync(join(raiz, f), join(obra, f));
}

console.log(`- portable Node ${process.version}`);
mkdirSync(join(obra, "node"));
cpSync(process.execPath, join(obra, "node", "node.exe"));
// Su licencia (con las de lo que lleva dentro) va con él. El instalador de Windows no la deja junto a
// node.exe: si no está, la de esta versión exacta, del repo de Node.
const licenciaNode = join(dirname(process.execPath), "LICENSE");
if (existsSync(licenciaNode)) cpSync(licenciaNode, join(obra, "node", "LICENSE"));
else {
  const r = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);
  if (!r.ok) { console.error(`  couldn't get Node's license (${r.status}): not packaging without it`); process.exit(1); }
  writeFileSync(join(obra, "node", "LICENSE"), await r.text());
}

// Los .cmd de la raíz: doble clic. Con el node del paquete, desde donde esté el .cmd.
const cmd = (/** @type {string} */ script, /** @type {string} */ que) => [
  "@echo off",
  `rem ${que}`,
  // Fuera de la carpeta del programa: Desinstalar.cmd la borra (y todas las rutas van enteras).
  'cd /d "%TEMP%"',
  `"%~dp0node\\node.exe" "%~dp0tools\\${script}" %*`,
  "echo.",
  "pause",
  "",
].join("\r\n");
writeFileSync(join(obra, "Instalar.cmd"), cmd("instalar.mjs", "Instala infinite-desk para este usuario (sin permisos de administrador) o lo actualiza."));
writeFileSync(join(obra, "Desinstalar.cmd"), cmd("desinstalar.mjs", "Quita infinite-desk: el fondo animado, Entrar, el acceso del menu Inicio y el programa."));
writeFileSync(join(obra, "Parar.cmd"), cmd("parar.mjs", "Para todo lo de infinite-desk y devuelve las ventanas escondidas (no desinstala nada)."));

// Última red: ni rastro de la marca en lo que se va a compartir. Qué buscar lo dice la propia marca
// de esta máquina (wallpaper/marca.js, ignorado): su nombre, palabra a palabra, y sus colores. Así
// ningún fichero versionado la nombra, tampoco este.
/** @type {RegExp | null} */
let MARCA = null;
try {
  const texto = readFileSync(join(raiz, "wallpaper", "marca.js"), "utf8");
  const { nombre, colores } = JSON.parse(texto.slice(texto.indexOf("=") + 1, texto.lastIndexOf(";")));
  // Los grises (blanco, negro…) no son de nadie: están en cualquier parte del código.
  const distintivos = colores.map((/** @type {string} */ c) => c.replace("#", "").toLowerCase()).filter((/** @type {string} */ c) => !/^(..)\1\1$/.test(c));
  const terminos = [...String(nombre).split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 4), ...distintivos];
  if (terminos.length) MARCA = new RegExp(terminos.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
} catch { /* sin marca en esta máquina: nada que se pueda colar */ }
if (MARCA) console.log("- checking the brand of this computer isn't in the package");
/** @param {string} dir */
function revisar(dir) {
  if (!MARCA) return;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, d.name);
    if (d.isDirectory()) { revisar(ruta); continue; }
    if (/\.(exe|dll|png|jpg|ico|glb|bin)$/i.test(d.name)) continue;
    if (MARCA.test(d.name) || MARCA.test(readFileSync(ruta, "latin1"))) {
      console.error(`  brand found in ${relative(obra, ruta)}: not packaging it`);
      process.exit(1);
    }
  }
}
revisar(obra);

console.log("- zipping");
// El tar de Windows (System32, desde Windows 10 1803) hace zip; el de Git Bash no.
execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-a", "-cf", zip, "-C", dist, "infinite-desk"], { stdio: "inherit" });
const mb = (/** @type {number} */ b) => `${(b / 1024 / 1024).toFixed(0)} MB`;
console.log(`\n${zip} (${mb(statSync(zip).size)})`);
console.log("To install on another computer: unzip it anywhere and double-click Instalar.cmd.");
