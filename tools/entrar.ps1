# "Entrar en infinite-desk" (clic derecho del escritorio, lo instala tools/fondo.mjs).
#
# Para ver el escritorio se minimiza todo, y Chromium NO puede capturar una ventana minimizada: ni
# la ofrece en el selector. Así que primero se restauran, sin activarlas, y después se abre el
# mundo a pantalla completa por encima: quedan detrás, vivas y capturables con N.
param([string]$Navegador, [string]$Perfil, [string]$Url)

Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class Ventanas {
  delegate bool Visitar(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Visitar v, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct PLACEMENT { public int len, flags, show; public int minX, minY, maxX, maxY; public RECT normal; }
  [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref PLACEMENT p);
  public static void RestaurarMinimizadas() {
    EnumWindows((h, l) => {
      // Solo ventanas de aplicación: visibles, con título, sin dueño y no de herramientas.
      bool deApp = IsWindowVisible(h) && GetWindowTextLength(h) > 0
        && GetWindow(h, 4) == IntPtr.Zero && (GetWindowLong(h, -20) & 0x80) == 0;
      // Y de un tamaño que valga la pena capturar: Discord restauraba a 314×50 y se quedaba como
      // un recuadro blanco en el escritorio (uso real).
      var p = new PLACEMENT(); p.len = Marshal.SizeOf(p);
      bool grande = GetWindowPlacement(h, ref p) && p.normal.R - p.normal.L >= 300 && p.normal.B - p.normal.T >= 200;
      if (deApp && grande && IsIconic(h)) ShowWindow(h, 4); // SW_SHOWNOACTIVATE: sin robar el foco
      return true;
    }, IntPtr.Zero);
  }
}
'@
[Ventanas]::RestaurarMinimizadas()

# El puente (ADR 0002): sin él el mundo funciona, pero no se puede escribir en las pantallas.
$raiz = Split-Path $PSScriptRoot -Parent
$puente = Join-Path $raiz 'puente\bin\Release\net10.0-windows\infinite-desk-bridge.exe'
# Se mira el puerto, no el nombre del proceso: el fondo animado (--fondo, ADR 0004) es el mismo
# ejecutable y no escucha.
function Escucha { try { (New-Object Net.Sockets.TcpClient '127.0.0.1', 47800).Close(); $true } catch { $false } }
if ((Test-Path $puente) -and -not (Escucha)) {
  Start-Process $puente -ArgumentList "`"$(Join-Path $raiz 'wallpaper')`"" -WindowStyle Hidden
  # Espera a que escuche (la página también reintenta, pero así Enter funciona a la primera).
  for ($i = 0; $i -lt 50; $i++) {
    if (Escucha) { break } else { Start-Sleep -Milliseconds 100 }
  }
}
Start-Process $Navegador -ArgumentList "--user-data-dir=`"$Perfil`"", '--no-first-run', '--start-fullscreen', "--app=$Url"
