@echo off
rem Doble clic: enciende o apaga el fondo animado (tools\alternar-fondo.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0alternar-fondo.ps1" %*
rem Unos segundos para leer el resultado antes de que se cierre la ventana.
ping -n 4 127.0.0.1 >nul
