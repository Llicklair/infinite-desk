// Los agentes de galaxy-brain sobre los nodos: quién está tocando qué ahora mismo. Lo sabe
// `gb who --json` (derivado de los worktrees de git: cambios sin commitear y commits recientes),
// y aquí solo se decide CUÁNDO preguntarlo: cuando cambia un fichero de un repo con gb (con un
// poco de espera, para no preguntar en mitad de un guardado); cuando un agente nace, escribe en su
// worktree o acaba (se vigilan la carpeta de los worktrees y la de sus fichas: están FUERA de la
// carpeta de proyectos); y, para los repos con agentes, cada 5 s (sus consolas, y que se apaguen
// solos al commitear o parar). Tres preguntas a la vez: gb who tarda de 1 a 13 s por repo (medido),
// y de una en una, con 19 agentes de ~40 s, muchos acababan antes de que llegara su turno y su isla
// no se encendía (uso real: "algunos no se han llegado a encender", 2026-09-27).
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace InfiniteDesk.Puente;

sealed class Agentes(string mundo, Func<object, Task> difundir)
{
    // Con agentes, cada 5 s: sus consolas se leen de disco (gb who) y tienen que verse moverse.
    const int ESPERA_MS = 3000, REPASO_MS = 5000, TODOS_MS = 120000;

