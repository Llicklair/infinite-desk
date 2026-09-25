// Regenerar los grafos (`npm run grafo`) sin salir del mundo: con R, al arrancar el puente (es
// decir, al entrar) y cuando aparece un repo nuevo en dev/. Uno a la vez: si se pide otro
// mientras corre, se repite al acabar. SCOPE dejaba fuera el refresco en vivo; lo pidió el
// primer uso real ("si levanto un grafo dentro, ¿se añade una isla?").
using System.Diagnostics;

namespace InfiniteDesk.Puente;

sealed class Regenerador(string raiz, Func<object, Task> difundir, Action alTerminar)
{
    readonly object cerrojo = new();
    bool enCurso, pendiente;
    DateTime finPropio = DateTime.MinValue;
    FileSystemWatcher? vigia, usos;
    Timer? espera;
    long leidoUsos;

    /// <summary>Pide una regeneración; devuelve false si ya había una en marcha (se repetirá).</summary>
    public bool Pedir(string motivo)
    {
        lock (cerrojo)
        {
            if (enCurso) { pendiente = true; return false; }
            enCurso = true;
        }
        Console.WriteLine($"{DateTime.Now:HH:mm:ss} regenerando grafos: {motivo}");
        _ = Task.Run(() => Correr(motivo));
        return true;
    }

    async Task Correr(string motivo)
    {
        bool ok = false;
        string resumen;
        try
        {
            var psi = new ProcessStartInfo("cmd.exe", "/c npm run --silent grafo")
            {
                WorkingDirectory = raiz,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var p = Process.Start(psi)!;
            var salida = p.StandardOutput.ReadToEndAsync();
            var errores = p.StandardError.ReadToEndAsync();
            await p.WaitForExitAsync();
            ok = p.ExitCode == 0;
            // La última línea de exportar.mjs: "N islas -> ...", o el error.
            resumen = (await salida + await errores)
                .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .LastOrDefault() ?? "";
        }
        catch (Exception e) { resumen = e.Message; }

        await difundir(new { evento = "grafos", ok, motivo, resumen });
        if (ok) alTerminar();
        bool otra;
        lock (cerrojo) { enCurso = false; otra = pendiente; pendiente = false; finPropio = DateTime.Now; }
        if (otra) Pedir("pedida mientras regeneraba");
    }

    /// <summary>
    /// Un `.git` nuevo justo debajo de dev/ es un repo nuevo (git init, git clone). Se espera un
    /// poco: un clone sigue escribiendo, y varios eventos seguidos cuentan como uno.
    /// </summary>
    public void Vigilar()
    {
        var dev = Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(raiz))!;
        vigia = new FileSystemWatcher(dev)
        {
            IncludeSubdirectories = true, // el .git está un nivel más abajo
            NotifyFilter = NotifyFilters.DirectoryName,
            InternalBufferSize = 64 * 1024,
        };
        void QuizaRepoNuevo(string ruta)
        {
            if (Path.GetFileName(ruta) != ".git") return;
            var repo = Path.GetDirectoryName(ruta);
            if (repo == null || !string.Equals(Path.GetDirectoryName(repo), dev, StringComparison.OrdinalIgnoreCase)) return;
            lock (cerrojo)
            {
                espera?.Dispose();
                espera = new Timer(_ => Pedir($"repo nuevo: {Path.GetFileName(repo)}"), null, 5000, Timeout.Infinite);
            }
        }
        vigia.Created += (_, e) => QuizaRepoNuevo(e.FullPath);
        vigia.Renamed += (_, e) => QuizaRepoNuevo(e.FullPath);
        vigia.EnableRaisingEvents = true;
        VigilarUsosDeGb();
    }

    /// <summary>
    /// "Levanta el grafo aquí y que salga la isla": gb apunta cada orden en usos.jsonl (sin decir
    /// en qué repo). Un `graph` nuevo que no sea de nuestra propia regeneración la dispara.
    /// </summary>
    void VigilarUsosDeGb()
    {
        var casa = Environment.GetEnvironmentVariable("GB_HOME") is { Length: > 0 } g ? g
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".galaxy-brain");
        var fichero = Path.Combine(casa, "usos.jsonl");
        if (!Directory.Exists(casa)) return;
        leidoUsos = File.Exists(fichero) ? new FileInfo(fichero).Length : 0;
        usos = new FileSystemWatcher(casa, "usos.jsonl") { NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size };
        usos.Changed += (_, _) =>
        {
            string nuevo;
            try
            {
                using var f = new FileStream(fichero, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                if (f.Length < leidoUsos) leidoUsos = 0; // rotado
                f.Seek(leidoUsos, SeekOrigin.Begin);
                nuevo = new StreamReader(f).ReadToEnd();
                leidoUsos = f.Length;
            }
            catch { return; }
            if (!nuevo.Contains("\"cmd\": \"graph\"") && !nuevo.Contains("\"cmd\":\"graph\"")) return;
            lock (cerrojo)
            {
                // Los `gb graph` de nuestra propia regeneración (uno por repo) no cuentan, y los
                // hooks de gb (inicio de sesión, pre-commit) también lo lanzan: como mucho una
                // regeneración automática cada 2 minutos (cada una son ~50 s de CPU).
                if (enCurso || DateTime.Now - finPropio < TimeSpan.FromMinutes(2)) return;
                espera?.Dispose();
                espera = new Timer(_ => Pedir("se levantó un grafo con gb"), null, 3000, Timeout.Infinite);
            }
        };
        usos.EnableRaisingEvents = true;
    }
}
