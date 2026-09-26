# Enciende o apaga el fondo animado (Windows): si está puesto lo quita, y si no, lo pone.
# Apagado sigue apagado al volver a iniciar sesión (se quita de HKCU\...\Run); encendido vuelve a
# arrancar solo. No toca el clic derecho "Enter infinite-desk" ni el mundo ni su puente.
# Usa la copia que instaló `npm run fondo` (%LOCALAPPDATA%\infinite-desk\fondo).
# Uso: npm run alternar-fondo [-- on|off], o doble clic en tools\alternar-fondo.cmd.
param([ValidateSet('', 'on', 'off')][string]$Modo = '')

$raiz = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $env:LOCALAPPDATA 'infinite-desk\fondo\infinite-desk-bridge.exe'
$arranque = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
function Fondos { Get-CimInstance Win32_Process -Filter "Name='infinite-desk-bridge.exe'" | Where-Object { $_.CommandLine -like '*--fondo*' } }

if (-not $Modo) { $Modo = if (Fondos) { 'off' } else { 'on' } }

if ($Modo -eq 'off') {
  # Por las buenas (repone el fondo de Windows) y, si no cierra, a la fuerza: solo el del fondo,
  # el puente del mundo es el mismo .exe sin --fondo.
  if (Test-Path $exe) { & $exe --fondo --parar | Out-Null }
  for ($i = 0; $i -lt 40 -and (Fondos); $i++) { Start-Sleep -Milliseconds 100 }
  Fondos | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Remove-ItemProperty $arranque -Name 'infinite-desk-fondo' -ErrorAction SilentlyContinue
  'animated wallpaper: off (also at sign-in)'
  exit
}

if (-not (Test-Path $exe)) {
  'The animated wallpaper was never installed: run npm run fondo first.'
  exit 1
}
if (-not (Fondos)) {
  $carpeta = Join-Path $raiz 'wallpaper'
  Start-Process $exe -ArgumentList '--fondo', "`"$carpeta`"" -WindowStyle Hidden
  Set-ItemProperty $arranque -Name 'infinite-desk-fondo' -Value "`"$exe`" --fondo `"$carpeta`""
}
'animated wallpaper: on (and at every sign-in)'
