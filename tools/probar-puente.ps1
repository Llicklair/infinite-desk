# Ayudante de tools/probar-puente.mjs: mira y toca ventanas por su HWND.
#   buscar <prefijo>   la primera ventana visible cuyo título empieza así (sin el fondo)
#   estado <hwnd>      "atraviesa encima alfa minimizada" de una vez
#   titulo | minimizar | restaurar | delante | cerrar <hwnd>
#   sin-escritorio     abre 20 s una ventana propia SIN escritorio virtual (como las que N no ve)
#   vigilar <h>,<mundo>,<ms>  mira el apilado sin parar esos ms: "encima N de M" (veces que <h> estaba
#                      por encima del mundo, de todas las que se miró)
param([string]$Accion, [string]$Arg)
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
[ComImport, Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IBarra { void HrInit(); void AddTab(IntPtr h); void DeleteTab(IntPtr h); void ActivateTab(IntPtr h); void SetActiveAlt(IntPtr h); }
[ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")] public class Barra { }
public static class P {
  public delegate bool E(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(E e, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);
  // Delante de verdad (restaurar no la sube si otra se le puso encima): F24 da "la última entrada".
  public static void Delante(IntPtr h) { ShowWindow(h, 9); keybd_event(0x87, 0, 0, UIntPtr.Zero); keybd_event(0x87, 0, 2, UIntPtr.Zero); SetForegroundWindow(h); }
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  // Como EncimaDe del puente: si el mundo sale después de h en el apilado, h está por encima.
  public static bool Encima(IntPtr a, IntPtr b) { for (var w = GetWindow(a, 2); w != IntPtr.Zero; w = GetWindow(w, 2)) if (w == b) return true; return false; }
  public static string Vigilar(IntPtr h, IntPtr m, int ms) { int n = 0, total = 0; var fin = DateTime.UtcNow.AddMilliseconds(ms);
    while (DateTime.UtcNow < fin) { total++; if (Encima(h, m)) n++; } return "encima " + n + " de " + total; }
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetL(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr h, out uint k, out byte a, out uint f);
  public static string T(IntPtr h) { var t = new StringBuilder(300); GetWindowText(h, t, 300); return t.ToString(); }
  public static long Buscar(string p) { long r = 0; EnumWindows((h, l) => { var t = T(h);
    if (IsWindowVisible(h) && t.StartsWith(p) && !t.Contains("fondo")) { r = h.ToInt64(); return false; } return true; }, IntPtr.Zero); return r; }
  public static string Estado(IntPtr h) { long ex = GetL(h, -20).ToInt64(); uint k, f; byte a = 255;
    if ((ex & 0x80000) != 0 && !GetLayeredWindowAttributes(h, out k, out a, out f)) a = 255;
    return ((ex & 0x20) != 0 ? "atraviesa " : "") + ((ex & 8) != 0 ? "encima " : "") + "alfa" + a + (IsIconic(h) ? " minimizada" : ""); }
  public static void QuitarEscritorio(IntPtr h) { var b = (IBarra)new Barra(); b.HrInit(); b.DeleteTab(h); }
}
'@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$h = if ($Accion -notin 'buscar', 'sin-escritorio', 'vigilar') { [IntPtr][long]$Arg } else { [IntPtr]::Zero }
switch ($Accion) {
  'buscar' { [P]::Buscar($Arg) }
  'estado' { [P]::Estado($h) }
  'titulo' { [P]::T($h) }
  'minimizar' { [void][P]::ShowWindow($h, 6) }
  'restaurar' { [void][P]::ShowWindow($h, 9) }
  'delante' { [P]::Delante($h) }
  'cerrar' { [void][P]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) }
  'vigilar' { $v = $Arg -split ','; "listo"; [P]::Vigilar([IntPtr][long]$v[0], [IntPtr][long]$v[1], [int]$v[2]) }
  'sin-escritorio' {
    Add-Type -AssemblyName System.Windows.Forms
    $f = New-Object System.Windows.Forms.Form; $f.Text = 'probar-puente sin escritorio'; $f.Show()
    1..5 | ForEach-Object { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
    [P]::QuitarEscritorio($f.Handle)
    $fin = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $fin) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
    $f.Close()
  }
  'tapar' {
    # 8 s, una ventana propia siempre encima que tapa el centro de <hwnd> (como un Chrome por encima
    # del mundo, o en el monitor que no cubre): la rueda tiene que llegar igual.
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c); [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Ri, B; } [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);' -Name T -Namespace Tapa
    [void][Tapa.T]::SetProcessDpiAwarenessContext([IntPtr](-4))
    Add-Type -AssemblyName System.Windows.Forms
    $r = New-Object Tapa.T+R; [void][Tapa.T]::GetWindowRect($h, [ref]$r)
    $w = [int](($r.Ri - $r.L) * 0.4); $a = [int](($r.B - $r.T) * 0.4)
    $f = New-Object System.Windows.Forms.Form; $f.Text = 'probar-puente tapa'; $f.FormBorderStyle = 'None'; $f.TopMost = $true; $f.ShowInTaskbar = $false
    $f.StartPosition = 'Manual'; $f.Show(); $f.Bounds = New-Object System.Drawing.Rectangle(([int](($r.L + $r.Ri) / 2) - [int]($w / 2)), ([int](($r.T + $r.B) / 2) - [int]($a / 2)), $w, $a)
    $fin = (Get-Date).AddSeconds(8)
    while ((Get-Date) -lt $fin) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 }
    $f.Close()
  }
}
