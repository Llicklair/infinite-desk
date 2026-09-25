// Lo que el puente hace con las ventanas, en Win32 a pelo. Cada decisión sale de una medida
// (docs/evidencia.md): el teclado solo llega a la ventana ACTIVA; el ratón, por mensajes, llega
// esté activa o no; y Chromium (Edge, Chrome, Discord, VS Code...) deja de pintar y congela los
// vídeos si cree que su ventana está tapada o fuera de la pantalla, SALVO que lo que la tapa sea
// una ventana "en capas" no del todo opaca. Por eso el mundo es en capas con alfa 254 y las
// ventanas se quedan en su sitio, debajo: nunca se aparcan fuera (eso las daba por ocultas).
using System.Runtime.InteropServices;
using System.Text;

namespace InfiniteDesk.Puente;

static class Ventanas
{
    const int GWL_EXSTYLE = -20;
    const long WS_EX_NOACTIVATE = 0x08000000, WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20;
    const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20;
    static readonly IntPtr HWND_TOPMOST = -1, HWND_NOTOPMOST = -2;
    const int SW_SHOWNOACTIVATE = 4;

    /// <summary>La ventana del mundo (Edge a pantalla completa), cuando la página se presenta.</summary>
    static IntPtr mundo;
    /// <summary>La ventana en la que se está escribiendo.</summary>
    static IntPtr objetivo;
    /// <summary>Las ventanas que son pantallas del mundo (la página pregunta su título al capturarlas).</summary>
    static readonly HashSet<IntPtr> capturadas = [];
    static readonly object cerrojo = new();

    public static bool Existe(IntPtr h) => IsWindow(h);

    public static string Titulo(IntPtr h)
    {
        var s = new StringBuilder(512);
        GetWindowText(h, s, s.Capacity);
        return s.ToString();
    }

