// El mundo como fondo animado de Windows, detrás de los iconos, sin Lively (ADR 0004): lo que
// Lively hacía, a mano. `infinite-desk-bridge --fondo` abre wallpaper/fondo.html en Chrome con
// perfil propio y mete su ventana en la WorkerW del escritorio: la ventana que Windows pinta
// entre el fondo y los iconos. Vigila y lo rehace si Chrome o el Explorador se reinician.
// Un Chrome por monitor, cada uno a su tamaño y escala: con monitores a escalas distintas, una
// sola ventana que los cruzara se pintaba a una escala y salía borrosa o descentrada (medido el
// 2026-09-25). Cada página sabe su monitor por ?monitor=N (para la pausa, en fondo-estado.js).
// `--fondo --parar` lo cierra desde otro proceso y deja el fondo de Windows de antes.
// Detrás de los iconos no llega el ratón: un hook de bajo nivel se lo pasa al Chrome del monitor
// cuando el cursor está sobre el escritorio vacío (el botón derecho no: es el menú del escritorio).
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

namespace InfiniteDesk.Puente;

static class Fondo
{
    const string UNICO = @"Local\infinite-desk-fondo", PARAR = @"Local\infinite-desk-fondo-parar";

    /// <summary>Un monitor y el Chrome que le pinta el fondo.</summary>
    sealed class Pantalla(int indice, RECT monitor, RECT trabajo, double escala)
    {
        public readonly int Indice = indice;
        public readonly RECT Monitor = monitor, Trabajo = trabajo;
        public readonly double Escala = escala;
        public Process? Proceso;
        public IntPtr Ventana;
        public volatile IntPtr Lienzo;
    }

    /// <summary>Lo que lee el hook del ratón (otro hilo): se sustituye entero, nunca se modifica.</summary>
    static volatile Pantalla[] pantallas = [];

    /// <summary>Avisa al fondo en marcha (si hay) de que se cierre.</summary>
    public static int Parar()
    {
        if (EventWaitHandle.TryOpenExisting(PARAR, out var e)) e.Set();
        return 0;
    }

    public static int Correr(string mundo)
    {
        using var unico = new Mutex(true, UNICO, out bool primero);
        if (!primero) { Console.Error.WriteLine("infinite-desk fondo: ya hay uno en marcha"); return 0; }
        using var alto = new EventWaitHandle(false, EventResetMode.ManualReset, PARAR);

        var chrome = Navegador();
        if (chrome == null) { Console.Error.WriteLine("infinite-desk fondo: no encuentro Chrome ni Edge"); return 1; }
        var perfil = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "chrome-fondo");
        var url = new Uri(Path.Combine(mundo, "fondo.html")).AbsoluteUri;
        ficheroEstado = Path.Combine(mundo, "fondo-estado.js");

