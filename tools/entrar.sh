#!/bin/bash
# "Enter infinite-desk" en macOS (la app que crea tools/fondo.mjs): la pareja de entrar.ps1.
# Arranca el puente si está construido y no corre (ADR 0002), y abre el mundo a pantalla completa.
# Uso: entrar.sh <chrome> <perfil> <url>
set -u
chrome=$1; perfil=$2; url=$3
raiz="$(cd "$(dirname "$0")/.." && pwd)"
puente="$raiz/puente/bin/Release/net10.0/infinite-desk-bridge"
# Se mira el puerto, no el nombre del proceso: el fondo animado es el mismo ejecutable.
if [ -x "$puente" ] && ! nc -z 127.0.0.1 47800 2> /dev/null; then
  "$puente" "$raiz/wallpaper" > /dev/null 2>&1 &
  # Espera a que escuche (la página también reintenta, pero así Enter funciona a la primera).
  for _ in $(seq 50); do nc -z 127.0.0.1 47800 2> /dev/null && break; sleep 0.1; done
fi
exec "$chrome" --user-data-dir="$perfil" --no-first-run --start-fullscreen --app="$url"