    /// <summary>
    /// La página del mundo se presenta con un título único: esa ventana pasa a ser en capas con
    /// alfa 254 (a la vista, igual), y lo que hay debajo sigue vivo para Chromium.
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
    /// Entrar en una pantalla: el mundo se pone siempre-encima y deja de poder activarse con
    /// clics; la ventana real se activa en su sitio, DEBAJO del mundo: el teclado va a ella de
    /// verdad y, como el mundo es en capas, sigue viva (vídeos incluidos).
    /// </summary>
    public static string? Entrar(IntPtr h)
    {
        lock (cerrojo)
        {
            if (!IsWindow(h)) return "that window no longer exists";
            if (DeWindows(h)) return "that is a Windows window (taskbar, desktop): left alone";
            if (objetivo != IntPtr.Zero) SalirSinCerrojo();
            // Solo el mundo que se presentó por su título. Antes, si no, se tomaba la ventana de
            // delante: si era la barra de tareas, se la dejaba no activable y sin siempre-encima
            // (primer uso real: "me has roto la barra de tareas").
            if (mundo == IntPtr.Zero || !IsWindow(mundo)) return "the space hasn't connected to the bridge yet: wait a moment";
            if (mundo == h) return "that window is already in front: go back to the space and press Enter";
            if (IsIconic(h)) ShowWindow(h, SW_SHOWNOACTIVATE); // minimizada no se captura ni se pinta
            Mostrar(h, minimizar: false); // si estaba escondida, vuelve a ser una ventana normal

            SetWindowPos(mundo, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            PonerNoActivable(mundo, true);
            objetivo = h;
            if (!Activar(h))
            {
                SalirSinCerrojo();
                return "Windows wouldn't let the window be activated";
            }
            return null;
        }
    }

    public static void Salir() { lock (cerrojo) SalirSinCerrojo(); }

    public static void Capturada(IntPtr h, bool si)
    {
        lock (cerrojo)
        {
            capturadas.RemoveWhere(c => !IsWindow(c));
            if (si) capturadas.Add(h); else capturadas.Remove(h);
        }
    }

    /// <summary>
    /// Una ventana minimizada no se pinta: su pantalla se congela y el vídeo se para (uso real:
    /// "al minimizar deja de reproducirse el YouTube"). Deshacer el minimizado sin más tampoco
    /// valía ("no me deja minimizar las pestañas que estoy compartiendo"). Así que, con el mundo
    /// abierto, minimizar una pantalla la ESCONDE: sigue viva y pintándose, pero invisible,
    /// atravesable por el ratón, fuera de la barra de tareas y siempre encima (si algo opaco la
    /// tapara, Chromium la congelaría). Enter sobre ella la devuelve; cerrar el mundo la minimiza.
    /// </summary>
    public static void AlMinimizar(IntPtr h)
    {
        lock (cerrojo)
        {
            if (!capturadas.Contains(h)) return; // no es una pantalla: ni se apunta (se minimizan muchas)
            if (!MundoAbierto())
            {
                Registro.Anotar($"minimizada {h}: se deja, el mundo no está abierto");
                return;
            }
            if (objetivo == h) SalirSinCerrojo(); // se estaba escribiendo en ella: se vuelve al mundo
            Esconder(h);
            Registro.Anotar($"minimizada {h} \"{Titulo(h)}\": escondida, sigue viva");
        }
    }

    /// <summary>El estilo extendido de cada ventana escondida, para devolvérselo.</summary>
    static readonly Dictionary<IntPtr, long> escondidas = [];

    static void Esconder(IntPtr h)
    {
        if (!escondidas.ContainsKey(h)) escondidas[h] = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        ShowWindow(h, SW_SHOWNOACTIVATE);
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)(escondidas[h] | WS_EX_LAYERED | WS_EX_TRANSPARENT));
        SetLayeredWindowAttributes(h, 0, 0, 2 /*LWA_ALPHA*/);
        SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        Barra(b => b.DeleteTab(h));
    }

    /// <summary>La devuelve tal cual estaba. Con <paramref name="minimizar"/>, además la minimiza de verdad.</summary>
    static void Mostrar(IntPtr h, bool minimizar)
    {
        if (!escondidas.Remove(h, out long ex) || !IsWindow(h)) return;
        SetWindowPos(h, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)ex);
        if ((ex & WS_EX_LAYERED) != 0) SetLayeredWindowAttributes(h, 0, 255, 2);
        Barra(b => b.AddTab(h));
        if (minimizar) ShowWindow(h, 7 /*SW_SHOWMINNOACTIVE*/);
        Registro.Anotar($"{h} \"{Titulo(h)}\": {(minimizar ? "minimizada de verdad (se cerró el mundo)" : "visible otra vez")}");
    }

    /// <summary>El mundo se cerró: lo escondido se minimiza de verdad, que es lo que se pidió.</summary>
    public static void MundoCerrado()
    {
        lock (cerrojo)
        {
            // El mundo deja de contar como abierto ANTES de minimizar: si no, ese minimizado
            // volvía a esconder la ventana (uso real: VS Code invisible tras cerrar el mundo).
            mundo = IntPtr.Zero;
            foreach (var h in escondidas.Keys.ToArray()) Mostrar(h, minimizar: true);
        }
    }

    /// <summary>Al volver al mundo, las pantallas minimizadas con el mundo cerrado u oculto se esconden vivas.</summary>
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

    static bool MundoAbierto() => mundo != IntPtr.Zero && IsWindow(mundo) && !IsIconic(mundo);

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


    /// <summary>Ventanas del propio Windows que el puente no debe tocar nunca.</summary>
    static bool DeWindows(IntPtr h)
    {
        var c = new StringBuilder(128);
        GetClassName(h, c, c.Capacity);
        return c.ToString() is "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "Progman" or "WorkerW"
            or "Windows.UI.Core.CoreWindow" or "NotifyIconOverflowWindow" or "TopLevelWindowForOverflowXamlIsland";
    }

    static void SalirSinCerrojo()
    {
        if (objetivo == IntPtr.Zero) return;
        objetivo = IntPtr.Zero;
        if (!IsWindow(mundo)) return;
        PonerNoActivable(mundo, false);
        // Fuera de siempre-encima: si luego cambias de programa con Alt+Tab, que se vea.
        SetWindowPos(mundo, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        Activar(mundo);
    }

    /// <summary>
    /// Un evento de ratón sobre la pantalla 3D, en coordenadas 0..1 de la imagen capturada.
    /// La captura es el rectángulo VISIBLE de la ventana (sin los bordes invisibles de 7 px),
    /// así que se escala sobre ese y se pasa a coordenadas de cliente.
    /// </summary>
    public static void Raton(IntPtr h, string tipo, int boton, double u, double v, int botones, int delta)
    {
        if (!IsWindow(h)) return;
        if (DwmGetWindowAttribute(h, 9, out RECT r, Marshal.SizeOf<RECT>()) != 0) GetWindowRect(h, out r); // DWMWA_EXTENDED_FRAME_BOUNDS
        var p = new POINT { X = r.Left + (int)Math.Round(u * (r.Right - r.Left)), Y = r.Top + (int)Math.Round(v * (r.Bottom - r.Top)) };
        var enPantalla = p;
        ScreenToClient(h, ref p);
        var lp = (IntPtr)((p.Y << 16) | (p.X & 0xFFFF));
        var mk = (IntPtr)Teclas(botones);
        switch (tipo)
        {
            case "mover": PostMessage(h, 0x0200, mk, lp); break;
            case "bajar": PostMessage(h, boton == 2 ? 0x0204u : 0x0201u, mk, lp); break;
            case "doble": PostMessage(h, boton == 2 ? 0x0206u : 0x0203u, mk, lp); break;
            case "subir": PostMessage(h, boton == 2 ? 0x0205u : 0x0202u, mk, lp); break;
            case "rueda":
                // WM_MOUSEWHEEL lleva coordenadas de PANTALLA, no de cliente.
                var wp = (IntPtr)((delta << 16) | (Teclas(botones) & 0xFFFF));
                PostMessage(h, 0x020A, wp, (IntPtr)((enPantalla.Y << 16) | (enPantalla.X & 0xFFFF)));
                break;
        }
        // Un clic sobre el mundo puede reactivarlo aun siendo no activable (Chromium hace su
        // propio SetFocus): si pasa, el teclado vuelve a la ventana.
        if (tipo is "bajar" or "doble" && objetivo == h && GetForegroundWindow() != h) Activar(h);
    }

    /// <summary>MouseEvent.buttons (1 izq, 2 der, 4 medio) -> MK_LBUTTON/MK_RBUTTON/MK_MBUTTON.</summary>
    static int Teclas(int botones) => ((botones & 1) != 0 ? 0x1 : 0) | ((botones & 2) != 0 ? 0x2 : 0) | ((botones & 4) != 0 ? 0x10 : 0);

    static void PonerNoActivable(IntPtr h, bool si)
    {
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        ex = si ? ex | WS_EX_NOACTIVATE : ex & ~WS_EX_NOACTIVATE;
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)ex);
        SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, SWP_NOSIZE | 0x2 /*NOMOVE*/ | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }

    /// <summary>
    /// SetForegroundWindow solo funciona si quien llama tiene "la última entrada": una pulsación
    /// de F24 (ninguna app la usa; va a la ventana de delante, el mundo) se la da. Antes se
    /// enganchaba la cola de entrada del programa de delante (AttachThreadInput): cuando ese
    /// programa era el Explorador dejó la búsqueda de la barra de tareas sorda hasta reiniciarlo.
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

    // --- Win32 ------------------------------------------------------------------------------
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string? clase, string titulo);
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint clave, byte alfa, uint f);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr tras, int x, int y, int w, int alto, uint f);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int tam);
}
