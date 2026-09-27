@echo off
rem Doble clic cuando Windows se queda "sordo" (el panel de sonido de la barra no sale, el buscador
rem no responde...): primero la foto de tools\diagnostico.ps1 (se guarda en %LOCALAPPDATA%\infinite-desk,
rem para buscar la causa: el reinicio borra las pistas) y despues reinicia SOLO el Explorador. El mundo,
rem el puente y el fondo siguen como estaban (npm run parar -- --explorador, en cambio, lo para todo).
echo Guardando la foto del estado de Windows...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnostico.ps1"
echo.
echo Reiniciando el Explorador...
powershell -NoProfile -Command "Stop-Process -Name explorer -Force; for ($i = 0; $i -lt 20 -and -not (Get-Process explorer -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }; 'Explorador reiniciado'"
"%SystemRoot%\System32\timeout.exe" /t 3 >nul
