@echo off
rem Doble clic (o npm run grabar): la grabadora de pantalla de tools\grabar.html, sin instalar nada.
rem En Chrome si esta (graba tambien el sonido del sistema al compartir la pantalla entera); si no, Edge.
set "pagina=%~dp0grabar.html"
for %%n in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe") do (
  if exist %%n (
    start "" %%n --new-window "%pagina%"
    exit /b 0
  )
)
echo No Chrome or Edge found.
pause
