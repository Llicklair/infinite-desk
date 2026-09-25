// Escribir en una pantalla (Enter): la ventana real se activa y queda DETRÁS del mundo (regla 3),
// el ratón sobre la pantalla 3D se le manda por mensajes, y sus diálogos salen por encima.
using System.Runtime.InteropServices;

namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    static Timer? vigia;
    static int recolocadas;

    /// <summary>
    /// Entrar en una pantalla: el mundo deja de poder activarse con clics (los clics sobre él son
    /// para la pantalla 3D) y la ventana real se activa en su sitio: el teclado va a ella de verdad
    /// (regla 1) y, como el mundo es en capas, sigue viva, vídeos incluidos (regla 2).
    /// </summary>
    public static string? Entrar(IntPtr h)
    {
        lock (cerrojo)
        {
            if (!IsWindow(h)) return "that window no longer exists";
            if (DeWindows(h)) return "that is a Windows window (taskbar, desktop): left alone";
            if (objetivo != IntPtr.Zero) SalirSinCerrojo();
            // Solo el mundo que se presentó por su título. Antes, si no, se tomaba la ventana de
            // delante: si era la barra de tareas, se la dejaba no activable (primer uso real: "me
            // has roto la barra de tareas").
            if (mundo == IntPtr.Zero || !IsWindow(mundo)) return "the space hasn't connected to the bridge yet: wait a moment";
            if (mundo == h) return "that window is already in front: go back to the space and press Enter";
            if (IsIconic(h)) ShowWindow(h, SW_SHOWNOACTIVATE); // minimizada no se pinta
            Limpiar(h);
            // Si estaba escondida se QUEDA escondida: el teclado le llega igual por estar activa, y
            // los clics van por mensajes. Devolverla hacía que "cada vez que interactúo con una
            // pantalla, la abre" (uso real).

            PonerNoActivable(mundo, true);
            objetivo = h;
            if (!Activar(h))
            {
                SalirSinCerrojo();
                return "Windows wouldn't let the window be activated";
            }
            if (!escondidas.Contains(h)) DetrasDelMundo(h);
            recolocadas = 0;
            vigia ??= new Timer(_ => Vigilar(), null, Timeout.Infinite, Timeout.Infinite);
            vigia.Change(0, 200);
            return null;
        }
    }

    public static void Salir() { lock (cerrojo) SalirSinCerrojo(); }

    static void SalirSinCerrojo()
    {
        if (objetivo == IntPtr.Zero) return;
        if (recolocadas > 1) Registro.Anotar($"la ventana {objetivo} se puso delante del mundo {recolocadas} veces mientras se escribía");
        objetivo = IntPtr.Zero;
        vigia?.Change(Timeout.Infinite, Timeout.Infinite);
        if (!IsWindow(mundo)) return;
        PonerNoActivable(mundo, false);
        Activar(mundo);
    }

    /// <summary>
    /// Regla 3, vigilada cada 200 ms mientras se escribe: si el objetivo se ha puesto delante del
    /// mundo (al activarse sube arriba del todo), vuelve detrás. Antes se hacía al revés, poniendo
    /// el mundo siempre-encima, pero Edge se lo quitaba sin parar (medido: cada 200 ms) y la ventana
    /// real salía delante a pantalla completa.
    /// </summary>
    static void Vigilar()
    {
        lock (cerrojo)
        {
            if (objetivo == IntPtr.Zero || !IsWindow(mundo) || !IsWindow(objetivo)) { vigia?.Change(Timeout.Infinite, Timeout.Infinite); return; }
            if (escondidas.Contains(objetivo) || !EncimaDe(objetivo, mundo) || TieneDialogo(objetivo)) return;
            DetrasDelMundo(objetivo);
            if (recolocadas++ == 0) Registro.Anotar($"la ventana {objetivo} se había puesto delante del mundo: devuelta detrás");
        }
    }

    /// <summary>¿Está <paramref name="a"/> por encima de <paramref name="b"/> en el apilado?</summary>
    static bool EncimaDe(IntPtr a, IntPtr b)
    {
        for (var w = GetWindow(a, 2 /*GW_HWNDNEXT*/); w != IntPtr.Zero; w = GetWindow(w, 2))
            if (w == b) return true;
        return false;
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

    /// <summary>
    /// Una ventana nueva aparece mientras se escribe. Si es del mismo programa (un diálogo, un
    /// menú, un desplegable), se pone por encima del mundo: si no, se abría detrás, invisible, y el
    /// programa se quedaba esperando (uso real: "Open Folder" en VS Code; ADR 0002 lo dejaba por
    /// medir). Un diálogo de verdad (#32770) se activa también, para que reciba teclado y ratón.
    /// </summary>
    public static void AlMostrarse(IntPtr h)
    {
        lock (cerrojo)
        {
            if (objetivo == IntPtr.Zero || h == objetivo || h == mundo || !IsWindow(h)) return;
            if (GetAncestor(h, 2 /*GA_ROOT*/) != h || Proceso(h) != Proceso(objetivo)) return;
            SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            bool dialogo = Clase(h) == "#32770";
            if (dialogo) Activar(h);
            Registro.Anotar($"ventana nueva de la pantalla {objetivo}: {h} \"{Titulo(h)}\" por encima del mundo{(dialogo ? " y activada" : "")}");
        }
    }

    /// <summary>
    /// Un evento de ratón sobre la pantalla 3D, en coordenadas 0..1 de la imagen capturada. La
    /// captura es el rectángulo VISIBLE de la ventana (sin los bordes invisibles de 7 px), así que
    /// se escala sobre ese y se pasa a coordenadas de cliente.
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
                // WM_MOUSEWHEEL lleva coordenadas de PANTALLA, no de cliente. Y Chromium (Chrome,
                // VS Code…) reenvía la rueda a la ventana que hay de verdad bajo ese punto: el
                // mundo, que está delante. Medido: con el mundo atravesable un instante, la ventana
                // se desplaza (scroll 300); sin eso, nada (uso real: "que funcione el scroll").
                var wp = (IntPtr)((delta << 16) | (Teclas(botones) & 0xFFFF));
                RuedaConMundoAtravesable(h, wp, (IntPtr)((enPantalla.Y << 16) | (enPantalla.X & 0xFFFF)));
                break;
        }
        // Un clic sobre el mundo puede reactivarlo aun siendo no activable (Chromium hace su propio
        // SetFocus): si pasa, el teclado vuelve a la ventana. Y activarla la sube arriba del todo:
        // vuelve detrás del mundo en el acto (regla 3; uso real: "pulso Enter y después clic
        // izquierdo, y la ventana se pone por encima a pantalla completa").
        if (tipo is not ("bajar" or "doble")) return;
        lock (cerrojo)
        {
            if (objetivo != h || GetForegroundWindow() == h || !Activar(h)) return;
            if (!escondidas.Contains(h) && MundoAbierto() && !TieneDialogo(h)) DetrasDelMundo(h);
        }
    }

    /// <summary>
    /// El mundo, atravesable solo MIENTRAS la ventana procesa la rueda (SendMessageTimeout espera,
    /// como mucho 100 ms): así no se la reenvía al mundo. Si durase más, las siguientes muescas de
    /// la rueda de verdad cruzarían el mundo y caerían en lo que hubiera detrás del cursor.
    /// </summary>
    static void RuedaConMundoAtravesable(IntPtr h, IntPtr wp, IntPtr lp)
    {
        lock (cerrojo)
        {
            if (!IsWindow(mundo)) { PostMessage(h, 0x020A, wp, lp); return; }
            long ex = GetWindowLongPtr(mundo, GWL_EXSTYLE).ToInt64();
            SetWindowLongPtr(mundo, GWL_EXSTYLE, (IntPtr)(ex | WS_EX_TRANSPARENT));
            try { SendMessageTimeout(h, 0x020A, wp, lp, 0x2 /*SMTO_ABORTIFHUNG*/, 100, out _); }
            finally { SetWindowLongPtr(mundo, GWL_EXSTYLE, (IntPtr)(ex & ~WS_EX_TRANSPARENT)); }
        }
    }

    /// <summary>MouseEvent.buttons (1 izq, 2 der, 4 medio) -> MK_LBUTTON/MK_RBUTTON/MK_MBUTTON.</summary>
    static int Teclas(int botones) => ((botones & 1) != 0 ? 0x1 : 0) | ((botones & 2) != 0 ? 0x2 : 0) | ((botones & 4) != 0 ? 0x10 : 0);

    static void PonerNoActivable(IntPtr h, bool si)
    {
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        ex = si ? ex | WS_EX_NOACTIVATE : ex & ~WS_EX_NOACTIVATE;
        SetWindowLongPtr(h, GWL_EXSTYLE, (IntPtr)ex);
        SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
}
