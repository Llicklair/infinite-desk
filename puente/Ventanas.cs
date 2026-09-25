// Lo que el puente hace con las ventanas, en Win32 a pelo. Cada decisión sale de una medida o de
// un uso real (docs/evidencia.md). Repartido por asuntos (static partial class):
//
//   Ventanas.cs            los estados y sus reglas (esto), y lo común
//   Ventanas.Mundo.cs      la ventana del mundo: presentarse, minimizarse (Esc), cerrarse
//   Ventanas.Escribir.cs   escribir en una pantalla: entrar, salir, el ratón, diálogos, el vigilante
//   Ventanas.Escondidas.cs minimizar una pantalla con el mundo abierto la esconde viva
//   Ventanas.Nuevas.cs     que lo recién abierto (F, Enter en una isla) y lo minimizado lleguen a N
//   Ventanas.Win32.cs      las llamadas a Windows
//
// ESTADOS
//   Mundo:    cerrado (no hay ventana) · abierto · minimizado (Esc dos veces: sigue vivo).
//   Pantalla: normal · escondida (minimizada con el mundo abierto) · objetivo (en ella se escribe).
//
// REGLAS (si una se rompe, algo del uso real vuelve a fallar)
//   1. El teclado solo llega a la ventana ACTIVA; el ratón, por mensajes, llega esté activa o no.
//   2. Chromium deja de pintar lo que cree tapado, salvo si lo tapa una ventana en capas no opaca:
//      el mundo es en capas con alfa 254 y las pantallas se quedan en su sitio, debajo.
//   3. El objetivo está activo pero DETRÁS del mundo (Edge no deja que el mundo sea siempre-encima:
//      se lo quita cada 200 ms). Excepción: con un diálogo suyo abierto no se mueve (se lo llevaría).
//   4. Solo hay escondidas con el mundo abierto. Al minimizar o cerrar el mundo, se minimizan de
//      verdad; al volver al mundo, las pantallas minimizadas se esconden otra vez.
//   5. Nunca se tocan ventanas del propio Windows (barra de tareas, escritorio): DeWindows.
//   6. Lo escondido se apunta en disco: si el puente se cae, al arrancar se devuelve (Rescatar).
using System.Text;

namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    const int GWL_EXSTYLE = -20;
    const long WS_EX_NOACTIVATE = 0x08000000, WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80;
    const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_NOOWNERZORDER = 0x200;
    static readonly IntPtr HWND_TOPMOST = -1, HWND_NOTOPMOST = -2;
    const int SW_SHOWNOACTIVATE = 4, SW_MINIMIZE = 6, SW_SHOWMINNOACTIVE = 7;

    /// <summary>Todo el estado se toca con este cerrojo: lo llaman el servidor, los eventos de Windows y los temporizadores.</summary>
    static readonly object cerrojo = new();

    /// <summary>La ventana del mundo (Edge a pantalla completa), cuando la página se presenta.</summary>
    static IntPtr mundo;
    /// <summary>La ventana en la que se está escribiendo (regla 3).</summary>
    static IntPtr objetivo;
    /// <summary>Las ventanas que son pantallas del mundo (la página pregunta su título al capturarlas).</summary>
    static readonly HashSet<IntPtr> capturadas = [];
    /// <summary>Las escondidas ahora mismo (regla 4).</summary>
    static readonly HashSet<IntPtr> escondidas = [];

    public static bool Existe(IntPtr h) => IsWindow(h);

    public static string Titulo(IntPtr h)
    {
        var s = new StringBuilder(512);
        GetWindowText(h, s, s.Capacity);
        return s.ToString();
    }

    static string Clase(IntPtr h)
    {
        var c = new StringBuilder(128);
        GetClassName(h, c, c.Capacity);
        return c.ToString();
    }

    static uint Proceso(IntPtr h)
    {
        GetWindowThreadProcessId(h, out uint pid);
        return pid;
    }

    /// <summary>Regla 5: ventanas del propio Windows que el puente no debe tocar nunca.</summary>
    static bool DeWindows(IntPtr h) =>
        Clase(h) is "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "Progman" or "WorkerW"
            or "Windows.UI.Core.CoreWindow" or "NotifyIconOverflowWindow" or "TopLevelWindowForOverflowXamlIsland";

    /// <summary>Coloca una ventana justo detrás del mundo en el apilado, sin activarla.</summary>
    static void DetrasDelMundo(IntPtr h) =>
        SetWindowPos(h, mundo, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);

    /// <summary>
    /// SetForegroundWindow solo funciona si quien llama tiene "la última entrada": una pulsación
    /// de F24 (ninguna app la usa; va a la ventana de delante) se la da. Antes se enganchaba la cola
    /// de entrada del programa de delante (AttachThreadInput): cuando ese programa era el Explorador
    /// dejó la búsqueda de la barra de tareas sorda hasta reiniciarlo.
    /// </summary>
    static bool Activar(IntPtr h)
    {
        if (GetForegroundWindow() == h) return true;
        keybd_event(0x87, 0, 0, UIntPtr.Zero);
        keybd_event(0x87, 0, 2, UIntPtr.Zero);
        SetForegroundWindow(h);
        if (GetForegroundWindow() == h) return true;
        Thread.Sleep(50); // a veces la pulsación tarda en contar
        SetForegroundWindow(h);
        return GetForegroundWindow() == h;
    }
}
