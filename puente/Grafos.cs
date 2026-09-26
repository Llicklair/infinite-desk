// Regenerar los grafos (`npm run grafo`) sin salir del mundo: con R, al arrancar el puente (es
// decir, al entrar) y cuando aparece un repo nuevo en la carpeta de proyectos. Uno a la vez: si se pide otro
// mientras corre, se repite al acabar. SCOPE dejaba fuera el refresco en vivo; lo pidió el
// primer uso real ("si levanto un grafo dentro, ¿se añade una isla?").
using System.Diagnostics;

namespace InfiniteDesk.Puente;

sealed class Regenerador(string raiz, Func<object, Task> difundir, Action alTerminar)
{
    readonly object cerrojo = new();
    bool enCurso, pendiente;
    // Lo pedido mientras corría otra: null = todas; si no, esos repos (R sobre una isla, "Rebuild maps").
    HashSet<string>? pendientes;
    bool pendienteTodo;
    DateTime finPropio = DateTime.MinValue;
    FileSystemWatcher? vigia, usos;
    Timer? espera;
    long leidoUsos;

    /// <summary>
    /// Pide una regeneración: de todas las islas, o solo de estos repos (por nombre, de la carpeta de
    /// proyectos: lo que no esté en ella se ignora). Devuelve false si ya había una en marcha (se
    /// repetirá al acabar, con lo pedido mientras tanto).
    /// </summary>
    public bool Pedir(string motivo, IEnumerable<string>? repos = null)
    {
        var validos = repos == null ? null : Validos(repos);
        if (validos is { Count: 0 }) return false;
        lock (cerrojo)
        {
            if (enCurso)
            {
                pendiente = true;
                if (validos == null) pendienteTodo = true;
                else (pendientes ??= []).UnionWith(validos);
                return false;
            }
            enCurso = true;
        }
        Console.WriteLine($"{DateTime.Now:HH:mm:ss} regenerando grafos: {motivo}{(validos == null ? "" : $" ({string.Join(", ", validos)})")}");
        _ = Task.Run(() => Correr(motivo, validos));
        return true;
    }

    /// <summary>Solo nombres de carpetas que están de verdad en la carpeta de proyectos (nada de rutas).</summary>
    HashSet<string> Validos(IEnumerable<string> repos)
    {
        var dev = Proyectos.Carpeta(raiz);
        return repos.Where(n => !string.IsNullOrWhiteSpace(n) && n.IndexOfAny(['/', '\\', ':']) < 0 && n != ".." && n != "."
            && Directory.Exists(Path.Combine(dev, n))).ToHashSet();
    }

    async Task Correr(string motivo, HashSet<string>? repos)
    {
        bool ok = false;
        string resumen;
        try
        {
            // node directo (sin cmd): los nombres de repo van tal cual como argumentos, sin que un
            // nombre raro pueda colarse como otra orden.
            var psi = new ProcessStartInfo("node")
            {
                WorkingDirectory = raiz,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add(Path.Combine(raiz, "tools", "exportar.mjs"));
            foreach (var r in repos ?? []) psi.ArgumentList.Add(r);
            using var p = Hijos.Lanzar(psi, TimeSpan.FromMinutes(15), "grafos");
            var errores = p.StandardError.ReadToEndAsync();
            // Línea a línea: cada isla que acaba ("  isla   nombre: …" o "  salto  nombre: …") se
            // avisa al momento, y la pestaña Maps de la consola maestra la va marcando.
            var ultima = "";
            while (await p.StandardOutput.ReadLineAsync() is { } linea)
            {
                var l = linea.Trim();
                if (l.Length > 0) ultima = l;
                var m = System.Text.RegularExpressions.Regex.Match(l, @"^(isla|salto)\s+(.+?): (.*)$");
                if (m.Success) await difundir(new { evento = "isla", repo = m.Groups[2].Value, ok = m.Groups[1].Value == "isla", texto = m.Groups[3].Value });
            }
            await p.WaitForExitAsync();
            ok = p.ExitCode == 0;
            // La última línea de exportar.mjs: "N islas -> ...", o el error.
            resumen = (await errores).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).LastOrDefault() is { } error && !ok ? error : ultima;
        }
        catch (Exception e) { resumen = e.Message; }

        await difundir(new { evento = "grafos", ok, motivo, resumen });
        if (ok) alTerminar();
        bool otra;
        HashSet<string>? siguientes;
        lock (cerrojo)
        {
            enCurso = false; otra = pendiente; pendiente = false; finPropio = DateTime.Now;
            siguientes = pendienteTodo ? null : pendientes;
            pendientes = null; pendienteTodo = false;
        }
        if (otra) Pedir("pedida mientras regeneraba", siguientes);
    }

    /// <summary>
    /// Un `.git` nuevo justo debajo de la carpeta de proyectos es un repo nuevo (git init, git clone). Se espera un
    /// poco: un clone sigue escribiendo, y varios eventos seguidos cuentan como uno.
    /// </summary>
    /// <summary>Se eligió otra carpeta de proyectos (la P en el mundo): se vigila la nueva.</summary>
    public void Revigilar()
    {
        vigia?.Dispose();
        usos?.Dispose();
        Vigilar();
    }

    public void Vigilar()
    {
        var dev = Proyectos.Carpeta(raiz);
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
