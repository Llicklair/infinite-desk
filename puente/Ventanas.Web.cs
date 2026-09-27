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
    /// <param name="extensiones">las extensiones del Edge de las pantallas (extensiones/ del repo:
    /// saltar los anuncios de YouTube que lo permiten); solo cuentan si ese Edge no estaba ya abierto</param>
    public static async Task<(IntPtr hwnd, string titulo, string? error)> AbrirWeb(string? url, string extensiones)
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
            // Un solo --disable-features: Chromium solo hace caso al último. El segundo, para las
            // extensiones de abajo (Chrome dejó de cargar --load-extension en 2025 si no se apaga;
            // Edge 154 aún las carga sin eso, medido, pero por si lo sigue).
            "--disable-features=CalculateNativeWinOcclusion,DisableLoadExtensionCommandLineSwitch", "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
            "--autoplay-policy=no-user-gesture-required", "--window-size=1280,760", $"--app={uri.AbsoluteUri}" })
            psi.ArgumentList.Add(a);
        // Las del repo, sin empaquetar (uso real: "que se dé al botón de saltar si el anuncio lo
        // permite"). Solo si este Edge arranca ahora: si ya estaba abierto, la ventana nueva es suya.
        var cargar = Directory.Exists(extensiones)
            ? string.Join(",", Directory.GetDirectories(extensiones).Where(d => File.Exists(Path.Combine(d, "manifest.json"))))
            : "";
        if (cargar != "") psi.ArgumentList.Add($"--load-extension={cargar}");
        try { Process.Start(psi); }
        catch (Exception e) { return (IntPtr.Zero, "", e.Message); }

        var nueva = await EsperarNueva(antes, "msedge", 12000);
        if (nueva == IntPtr.Zero) return (IntPtr.Zero, "", "the window didn't show up");
        await Task.Delay(400);
        AtrasYMundoDelante(nueva);
        var titulo = Titulo(nueva);
        EsWeb(nueva); // fuera de los monitores mientras el mundo esté abierto: sin recuadro amarillo encima
        return (nueva, titulo, null);
    }

    /// <summary>
    /// Un repo en VS Code como pantalla del mundo (Atlas: "ábreme el repo"): VS Code lo abre en una
    /// ventana nueva (o trae la que ya lo tiene), se encuentra esa ventana y se deja detrás del mundo,
    /// viva, para verla y trabajar en ella con Enter. Antes se abría fuera y había que traerla con N.
    /// </summary>
    public static async Task<(IntPtr hwnd, string titulo, string? error)> AbrirRepoComoPantalla(string? ruta, string dev)
    {
        var antes = DePrimerNivel();
        var nombre = Path.GetFileName(Path.TrimEndingDirectorySeparator(ruta ?? ""));
        // Si ya está abierto, VS Code trae esa misma ventana: se sabe antes y no se espera a una nueva.
        var yaAbierta = BuscarPorTitulo("Code", $" - {nombre} - ");
        var error = Escritorio.AbrirRepo(ruta, dev);
        if (error != null) return (IntPtr.Zero, "", error);
        var h = yaAbierta != IntPtr.Zero ? yaAbierta : await EsperarNueva(antes, "Code", 12000);
        // Ya estaba abierto: VS Code trae esa ventana en vez de abrir otra; se busca por su título.
        if (h == IntPtr.Zero) h = BuscarPorTitulo("Code", $" - {nombre} - ");
        if (h == IntPtr.Zero) h = BuscarPorTitulo("Code", nombre);
        if (h == IntPtr.Zero) return (IntPtr.Zero, "", "VS Code's window didn't show up");
        // VS Code a veces se minimiza él solo al nacer (Ventanas.Nuevas.cs): se le da un momento.
        await Task.Delay(1200);
        AtrasYMundoDelante(h);
        return (h, Titulo(h), null);
    }

    /// <summary>
    /// Las ventanas de aplicación abiertas (visibles o minimizadas, con título, sin dueña, que no son
    /// del mundo ni de Windows): su HWND, su título y su programa.
    /// </summary>
    public static object[] DeAplicacion()
    {
        var lista = new List<object>();
        EnumWindows((h, _) =>
        {
            if (h == mundo || DeWindows(h) || (!IsWindowVisible(h) && !IsIconic(h)) || GetWindowTextLength(h) == 0 || GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) return true;
            if (Titulo(h).StartsWith("infinite-desk ·")) return true; // el mundo, el oído: nuestras
            string proceso;
            try { proceso = Process.GetProcessById((int)Proceso(h)).ProcessName; } catch { return true; }
            lista.Add(new { hwnd = (long)h, titulo = Titulo(h), proceso });
            return true;
        }, IntPtr.Zero);
        return lista.ToArray();
    }

    /// <summary>Una ventana que vuelve a ser pantalla (el espacio guardado): viva, detrás del mundo.</summary>
    public static void Traer(IntPtr h) { if (IsWindow(h)) AtrasYMundoDelante(h); }

    /// <summary>La primera ventana de aplicación nueva (no estaba en <paramref name="antes"/>) del proceso dado, o nada.</summary>
    static async Task<IntPtr> EsperarNueva(HashSet<IntPtr> antes, string proceso, int ms)
    {
        for (int t = 0; t < ms; t += 150)
        {
            await Task.Delay(150);
            var nueva = IntPtr.Zero;
            EnumWindows((h, _) =>
            {
                if (antes.Contains(h) || !EsDeApp(h, proceso)) return true;
                nueva = h;
                return false;
            }, IntPtr.Zero);
            if (nueva != IntPtr.Zero) return nueva;
        }
        return IntPtr.Zero;
    }

    /// <summary>Una ventana de aplicación del proceso cuyo título contiene el texto, o nada.</summary>
    static IntPtr BuscarPorTitulo(string proceso, string contiene)
    {
        var hallada = IntPtr.Zero;
        EnumWindows((h, _) =>
        {
            if (!EsDeApp(h, proceso) || !Titulo(h).Contains(contiene, StringComparison.OrdinalIgnoreCase)) return true;
            hallada = h;
            return false;
        }, IntPtr.Zero);
        return hallada;
    }

    /// <summary>¿Ventana principal (visible, con título, sin dueña) de una app Chromium/Electron de ese proceso?</summary>
    static bool EsDeApp(IntPtr h, string proceso)
    {
        if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0 || GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) return false;
        var clase = new StringBuilder(64);
        GetClassName(h, clase, 64);
        if (clase.ToString() != "Chrome_WidgetWin_1") return false;
        try { return Process.GetProcessById((int)Proceso(h)).ProcessName.Equals(proceso, StringComparison.OrdinalIgnoreCase); } catch { return false; }
    }

    /// <summary>
    /// Detrás de todo, y a la vista (minimizada no se captura), sin activarla; y el mundo, delante.
    /// </summary>
    static void AtrasYMundoDelante(IntPtr h)
    {
        if (IsIconic(h)) ShowWindow(h, 4 /*SW_SHOWNOACTIVATE*/);
        lock (cerrojo)
        {
            if (!MundoAbierto()) { SetWindowPos(h, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE); return; }
            Activar(mundo);
            DetrasDelMundo(h);
        }
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