    /// <summary>nombre del repo -> su raíz, solo los que tienen grafo de gb (de wallpaper/grafos.js).</summary>
    Dictionary<string, string> repos = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Lo último que se mandó de cada repo, para no repetir lo que no cambió.</summary>
    readonly ConcurrentDictionary<string, string> ultimo = new(StringComparer.OrdinalIgnoreCase);
    readonly ConcurrentDictionary<string, Timer> esperas = new(StringComparer.OrdinalIgnoreCase);
    readonly SemaphoreSlim turnos = new(3, 3);
    /// <summary>Los repos con una pregunta ya en camino por algo de sus agentes (no se pospone).</summary>
    readonly ConcurrentDictionary<string, byte> enCamino = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Los repos con una pregunta esperando turno (como mucho una cada uno).</summary>
    readonly ConcurrentDictionary<string, byte> esperandoTurno = new(StringComparer.OrdinalIgnoreCase);
    FileSystemWatcher? vigia, vigiaWorktrees, vigiaFichas;
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
        VigilarAgentes();
        EmpezarRepaso();
    }

    /// <summary>
    /// Los worktrees de los agentes y sus fichas (tools/agente.mjs, en %LOCALAPPDATA%\infinite-desk):
    /// ahí nace, trabaja y acaba cada uno, y el vigilante de la carpeta de proyectos no los ve.
    /// </summary>
    void VigilarAgentes()
    {
        var datos = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk");
        var worktrees = Path.Combine(datos, "worktrees");
        var fichas = Path.Combine(datos, "agentes");
        Directory.CreateDirectory(worktrees);
        Directory.CreateDirectory(fichas);
        // worktrees\<repo>\<agente>\…: el repo es el primer tramo. Su consola (<agente>.consola.log)
        // se escribe sin parar: sin posponer, o la pregunta no llegaría nunca.
        vigiaWorktrees = new FileSystemWatcher(worktrees)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName,
            InternalBufferSize = 64 * 1024,
        };
        void EnWorktree(string ruta)
        {
            if (ruta.Contains(@"\node_modules\")) return;
            var nombre = Path.GetRelativePath(worktrees, ruta).Split(Path.DirectorySeparatorChar)[0];
            if (repos.ContainsKey(nombre)) PreguntarSinPosponer(nombre, ESPERA_MS);
        }
        vigiaWorktrees.Changed += (_, e) => EnWorktree(e.FullPath);
        vigiaWorktrees.Created += (_, e) => EnWorktree(e.FullPath);
        vigiaWorktrees.Deleted += (_, e) => EnWorktree(e.FullPath);
        vigiaWorktrees.Renamed += (_, e) => EnWorktree(e.FullPath);
        vigiaWorktrees.EnableRaisingEvents = true;
        // Una ficha nueva (nace) o que cambia (acaba, se descarta, se integra): su repo, ya.
        vigiaFichas = new FileSystemWatcher(fichas, "*.json") { NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName };
        void EnFicha(string ruta)
        {
            for (int i = 0; i < 3; i++)
            {
                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(ruta));
                    var nombre = doc.RootElement.GetProperty("repo").GetString();
                    if (nombre != null && repos.ContainsKey(nombre)) PreguntarSinPosponer(nombre, 500);
                    return;
                }
                catch (IOException) { Thread.Sleep(100); } // aún se está escribiendo
                catch { return; } // a medio escribir o sin repo: la siguiente escritura avisará
            }
        }
        vigiaFichas.Changed += (_, e) => EnFicha(e.FullPath);
        vigiaFichas.Created += (_, e) => EnFicha(e.FullPath);
        vigiaFichas.EnableRaisingEvents = true;
    }

    /// <summary>Como Preguntar, pero si ya hay una en camino no la retrasa (lo que se escribe sin parar).</summary>
    void PreguntarSinPosponer(string nombre, int espera)
    {
        if (enCamino.TryAdd(nombre, 0)) Preguntar(nombre, espera);
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
        // Los que tienen un agente TRABAJANDO (tocando nodos) se repasan solos cada 5 s: un commit o
        // parar de trabajar los apaga. Los que solo tienen commits recientes, no: tras una tanda de 19
        // agentes eran todos, y la cola de gb who no se vaciaba nunca (medido: una isla tardaba 23 s en
        // encenderse, otra ni en 30). Y cada 2 min, todos, por si algo se escapó a los vigilantes: cada
        // 30 s, con 15 repos de 1 a 13 s cada uno, la cola casi no se vaciaba y lo que cambiaba
        // esperaba detrás (medido: ~29 s para encenderse).
        int vuelta = 0;
        repaso = new Timer(_ =>
        {
            bool todos = ++vuelta % (TODOS_MS / REPASO_MS) == 0;
            foreach (var nombre in repos.Keys)
                if (todos || (ultimo.TryGetValue(nombre, out var json) && Trabajando(json))) PreguntarSinPosponer(nombre, 0);
        }, null, REPASO_MS, REPASO_MS);
    }

    /// <summary>¿Hay en esta foto de gb who algún agente tocando nodos ahora (no solo commits)?</summary>
    static bool Trabajando(string json)
    {
        try { return JsonNode.Parse(json)?["agentes"]?.AsArray().Any(a => (a?["nodos"]?.AsArray().Count ?? 0) > 0) ?? false; }
        catch { return false; }
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
        // Una sola esperando turno por repo: si ya hay una, esta sobra (daría lo mismo).
        if (!esperandoTurno.TryAdd(nombre, 0)) return;
        await turnos.WaitAsync();
        esperandoTurno.TryRemove(nombre, out _);
        enCamino.TryRemove(nombre, out _); // desde aquí, lo que cambie merece otra pregunta
        try
        {
            // Donde lo encontró tools/gb.mjs: en una máquina limpia gb no suele estar en el PATH.
            var gb = Proyectos.Gb(Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(mundo)))!);
            var psi = new ProcessStartInfo(gb[0]) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var a in gb.Skip(1).Concat(["who", "--json", raiz])) psi.ArgumentList.Add(a);
            psi.Environment["PYTHONUTF8"] = "1";
            using var p = Hijos.Lanzar(psi, TimeSpan.FromMinutes(1), $"gb who {nombre}");
            // El error también se lee: si nadie lo vacía y gb escribe mucho, se queda bloqueado
            // escribiendo, y con él las preguntas siguientes (van de tres en tres).
            _ = p.StandardError.ReadToEndAsync();
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
        finally { turnos.Release(); }
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
