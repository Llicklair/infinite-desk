// El mundo como fondo animado de Windows, detrás de los iconos, sin Lively (ADR 0004).
//
// Detrás de los iconos solo va una ventana DEL PROPIO PUENTE por monitor, en la WorkerW del
// Explorador (la que Windows pinta entre el fondo y los iconos). Dentro, el motor de Edge que trae
// Windows (WebView2) pinta fondo.html en modo composición (DirectComposition): no crea ventanas
// hijas de otro proceso. La primera versión metía ventanas de Chrome en la WorkerW, y eso engancha
// la cola de entrada del Explorador a la de Chrome (lo hace Windows con padre e hija de procesos
// distintos, y no se puede deshacer): cada vez que Chrome se entretenía, el buscador y la barra
// de tareas se quedaban sordos (uso real, "cada dos por tres"; parado el fondo, no volvió a pasar).
// Así, el Explorador solo queda enganchado a este hilo, que no hace otra cosa que responder.
//
// El ratón no llega detrás de los iconos: se lee con entrada "cruda" (RegisterRawInputDevices,
// no un hook: no se mete en la cadena del ratón de todo el sistema) y, si el cursor está sobre el
// escritorio vacío, se le pasa a WebView2 con SendMouseInput. El botón derecho no: es el menú del
// escritorio. Cada página sabe su monitor por ?monitor=N y se pausa sola si algo tapa ese monitor
// entero (fondo-estado.js). `--fondo --parar` lo cierra desde otro proceso.
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace InfiniteDesk.Puente;

static class Fondo
{
    const string UNICO = @"Local\infinite-desk-fondo", PARAR = @"Local\infinite-desk-fondo-parar";

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
        Registro.Anotar("fondo: arranca");

