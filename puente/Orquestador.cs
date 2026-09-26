// La consola maestra, desde el puente: corre `node tools/orquestador.mjs <orden> ...` y devuelve su
// JSON. Solo las órdenes de la lista (la página no ejecuta lo que quiera) y sin shell: los
// argumentos van tal cual a node, así que una tarea con comillas o símbolos no se cuela como otra
// cosa (y la tarea llega en base64 de todos modos). En segundo plano: un pull en masa tarda.
using System.Diagnostics;
using System.Text.Json;

namespace InfiniteDesk.Puente;

static class Orquestador
{
    public static readonly HashSet<string> Ordenes = ["estado", "accion", "lanzar", "descartar", "abrir", "traza", "instalarGb", "arreglado", "reabrir"];

    public static async Task<(bool ok, JsonElement? datos, string? error)> Correr(string raiz, string[] args)
    {
        if (args.Length == 0 || !Ordenes.Contains(args[0])) return (false, null, "unknown order");
        var psi = new ProcessStartInfo("node")
        {
            WorkingDirectory = raiz,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add(Path.Combine(raiz, "tools", "orquestador.mjs"));
        foreach (var a in args) psi.ArgumentList.Add(a);
        try
        {
            // Instalar galaxy-brain con pip puede tardar más que lo demás. Pasado el tiempo se mata
            // con sus hijos (antes solo se dejaba de esperar: node y sus git seguían vivos).
            var max = TimeSpan.FromMinutes(args[0] == "instalarGb" ? 12 : 3);
            using var p = Hijos.Lanzar(psi, max, $"orquestador {args[0]}");
            var salida = p.StandardOutput.ReadToEndAsync();
            _ = p.StandardError.ReadToEndAsync();
            await p.WaitForExitAsync();
            if (p.ExitCode != 0 && string.IsNullOrWhiteSpace(await salida)) return (false, null, $"took more than {max.TotalMinutes:0} minutes, or failed");
            var ultima = (await salida).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).LastOrDefault() ?? "";
            using var doc = JsonDocument.Parse(ultima);
            var raizJson = doc.RootElement;
            bool ok = raizJson.TryGetProperty("ok", out var o) && o.GetBoolean();
            string? error = raizJson.TryGetProperty("error", out var e) ? e.GetString() : null;
            JsonElement? datos = raizJson.TryGetProperty("r", out var r) ? r.Clone() : null;
            return (ok, datos, error);
        }
        catch (Exception e) { return (false, null, e.Message); }
    }
}
