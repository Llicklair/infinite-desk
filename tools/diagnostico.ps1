# npm run diagnostico (Windows): una foto del estado de Windows y de infinite-desk para cuando la
# barra de tareas o el buscador se quedan sin responder. Se ejecuta ANTES de reiniciar nada (el
# reinicio borra las pistas). Uso real: la barra se bloqueó con el mundo cerrado y la causa quedó
# sin identificar (docs/evidencia.md, 2026-09-25). Lo deja en %LOCALAPPDATA%\infinite-desk.
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text; using System.Diagnostics; using System.Collections.Generic;
[ComImport, Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVirtualDesktopManager { [PreserveSig] int IsWindowOnCurrentVirtualDesktop(IntPtr h, out int en); [PreserveSig] int GetWindowDesktopId(IntPtr h, out Guid id); }
[ComImport, Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")] public class VirtualDesktopManager { }
public static class Diag {
  public delegate bool E(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO { public int cbSize; public int flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rc; }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool EnumWindows(E e, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO i);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern bool GetClipCursor(out RECT r);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetL(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr h, out uint k, out byte a, out uint f);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);

  public static string N(IntPtr h) {
    if (h == IntPtr.Zero) return "-";
    uint p; uint tid = GetWindowThreadProcessId(h, out p);
    var t = new StringBuilder(100); GetWindowText(h, t, 100); var c = new StringBuilder(80); GetClassName(h, c, 80);
    string n = "?"; try { n = Process.GetProcessById((int)p).ProcessName; } catch { }
    return n + "/" + p + "/hilo " + tid + " " + c + " '" + t + "'";
  }
  public static string Hilo(string que, IntPtr h) {
    uint p; uint tid = GetWindowThreadProcessId(h, out p);
    var i = new GUITHREADINFO(); i.cbSize = Marshal.SizeOf(i); GetGUIThreadInfo(tid, ref i);
    var reloj = Stopwatch.StartNew(); IntPtr r;
    bool responde = SendMessageTimeout(h, 0, IntPtr.Zero, IntPtr.Zero, 0x2, 2000, out r) != IntPtr.Zero;
    return que + ": " + N(h) + "\n  colgada=" + IsHungAppWindow(h) + " responde=" + responde + " (" + reloj.ElapsedMilliseconds + " ms)"
      + "\n  captura=" + N(i.hwndCapture) + "\n  activa=" + N(i.hwndActive) + "\n  foco=" + N(i.hwndFocus)
      + "\n  menú=" + N(i.hwndMenuOwner) + " moviendo=" + N(i.hwndMoveSize) + " flags=0x" + i.flags.ToString("X");
  }
  /// Las ventanas de primer nivel visibles que contienen un punto, de arriba abajo: qué tapa qué.
  public static string EnPunto(int x, int y) {
    var sb = new StringBuilder(); int n = 0;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      RECT r; GetWindowRect(h, out r); if (x < r.L || x >= r.R || y < r.T || y >= r.B) return true;
      long ex = GetL(h, -20).ToInt64(); uint k; byte a = 255; uint f;
      if ((ex & 0x80000) != 0) GetLayeredWindowAttributes(h, out k, out a, out f);
      int cl; DwmGetWindowAttribute(h, 14, out cl, 4);
      sb.Append("  " + (++n) + ". " + N(h) + " encima=" + ((ex & 8) != 0) + " atraviesa=" + ((ex & 0x20) != 0) + " alfa=" + a + " oculta=" + cl + "\n");
      return n < 12; }, IntPtr.Zero);
    return sb.ToString();
  }
  /// Ventanas de programa visibles SIN escritorio virtual. El selector de Edge/Chrome (N) solo lista
  /// las del escritorio actual: si el Explorador deja de apuntar las ventanas nuevas a un escritorio
  /// (medido tras reiniciarlo: ninguna ventana nueva tenía), esas no salen en N.
  public static string SinEscritorio() {
    var sb = new StringBuilder(); int con = 0;
    var m = (IVirtualDesktopManager)new VirtualDesktopManager();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero || (GetL(h, -20).ToInt64() & 0x80) != 0) return true;
      var t = new StringBuilder(10); if (GetWindowText(h, t, 10) == 0) return true;
      Guid id; if (m.GetWindowDesktopId(h, out id) != 0) return true;
      if (id == Guid.Empty) sb.Append("  " + N(h) + "\n"); else con++;
      return true; }, IntPtr.Zero);
    return "  con escritorio: " + con + "\n" + (sb.Length == 0 ? "  sin escritorio: ninguna\n" : "  SIN escritorio (no salen en N):\n" + sb);
  }
  /// Toda ventana invisible y atravesable con título (lo que deja el puente al esconder).
  public static string Escondidas() {
    var sb = new StringBuilder();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true; long ex = GetL(h, -20).ToInt64();
      if ((ex & 0x80000) == 0 || (ex & 0x20) == 0) return true;
      uint k; byte a; uint f; if (!GetLayeredWindowAttributes(h, out k, out a, out f) || a > 1) return true;
      sb.Append("  " + N(h) + "\n"); return true; }, IntPtr.Zero);
    return sb.Length == 0 ? "  (ninguna)\n" : sb.ToString();
  }
}
'@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8 # tildes bien en la terminal
[void][Diag]::SetProcessDpiAwarenessContext([IntPtr](-4))
$datos = Join-Path $env:LOCALAPPDATA 'infinite-desk'
New-Item -ItemType Directory -Force $datos | Out-Null
$fichero = Join-Path $datos ("diagnostico-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".txt")
$s = New-Object System.Text.StringBuilder
function L([string]$t) { [void]$s.AppendLine($t) }

L "diagnóstico de infinite-desk · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
L ""
L "== barra de tareas y escritorio =="
$bandeja = [Diag]::FindWindow('Shell_TrayWnd', $null)
L ([Diag]::Hilo('barra de tareas', $bandeja))
L ([Diag]::Hilo('primer plano', [Diag]::GetForegroundWindow()))
$r = New-Object Diag+RECT; [void][Diag]::GetWindowRect($bandeja, [ref]$r)
L "barra en $($r.L),$($r.T) - $($r.R),$($r.B)"
$x = [int](($r.L + $r.R) / 2); $y = [int](($r.T + $r.B) / 2)
L "ventanas en el centro de la barra ($x,$y), de arriba abajo:"
L ([Diag]::EnPunto($x, $y))
$c = New-Object Diag+RECT; [void][Diag]::GetClipCursor([ref]$c)
$p = New-Object Diag+POINT; [void][Diag]::GetCursorPos([ref]$p)
L "ratón en $($p.X),$($p.Y) · confinado a $($c.L),$($c.T) - $($c.R),$($c.B)"
L ""
L "== escritorios virtuales =="
L ([Diag]::SinEscritorio())
L "== procesos del shell =="
foreach ($n in 'explorer', 'SearchApp', 'SearchHost', 'StartMenuExperienceHost', 'ShellExperienceHost', 'TextInputHost') {
  Get-Process $n -ErrorAction SilentlyContinue | ForEach-Object { L "  $($_.ProcessName)/$($_.Id) responde=$($_.Responding) desde $($_.StartTime.ToString('HH:mm:ss')) hilos=$($_.Threads.Count)" }
}
L ""
L "== infinite-desk =="
Get-CimInstance Win32_Process -Filter "Name='infinite-desk-bridge.exe'" | ForEach-Object {
  L "  $($_.ProcessId) desde $($_.CreationDate.ToString('HH:mm:ss')) $(if ($_.CommandLine -like '*--fondo*') { 'fondo' } else { 'puente' })"
}
Get-Process msedge, chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like 'infinite-desk *' } |
  ForEach-Object { L "  mundo: $([Diag]::N($_.MainWindowHandle))"; L ([Diag]::Hilo('  mundo', $_.MainWindowHandle)) }
L "ventanas escondidas (invisibles y atravesables):"
L ([Diag]::Escondidas())
$apuntadas = Join-Path $datos 'escondidas.txt'
if (Test-Path $apuntadas) { L "escondidas.txt: $((Get-Content $apuntadas) -join ', ')" }
L ""
foreach ($nombre in 'puente.log', 'fondo.log') {
  L "== últimas 60 líneas de $nombre =="
  $log = Join-Path $datos $nombre
  if (Test-Path $log) { Get-Content $log -Tail 60 -Encoding UTF8 | ForEach-Object { L "  $_" } }
  L ""
}

[System.IO.File]::WriteAllText($fichero, $s.ToString(), [System.Text.Encoding]::UTF8)
$s.ToString()
"guardado en $fichero"
