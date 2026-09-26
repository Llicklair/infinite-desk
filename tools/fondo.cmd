@echo off
rem Doble clic: si el fondo animado esta parado, instala la version de ahora (npm run fondo: el
rem puente recien compilado) y lo arranca; si esta corriendo, lo para (tambien al iniciar sesion).
cd /d "%~dp0.."
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'infinite-desk-bridge.exe' -and $_.CommandLine -like '*--fondo*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Parando el fondo animado...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0alternar-fondo.ps1" off
) else (
  echo Poniendo el fondo animado...
  call npm run fondo
)
rem Unos segundos para leer el resultado antes de que se cierre la ventana.
ping -n 5 127.0.0.1 >nul
