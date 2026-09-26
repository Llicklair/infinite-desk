// Una web que abre un asistente (Kiri, Atlas) como pantalla del mundo, SIN el selector de N (uso
// real: "me saltó el modal de N; los asistentes deberían poder abrirlo directamente"). Se abre en
// un Edge propio (perfil aparte, en modo app) que no deja de pintar aunque esté tapado (uso real:
// "las ventanas no muestran el contenido en tiempo real, se paran"), se encuentra su ventana, se
// deja detrás del mundo y el mundo vuelve delante. La imagen la manda el puente (Vista.cs), no Chromium.
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    static readonly IntPtr HWND_BOTTOM = new(1);

    /// <summary>
    /// Abre <paramref name="url"/> (solo http/https) en el Edge de las pantallas y devuelve su
    /// ventana y su título, o el error. Tarda lo que tarde en aparecer (como mucho ~12 s).
    /// </summary>
    public static async Task<(IntPtr hwnd, string titulo, string? error)> AbrirWeb(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            return (IntPtr.Zero, "", "only web links (http, https) can be opened");
        var edge = new[] { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles }
            .Select(f => Path.Combine(Environment.GetFolderPath(f), "Microsoft", "Edge", "Application", "msedge.exe"))
            .FirstOrDefault(File.Exists);
        if (edge == null) return (IntPtr.Zero, "", "Microsoft Edge not found");
        var perfil = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "edge-pantallas");
        var antes = DePrimerNivel();
        var psi = new ProcessStartInfo(edge) { UseShellExecute = false };
        foreach (var a in new[] {
            $"--user-data-dir={perfil}", "--no-first-run", "--no-default-browser-check", "--new-window",
            // Que no deje de pintar tapado ni en segundo plano: la pantalla se ve en vivo.
            "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
            "--autoplay-policy=no-user-gesture-required", "--window-size=1280,760", $"--app={uri.AbsoluteUri}" })
            psi.ArgumentList.Add(a);
        try { Process.Start(psi); }
        catch (Exception e) { return (IntPtr.Zero, "", e.Message); }

        for (int i = 0; i < 80; i++)
        {
            await Task.Delay(150);
            var nueva = IntPtr.Zero;
            EnumWindows((h, _) =>
            {
                if (antes.Contains(h) || !IsWindowVisible(h) || GetWindowTextLength(h) == 0 || GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) return true;
                var clase = new StringBuilder(64);
                GetClassName(h, clase, 64);
                if (clase.ToString() != "Chrome_WidgetWin_1") return true;
                try { if (Process.GetProcessById((int)Proceso(h)).ProcessName != "msedge") return true; } catch { return true; }
                nueva = h;
                return false;
            }, IntPtr.Zero);
            if (nueva == IntPtr.Zero) continue;
            // Detrás de todo (no minimizada: minimizada no se captura) y el mundo, delante otra vez.
            await Task.Delay(400);
            SetWindowPos(nueva, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
            lock (cerrojo) { if (MundoAbierto()) Activar(mundo); }
            return (nueva, Titulo(nueva), null);
        }
        return (IntPtr.Zero, "", "the window didn't show up");
    }

    /// <summary>
    /// Que la ventana pinte un fotograma nuevo (WGC no manda nada mientras no cambia): un píxel más
    /// de ancho y de vuelta, sin activarla.
    /// </summary>
    public static void Despertar(IntPtr h)
    {
        if (!GetWindowRect(h, out RECT r)) return;
        int w = r.Right - r.Left, alto = r.Bottom - r.Top;
        SetWindowPos(h, IntPtr.Zero, 0, 0, w + 1, alto, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        SetWindowPos(h, IntPtr.Zero, 0, 0, w, alto, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
}
