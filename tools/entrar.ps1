# "Entrar en infinitas" (clic derecho del escritorio, lo instala tools/fondo.mjs).
#
# Para ver el escritorio se minimiza todo, y Edge NO puede capturar una ventana minimizada: ni
# la ofrece en el selector. Así que primero se restauran, sin activarlas, y después se abre el
# mundo a pantalla completa por encima: quedan detrás, vivas y capturables con N.
param([string]$Edge, [string]$Perfil, [string]$Url)

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
  public static void RestaurarMinimizadas() {
    EnumWindows((h, l) => {
      // Solo ventanas de aplicación: visibles, con título, sin dueño y no de herramientas.
      bool deApp = IsWindowVisible(h) && GetWindowTextLength(h) > 0
        && GetWindow(h, 4) == IntPtr.Zero && (GetWindowLong(h, -20) & 0x80) == 0;
      if (deApp && IsIconic(h)) ShowWindow(h, 4); // SW_SHOWNOACTIVATE: sin robar el foco
      return true;
    }, IntPtr.Zero);
  }
}
'@
[Ventanas]::RestaurarMinimizadas()

# El puente (ADR 0002): sin él el mundo funciona, pero no se puede escribir en las pantallas.
$raiz = Split-Path $PSScriptRoot -Parent
$puente = Join-Path $raiz 'puente\bin\Release\net10.0-windows\infinitas-puente.exe'
if ((Test-Path $puente) -and -not (Get-Process infinitas-puente -ErrorAction SilentlyContinue)) {
  Start-Process $puente -ArgumentList "`"$(Join-Path $raiz 'wallpaper')`"" -WindowStyle Hidden
  # Espera a que escuche (la página también reintenta, pero así Enter funciona a la primera).
  for ($i = 0; $i -lt 50; $i++) {
    try { (New-Object Net.Sockets.TcpClient '127.0.0.1', 47800).Close(); break } catch { Start-Sleep -Milliseconds 100 }
  }
}
Start-Process $Edge -ArgumentList "--user-data-dir=`"$Perfil`"", '--no-first-run', '--start-fullscreen', "--app=$Url"
