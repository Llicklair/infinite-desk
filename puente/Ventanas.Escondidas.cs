// Minimizar una pantalla con el mundo abierto la ESCONDE (regla 4): una ventana minimizada no se
// pinta, su pantalla se congela y el vídeo se para (uso real: "al minimizar deja de reproducirse
// el YouTube"); y deshacer el minimizado sin más tampoco valía ("no me deja minimizar las pestañas
// que estoy compartiendo"). Escondida = viva y pintándose, pero invisible, atravesable por el
// ratón, fuera de la barra de tareas y siempre encima (si algo opaco la tapara, Chromium la
// congelaría). Se apunta en disco (regla 6).
using System.Runtime.InteropServices;

namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    static readonly string ficheroEscondidas = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "escondidas.txt");

    /// <summary>Se pregunta el título de una ventana al capturarla: desde ahí es una pantalla del mundo.</summary>
    public static void Capturada(IntPtr h, bool si)
    {
        lock (cerrojo)
        {
            capturadas.RemoveWhere(c => !IsWindow(c));
            if (si) capturadas.Add(h); else capturadas.Remove(h);
            if (si) Limpiar(h);
        }
    }

    /// <summary>
    /// Una pantalla que NO está escondida no puede tener las marcas de esconder: si las tiene, son
    /// restos (de un puente anterior, o del fallo de restaurar un estilo contaminado) y el ratón la
    /// atraviesa, así que no se deja ni minimizar (uso real: "se bloqueó la ventana del navegador, no
    /// puedo minimizarla"; tenía WS_EX_TRANSPARENT sin estar escondida). Solo pantallas del mundo:
    /// otros programas usan esas marcas a propósito (el overlay de NVIDIA).
    /// </summary>
    static void Limpiar(IntPtr h)
    {
        if (escondidas.Contains(h) || !IsWindow(h)) return;
        if ((GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64() & WS_EX_TRANSPARENT) == 0) return;
        Normal(h, minimizar: false);
        Registro.Anotar($"pantalla {h} \"{Titulo(h)}\" tenía 'atraviesa clics' sin estar escondida: limpiada");
    }

    /// <summary>Una ventana se minimiza. Si es una pantalla y el mundo está abierto, se esconde viva.</summary>
    public static void AlMinimizar(IntPtr h)
    {
        lock (cerrojo)
        {
            if (!capturadas.Contains(h)) return; // no es una pantalla: ni se apunta (se minimizan muchas)
            if (!MundoAbierto()) return;          // regla 4: sin mundo, minimizada de verdad
            if (objetivo == h) SalirSinCerrojo(); // se estaba escribiendo en ella: se vuelve al mundo
            Esconder(h);
            Registro.Anotar($"minimizada {h} \"{Titulo(h)}\": escondida, sigue viva");
        }
    }

    static void Esconder(IntPtr h)
    {
        escondidas.Add(h);
        Apuntar();
        ShowWindow(h, SW_SHOWNOACTIVATE);
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)(ex | WS_EX_LAYERED | WS_EX_TRANSPARENT));
        SetLayeredWindowAttributes(h, 0, 0, 2 /*LWA_ALPHA*/);
        SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        Barra(b => b.DeleteTab(h));
    }

    /// <summary>La devuelve a la normalidad; con <paramref name="minimizar"/>, además la minimiza de verdad.</summary>
    static void Mostrar(IntPtr h, bool minimizar)
    {
        if (!escondidas.Remove(h)) return;
        Apuntar();
        if (IsWindow(h)) Normal(h, minimizar);
        Registro.Anotar($"{h} \"{Titulo(h)}\": {(minimizar ? "minimizada de verdad" : "visible otra vez")}");
    }

    /// <summary>
    /// Se quita lo que pone Esconder. No se restaura un estilo "de antes" guardado: podía estar ya
    /// contaminado si el puente se reinició con ella escondida (uso real: una ventana se quedó
    /// "atraviesa clics" para siempre, "no puedo ni cerrarla ni nada").
    /// </summary>
    static void Normal(IntPtr h, bool minimizar)
    {
        SetWindowPos(h, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)(ex & ~WS_EX_TRANSPARENT));
        SetLayeredWindowAttributes(h, 0, 255, 2); // en capas con alfa 255 se ve y se usa igual
        Barra(b => b.AddTab(h));
        if (minimizar) ShowWindow(h, SW_SHOWMINNOACTIVE);
    }

    static void Apuntar()
    {
        try { File.WriteAllLines(ficheroEscondidas, escondidas.Select(h => h.ToInt64().ToString())); }
        catch (IOException) { }
    }

    /// <summary>
    /// Regla 6, al arrancar: lo que quedó escondido de un puente anterior vuelve a la normalidad,
    /// MINIMIZADO (lo que se pidió al minimizarlo): devuelto visible, saltaba delante al reiniciar el
    /// puente y había que minimizarlo otra vez. Si el mundo sigue abierto, al volver a él se esconde.
    /// </summary>
    public static void Rescatar()
    {
        try
        {
            if (!File.Exists(ficheroEscondidas)) return;
            foreach (var linea in File.ReadAllLines(ficheroEscondidas))
                if (long.TryParse(linea, out var n) && IsWindow((IntPtr)n))
                {
                    Normal((IntPtr)n, minimizar: true);
                    Registro.Anotar($"rescatada {n} \"{Titulo((IntPtr)n)}\": escondida por un puente anterior");
                }
            File.Delete(ficheroEscondidas);
        }
        catch (IOException) { }
    }

    /// <summary>ITaskbarList (COM, viene con Windows): quitar y poner el botón de una ventana en la barra.</summary>
    static void Barra(Action<ITaskbarList> que)
    {
        try
        {
            var b = (ITaskbarList)new TaskbarList();
            b.HrInit();
            que(b);
        }
        catch (Exception e) { Registro.Anotar($"barra de tareas: {e.Message}"); }
    }

    [ComImport, Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ITaskbarList { void HrInit(); void AddTab(IntPtr h); void DeleteTab(IntPtr h); void ActivateTab(IntPtr h); void SetActiveAlt(IntPtr h); }
    [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")] class TaskbarList { }
}
