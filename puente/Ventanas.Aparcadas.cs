// Aparcar fuera de los monitores las webs que abren los asistentes, mientras el mundo está abierto.
// Windows 10 pinta un recuadro amarillo alrededor de toda ventana capturada con WGC (la vista
// directa, Vista.cs), por encima de todo, también del mundo (uso real: "el recuadro amarillo aparece
// en el mundo a veces", 2026-09-27; en Windows 10 no se puede quitar, ver Ventanas.Escondidas.cs).
// Fuera de los monitores, el recuadro no se ve. Solo se puede con el Edge de las pantallas: con sus
// opciones (Ventanas.Web.cs) sigue pintando fuera (medido: 59,3 imágenes/s a la vista, 58,3 fuera);
// otro navegador deja de pintar (0,7) y su pantalla se congelaría. Al escribir en una (Enter) vuelve
// a su sitio detrás del mundo: la rueda necesita que esté en pantalla (RuedaConMundoAtravesable).
// Al minimizar el mundo o cerrarlo, todas vuelven. Se apunta en disco, como lo escondido (regla 6).
using System.Runtime.InteropServices;

namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    static readonly string ficheroAparcadas = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "aparcadas.txt");
    /// <summary>Las webs que abrió el puente en el Edge de las pantallas (las que se pueden aparcar).</summary>
    static readonly HashSet<IntPtr> webs = [];
    /// <summary>Las aparcadas ahora, con dónde estaban (arriba a la izquierda).</summary>
    static readonly Dictionary<IntPtr, (int x, int y)> aparcadas = [];

    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

    /// <summary>Una web del Edge de las pantallas: desde ahora se aparca mientras el mundo esté abierto.</summary>
    static void EsWeb(IntPtr h)
    {
        lock (cerrojo)
        {
            webs.RemoveWhere(w => !IsWindow(w));
            webs.Add(h);
            Aparcar(h);
        }
    }

    static void Aparcar(IntPtr h)
    {
        if (!webs.Contains(h) || aparcadas.ContainsKey(h) || h == objetivo || !MundoAbierto() || !IsWindow(h) || IsIconic(h)) return;
        GetWindowRect(h, out RECT r);
        // A la derecha de todos los monitores (el escritorio virtual entero), con margen.
        int fuera = GetSystemMetrics(76 /*SM_XVIRTUALSCREEN*/) + GetSystemMetrics(78 /*SM_CXVIRTUALSCREEN*/) + 200;
        aparcadas[h] = (r.Left, r.Top);
        SetWindowPos(h, IntPtr.Zero, fuera, r.Top, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        ApuntarAparcadas();
    }

    static void Desaparcar(IntPtr h)
    {
        if (!aparcadas.Remove(h, out var sitio)) return;
        if (IsWindow(h)) SetWindowPos(h, IntPtr.Zero, sitio.x, sitio.y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        ApuntarAparcadas();
    }

    /// <summary>
    /// Hace <paramref name="que"/> con la ventana en su sitio (si estaba aparcada) y la vuelve a
    /// aparcar después: empezar a capturarla fuera de los monitores falla (Vista.cs).
    /// </summary>
    public static void EnSuSitio(IntPtr h, Action que)
    {
        lock (cerrojo)
        {
            bool estaba = aparcadas.ContainsKey(h);
            if (estaba) Desaparcar(h);
            try { que(); }
            finally { if (estaba) Aparcar(h); }
        }
    }

    /// <summary>El mundo vuelve (o sigue): las webs, fuera otra vez. Con el cerrojo ya cogido.</summary>
    static void AparcarTodas()
    {
        webs.RemoveWhere(w => !IsWindow(w));
        foreach (var h in webs.ToArray()) Aparcar(h);
    }

    /// <summary>El mundo se minimiza o se cierra: todas a su sitio. Con el cerrojo ya cogido.</summary>
    static void DesaparcarTodas()
    {
        foreach (var h in aparcadas.Keys.ToArray()) Desaparcar(h);
    }

    static void ApuntarAparcadas()
    {
        try { File.WriteAllLines(ficheroAparcadas, aparcadas.Select(a => $"{a.Key.ToInt64()} {a.Value.x} {a.Value.y}")); }
        catch (IOException) { }
    }

    /// <summary>Al arrancar: lo que dejó aparcado un puente anterior que se cayó, a su sitio.</summary>
    public static void RescatarAparcadas()
    {
        try
        {
            if (!File.Exists(ficheroAparcadas)) return;
            foreach (var linea in File.ReadAllLines(ficheroAparcadas))
            {
                var p = linea.Split(' ');
                if (p.Length != 3 || !long.TryParse(p[0], out var n) || !int.TryParse(p[1], out var x) || !int.TryParse(p[2], out var y)) continue;
                if (!IsWindow((IntPtr)n)) continue;
                SetWindowPos((IntPtr)n, IntPtr.Zero, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
                Registro.Anotar($"rescatada {n} \"{Titulo((IntPtr)n)}\": aparcada fuera de los monitores por un puente anterior");
            }
            File.Delete(ficheroAparcadas);
        }
        catch (IOException) { }
    }
}