        // WebView2 y el bucle de mensajes, en un hilo STA propio (el principal de .NET es MTA).
        var hilo = new Thread(() =>
        {
            SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
            var lienzos = new Lienzos(mundo);
            new Thread(() => { alto.WaitOne(); lienzos.Cerrar(); }) { IsBackground = true }.Start();
            lienzos.Empezar();
            Application.Run();
            lienzos.Limpiar();
        });
        hilo.SetApartmentState(ApartmentState.STA);
        hilo.Start();
        hilo.Join();
        RepintarFondo();
        return 0;
    }

    /// <summary>Todo el fondo: una ventana con su WebView2 por monitor, y lo que las vigila.</summary>
    sealed class Lienzos(string mundo)
    {
        readonly SynchronizationContext ui = SynchronizationContext.Current!;
        readonly string ficheroEstado = Path.Combine(mundo, "fondo-estado.js");
        readonly string url = new Uri(Path.Combine(mundo, "fondo.html")).AbsoluteUri;
        readonly List<Pantalla> pantallas = [];
        readonly System.Windows.Forms.Timer reloj = new() { Interval = 500 };
        CoreWebView2Environment? entorno;
        IDCompositionDevice? composicion;
        IntPtr worker;
        string firma = "", tapados = "";
        bool rehaciendo;

        public void Empezar()
        {
            reloj.Tick += (_, _) => Vigilar();
            reloj.Start();
            _ = Rehacer();
        }

        /// <summary>Cada medio segundo: ¿sigue la WorkerW (el Explorador se reinicia)?, ¿cambiaron los monitores?, ¿qué está tapado?</summary>
        void Vigilar()
        {
            var monitores = Monitores();
            var nueva = string.Join(";", monitores.Select(m => $"{m.monitor.Left},{m.monitor.Top},{m.monitor.Right},{m.monitor.Bottom}@{m.escala}"));
            if (!rehaciendo && (nueva != firma || worker == IntPtr.Zero || !IsWindow(worker))) { _ = Rehacer(); return; }
            Pausar(pantallas.Select(p => Tapado(p.Trabajo)).ToArray());
        }

        async Task Rehacer()
        {
            rehaciendo = true;
            try
            {
                Limpiar();
                worker = WorkerW();
                if (worker == IntPtr.Zero) return; // sin Explorador todavía: a la próxima vuelta
                var monitores = Monitores();
                firma = string.Join(";", monitores.Select(m => $"{m.monitor.Left},{m.monitor.Top},{m.monitor.Right},{m.monitor.Bottom}@{m.escala}"));
                entorno ??= await CoreWebView2Environment.CreateAsync(null,
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "webview-fondo"),
                    new CoreWebView2EnvironmentOptions(
                        // Detrás de los iconos Chromium se cree tapado y dejaría de animar: sin oclusión.
                        "--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding"));
                composicion ??= CrearComposicion();
                for (int i = 0; i < monitores.Length; i++)
                {
                    var p = new Pantalla(i, monitores[i].monitor, monitores[i].trabajo, worker);
                    pantallas.Add(p);
                    await p.Montar(entorno, composicion, $"{url}?monitor={i}", monitores[i].escala);
                    // El ratón "crudo" se registra una vez por proceso: lo recibe la primera ventana
                    // y se reparte a todas (cada una mira si el cursor está en su monitor).
                    if (i == 0) p.Escuchar(e => { foreach (var q in pantallas) q.Raton(e); });
                }
                composicion.Commit();
                tapados = "";
                Registro.Anotar($"fondo: {pantallas.Count} monitor(es) en la WorkerW {worker}");
            }
            catch (Exception e) { Registro.Anotar($"fondo: no se pudo montar: {e.Message}"); }
            finally { rehaciendo = false; }
        }

        /// <summary>
        /// Pausa sin esconder nada (esconder y mostrar hacía parpadear en blanco): se escribe
        /// fondo-estado.js, un sí/no por monitor, y cada página lo relee cada segundo.
        /// </summary>
        void Pausar(bool[] cada)
        {
            var json = "[" + string.Join(", ", cada.Select(t => t ? "true" : "false")) + "]";
            if (json == tapados) return;
            try
            {
                File.WriteAllText(ficheroEstado, "// Lo escribe infinite-desk-bridge --fondo (ADR 0004); no se versiona.\n" +
                    $"window.INFINITE_DESK_FONDO = {{ tapado: {json} }};\n");
                tapados = json;
            }
            catch (IOException) { } // la página lo estaba leyendo: a la próxima vuelta
        }

        /// <summary>Del hilo que espera la señal de parar: se cierra desde el hilo de la interfaz.</summary>
        public void Cerrar() => ui.Post(_ => Application.ExitThread(), null);

        public void Limpiar()
        {
            foreach (var p in pantallas) p.Cerrar();
            pantallas.Clear();
            try { File.Delete(ficheroEstado); } catch (IOException) { }
        }
    }

    /// <summary>Un monitor: nuestra ventana en la WorkerW, su WebView2 y el ratón que le toca.</summary>
    sealed class Pantalla(int indice, RECT monitor, RECT trabajo, IntPtr worker) : NativeWindow
    {
        public readonly RECT Trabajo = trabajo;
        CoreWebView2CompositionController? web;
        IDCompositionTarget? destino;
        uint ultimoClic;
        POINT ultimoSitio;
        bool dentro;

        public async Task Montar(CoreWebView2Environment entorno, IDCompositionDevice composicion, string url, double escala)
        {
            // Sus coordenadas dentro de la WorkerW, que empieza en la esquina del escritorio virtual.
            var r = monitor;
            MapWindowPoints(IntPtr.Zero, worker, ref r, 2);
            CreateHandle(new CreateParams
            {
                Caption = $"infinite-desk fondo {indice}",
                Parent = worker,
                Style = unchecked((int)(WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN)),
                ExStyle = (int)WS_EX_NOACTIVATE,
                X = r.Left, Y = r.Top, Width = r.Right - r.Left, Height = r.Bottom - r.Top,
            });
            web = await entorno.CreateCoreWebView2CompositionControllerAsync(Handle);
            web.DefaultBackgroundColor = Color.FromArgb(255, 7, 9, 18); // el del mundo: nada de blanco mientras carga
            web.ShouldDetectMonitorScaleChanges = false;
            web.RasterizationScale = escala;
            web.Bounds = new Rectangle(0, 0, r.Right - r.Left, r.Bottom - r.Top);
            destino = composicion.CreateTargetForHwnd(Handle, true);
            var visual = composicion.CreateVisual();
            destino.SetRoot(visual);
            web.RootVisualTarget = visual;
            web.IsVisible = true;
            web.CoreWebView2.Navigate(url);
        }

        Action<(ushort botones, short rueda)>? alRaton;

        /// <summary>Ratón "crudo" aunque la ventana no tenga el foco (RIDEV_INPUTSINK): lo lee este hilo.</summary>
        public void Escuchar(Action<(ushort botones, short rueda)> que)
        {
            alRaton = que;
            var dispositivo = new RAWINPUTDEVICE { usUsagePage = 1, usUsage = 2, dwFlags = 0x100, hwndTarget = Handle };
            RegisterRawInputDevices([dispositivo], 1, Marshal.SizeOf<RAWINPUTDEVICE>());
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x00FF /*WM_INPUT*/ && alRaton != null && Leer(m.LParam) is { } e) alRaton(e);
            base.WndProc(ref m);
        }

        /// <summary>Los botones y la rueda de un WM_INPUT de ratón, o null.</summary>
        static (ushort botones, short rueda)? Leer(IntPtr entrada)
        {
            uint tam = 0, cabecera = (uint)Marshal.SizeOf<RAWINPUTHEADER>();
            GetRawInputData(entrada, 0x10000003 /*RID_INPUT*/, IntPtr.Zero, ref tam, cabecera);
            if (tam == 0 || tam > 256) return null;
            var buffer = Marshal.AllocHGlobal((int)tam);
            try
            {
                if (GetRawInputData(entrada, 0x10000003, buffer, ref tam, cabecera) != tam) return null;
                if (Marshal.ReadInt32(buffer) != 0 /*RIM_TYPEMOUSE*/) return null;
                // RAWMOUSE tras la cabecera: usFlags (2), relleno (2), usButtonFlags (2), usButtonData (2).
                return ((ushort)Marshal.ReadInt16(buffer, (int)cabecera + 4), Marshal.ReadInt16(buffer, (int)cabecera + 6));
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        /// <summary>
        /// Un evento de ratón del sistema. Solo si el cursor está en ESTE monitor y sobre el
        /// escritorio vacío (no sobre otra ventana) se le pasa a la página; nunca se come nada.
        /// </summary>
        public void Raton((ushort botones, short rueda) e)
        {
            if (web == null) return;
            var (botones, rueda) = e;
            {
                GetCursorPos(out var p);
                bool aqui = p.X >= monitor.Left && p.X < monitor.Right && p.Y >= monitor.Top && p.Y < monitor.Bottom && SobreElEscritorio(p);
                if (!aqui)
                {
                    if (dentro) web!.SendMouseInput(CoreWebView2MouseEventKind.Leave, CoreWebView2MouseEventVirtualKeys.None, 0, new Point());
                    dentro = false;
                    return;
                }
                dentro = true;
                var punto = new Point(p.X - monitor.Left, p.Y - monitor.Top);
                var teclas = (GetAsyncKeyState(0x01) & 0x8000) != 0 ? CoreWebView2MouseEventVirtualKeys.LeftButton : CoreWebView2MouseEventVirtualKeys.None;
                if ((botones & 0x0001) != 0) // RI_MOUSE_LEFT_BUTTON_DOWN; el doble clic hay que deducirlo
                {
                    uint ahora = (uint)Environment.TickCount;
                    bool doble = ahora - ultimoClic <= GetDoubleClickTime()
                        && Math.Abs(p.X - ultimoSitio.X) <= GetSystemMetrics(36) / 2 && Math.Abs(p.Y - ultimoSitio.Y) <= GetSystemMetrics(37) / 2;
                    ultimoClic = doble ? 0 : ahora;
                    ultimoSitio = p;
                    web!.SendMouseInput(doble ? CoreWebView2MouseEventKind.LeftButtonDoubleClick : CoreWebView2MouseEventKind.LeftButtonDown, teclas, 0, punto);
                }
                else if ((botones & 0x0002) != 0) web!.SendMouseInput(CoreWebView2MouseEventKind.LeftButtonUp, teclas, 0, punto);
                else if ((botones & 0x0400) != 0) web!.SendMouseInput(CoreWebView2MouseEventKind.Wheel, teclas, unchecked((uint)rueda), punto);
                else web!.SendMouseInput(CoreWebView2MouseEventKind.Move, teclas, 0, punto);
            }
        }

        public void Cerrar()
        {
            try { web?.Close(); } catch (Exception) { }
            web = null;
            if (destino != null) Marshal.ReleaseComObject(destino);
            destino = null;
            if (Handle != IntPtr.Zero) DestroyHandle();
        }
    }

    /// <summary>El cursor está sobre el escritorio (los iconos o el fondo), no sobre otra ventana.</summary>
    static bool SobreElEscritorio(POINT p)
    {
        var c = new StringBuilder(32);
        GetClassName(WindowFromPoint(p), c, c.Capacity);
        return c.ToString() is "SysListView32" or "SHELLDLL_DefView" or "WorkerW" or "Progman";
    }

    /// <summary>¿Tapa la ventana activa toda esta área de trabajo (el mundo, algo maximizado)? Entonces no se ve.</summary>
    static bool Tapado(RECT w)
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero || IsIconic(h) || !IsWindowVisible(h)) return false;
        var c = new StringBuilder(32);
        GetClassName(h, c, c.Capacity);
        if (c.ToString() is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd") return false;
        GetWindowRect(h, out RECT r);
        return r.Left <= w.Left && r.Top <= w.Top && r.Right >= w.Right && r.Bottom >= w.Bottom;
    }

    /// <summary>Los monitores, el principal primero, en píxeles físicos (el puente es PerMonitorV2).</summary>
    static (RECT monitor, RECT trabajo, double escala)[] Monitores()
    {
        var lista = new List<(RECT monitor, RECT trabajo, double escala, bool principal)>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (m, _, _, _) =>
        {
            var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            GetMonitorInfo(m, ref info);
            double escala = GetDpiForMonitor(m, 0 /*MDT_EFFECTIVE_DPI*/, out uint ppp, out _) == 0 ? ppp / 96.0 : 1;
            lista.Add((info.rcMonitor, info.rcWork, escala, (info.dwFlags & 1) != 0));
            return true;
        }, IntPtr.Zero);
        return lista.OrderByDescending(m => m.principal).ThenBy(m => m.monitor.Left)
            .Select(m => (m.monitor, m.trabajo, m.escala)).ToArray();
    }

    /// <summary>
    /// La WorkerW entre el fondo y los iconos. El mensaje 0x052C a Progman hace que el Explorador
    /// la cree; se pide solo cuando no la hay (mandarlo cada 2 s dejó el buscador sordo). En
    /// Windows 10 es la hermana siguiente de la de los iconos (SHELLDLL_DefView); en 11 24H2, hija de Progman.
    /// </summary>
    static IntPtr WorkerW()
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

    static IDCompositionDevice CrearComposicion()
    {
        var iid = typeof(IDCompositionDevice).GUID;
        Marshal.ThrowExceptionForHR(DCompositionCreateDevice2(IntPtr.Zero, ref iid, out var dispositivo));
        return (IDCompositionDevice)Marshal.GetObjectForIUnknown(dispositivo);
    }

    /// <summary>Sin nuestras ventanas, la WorkerW puede quedarse con su último fotograma: se repone el fondo de Windows.</summary>
    static void RepintarFondo()
    {
        var ruta = new StringBuilder(260);
        SystemParametersInfo(0x73 /*SPI_GETDESKWALLPAPER*/, (uint)ruta.Capacity, ruta, 0);
        SystemParametersInfo(0x14 /*SPI_SETDESKWALLPAPER*/, 0, ruta, 0);
    }

    // --- DirectComposition (solo lo que se usa, en el orden de su vtable) ----------------------
    [ComImport, Guid("C37EA93A-E7AA-450D-B16F-9746CB0407F3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDCompositionDevice
    {
        void Commit();
        void WaitForCommitCompletion();
        void GetFrameStatistics(IntPtr estadisticas);
        IDCompositionTarget CreateTargetForHwnd(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool encima);
        IDCompositionVisual CreateVisual();
    }
    [ComImport, Guid("eacdd04c-117e-4e17-88f4-d1b12b0e3d89"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDCompositionTarget { void SetRoot(IDCompositionVisual visual); }
    [ComImport, Guid("4d93059d-097b-4651-9a60-f0f25116e2f3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDCompositionVisual { }
    [DllImport("dcomp.dll")] static extern int DCompositionCreateDevice2(IntPtr dispositivoRender, ref Guid iid, out IntPtr dispositivo);

    // --- Win32 ------------------------------------------------------------------------------
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_CLIPCHILDREN = 0x02000000, WS_EX_NOACTIVATE = 0x08000000;

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }
    [StructLayout(LayoutKind.Sequential)] struct RAWINPUTDEVICE { public ushort usUsagePage, usUsage; public uint dwFlags; public IntPtr hwndTarget; }
    [StructLayout(LayoutKind.Sequential)] struct RAWINPUTHEADER { public uint dwType, dwSize; public IntPtr hDevice, wParam; }
    delegate bool Visitar(IntPtr h, IntPtr l);
    delegate bool VisitarMonitor(IntPtr m, IntPtr dc, IntPtr r, IntPtr l);

    [DllImport("user32.dll")] static extern bool EnumWindows(Visitar v, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr recorte, VisitarMonitor v, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string? clase, string? titulo);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr padre, IntPtr despues, string? clase, string? titulo);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint ms, out IntPtr r);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")] static extern uint GetDoubleClickTime();
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern int MapWindowPoints(IntPtr desde, IntPtr hasta, ref RECT r, uint n);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
    [DllImport("user32.dll")] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] d, uint n, int tam);
    [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr entrada, uint que, IntPtr datos, ref uint tam, uint cabecera);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr m, int tipo, out uint x, out uint y);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(uint a, uint b, StringBuilder c, uint f);
}
