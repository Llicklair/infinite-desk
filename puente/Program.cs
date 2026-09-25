// infinite-desk-bridge: servidor WebSocket en 127.0.0.1 para el mundo web (ADR 0002).
//
// Seguridad: controlar ventanas desde una página es peligroso si CUALQUIER web puede hacerlo.
// Por eso (1) solo escucha en 127.0.0.1, (2) exige el origen de una página abierta desde disco
// ("null" en file://) y (3) un token, escrito en wallpaper/puente-config.js:
// una web no puede leer un fichero local, la página del mundo sí lo carga como script.
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using InfiniteDesk.Puente;

const int PUERTO = 47800;

string mundo = args.Length > 0 ? args[0] : BuscarMundo();
// El token se guarda y se reutiliza: si el puente se reinicia, una página ya abierta sigue
// valiendo (primer uso real: el mundo abierto antes que el puente se quedó sin él).
string ficheroToken = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "puente-token");
string token = File.Exists(ficheroToken) ? File.ReadAllText(ficheroToken).Trim() : "";
if (token.Length < 32)
{
    token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    Directory.CreateDirectory(Path.GetDirectoryName(ficheroToken)!);
    File.WriteAllText(ficheroToken, token);
}
string config = Path.Combine(mundo, "puente-config.js");

var sockets = new ConcurrentDictionary<WebSocket, byte>();
var agentes = new Agentes(mundo, Difundir);
var regenerador = new Regenerador(Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(mundo)))!, Difundir, agentes.Releer);

var builder = WebApplication.CreateSlimBuilder();
builder.WebHost.UseUrls($"http://127.0.0.1:{PUERTO}");
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();
app.UseWebSockets();

app.Map("/", async (HttpContext ctx) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var origen = ctx.Request.Headers.Origin.ToString();
    if (ctx.Request.Query["token"] != token || (origen != "null" && origen != ""))
    {
        ctx.Response.StatusCode = 403;
        return;
    }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    sockets[ws] = 0;
    try { await Atender(ws); }
    catch (WebSocketException) { /* la página se cerró sin despedirse (Esc, recarga): normal */ }
    finally
    {
        sockets.TryRemove(ws, out _);
        // El mundo se cerró o recargó a mitad: que la ventana no se quede aparcada fuera.
        Ventanas.Salir();
    }
});

// Un atajo global para salir de la pantalla aunque el teclado lo tenga la ventana, no el mundo.
// El primero libre de la lista (Ctrl+Alt+M ya lo tenía otro programa en el primer uso real).
(string nombre, uint vk)[] candidatos = [("Ctrl+Alt+Esc", 0x1B), ("Ctrl+Alt+M", 'M'), ("Ctrl+Alt+Q", 'Q'), ("Ctrl+Alt+F12", 0x7B)];
string? atajo = null;
var listo = new ManualResetEventSlim();
new Thread(() =>
{
    // RegisterHotKey entrega WM_HOTKEY a la cola del hilo que lo registra: este hilo.
    atajo = candidatos.FirstOrDefault(c => Win.RegisterHotKey(IntPtr.Zero, 1, 0x4000 | 0x2 | 0x1, c.vk)).nombre;
    listo.Set();
    while (Win.GetMessage(out var m, IntPtr.Zero, 0, 0) > 0)
        if (m.message == 0x0312) { Ventanas.Salir(); _ = Difundir(new { evento = "salir" }); }
}) { IsBackground = true }.Start();
listo.Wait();
if (atajo == null) Console.Error.WriteLine("ningún atajo libre: se sale con clic fuera de la pantalla");

AppDomain.CurrentDomain.ProcessExit += (_, _) => Ventanas.Salir();

File.WriteAllText(config,
    "// Lo escribe infinite-desk-bridge al arrancar (ADR 0002); no se versiona.\n" +
    $"window.INFINITE_DESK_PUENTE = {{ puerto: {PUERTO}, token: \"{token}\", atajo: {JsonSerializer.Serialize(atajo)} }};\n");
