// Los procesos que lanza el puente (gb who, el orquestador, las noticias, la regeneración de
// grafos) y la salud del propio puente. Uso real: "cuando salgo y entro a los mundos quedan
// subprocesos y dejan el ordenador entero colgado" (dos reinicios, 2026-09-26). Así, ninguno vive
// más de lo que debe (se mata con sus hijos: node lanza git, gb lanza python) y el registro dice
// cada minuto cuántos hay y cuánto pesa el puente: si vuelve a pasar, queda escrito qué crecía.
using System.Collections.Concurrent;
using System.Diagnostics;

namespace InfiniteDesk.Puente;

static class Hijos
{
    static readonly ConcurrentDictionary<int, (Process p, string que)> vivos = new();
    static Timer? salud;

    /// <summary>
    /// Lanza <paramref name="psi"/> y lo apunta; si a los <paramref name="max"/> sigue vivo, lo mata
    /// con todo lo que haya lanzado (quien lo espera ve que acabó, con código de error).
    /// </summary>
    public static Process Lanzar(ProcessStartInfo psi, TimeSpan max, string que)
    {
        var p = Process.Start(psi)!;
        vivos[p.Id] = (p, que);
        var limite = new Timer(_ =>
        {
            try
            {
                if (p.HasExited) return;
                p.Kill(entireProcessTree: true);
                Registro.Anotar($"{que}: más de {max.TotalMinutes:0.#} min, matado con sus hijos");
            }
            catch (Exception) { /* ya acabó, o no se deja */ }
        }, null, max, Timeout.InfiniteTimeSpan);
        p.EnableRaisingEvents = true;
        p.Exited += (_, _) => { limite.Dispose(); vivos.TryRemove(p.Id, out _); };
        if (p.HasExited) { limite.Dispose(); vivos.TryRemove(p.Id, out _); } // acabó antes de engancharse
        return p;
    }

    /// <summary>Cada minuto, una línea en el registro: hilos, handles, memoria, hijos y vistas.</summary>
    public static void VigilarSalud(Func<int> vistas) => salud = new Timer(_ =>
    {
        try
        {
            using var yo = Process.GetCurrentProcess();
            var hijos = vivos.Values.Where(v => { try { return !v.p.HasExited; } catch { return false; } }).Select(v => v.que).ToList();
            Registro.Anotar($"salud: {yo.Threads.Count} hilos, {yo.HandleCount} handles, {yo.PrivateMemorySize64 / 1048576} MB, " +
                $"{vistas()} vista(s) directa(s), {hijos.Count} hijo(s){(hijos.Count > 0 ? $" ({string.Join(", ", hijos)})" : "")}");
        }
        catch (Exception) { /* la salud nunca tumba el puente */ }
    }, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
}
