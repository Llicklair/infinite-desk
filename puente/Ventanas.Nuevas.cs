// Que lo recién abierto (F, Enter en una isla) y lo minimizado lleguen al selector de N, que no
// ofrece ventanas minimizadas: VS Code crea sus ventanas nuevas y las MINIMIZA él mismo a destiempo
// (imita a la última que se cerró; medido: tras ~1 s, y otra vez más de 10 s después).
using System.Runtime.InteropServices;

namespace InfiniteDesk.Puente;

static partial class Ventanas
{
    /// <summary>Las ventanas de primer nivel que hay ahora (para ver cuáles son nuevas después).</summary>
    public static HashSet<IntPtr> DePrimerNivel()
    {
        var r = new HashSet<IntPtr>();
        EnumWindows((h, _) => { r.Add(h); return true; }, IntPtr.Zero);
        return r;
    }

    /// <summary>
    /// Al pulsar N, justo antes del selector: las ventanas de aplicación minimizadas de un tamaño
    /// que valga la pena (300×200 o más: Discord restauraba a 314×50 y dejaba un recuadro blanco) se
    /// restauran sin activarlas, detrás del mundo. Es lo que entrar.ps1 hace al entrar.
    /// </summary>
    public static int RestaurarParaCapturar()
    {
        int n = 0;
        lock (cerrojo)
        {
            if (!MundoAbierto()) return 0;
            uint delMundo = Proceso(mundo);
            EnumWindows((h, _) =>
            {
                if (!IsWindowVisible(h) || !IsIconic(h) || GetWindowTextLength(h) == 0 || GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) return true;
                if ((GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64() & WS_EX_TOOLWINDOW) != 0) return true;
                if (Proceso(h) == delMundo || escondidas.Contains(h)) return true;
                var p = new WINDOWPLACEMENT { length = Marshal.SizeOf<WINDOWPLACEMENT>() };
                if (!GetWindowPlacement(h, ref p) || p.normal.Right - p.normal.Left < 300 || p.normal.Bottom - p.normal.Top < 200) return true;
                ShowWindow(h, SW_SHOWNOACTIVATE);
                DetrasDelMundo(h);
                Registro.Anotar($"N: {h} \"{Titulo(h)}\" estaba minimizada: restaurada detrás del mundo para el selector");
                n++;
                return true;
            }, IntPtr.Zero);
        }
        return n;
    }

    /// <summary>
    /// Durante 10 s tras abrir algo, toda ventana nueva de otro proceso que no sea el del mundo (el
    /// selector de N también es una ventana de Edge) se restaura si nace o se vuelve minimizada, se
    /// coloca detrás del mundo (si no, tapaba el selector: "aparece superpuesta al mundo") y el
    /// mundo recupera el foco. Cuando está lista, se avisa al mundo ("… is ready: press N").
    /// </summary>
    public static void QueNoNazcanMinimizadas(HashSet<IntPtr> antes, Action<string> lista) => _ = Task.Run(async () =>
    {
        var vistas = new HashSet<IntPtr>(antes);
        var nuevas = new HashSet<IntPtr>();
        for (int n = 0; n < 40; n++)
        {
            await Task.Delay(250);
            foreach (var h in nuevas)
                if (IsWindow(h) && IsIconic(h))
                    lock (cerrojo)
                    {
                        ShowWindow(h, SW_SHOWNOACTIVATE);
                        if (MundoAbierto()) DetrasDelMundo(h);
                        Registro.Anotar($"ventana nueva {h} \"{Titulo(h)}\" se minimizó sola: restaurada, detrás del mundo");
                    }
            foreach (var h in DePrimerNivel())
            {
                if (!vistas.Add(h)) continue;
                if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0) { vistas.Remove(h); continue; } // aún naciendo
                lock (cerrojo)
                {
                    if (!MundoAbierto() || Proceso(h) == Proceso(mundo)) continue;
                    bool minimizada = IsIconic(h);
                    if (minimizada) ShowWindow(h, SW_SHOWNOACTIVATE);
                    DetrasDelMundo(h);
                    if (GetForegroundWindow() == h) Activar(mundo);
                    nuevas.Add(h);
                    lista(Titulo(h));
                    Registro.Anotar($"ventana nueva {h} \"{Titulo(h)}\"{(minimizada ? " (nació minimizada)" : "")}: detrás del mundo, lista para N");
                }
            }
        }
    });
}
