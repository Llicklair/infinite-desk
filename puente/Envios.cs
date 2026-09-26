// Un cerrojo por conexión para los envíos (Program.cs, Enviar): un WebSocket no admite dos envíos a
// la vez, y las respuestas y los avisos salen de hilos distintos.
using System.Collections.Concurrent;
using System.Net.WebSockets;

namespace InfiniteDesk.Puente;

static class Envios
{
    static readonly ConcurrentDictionary<WebSocket, SemaphoreSlim> cerrojos = new();

    public static SemaphoreSlim De(WebSocket ws) => cerrojos.GetOrAdd(ws, _ => new SemaphoreSlim(1, 1));

    public static void Olvidar(WebSocket ws) { if (cerrojos.TryRemove(ws, out var c)) c.Dispose(); }
}