// Al arrancar (= al entrar en el mundo) los grafos se ponen al día solos, en segundo plano.
regenerador.Pedir("al entrar");
regenerador.Vigilar();
agentes.Empezar();
Console.WriteLine($"infinite-desk-bridge en ws://127.0.0.1:{PUERTO} · atajo {atajo ?? "ninguno"} · config en {config}");
await app.RunAsync();

async Task Atender(WebSocket ws)
{
    var buffer = new byte[16 * 1024];
    while (ws.State == WebSocketState.Open)
    {
        var r = await ws.ReceiveAsync(buffer, CancellationToken.None);
        if (r.MessageType == WebSocketMessageType.Close) break;
        if (!r.EndOfMessage) continue; // los mensajes del mundo son pequeños
        object? respuesta;
        try { respuesta = Responder(JsonDocument.Parse(buffer.AsMemory(0, r.Count)).RootElement); }
        catch (Exception e) { respuesta = new { ok = false, error = e.Message }; }
        if (respuesta != null) await Enviar(ws, respuesta);
    }
}

object? Responder(JsonElement m)
{
    int id = m.TryGetProperty("id", out var i) ? i.GetInt32() : 0;
    string op = m.GetProperty("op").GetString() ?? "";
    IntPtr h = m.TryGetProperty("hwnd", out var hw) ? (IntPtr)hw.GetInt64() : IntPtr.Zero;
    switch (op)
    {
        case "titulo":
            return new { id, ok = Ventanas.Existe(h), titulo = Ventanas.Titulo(h) };
        case "entrar":
            var error = Ventanas.Entrar(h);
            return new { id, ok = error == null, error };
        case "mundo":
            // La página se presenta por su título (único): su ventana pasa a ser en capas.
            return new { id, ok = Ventanas.Presentar(m.GetProperty("titulo").GetString() ?? "") };
        case "escritorio":
            return new { id, ok = true, cosas = Escritorio.Listar() };
        case "abrir":
            var fallo = Escritorio.Abrir(Texto(m, "ruta"), Texto(m, "especial"));
            return new { id, ok = fallo == null, error = fallo };
        case "agentes":
            return new { id, ok = true, repos = agentes.Foto() };
        case "regenerar":
            return new { id, ok = true, empezado = regenerador.Pedir("R") };
        case "salir":
            Ventanas.Salir();
            return new { id, ok = true };
        case "raton":
            // Sin respuesta: llegan decenas por segundo al mover.
            Ventanas.Raton(h, m.GetProperty("tipo").GetString() ?? "", Num(m, "boton"),
                m.GetProperty("u").GetDouble(), m.GetProperty("v").GetDouble(), Num(m, "botones"), Num(m, "delta"));
            return null;
        default:
            return new { id, ok = false, error = $"operación desconocida: {op}" };
    }
}

static int Num(JsonElement m, string k) => m.TryGetProperty(k, out var v) ? v.GetInt32() : 0;
static string? Texto(JsonElement m, string k) => m.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

static Task Enviar(WebSocket ws, object o) =>
    ws.SendAsync(JsonSerializer.SerializeToUtf8Bytes(o), WebSocketMessageType.Text, true, CancellationToken.None);

Task Difundir(object o) => Task.WhenAll(sockets.Keys.Where(s => s.State == WebSocketState.Open).Select(s => Enviar(s, o)));

// El exe vive en puente/bin/<config>/<tfm>/: el mundo construido está en ../wallpaper del repo.
static string BuscarMundo()
{
    for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
        if (File.Exists(Path.Combine(d.FullName, "wallpaper", "index.html"))) return Path.Combine(d.FullName, "wallpaper");
    throw new DirectoryNotFoundException("no encuentro wallpaper/index.html encima del ejecutable; pásalo como argumento");
}

static class Win
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")] public static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
}
