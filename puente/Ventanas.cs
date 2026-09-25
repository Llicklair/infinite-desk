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
    const long WS_EX_NOACTIVATE = 0x08000000, WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOPMOST = 0x8;
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
            // Si estaba escondida (se minimizó con el mundo abierto) se QUEDA escondida: el teclado le
            // llega igual por estar activa, y los clics sobre la pantalla 3D van por mensajes.
            // Devolverla hacía que "cada vez que interactúo con una pantalla, la abre" (uso real).
            // Se minimiza de verdad al cerrar el mundo, como antes.

            SetWindowPos(mundo, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            PonerNoActivable(mundo, true);
            objetivo = h;
            if (!Activar(h))
            {
                SalirSinCerrojo();
                return "Windows wouldn't let the window be activated";
            }
            if (!escondidas.Contains(h)) DebajoDelMundo(h);
            recolocadas = 0;
            vigia ??= new Timer(_ => MantenerEncima(), null, Timeout.Infinite, Timeout.Infinite);
            vigia.Change(0, 200);
            return null;
        }
    }

    static Timer? vigia;
    static int recolocadas;

    /// <summary>
    /// Mientras se escribe en una pantalla, la ventana real tiene que quedar DEBAJO del mundo.
    /// Primero se intentó que el mundo fuese siempre-encima, pero Edge se lo quita sin parar
    /// mientras no es la ventana activa (medido: "perdido… devuelto" cada 200 ms, y la ventana
    /// real salía delante a pantalla completa). La activa no tiene por qué ser la de arriba: se
    /// deja activa (el teclado va a ella) y se coloca justo detrás del mundo, y esto se vigila.
    /// </summary>
    static void MantenerEncima()
    {
        lock (cerrojo)
        {
            if (objetivo == IntPtr.Zero || !IsWindow(mundo) || !IsWindow(objetivo)) { vigia?.Change(Timeout.Infinite, Timeout.Infinite); return; }
            if (escondidas.Contains(objetivo) || !EncimaDe(objetivo, mundo)) return; // escondida: invisible, da igual
            if (TieneDialogo(objetivo)) return; // con un diálogo abierto no se mueve: se lo llevaría detrás
            DebajoDelMundo(objetivo);
            if (recolocadas++ == 0) Registro.Anotar($"la ventana {objetivo} se había puesto delante del mundo: devuelta detrás");
        }
    }

    /// <summary>
    /// ¿Tiene la ventana un diálogo (una ventana suya, visible) abierto? Windows mueve las ventanas
    /// propiedad con su dueña: devolver VS Code detrás del mundo se llevaba detrás el "Open Folder",
    /// que se abría pero nadie veía (medido: el diálogo existió; "no sale nada", uso real).
    /// </summary>
    static bool TieneDialogo(IntPtr dueña)
    {
        bool hay = false;
        EnumWindows((h, _) =>
        {
            if (h == dueña || !IsWindowVisible(h) || GetWindow(h, 4 /*GW_OWNER*/) != dueña) return true;
            hay = true;
            return false;
        }, IntPtr.Zero);
        return hay;
    }

    static void DebajoDelMundo(IntPtr h) =>
        SetWindowPos(h, mundo, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | 0x200 /*SWP_NOOWNERZORDER*/);

    /// <summary>¿Está <paramref name="a"/> por encima de <paramref name="b"/> en el apilado?</summary>
    static bool EncimaDe(IntPtr a, IntPtr b)
    {
        for (var w = GetWindow(a, 2 /*GW_HWNDNEXT*/); w != IntPtr.Zero; w = GetWindow(w, 2))
            if (w == b) return true;
        return false;
    }

    public static void Salir() { lock (cerrojo) SalirSinCerrojo(); }

    /// <summary>
    /// Al pulsar N, justo antes del selector: las ventanas de aplicación minimizadas (de un tamaño
    /// que valga la pena, 300×200 o más: Discord restauraba a 314×50) se restauran sin activarlas,
    /// detrás del mundo, porque el selector no ofrece minimizadas. VS Code minimiza sus ventanas
    /// nuevas por su cuenta y a destiempo (medido: más de 10 s después): vigilar tras abrirlas no
    /// bastaba ("vuelve a no detectarla el menú de N", uso real). Es lo que entrar.ps1 hace al entrar.
    /// </summary>
    public static int RestaurarParaCapturar()
    {
        int n = 0;
        lock (cerrojo)
        {
            if (!MundoAbierto()) return 0;
            GetWindowThreadProcessId(mundo, out uint delMundo);
            EnumWindows((h, _) =>
            {
                if (!IsWindowVisible(h) || !IsIconic(h) || GetWindowTextLength(h) == 0 || GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) return true;
                if ((GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64() & 0x80 /*WS_EX_TOOLWINDOW*/) != 0) return true;
                GetWindowThreadProcessId(h, out uint suyo);
                if (suyo == delMundo || escondidas.Contains(h)) return true;
                var p = new WINDOWPLACEMENT { length = Marshal.SizeOf<WINDOWPLACEMENT>() };
                if (!GetWindowPlacement(h, ref p) || p.normal.Right - p.normal.Left < 300 || p.normal.Bottom - p.normal.Top < 200) return true;
                ShowWindow(h, SW_SHOWNOACTIVATE);
                SetWindowPos(h, mundo, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                Registro.Anotar($"N: {h} \"{Titulo(h)}\" estaba minimizada: restaurada detrás del mundo para el selector");
                n++;
                return true;
            }, IntPtr.Zero);
        }
        return n;
    }

    /// <summary>Las ventanas de primer nivel que hay ahora (para ver cuáles son nuevas después).</summary>
    public static HashSet<IntPtr> DePrimerNivel()
    {
        var r = new HashSet<IntPtr>();
        EnumWindows((h, _) => { r.Add(h); return true; }, IntPtr.Zero);
        return r;
    }

    /// <summary>
    /// Lo que se acaba de abrir (F, Enter en una isla) tiene que poder capturarse con N enseguida.
    /// Dos usos reales: VS Code abría la ventana nueva MINIMIZADA (recuerda el estado de la última
    /// que se cerró), y el selector no ofrece minimizadas; y si nacía normal, salía DELANTE del mundo
    /// y tapaba el selector de N, que es de la ventana del mundo ("no aparece para invocarla con
    /// N"; "aparece superpuesta al mundo"). Durante 10 s, toda ventana nueva de otro proceso que no
    /// sea el del mundo (el selector también es una ventana de Edge) se restaura si nació
    /// minimizada, se coloca detrás del mundo, y el mundo recupera el foco.
    /// </summary>
    public static void QueNoNazcanMinimizadas(HashSet<IntPtr> antes, Action<string> lista) => _ = Task.Run(async () =>
    {
        var vistas = new HashSet<IntPtr>(antes);
        var nuevas = new HashSet<IntPtr>();
        for (int n = 0; n < 40; n++)
        {
            await Task.Delay(250);
            // Las ya vistas se siguen mirando: VS Code crea la ventana normal y la MINIMIZA él mismo
            // un momento después (imita a la última que se cerró; medido: WS_MINIMIZE tras 1 s).
            foreach (var h in nuevas)
                if (IsWindow(h) && IsIconic(h))
                    lock (cerrojo)
                    {
                        ShowWindow(h, SW_SHOWNOACTIVATE);
                        if (MundoAbierto()) SetWindowPos(h, mundo, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                        Registro.Anotar($"ventana nueva {h} \"{Titulo(h)}\" se minimizó sola: restaurada, detrás del mundo");
                    }
            foreach (var h in DePrimerNivel())
            {
                if (!vistas.Add(h)) continue;
                if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0) { vistas.Remove(h); continue; } // aún naciendo: otra vuelta
                lock (cerrojo)
                {
                    if (!MundoAbierto()) continue;
                    GetWindowThreadProcessId(h, out uint suyo);
                    GetWindowThreadProcessId(mundo, out uint delMundo);
                    if (suyo == delMundo) continue; // el selector de N, o cualquier cosa del propio mundo
                    bool minimizada = IsIconic(h);
                    if (minimizada) ShowWindow(h, SW_SHOWNOACTIVATE);
                    SetWindowPos(h, mundo, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                    if (GetForegroundWindow() == h) Activar(mundo);
                    nuevas.Add(h);
                    lista(Titulo(h)); // al mundo: ya se puede traer con N
                    Registro.Anotar($"ventana nueva {h} \"{Titulo(h)}\"{(minimizada ? " (nació minimizada)" : "")}: detrás del mundo, lista para N");
                }
            }
        }
    });

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

    /// <summary>Las ventanas escondidas ahora mismo.</summary>
    static readonly HashSet<IntPtr> escondidas = [];

    /// <summary>
    /// Las escondidas, también en disco: si el puente se reinicia o se cae con una escondida, al
    /// arrancar la devuelve (<see cref="Rescatar"/>). Uso real: tras un reinicio, una ventana se
    /// quedó "atraviesa clics" para siempre ("no puedo ni cerrarla ni nada").
    /// </summary>
    static readonly string ficheroEscondidas = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "escondidas.txt");

    static void Apuntar()
    {
        try { File.WriteAllLines(ficheroEscondidas, escondidas.Select(h => h.ToInt64().ToString())); }
        catch (IOException) { }
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

    /// <summary>
    /// La devuelve a la normalidad. No se restaura un estilo "de antes" guardado (podía estar ya
    /// contaminado si el puente se reinició con ella escondida): se quita lo que pone Esconder.
    /// Con <paramref name="minimizar"/>, además la minimiza de verdad.
    /// </summary>
    static void Mostrar(IntPtr h, bool minimizar)
    {
        if (!escondidas.Remove(h)) return;
        Apuntar();
        if (IsWindow(h)) Normal(h, minimizar);
        Registro.Anotar($"{h} \"{Titulo(h)}\": {(minimizar ? "minimizada de verdad (se cerró el mundo)" : "visible otra vez")}");
    }

    static void Normal(IntPtr h, bool minimizar)
    {
        SetWindowPos(h, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)(ex & ~WS_EX_TRANSPARENT));
        SetLayeredWindowAttributes(h, 0, 255, 2); // en capas con alfa 255 se ve y se usa igual
        Barra(b => b.AddTab(h));
        if (minimizar) ShowWindow(h, 7 /*SW_SHOWMINNOACTIVE*/);
    }

    /// <summary>Al arrancar: lo que quedó escondido de un puente anterior vuelve a la normalidad.</summary>
    public static void Rescatar()
    {
        try
        {
            if (!File.Exists(ficheroEscondidas)) return;
            foreach (var linea in File.ReadAllLines(ficheroEscondidas))
                if (long.TryParse(linea, out var n) && IsWindow((IntPtr)n))
                {
                    Normal((IntPtr)n, minimizar: false);
                    Registro.Anotar($"rescatada {n} \"{Titulo((IntPtr)n)}\": escondida por un puente anterior");
                }
            File.Delete(ficheroEscondidas);
        }
        catch (IOException) { }
    }

    /// <summary>El mundo se cerró: lo escondido se minimiza de verdad, que es lo que se pidió.</summary>
    /// <summary>
    /// Esc dos veces: de vuelta al escritorio SIN cerrar el mundo (uso real: "sin querer le di a
    /// Escape dos veces y perdí lo que tenía abierto"). Se minimiza el mundo, y DESPUÉS las
    /// escondidas se minimizan de verdad (así están en la barra de tareas); en ese orden, o el
    /// vigilante de minimizados las volvería a esconder. Al volver al mundo (AlActivar), se esconden
    /// otra vez. Entrar desde el clic derecho restaura este mismo mundo (entrar.ps1).
    /// </summary>
    public static void AlEscritorio()
    {
        lock (cerrojo)
        {
            SalirSinCerrojo();
            if (!IsWindow(mundo)) return;
            ShowWindow(mundo, 6 /*SW_MINIMIZE*/);
            foreach (var h in escondidas.ToArray()) Mostrar(h, minimizar: true);
            Registro.Anotar("mundo minimizado (Esc): sigue abierto, con sus pantallas");
        }
    }

    public static void MundoCerrado()
    {
        lock (cerrojo)
        {
            // El mundo deja de contar como abierto ANTES de minimizar: si no, ese minimizado
            // volvía a esconder la ventana (uso real: VS Code invisible tras cerrar el mundo).
            mundo = IntPtr.Zero;
            foreach (var h in escondidas.ToArray()) Mostrar(h, minimizar: true);
        }
    }

    /// <summary>
    /// Una ventana nueva aparece mientras se escribe en una pantalla. Si es del mismo programa
    /// (un diálogo, un menú, un desplegable), se pone por encima del mundo: si no, se abría detrás,
    /// invisible, y el programa se quedaba esperando (uso real: "Open Folder no me deja abrir
    /// ninguna carpeta" en VS Code; ADR 0002 ya lo dejaba por medir).
    /// </summary>
    public static void AlMostrarse(IntPtr h)
    {
        lock (cerrojo)
        {
            if (objetivo == IntPtr.Zero || h == objetivo || h == mundo || !IsWindow(h)) return;
            if (GetAncestor(h, 2 /*GA_ROOT*/) != h) return; // solo ventanas de primer nivel
            GetWindowThreadProcessId(h, out uint suyo);
            GetWindowThreadProcessId(objetivo, out uint deLaPantalla);
            var clase = new StringBuilder(64);
            GetClassName(h, clase, clase.Capacity);
            if (suyo != deLaPantalla)
            {
                // Diagnóstico: ¿aparece el diálogo en otro proceso? (uso real: "Open Folder no responde").
                Registro.Anotar($"ventana nueva de OTRO proceso ({suyo}) mientras se escribe: {h} {clase} \"{Titulo(h)}\"");
                return;
            }
            SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            // Un diálogo de verdad (#32770: "Open Folder", guardar, avisos) se activa también: que
            // se vea delante y el teclado y el ratón vayan a él. Los menús y desplegables, no.
            bool dialogo = clase.ToString() == "#32770";
            if (dialogo) Activar(h);
            Registro.Anotar($"ventana nueva de la pantalla {objetivo}: {h} {clase} \"{Titulo(h)}\" puesta por encima del mundo{(dialogo ? " y activada" : "")}");
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
        if (recolocadas > 1) Registro.Anotar($"la ventana {objetivo} se puso delante del mundo {recolocadas} veces mientras se escribía");
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
        // Y activarla la sube arriba del todo: se devuelve detrás del mundo en el acto (uso real:
        // "pulso Enter y después clic izquierdo, y la ventana se pone por encima a pantalla completa").
        if (tipo is "bajar" or "doble" && objetivo == h && GetForegroundWindow() != h && Activar(h))
            lock (cerrojo) if (!escondidas.Contains(h) && MundoAbierto() && !TieneDialogo(h)) DebajoDelMundo(h);
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
    [StructLayout(LayoutKind.Sequential)] struct WINDOWPLACEMENT { public int length, flags, showCmd; public POINT min, max; public RECT normal; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref WINDOWPLACEMENT p);
    [DllImport("user32.dll")] static extern bool EnumWindows(Visitar v, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    delegate bool Visitar(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
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
