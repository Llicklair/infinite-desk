// Los agentes de galaxy-brain sobre los nodos: quién está tocando qué ahora mismo. Lo sabe
// `gb who --json` (derivado de los worktrees de git: cambios sin commitear y commits recientes),
// y aquí solo se decide CUÁNDO preguntarlo: cuando cambia un fichero de un repo con gb (con un
// poco de espera, para no preguntar en mitad de un guardado) y, para los repos con agentes, cada
// 5 s (sus consolas, y que se apaguen solos al commitear o parar). Una pregunta a la vez.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace InfiniteDesk.Puente;

sealed class Agentes(string mundo, Func<object, Task> difundir)
{
    // Con agentes, cada 5 s: sus consolas se leen de disco (gb who) y tienen que verse moverse.
    const int ESPERA_MS = 3000, REPASO_MS = 5000;

    /// <summary>nombre del repo -> su raíz, solo los que tienen grafo de gb (de wallpaper/grafos.js).</summary>
    Dictionary<string, string> repos = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Lo último que se mandó de cada repo, para no repetir lo que no cambió.</summary>
    readonly ConcurrentDictionary<string, string> ultimo = new(StringComparer.OrdinalIgnoreCase);
    readonly ConcurrentDictionary<string, Timer> esperas = new(StringComparer.OrdinalIgnoreCase);
    readonly SemaphoreSlim uno = new(1, 1);
    FileSystemWatcher? vigia;
    Timer? repaso;

    /// <summary>Lo que hay ahora de cada repo con agentes: para una página que se acaba de conectar.</summary>
    public object[] Foto() => ultimo.Values.Select(v => (object)JsonNode.Parse(v)!).ToArray();

    /// <summary>Relee qué repos tienen gb (tras cada regeneración) y pregunta por todos una vez.</summary>
    public void Releer()
    {
        repos = LeerRepos();
        foreach (var nombre in repos.Keys) Preguntar(nombre, 0);
    }

    public void Empezar()
    {
        Releer();
        VigilarCarpeta();
        EmpezarRepaso();
    }

    /// <summary>Se eligió otra carpeta de proyectos (la P en el mundo): se vigila la nueva.</summary>
    public void Revigilar()
    {
        vigia?.Dispose();
        VigilarCarpeta();
    }

    void VigilarCarpeta()
    {
        var dev = Proyectos.Carpeta(Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(mundo)))!);
        vigia = new FileSystemWatcher(dev)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName,
            InternalBufferSize = 64 * 1024,
        };
        void Cambio(string ruta)
        {
            // Lo de git por dentro y las dependencias no son trabajo de un agente.
            if (ruta.Contains(@"\.git\") || ruta.Contains(@"\node_modules\") || ruta.Contains(@"\bin\") || ruta.Contains(@"\obj\")) return;
            var rel = Path.GetRelativePath(dev, ruta);
            var nombre = rel.Split(Path.DirectorySeparatorChar)[0];
            if (repos.ContainsKey(nombre)) Preguntar(nombre, ESPERA_MS);
        }
        vigia.Changed += (_, e) => Cambio(e.FullPath);
        vigia.Created += (_, e) => Cambio(e.FullPath);
        vigia.Deleted += (_, e) => Cambio(e.FullPath);
        vigia.Renamed += (_, e) => Cambio(e.FullPath);
        vigia.Error += (_, _) => { foreach (var n in repos.Keys) Preguntar(n, ESPERA_MS); }; // se desbordó: repaso entero
        vigia.EnableRaisingEvents = true;
    }

    void EmpezarRepaso()
    {
        // Los que tienen agentes se repasan solos: un commit o parar de trabajar los apaga.
        // Y cada 30 s, todos: un agente nace en un worktree FUERA del repo (git worktree add), y
        // eso no toca nada que vigile el FileSystemWatcher (uso real: agentes lanzados para probar).
        int vuelta = 0;
        repaso = new Timer(_ =>
        {
            bool todos = ++vuelta % (30000 / REPASO_MS) == 0;
            foreach (var nombre in repos.Keys)
                if (todos || (ultimo.TryGetValue(nombre, out var json) && !json.Contains("\"agentes\":[]"))) Preguntar(nombre, 0);
        }, null, REPASO_MS, REPASO_MS);
    }

    void Preguntar(string nombre, int espera)
    {
        esperas.AddOrUpdate(nombre,
            _ => new Timer(_ => _ = Correr(nombre), null, espera, Timeout.Infinite),
            (_, viejo) => { viejo.Change(espera, Timeout.Infinite); return viejo; });
    }

    async Task Correr(string nombre)
    {
        if (!repos.TryGetValue(nombre, out var raiz)) return;
        await uno.WaitAsync();
        try
        {
            var psi = new ProcessStartInfo("gb") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var a in new[] { "who", "--json", raiz }) psi.ArgumentList.Add(a);
            psi.Environment["PYTHONUTF8"] = "1";
            using var p = Process.Start(psi)!;
            var salida = await p.StandardOutput.ReadToEndAsync();
            await p.WaitForExitAsync();
            if (p.ExitCode != 0) return;
            var foto = JsonNode.Parse(salida.TrimStart('﻿'))!;
            // Al mundo le hace falta: quién, qué nodos (y símbolos), hace cuánto, y para su
            // terminal flotante lo que dice su consola y qué firmas cambió (como el mapa de gb).
            var agentes = new JsonArray((foto["agentes"]?.AsArray() ?? []).Select(a => (JsonNode)new JsonObject
            {
                ["nombre"] = a?["nombre"]?.GetValue<string>(),
                ["nodos"] = a?["nodos"]?.DeepClone(),
                ["simbolos"] = a?["simbolos"]?.DeepClone(),
                ["commitados"] = a?["commitados"]?.DeepClone(),
                ["hace_seg"] = a?["hace_seg"]?.DeepClone(),
                ["ficheros"] = a?["ficheros"]?.DeepClone(),
                ["vecinos"] = a?["vecinos"]?.DeepClone(),
                ["consola"] = a?["consola"]?.DeepClone(),
                ["cambios"] = a?["cambios"]?.DeepClone(),
            }).ToArray());
            var mensaje = new JsonObject { ["evento"] = "agentes", ["repo"] = nombre, ["agentes"] = agentes, ["cruces"] = foto["cruces"]?.DeepClone() };
            var texto = mensaje.ToJsonString();
            if (ultimo.TryGetValue(nombre, out var antes) && antes == texto) return;
            ultimo[nombre] = texto;
            await difundir(mensaje);
        }
        catch { /* gb no está o falló: sin agentes que enseñar */ }
        finally { uno.Release(); }
    }

    /// <summary>Los repos con grafo de gb, de lo que exportó `npm run grafo`.</summary>
    Dictionary<string, string> LeerRepos()
    {
        var r = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var texto = File.ReadAllText(Path.Combine(mundo, "grafos.js"));
            int i = texto.IndexOf('['), j = texto.LastIndexOf(']');
            foreach (var g in JsonDocument.Parse(texto[i..(j + 1)]).RootElement.EnumerateArray())
                if (g.TryGetProperty("fuente", out var f) && f.GetString() == "gb")
                    r[g.GetProperty("nombre").GetString()!] = g.GetProperty("raiz").GetString()!;
        }
        catch { }
        return r;
    }
}