        string firma = "";
        int vueltas = 0;
        EscucharRaton();
        try
        {
            do
            {
                // Se enchufa o desenchufa un monitor, o cambia su escala: se rehace todo.
                var monitores = Monitores();
                var nueva = string.Join(";", monitores.Select(m =>
                    $"{m.Monitor.Left},{m.Monitor.Top},{m.Monitor.Right},{m.Monitor.Bottom}@{m.Escala.ToString(CultureInfo.InvariantCulture)}"));
                if (nueva != firma)
                {
                    foreach (var p in pantallas) Cerrar(p);
                    pantallas = monitores;
                    firma = nueva;
                    tapados = null;
                }
                bool encajar = --vueltas <= 0;
                if (encajar) vueltas = 4; // cada 2 s basta
                bool listas = true;
                foreach (var p in pantallas)
                {
                    if (p.Proceso == null || p.Proceso.HasExited)
                    {
                        p.Proceso = Lanzar(chrome, $"{perfil}-{p.Indice}", $"{url}?monitor={p.Indice}", p.Escala);
                        p.Ventana = IntPtr.Zero;
                    }
                    if (p.Ventana == IntPtr.Zero || !IsWindow(p.Ventana)) p.Ventana = VentanaDe(p.Proceso.Id);
                    if (p.Ventana == IntPtr.Zero) { listas = false; continue; }
                    if (encajar || GetParent(p.Ventana) != WorkerW()) Encajar(p);
                    p.Lienzo = Lienzo(p.Ventana);
                }
                Pausar(pantallas.Select(Tapado).ToArray());
                if (!listas) vueltas = 0; // una recién lanzada: se encaja en cuanto aparezca
            } while (!alto.WaitOne(vueltas == 0 ? 250 : 500));
        }
        finally
        {
            foreach (var p in pantallas) Cerrar(p);
            try { File.Delete(ficheroEstado); } catch (IOException) { }
            RepintarFondo();
        }
        return 0;
    }

    /// <summary>Los monitores, el principal primero, en píxeles físicos (el puente es PerMonitorV2).</summary>
    static Pantalla[] Monitores()
    {
        var lista = new List<(RECT monitor, RECT trabajo, double escala, bool principal)>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (m, _, _, _) =>
        {
            var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            GetMonitorInfo(m, ref info);
            double escala = GetDpiForMonitor(m, 0 /*MDT_EFFECTIVE_DPI*/, out uint ppp, out _) == 0 ? ppp / 96.0 : 1;
            lista.Add((info.rcMonitor, info.rcWork, escala, (info.dwFlags & 1 /*MONITORINFOF_PRIMARY*/) != 0));
            return true;
        }, IntPtr.Zero);
        return lista.OrderByDescending(m => m.principal).ThenBy(m => m.monitor.Left)
            .Select((m, i) => new Pantalla(i, m.monitor, m.trabajo, m.escala)).ToArray();
    }

    static Process Lanzar(string chrome, string perfil, string url, double escala)
    {
        var psi = new ProcessStartInfo(chrome);
        foreach (var a in new[]
        {
            $"--user-data-dir={perfil}", "--no-first-run", "--no-default-browser-check",
            // Kiosco: sin la barra de título que Chrome se pinta él mismo (quitar el marco de la
            // ventana no la quita). A la escala del monitor, o se ve borroso al 200 %.
            "--kiosk", $"--force-device-scale-factor={escala.ToString(CultureInfo.InvariantCulture)}",
            // Detrás de los iconos Chromium se cree tapado y dejaría de animar (ADR 0002, lo
            // mismo con las ventanas capturadas): que no calcule oclusiones ni se duerma.
            "--disable-features=CalculateNativeWinOcclusion",
            "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
            "--hide-crash-restore-bubble", "--disable-background-networking", "--log-level=3",
            $"--app={url}",
        }) psi.ArgumentList.Add(a);
        return Process.Start(psi)!;
    }

    /// <summary>La ventana principal del Chrome lanzado: con perfil propio, su proceso es el del navegador.</summary>
    static IntPtr VentanaDe(int pid)
    {
        IntPtr hallada = IntPtr.Zero;
        EnumWindows((h, _) =>
        {
            GetWindowThreadProcessId(h, out uint p);
            if (p != pid || GetWindowTextLength(h) == 0) return true;
            var c = new StringBuilder(64);
            GetClassName(h, c, c.Capacity);
            if (c.ToString() != "Chrome_WidgetWin_1") return true;
            hallada = h;
            return false;
        }, IntPtr.Zero);
        // Ya metida en la WorkerW deja de ser de primer nivel: se busca allí.
        if (hallada == IntPtr.Zero && WorkerW() is var w && w != IntPtr.Zero)
            EnumChildWindows(w, (h, _) =>
            {
                if (GetParent(h) != w) return true;
                GetWindowThreadProcessId(h, out uint p);
                if (p != pid) return true;
                hallada = h;
                return false;
            }, IntPtr.Zero);
        return hallada;
    }

    /// <summary>Mete la ventana en la WorkerW (si no lo está ya) y la ajusta a su monitor.</summary>
    static void Encajar(Pantalla p)
    {
        var ventana = p.Ventana;
        var worker = WorkerW();
        if (worker == IntPtr.Zero) return;
        if (GetParent(ventana) != worker)
        {
            // Sin botón en la barra de tareas (uso real: "aparece una pestaña de Chrome"): se
            // esconde, pasa a ventana de herramientas y vuelve a mostrarse ya dentro, con
            // SWP_SHOWWINDOW abajo. Sin esconderla antes, la barra se queda con el botón.
            ShowWindow(ventana, 0 /*SW_HIDE*/);
            long ex = GetWindowLongPtr(ventana, GWL_EXSTYLE).ToInt64();
            SetWindowLongPtr(ventana, GWL_EXSTYLE, (IntPtr)((ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW));
            long estilo = GetWindowLongPtr(ventana, GWL_STYLE).ToInt64();
            estilo = (estilo & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX)) | WS_CHILD | WS_VISIBLE;
            SetWindowLongPtr(ventana, GWL_STYLE, (IntPtr)estilo);
            SetParent(ventana, worker);
        }
        // Padre e hija de procesos distintos: Windows engancha sus colas de entrada, y si Chrome
        // se entretiene el Explorador se queda sordo (uso real: "el buscador de Windows se rompe
        // cada dos por tres", como con AttachThreadInput en papercuts). Se desenganchan.
        uint hiloChrome = GetWindowThreadProcessId(ventana, out _), hiloExplorador = GetWindowThreadProcessId(worker, out _);
        AttachThreadInput(hiloChrome, hiloExplorador, false);
        AttachThreadInput(hiloExplorador, hiloChrome, false);
        // El monitor en coordenadas de pantalla (físicas: el puente es PerMonitorV2), pasado a las
        // de la WorkerW, que empieza en la esquina del escritorio virtual y no en la del principal.
        var r = p.Monitor;
        MapWindowPoints(IntPtr.Zero, worker, ref r, 2);
        GetWindowRect(ventana, out RECT actual);
        MapWindowPoints(IntPtr.Zero, worker, ref actual, 2);
        if (!IsWindowVisible(ventana) || actual.Left != r.Left || actual.Top != r.Top || actual.Right != r.Right || actual.Bottom != r.Bottom)
            SetWindowPos(ventana, IntPtr.Zero, r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    }

    /// <summary>
    /// La WorkerW entre el fondo y los iconos. El mensaje 0x052C a Progman hace que el Explorador
    /// la cree. En Windows 10 es la hermana siguiente de la que lleva los iconos (SHELLDLL_DefView);
    /// en Windows 11 24H2 es hija de Progman. Se pide UNA vez y se guarda: mandarlo cada 2 s dejó
    /// la barra de tareas y el buscador sordos (uso real, 2026-09-25). Solo se repite si la
    /// WorkerW desaparece (el Explorador se reinició).
    /// </summary>
    static IntPtr worker;

    static IntPtr WorkerW()
    {
        if (worker != IntPtr.Zero && IsWindow(worker)) return worker;
        worker = BuscarWorkerW();
        return worker;
    }

    static IntPtr BuscarWorkerW()
    {
        var progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return IntPtr.Zero;
        SendMessageTimeout(progman, 0x052C, (IntPtr)0xD, (IntPtr)0x1, 0 /*SMTO_NORMAL*/, 1000, out _);
        var hija = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (hija != IntPtr.Zero) return hija;
        IntPtr hallada = IntPtr.Zero;
        EnumWindows((h, _) =>
        {
            if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero) return true;
            hallada = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
            return false;
        }, IntPtr.Zero);
        return hallada;
    }

    // --- pausa -------------------------------------------------------------------------------------
    /// <summary>
    /// ¿Tapa la ventana activa todo este monitor (el mundo a pantalla completa, algo maximizado)?
    /// Entonces su fondo no se ve y pintarlo solo roba GPU: uso real, "hay un poco de lag en los
    /// vídeos" con el fondo animando detrás del mundo.
    /// </summary>
    static bool Tapado(Pantalla p)
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero || IsIconic(h) || !IsWindowVisible(h)) return false;
        var c = new StringBuilder(32);
        GetClassName(h, c, c.Capacity);
        if (c.ToString() is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd") return false;
        GetWindowRect(h, out RECT r);
        var w = p.Trabajo; // maximizada tapa el área de trabajo; a pantalla completa, más
        return r.Left <= w.Left && r.Top <= w.Top && r.Right >= w.Right && r.Bottom >= w.Bottom;
    }

    static string? ficheroEstado;
    static string? tapados;

    /// <summary>
    /// Pausa sin esconder la ventana: esconderla y volver a mostrarla hacía que Chrome pintara un
    /// fotograma en blanco (uso real: "el fondo parpadea en blanco"). Se escribe fondo-estado.js,
    /// un sí/no por monitor, y cada página, que lo relee cada segundo, deja de pintar si le toca.
    /// </summary>
    static void Pausar(bool[] cada)
    {
        var json = "[" + string.Join(", ", cada.Select(t => t ? "true" : "false")) + "]";
        if (tapados == json || ficheroEstado == null) return;
        tapados = json;
        try
        {
            File.WriteAllText(ficheroEstado, "// Lo escribe infinite-desk-bridge --fondo (ADR 0004); no se versiona.\n" +
                $"window.INFINITE_DESK_FONDO = {{ tapado: {json} }};\n");
        }
        catch (IOException) { tapados = null; } // la página lo estaba leyendo: a la próxima vuelta
    }

    // --- el ratón -------------------------------------------------------------------------------
    static HookProc? gancho; // referencia viva: si el GC se lo lleva, el hook llama a la nada
    static uint ultimoClic;
    static POINT ultimoSitio;

    /// <summary>Donde Chromium recibe el ratón de la página: su hija Chrome_RenderWidgetHostHWND.</summary>
    static IntPtr Lienzo(IntPtr ventana)
    {
        IntPtr hallada = IntPtr.Zero;
        EnumChildWindows(ventana, (h, _) =>
        {
            var c = new StringBuilder(64);
            GetClassName(h, c, c.Capacity);
            if (c.ToString() != "Chrome_RenderWidgetHostHWND") return true;
            hallada = h;
            return false;
        }, IntPtr.Zero);
        return hallada;
    }

    /// <summary>El hook de bajo nivel necesita un hilo con cola de mensajes propia.</summary>
    static void EscucharRaton()
    {
        new Thread(() =>
        {
            gancho = AlRaton;
            SetWindowsHookEx(14 /*WH_MOUSE_LL*/, gancho, GetModuleHandle(null), 0);
            while (GetMessage(out _, IntPtr.Zero, 0, 0) > 0) { }
        }) { IsBackground = true }.Start();
    }

    /// <summary>
    /// Cada evento de ratón del sistema. Tiene que volver rápido (Windows se salta un hook lento),
    /// así que solo mira qué hay bajo el cursor y, si es el escritorio, envía un mensaje: nunca
    /// se come el evento, que sigue su camino (seleccionar iconos, el menú contextual).
    /// </summary>
    static IntPtr AlRaton(int codigo, IntPtr mensaje, ref MSLLHOOKSTRUCT datos)
    {
        var destino = codigo >= 0 ? LienzoBajo(datos.pt) : IntPtr.Zero;
        if (destino != IntPtr.Zero)
        {
            int m = (int)mensaje;
            var cliente = datos.pt;
            ScreenToClient(destino, ref cliente);
            var lp = (IntPtr)((cliente.Y << 16) | (cliente.X & 0xFFFF));
            var botones = (IntPtr)(((GetAsyncKeyState(0x01) & 0x8000) != 0 ? 0x1 : 0) | ((GetAsyncKeyState(0x04) & 0x8000) != 0 ? 0x10 : 0));
            switch (m)
            {
                case 0x0200: // WM_MOUSEMOVE
                case 0x0202: // WM_LBUTTONUP
                    PostMessage(destino, (uint)m, botones, lp);
                    break;
                case 0x0201: // WM_LBUTTONDOWN; el doble clic hay que deducirlo: un mensaje enviado no lo trae
                    bool doble = datos.time - ultimoClic <= GetDoubleClickTime()
                        && Math.Abs(datos.pt.X - ultimoSitio.X) <= GetSystemMetrics(36 /*SM_CXDOUBLECLK*/) / 2
                        && Math.Abs(datos.pt.Y - ultimoSitio.Y) <= GetSystemMetrics(37 /*SM_CYDOUBLECLK*/) / 2;
                    ultimoClic = doble ? 0 : datos.time;
                    ultimoSitio = datos.pt;
                    PostMessage(destino, doble ? 0x0203u : 0x0201u, botones, lp);
                    break;
                case 0x020A: // WM_MOUSEWHEEL: el giro en la palabra alta, y coordenadas de PANTALLA
                    var wp = (IntPtr)((int)(datos.mouseData & 0xFFFF0000) | ((int)botones & 0xFFFF));
                    PostMessage(destino, 0x020A, wp, (IntPtr)((datos.pt.Y << 16) | (datos.pt.X & 0xFFFF)));
                    break;
            }
        }
        return CallNextHookEx(IntPtr.Zero, codigo, mensaje, ref datos);
    }

    /// <summary>El lienzo del monitor bajo el cursor, si el cursor está sobre el escritorio (no sobre otra ventana).</summary>
    static IntPtr LienzoBajo(POINT p)
    {
        var bajo = pantallas.FirstOrDefault(m => p.X >= m.Monitor.Left && p.X < m.Monitor.Right && p.Y >= m.Monitor.Top && p.Y < m.Monitor.Bottom);
        if (bajo == null || bajo.Lienzo == IntPtr.Zero) return IntPtr.Zero;
        var c = new StringBuilder(32);
        GetClassName(WindowFromPoint(p), c, c.Capacity);
        return c.ToString() is "SysListView32" or "SHELLDLL_DefView" or "WorkerW" or "Progman" ? bajo.Lienzo : IntPtr.Zero;
    }

    static void Cerrar(Pantalla p)
    {
        p.Lienzo = IntPtr.Zero;
        if (p.Proceso == null || p.Proceso.HasExited) return;
        // Por las buenas (WM_CLOSE), para que Chrome no se crea que se colgó; si no, a la fuerza.
        if (p.Ventana != IntPtr.Zero) PostMessage(p.Ventana, 0x0010, IntPtr.Zero, IntPtr.Zero);
        if (!p.Proceso.WaitForExit(3000)) p.Proceso.Kill(true);
    }

    /// <summary>Sin la ventana de Chrome, la WorkerW puede quedarse con su último fotograma: se repone el fondo.</summary>
    static void RepintarFondo()
    {
        var ruta = new StringBuilder(260);
        SystemParametersInfo(0x73 /*SPI_GETDESKWALLPAPER*/, (uint)ruta.Capacity, ruta, 0);
        SystemParametersInfo(0x14 /*SPI_SETDESKWALLPAPER*/, 0, ruta, 0);
    }

    /// <summary>Chrome (aprobado en el portátil de empresa); si no, Edge, que viene con Windows.</summary>
    static string? Navegador()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return new[]
        {
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
        }.FirstOrDefault(File.Exists);
    }

    // --- Win32 ------------------------------------------------------------------------------
    const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
    const long WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000;
    const long WS_POPUP = 0x80000000, WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_CAPTION = 0xC00000,
        WS_THICKFRAME = 0x40000, WS_SYSMENU = 0x80000, WS_MINIMIZEBOX = 0x20000, WS_MAXIMIZEBOX = 0x10000;
    const uint SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_SHOWWINDOW = 0x40;

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }
    delegate IntPtr HookProc(int codigo, IntPtr mensaje, ref MSLLHOOKSTRUCT datos);
    delegate bool Visitar(IntPtr h, IntPtr l);
    delegate bool VisitarMonitor(IntPtr m, IntPtr dc, IntPtr r, IntPtr l);

    [DllImport("user32.dll")] static extern bool EnumWindows(Visitar v, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr padre, Visitar v, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr recorte, VisitarMonitor v, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint desde, uint hacia, bool enganchar);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string? clase, string? titulo);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr padre, IntPtr despues, string? clase, string? titulo);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint ms, out IntPtr r);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr h, IntPtr padre);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int tipo, HookProc f, IntPtr mod, uint hilo);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int codigo, IntPtr w, ref MSLLHOOKSTRUCT l);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? nombre);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")] static extern uint GetDoubleClickTime();
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern int MapWindowPoints(IntPtr desde, IntPtr hasta, ref RECT r, uint n);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr tras, int x, int y, int w, int alto, uint f);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr m, int tipo, out uint x, out uint y);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(uint a, uint b, StringBuilder c, uint f);
}
