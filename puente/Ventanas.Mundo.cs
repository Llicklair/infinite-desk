// La ventana del mundo: se presenta, se minimiza con Esc (sin cerrarse), vuelve y se cierra.
namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    static bool MundoAbierto() => mundo != IntPtr.Zero && IsWindow(mundo) && !IsIconic(mundo);

    /// <summary>
    /// La página del mundo se presenta con un título único: esa ventana pasa a ser en capas con
    /// alfa 254 (a la vista, igual), y lo que hay debajo sigue vivo para Chromium (regla 2).
    /// </summary>
    public static bool Presentar(string titulo)
    {
        var h = FindWindow(null, titulo);
        if (h == IntPtr.Zero || DeWindows(h)) return false;
        lock (cerrojo) mundo = h;
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)(ex | WS_EX_LAYERED));
        SetLayeredWindowAttributes(h, 0, 254, 2 /*LWA_ALPHA*/);
        // Chromium recalcula qué está tapado con eventos de ventana, no al cambiar el estilo:
        // un movimiento de ida y vuelta lo despierta (medido: sin esto, siguen "hidden").
        GetWindowRect(h, out RECT r);
        SetWindowPos(h, IntPtr.Zero, r.Left + 1, r.Top, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        SetWindowPos(h, IntPtr.Zero, r.Left, r.Top, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        return true;
    }

    /// <summary>
    /// Esc dos veces: de vuelta al escritorio SIN cerrar el mundo (uso real: "sin querer le di a
    /// Escape dos veces y perdí lo que tenía abierto"). Se minimiza el mundo, y DESPUÉS las
    /// escondidas se minimizan de verdad (regla 4); en ese orden, o el vigilante de minimizados las
    /// volvería a esconder. Entrar desde el clic derecho restaura este mismo mundo (entrar.ps1).
    /// </summary>
    public static void AlEscritorio()
    {
        lock (cerrojo)
        {
            SalirSinCerrojo();
            if (!IsWindow(mundo)) return;
            ShowWindow(mundo, SW_MINIMIZE);
            foreach (var h in escondidas.ToArray()) Mostrar(h, minimizar: true);
            Registro.Anotar("mundo minimizado (Esc): sigue abierto, con sus pantallas");
        }
    }

    /// <summary>
    /// El mundo se cerró (la página se desconectó): lo escondido se minimiza de verdad, que es lo
    /// que se pidió al minimizarlo (regla 4). El mundo deja de contar ANTES de minimizar: si no,
    /// ese minimizado volvía a esconder la ventana (uso real: VS Code invisible tras cerrar).
    /// </summary>
    public static void MundoCerrado()
    {
        lock (cerrojo)
        {
            mundo = IntPtr.Zero;
            foreach (var h in escondidas.ToArray()) Mostrar(h, minimizar: true);
        }
    }

    /// <summary>
    /// Se activa una ventana. Si es el mundo que vuelve (restaurado tras Esc), las pantallas
    /// minimizadas mientras tanto se esconden vivas otra vez (regla 4).
    /// </summary>
    public static void AlActivar(IntPtr h)
    {
        lock (cerrojo)
        {
            if (h != mundo || !MundoAbierto()) return;
            capturadas.RemoveWhere(c => !IsWindow(c));
            foreach (var c in capturadas.Where(IsIconic))
            {
                Esconder(c);
                Registro.Anotar($"de vuelta al mundo: {c} \"{Titulo(c)}\" estaba minimizada, escondida viva");
            }
        }
    }
}
