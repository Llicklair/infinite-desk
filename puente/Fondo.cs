// El mundo como fondo animado de Windows, detrás de los iconos, sin Lively (ADR 0004).
//
// LA REGLA (aprendida rompiendo Windows tres veces): toda ventana que se mete en la WorkerW del
// Explorador (la que Windows pinta entre el fondo y los iconos) engancha la cola de entrada del
// Explorador a la del HILO dueño de esa ventana, y Windows no deja deshacerlo. Si ese hilo espera
// a algo, el Explorador deja de procesar la entrada: el buscador, la barra de tareas y hasta los
// clics del escritorio se quedan sordos. Pasó con ventanas de Chrome (su hilo se entretenía) y
// con WebView2 cuando el mismo hilo le pasaba el ratón con una llamada que espera a otro proceso.
//
// Así que dos hilos:
// - ANFITRIÓN: crea una ventana por monitor en la WorkerW y solo atiende su bucle de mensajes.
//   No llama a WebView2, no lee el ratón, no espera a otros procesos. Nunca se bloquea.
// - PINTOR: todo lo demás. El motor de Edge que trae Windows (WebView2) en modo composición, con
//   una ventana OCULTA de este hilo como padre (si WebView2 crea ventanas internas, cuelgan de
//   ella, no del Explorador); su imagen llega a las ventanas del anfitrión por DirectComposition.
//   Aquí se lee el ratón (entrada cruda, sin hook) y se decide la pausa. Si este hilo se
//   atasca, el fondo se congela, pero Windows sigue respondiendo.
// - El ratón llega a la página como MENSAJES (PostWebMessageAsJson), nunca como entrada: con
//   SendMouseInput el navegador capturaba el ratón en su ventana invisible (WebView2 crea una de
//   opacidad 0 por monitor) y Windows dejaba de responder a los clics hasta cerrar el fondo.
//
// Cada página sabe su monitor por ?monitor=N y se pausa sola si algo tapa ese monitor entero
// (fondo-estado.js). `--fondo --parar` lo cierra; si en 3 s no ha cerrado, el proceso se mata.
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

    public static int Correr(string mundo, string solo = "")
    {
        using var unico = new Mutex(true, UNICO, out bool primero);
        if (!primero) { Console.Error.WriteLine("infinite-desk fondo: ya hay uno en marcha"); return 0; }
        using var alto = new EventWaitHandle(false, EventResetMode.ManualReset, PARAR);
        Registro.Anotar($"fondo: arranca{(solo == "" ? "" : $" (diagnóstico: solo {solo})")}");

        var anfitrion = Hilo("anfitrión");
        var pintor = Hilo("pintor");
        var lienzos = new Lienzos(mundo, anfitrion.contexto, solo);
        pintor.contexto.Post(_ => lienzos.Empezar(), null);

        alto.WaitOne();
        Registro.Anotar("fondo: se para");
        pintor.contexto.Post(_ => { lienzos.Limpiar(); Application.ExitThread(); }, null);
        // Si el pintor no suelta en 3 s, no se espera más: fuera el proceso (nada de dejar
        // ventanas colgando del Explorador).
        if (!pintor.hilo.Join(3000)) { Registro.Anotar("fondo: el pintor no cerró; se mata"); Environment.Exit(1); }
        anfitrion.contexto.Post(_ => Application.ExitThread(), null);
        anfitrion.hilo.Join(1000);
        RepintarFondo();
        return 0;
    }

    /// <summary>Un hilo STA con su bucle de mensajes de Windows Forms y su contexto para mandarle trabajo.</summary>
    static (Thread hilo, SynchronizationContext contexto) Hilo(string nombre)
    {
        SynchronizationContext? contexto = null;
        using var listo = new ManualResetEventSlim();
        var hilo = new Thread(() =>
        {
            contexto = new WindowsFormsSynchronizationContext();
            SynchronizationContext.SetSynchronizationContext(contexto);
            listo.Set();
            Application.Run();
        }) { Name = $"fondo: {nombre}", IsBackground = true };
        hilo.SetApartmentState(ApartmentState.STA);
        hilo.Start();
        listo.Wait();
        return (hilo, contexto!);
    }

    /// <summary>
    /// Una ventana del anfitrión en la WorkerW. Solo existe para que DirectComposition pinte en
    /// ella: no maneja nada (ni ratón, ni foco, ni avisa a su padre).
    /// </summary>
    sealed class Anfitriona : NativeWindow
    {
        public Anfitriona(IntPtr worker, int indice, RECT r) => CreateHandle(new CreateParams
        {
            Caption = $"infinite-desk fondo {indice}",
            Parent = worker,
            Style = unchecked((int)(WS_CHILD | WS_VISIBLE | WS_DISABLED)),
            ExStyle = (int)(WS_EX_NOACTIVATE | WS_EX_NOPARENTNOTIFY),
            X = r.Left, Y = r.Top, Width = r.Right - r.Left, Height = r.Bottom - r.Top,
        });
    }

    /// <summary>Todo lo del pintor: WebView2, composición, ratón y pausa. Vive en el hilo pintor.</summary>
    sealed class Lienzos(string mundo, SynchronizationContext anfitrion, string solo)
    {
        readonly string ficheroEstado = Path.Combine(mundo, "fondo-estado.js");
        readonly string url = new Uri(Path.Combine(mundo, "fondo.html")).AbsoluteUri;
        readonly List<Pantalla> pantallas = [];
        readonly List<Anfitriona> anfitrionas = [];
        readonly System.Windows.Forms.Timer reloj = new() { Interval = 500 };
        CoreWebView2Environment? entorno;
        IDCompositionDevice? composicion;
        Oyente? oyente;
        IntPtr worker;
        string firma = "", tapados = "";
        bool rehaciendo;

        public void Empezar()
        {
            oyente = new Oyente(e => { foreach (var p in pantallas) p.Raton(e); });
            reloj.Tick += (_, _) => Vigilar();
            reloj.Start();
            _ = Rehacer();
        }

        /// <summary>Cada medio segundo: ¿sigue la WorkerW (el Explorador se reinicia)?, ¿cambiaron los monitores?, ¿qué está tapado?</summary>
        void Vigilar()
        {
            if (!rehaciendo && (Firma(Monitores()) != firma || worker == IntPtr.Zero || !IsWindow(worker))) { _ = Rehacer(); return; }
            Pausar(pantallas.Select(p => Tapado(p.Trabajo)).ToArray());
            foreach (var p in pantallas) p.Atravesables();
        }

        static string Firma((RECT monitor, RECT trabajo, double escala)[] ms) =>
            string.Join(";", ms.Select(m => $"{m.monitor.Left},{m.monitor.Top},{m.monitor.Right},{m.monitor.Bottom}@{m.escala}"));

        async Task Rehacer()
        {
            rehaciendo = true;
            try
            {
                Limpiar();
                worker = WorkerW();
                if (worker == IntPtr.Zero) return; // sin Explorador todavía: a la próxima vuelta
                var monitores = Monitores();
                firma = Firma(monitores);
                // Las ventanas de la WorkerW, en el hilo anfitrión (Send: el pintor espera al
                // anfitrión, nunca al revés).
                if (solo != "webview") anfitrion.Send(_ =>
                {
                    for (int i = 0; i < monitores.Length; i++)
                    {
                        var r = monitores[i].monitor;
                        MapWindowPoints(IntPtr.Zero, worker, ref r, 2); // la WorkerW empieza en la esquina del escritorio virtual
                        anfitrionas.Add(new Anfitriona(worker, i, r));
                    }
                }, null);
                if (solo == "ventanas") { Registro.Anotar($"fondo: {anfitrionas.Count} ventana(s) vacías en la WorkerW, sin WebView2"); return; }
                entorno ??= await CoreWebView2Environment.CreateAsync(null,
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "webview-fondo"),
                    new CoreWebView2EnvironmentOptions(
                        // Detrás de los iconos Chromium se cree tapado y dejaría de animar: sin oclusión.
                        "--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding"));
                composicion ??= CrearComposicion();
                for (int i = 0; i < monitores.Length; i++)
                {
                    var (monitor, trabajo, escala) = monitores[i];
                    var p = new Pantalla(monitor, trabajo);
                    pantallas.Add(p);
                    await p.Montar(entorno, composicion, solo == "webview" ? IntPtr.Zero : anfitrionas[i].Handle, $"{url}?monitor={i}", escala);
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

        public void Limpiar()
        {
            foreach (var p in pantallas) p.Cerrar();
            pantallas.Clear();
            var viejas = anfitrionas.ToArray();
            anfitrionas.Clear();
            if (viejas.Length > 0) anfitrion.Send(_ => { foreach (var a in viejas) a.DestroyHandle(); }, null);
            try { File.Delete(ficheroEstado); } catch (IOException) { }
        }
    }

    /// <summary>
    /// Un monitor, del lado del pintor: su WebView2 con una ventana oculta del pintor como padre, y
    /// su imagen llevada por DirectComposition a la ventana del anfitrión en la WorkerW.
    /// </summary>
    sealed class Pantalla(RECT monitor, RECT trabajo)
    {
        public readonly RECT Trabajo = trabajo;
        readonly NativeWindow padre = new();
        CoreWebView2CompositionController? web;
        IDCompositionTarget? destino;
        uint ultimoClic;
        POINT ultimoSitio;
        bool dentro;
        long ultimoMovimiento;
        // El gesto en curso empezó sobre un icono del escritorio: es del Explorador, no del fondo.
        bool deIcono;

        public async Task Montar(CoreWebView2Environment entorno, IDCompositionDevice composicion, IntPtr anfitriona, string url, double escala)
        {
            int ancho = monitor.Right - monitor.Left, alto = monitor.Bottom - monitor.Top;
            // Oculta, de primer nivel (ni en la WorkerW ni en la barra de tareas) y FUERA de la
            // pantalla: WebView2 crea por su cuenta una ventana de opacidad 0 donde está su padre,
            // y esa ventana se quedaba con los clics de los iconos y la barra de tareas (medido:
            // con WebView2 y nada nuestro en la WorkerW, Windows dejaba de responder; sin WebView2, no).
            padre.CreateHandle(new CreateParams
            {
                Caption = "infinite-desk fondo (pintor)",
                Style = unchecked((int)WS_POPUP),
                ExStyle = (int)(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE),
                X = -32000, Y = -32000, Width = ancho, Height = alto,
            });
            web = await entorno.CreateCoreWebView2CompositionControllerAsync(padre.Handle);
            web.DefaultBackgroundColor = Color.FromArgb(255, 7, 9, 18); // el del mundo: nada de blanco mientras carga
            web.ShouldDetectMonitorScaleChanges = false;
            web.RasterizationScale = escala;
            web.Bounds = new Rectangle(0, 0, ancho, alto);
            var visual = composicion.CreateVisual();
            if (anfitriona != IntPtr.Zero)
            {
                destino = composicion.CreateTargetForHwnd(anfitriona, true);
                destino.SetRoot(visual);
            }
            web.RootVisualTarget = visual;
            web.IsVisible = true;
            web.CoreWebView2.Navigate(url);
        }

        /// <summary>
        /// Un evento de ratón del sistema (en el pintor). Solo si el cursor está en ESTE monitor y
        /// sobre el escritorio vacío (no sobre otra ventana) se le pasa a la página; nunca se come nada.
        /// </summary>
        public void Raton((ushort botones, short rueda) e)
        {
            if (web == null) return;
            var (botones, rueda) = e;
            // Moverse sin botones ni rueda: como mucho unas 60 veces por segundo (cada una recorre las ventanas).
            if (botones == 0 && Environment.TickCount64 - ultimoMovimiento < 16) return;
            if (botones == 0) ultimoMovimiento = Environment.TickCount64;
            GetCursorPos(out var p);
            bool aqui = p.X >= monitor.Left && p.X < monitor.Right && p.Y >= monitor.Top && p.Y < monitor.Bottom && SobreElEscritorio(p);
            // A la página como MENSAJES, nunca como entrada (SendMouseInput): con entrada de verdad el
            // navegador capturaba el ratón en su ventana invisible y Windows dejaba de responder a
            // los clics (barra de tareas, iconos) hasta cerrar el fondo (uso real).
            if (!aqui)
            {
                if (dentro) Decir("fuera", p);
                dentro = false;
                return;
            }
            dentro = true;
            // Pulsar sobre un icono (arrastrar una carpeta, abrirla con doble clic) es del Explorador:
            // ese gesto entero, bajar y subir, no llega al fondo. Si no, arrastrar una carpeta giraba
            // la vista y el doble clic volaba a una isla (uso real: "movía una carpeta y a la vez se
            // movía la preview aérea").
            if ((botones & 0x0001) != 0 && SobreUnIcono(p)) { deIcono = true; return; }
            if ((botones & 0x0002) != 0 && deIcono) { deIcono = false; return; }
            if ((botones & 0x0001) != 0) // RI_MOUSE_LEFT_BUTTON_DOWN; el doble clic hay que deducirlo
            {
                uint ahora = (uint)Environment.TickCount;
                bool doble = ahora - ultimoClic <= GetDoubleClickTime()
                    && Math.Abs(p.X - ultimoSitio.X) <= GetSystemMetrics(36) / 2 && Math.Abs(p.Y - ultimoSitio.Y) <= GetSystemMetrics(37) / 2;
                ultimoClic = doble ? 0 : ahora;
                ultimoSitio = p;
                Decir(doble ? "doble" : "bajar", p);
            }
            else if ((botones & 0x0002) != 0) Decir("subir", p);
            else if ((botones & 0x0400) != 0) Decir("rueda", p, rueda);
            else Decir("mover", p);
        }

        /// <summary>Un mensaje de ratón a la página, en píxeles físicos relativos al monitor.</summary>
        void Decir(string tipo, POINT p, int rueda = 0) =>
            web?.CoreWebView2.PostWebMessageAsJson($"{{\"t\":\"{tipo}\",\"x\":{p.X - monitor.Left},\"y\":{p.Y - monitor.Top},\"d\":{rueda}}}");

        /// <summary>
        /// Red de seguridad: toda ventana visible y en capas del proceso de WebView2 pasa a
        /// "atraviesa clics", por si alguna vuelve a ponerse encima del escritorio.
        /// </summary>
        public void Atravesables()
        {
            if (web == null) return;
            uint navegador;
            try { navegador = web.CoreWebView2.BrowserProcessId; } catch (Exception) { return; }
            EnumWindows((h, _) =>
            {
                GetWindowThreadProcessId(h, out uint pid);
                if (pid != navegador || !IsWindowVisible(h)) return true;
                long ex = GetWindowLongPtr(h, -20).ToInt64();
                if ((ex & 0x80000 /*LAYERED*/) != 0 && (ex & 0x20 /*TRANSPARENT*/) == 0)
                {
                    SetWindowLongPtr(h, -20, (IntPtr)(ex | 0x20 | WS_EX_NOACTIVATE));
                    Registro.Anotar($"fondo: ventana invisible de WebView2 {h} ahora atraviesa clics");
                }
                return true;
            }, IntPtr.Zero);
        }

        public void Cerrar()
        {
            try { web?.Close(); } catch (Exception) { }
            web = null;
            if (destino != null) Marshal.ReleaseComObject(destino);
            destino = null;
            if (padre.Handle != IntPtr.Zero) padre.DestroyHandle();
        }
    }

    /// <summary>
    /// Ratón "crudo" en una ventana solo de mensajes del pintor (RIDEV_INPUTSINK: aunque no tenga
    /// el foco). No es un hook: no se mete en la cadena del ratón de todo el sistema.
    /// </summary>
    sealed class Oyente : NativeWindow
    {
        readonly Action<(ushort botones, short rueda)> alRaton;

        public Oyente(Action<(ushort botones, short rueda)> alRaton)
        {
            this.alRaton = alRaton;
            CreateHandle(new CreateParams { Caption = "infinite-desk fondo (ratón)", Parent = (IntPtr)(-3) /*HWND_MESSAGE*/ });
            var dispositivo = new RAWINPUTDEVICE { usUsagePage = 1, usUsage = 2, dwFlags = 0x100 /*RIDEV_INPUTSINK*/, hwndTarget = Handle };
            RegisterRawInputDevices([dispositivo], 1, Marshal.SizeOf<RAWINPUTDEVICE>());
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x00FF /*WM_INPUT*/ && Leer(m.LParam) is { } e) alRaton(e);
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
    }

    /// <summary>
    /// ¿Hay un icono del escritorio en ese punto? Se pregunta por accesibilidad (MSAA, como un
    /// lector de pantalla: solo lectura) a la lista de iconos del Explorador: accHitTest devuelve el
    /// número del icono, o 0 si es la lista vacía. Con límite de tiempo: si el Explorador no contesta
    /// en 200 ms, se da por que no (el fondo no se queda esperando a un Explorador colgado).
    /// Medido: en el centro de un icono, 1; en una zona vacía, 0; aunque haya ventanas encima.
    /// </summary>
    static bool SobreUnIcono(POINT p)
    {
        var pregunta = Task.Run(() =>
        {
            try
            {
                var lista = ListaDeIconos();
                if (lista == IntPtr.Zero) return false;
                var iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); // IID_IAccessible
                if (AccessibleObjectFromWindow(lista, 0xFFFFFFFC /*OBJID_CLIENT*/, ref iid, out var o) != 0 || o is not Accessibility.IAccessible acc) return false;
                var hijo = acc.accHitTest(p.X, p.Y);
                return (hijo is int i && i > 0) || hijo is Accessibility.IAccessible;
            }
            catch (Exception) { return false; }
        });
        return pregunta.Wait(200) && pregunta.Result;
    }

    /// <summary>La lista de iconos del escritorio (SysListView32 dentro de SHELLDLL_DefView, bajo Progman o una WorkerW).</summary>
    static IntPtr ListaDeIconos()
    {
        var vista = FindWindowEx(FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
        if (vista == IntPtr.Zero)
            EnumWindows((h, _) =>
            {
                var v = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (v == IntPtr.Zero) return true;
                vista = v;
                return false;
            }, IntPtr.Zero);
        return vista == IntPtr.Zero ? IntPtr.Zero : FindWindowEx(vista, IntPtr.Zero, "SysListView32", null);
    }

    [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h, uint id, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object? o);

    /// <summary>
    /// El cursor está sobre el escritorio (los iconos o el fondo), no sobre otra ventana. No vale
    /// WindowFromPoint: no se salta las ventanas que el ratón de verdad atraviesa, y WebView2 crea
    /// por su cuenta una de opacidad 0 del tamaño de cada monitor (y el overlay de NVIDIA otra):
    /// con ella, el ratón nunca llegaba al fondo del monitor principal (medido). Se recorren las
    /// de primer nivel de arriba abajo, saltando las invisibles, las que atraviesa el ratón, las de
    /// opacidad 0 y las ocultas por el sistema; la primera que queda decide.
    /// </summary>
    static bool SobreElEscritorio(POINT p)
    {
        bool escritorio = false;
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h) || !GetWindowRect(h, out RECT r) || p.X < r.Left || p.X >= r.Right || p.Y < r.Top || p.Y >= r.Bottom) return true;
            long ex = GetWindowLongPtr(h, -20 /*GWL_EXSTYLE*/).ToInt64();
            if ((ex & 0x20 /*WS_EX_TRANSPARENT*/) != 0) return true;
            if ((ex & 0x80000 /*WS_EX_LAYERED*/) != 0 && GetLayeredWindowAttributes(h, out uint _, out byte alfa, out uint banderas) && (banderas & 2) != 0 && alfa == 0) return true;
            if (DwmGetWindowAttribute(h, 14 /*DWMWA_CLOAKED*/, out int oculta, 4) == 0 && oculta != 0) return true;
            var c = new StringBuilder(32);
            GetClassName(h, c, c.Capacity);
            escritorio = c.ToString() is "Progman" or "WorkerW";
            return false;
        }, IntPtr.Zero);
        return escritorio;
    }

    /// <summary>
    /// ¿Hay alguna ventana visible y opaca que cubra toda esta área de trabajo (el mundo a
    /// pantalla completa, algo maximizado)? Entonces el fondo no se ve y pintarlo solo gasta. No
    /// basta mirar la ACTIVA: escribiendo en una pantalla la activa es esa ventana, y el fondo
    /// seguía pintando detrás del mundo (medido: 49 % de CPU sin que nadie lo viera). Se saltan las
    /// minimizadas, las ocultas por el sistema, las que atraviesa el ratón y las de opacidad 0.
    /// </summary>
    static bool Tapado(RECT w)
    {
        bool tapado = false;
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h) || IsIconic(h) || !GetWindowRect(h, out RECT r)) return true;
            if (r.Left > w.Left || r.Top > w.Top || r.Right < w.Right || r.Bottom < w.Bottom) return true;
            var c = new StringBuilder(32);
            GetClassName(h, c, c.Capacity);
            if (c.ToString() is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd") return true;
            long ex = GetWindowLongPtr(h, -20).ToInt64();
            if ((ex & 0x20 /*WS_EX_TRANSPARENT*/) != 0) return true;
            if ((ex & 0x80000) != 0 && GetLayeredWindowAttributes(h, out uint _, out byte alfa, out uint banderas) && (banderas & 2) != 0 && alfa == 0) return true;
            if (DwmGetWindowAttribute(h, 14 /*DWMWA_CLOAKED*/, out int oculta, 4) == 0 && oculta != 0) return true;
            tapado = true;
            return false;
        }, IntPtr.Zero);
        return tapado;
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
        SendMessageTimeout(progman, 0x052C, (IntPtr)0xD, (IntPtr)0x1, 0x2 /*SMTO_ABORTIFHUNG*/, 1000, out _);
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
    const uint WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000, WS_DISABLED = 0x08000000, WS_POPUP = 0x80000000,
        WS_EX_NOACTIVATE = 0x08000000, WS_EX_NOPARENTNOTIFY = 0x4, WS_EX_TOOLWINDOW = 0x80;

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
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint clave, out byte alfa, out uint banderas);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int atributo, out int valor, int tam);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
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
