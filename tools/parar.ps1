# npm run parar (Windows): para todo lo de infinite-desk y deja las ventanas como estaban.
# Para cuando algo se queda raro (la barra de tareas, una ventana que no se deja clicar). No
# desinstala nada: el arranque del fondo y el clic derecho siguen puestos (npm run fondo -- --quitar).
param([switch]$Explorador)

Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
[ComImport, Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITaskbarList { void HrInit(); void AddTab(IntPtr h); void DeleteTab(IntPtr h); void ActivateTab(IntPtr h); void SetActiveAlt(IntPtr h); }
[ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")] public class TaskbarList { }
public static class Parar {
  public delegate bool E(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(E e, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetL(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetL(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h, out uint k, out byte a, out uint f);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint k, byte a, uint f);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr t, int x, int y, int w, int a, uint f);

  /// Quita lo que pone el puente al esconder una ventana: atraviesa clics, invisible, siempre encima.
  public static string Normal(IntPtr h) {
    if (!IsWindow(h)) return null;
    long ex = GetL(h, -20).ToInt64();
    SetL(h, -20, (IntPtr)(ex & ~0x20L & ~0x08000000L)); // ni WS_EX_TRANSPARENT ni WS_EX_NOACTIVATE
    if ((ex & 0x80000) != 0) SetLayeredWindowAttributes(h, 0, 255, 2);
    SetWindowPos(h, (IntPtr)(-2), 0, 0, 0, 0, 0x1 | 0x2 | 0x10 | 0x20); // HWND_NOTOPMOST
    try { var b = (ITaskbarList)new TaskbarList(); b.HrInit(); b.AddTab(h); } catch { }
    var t = new StringBuilder(120); GetWindowText(h, t, 120);
    return h + " '" + t + "'";
  }

  /// Toda ventana con título que se haya quedado invisible y atravesable (por si el fichero no la tiene).
  public static List<IntPtr> Escondidas() {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      long ex = GetL(h, -20).ToInt64();
      if ((ex & 0x80000) == 0 || (ex & 0x20) == 0) return true;
      uint k; byte a; uint f;
      if (!GetLayeredWindowAttributes(h, out k, out a, out f) || (f & 2) == 0 || a > 1) return true;
      var t = new StringBuilder(120); GetWindowText(h, t, 120);
      if (t.Length > 0 && !t.ToString().Contains("infinite-desk")) r.Add(h);
      return true; }, IntPtr.Zero);
    return r;
  }
}
'@

$datos = Join-Path $env:LOCALAPPDATA 'infinite-desk'
$puentes = { Get-CimInstance Win32_Process -Filter "Name='infinite-desk-bridge.exe'" }

# 1. El mundo: por las buenas (así el puente, si sigue vivo, devuelve lo que tuviera enganchado).
Get-Process msedge, chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like 'infinite-desk ·*' } |
  ForEach-Object { [void]$_.CloseMainWindow(); "mundo cerrado: $($_.MainWindowTitle)" }
Start-Sleep -Milliseconds 1500

# 2. El puente (el mismo .exe sin --fondo).
& $puentes | Where-Object CommandLine -notlike '*--fondo*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "puente parado ($($_.ProcessId))" }

# 3. Las ventanas que el puente escondió: las que apuntó, y cualquier otra invisible y atravesable.
$apuntadas = @()
$fichero = Join-Path $datos 'escondidas.txt'
if (Test-Path $fichero) { $apuntadas = Get-Content $fichero | ForEach-Object { [IntPtr][long]$_ }; Remove-Item $fichero -Force }
foreach ($h in @($apuntadas) + @([Parar]::Escondidas()) | Select-Object -Unique) {
  $v = [Parar]::Normal($h); if ($v) { "ventana devuelta: $v" }
}

# 4. El fondo animado: la señal de parar y, si no cierra, a la fuerza (con su WebView2).
$fondo = & $puentes | Where-Object CommandLine -like '*--fondo*'
if ($fondo) {
  & $fondo[0].ExecutablePath --fondo --parar
  Start-Sleep -Seconds 4
  & $puentes | Where-Object CommandLine -like '*--fondo*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object CommandLine -like '*webview-fondo*' |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  "fondo animado parado"
}

# 5. Si la barra de tareas o el buscador se han quedado sordos: el Explorador de nuevo.
if ($Explorador) {
  Stop-Process -Name explorer -Force
  Start-Sleep -Seconds 3
  if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
  "Explorador reiniciado"
}
"listo: nada de infinite-desk en marcha (el fondo vuelve al iniciar sesión; npm run fondo -- --quitar para quitarlo)"
