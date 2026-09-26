// Las noticias del palantír (`npm run noticias`): al arrancar el puente, es decir, al entrar, y
// luego cada 30 minutos. El mundo relee wallpaper/noticias.js por su cuenta cada 5, así que no hace
// falta avisarle. Una a la vez: si la anterior aún corre (X va despacio a propósito), se salta.
using System.Diagnostics;

namespace InfiniteDesk.Puente;

sealed class Noticias(string raiz)
{
    static readonly TimeSpan Cada = TimeSpan.FromMinutes(30);
    static Timer? reloj; // estático: un Timer sin referencias se lo lleva el recolector y deja de sonar
    int enCurso;

    public void Empezar() => reloj = new Timer(_ => _ = Correr(), null, TimeSpan.Zero, Cada);

    async Task Correr()
    {
        if (Interlocked.Exchange(ref enCurso, 1) == 1) return;
        try
        {
            var psi = new ProcessStartInfo("cmd.exe", "/c npm run --silent noticias")
            {
                WorkingDirectory = raiz,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var p = Hijos.Lanzar(psi, TimeSpan.FromMinutes(5), "noticias");
            var salida = p.StandardOutput.ReadToEndAsync();
            var errores = p.StandardError.ReadToEndAsync();
            await p.WaitForExitAsync();
            // La última línea: "12 titulares (…) de N publicaciones; M fuente(s) fallaron", o el error.
            var ultima = (await salida + await errores)
                .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .LastOrDefault() ?? "";
            Registro.Anotar($"noticias: {(p.ExitCode == 0 ? "" : "FALLÓ: ")}{ultima}");
        }
        catch (Exception e) { Registro.Anotar($"noticias: no se pudo correr npm ({e.Message})"); }
        finally { Interlocked.Exchange(ref enCurso, 0); }
    }
}
