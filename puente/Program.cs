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

// PerMonitorV2 por código: el del app.manifest no se aplicaba (medido: el puente veía el segundo
// monitor, 1920×1080 al 100 %, como 3840×2160, con las coordenadas del 200 % del principal).
Win.SetProcessDpiAwarenessContext(-4 /*DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2*/);

// Otro oficio del mismo ejecutable: el mundo como fondo animado (ADR 0004). No abre el servidor.
if (args.Contains("--fondo"))
{
    // El fondo lleva su propio registro (fondo.log): con el mismo fichero, el puente se lo borraba.
    if (!args.Contains("--parar")) Registro.Empezar("fondo.log");
    return args.Contains("--parar") ? Fondo.Parar() : Fondo.Correr(args.FirstOrDefault(a => !a.StartsWith("--")) ?? BuscarMundo(),
        // Diagnóstico: --solo-ventanas (nuestras ventanas en la WorkerW, sin WebView2) o --solo-webview (al revés).
        args.Contains("--solo-ventanas") ? "ventanas" : args.Contains("--solo-webview") ? "webview" : "");
}

string mundo = args.Length > 0 ? args[0] : BuscarMundo();
Registro.Empezar();
Ventanas.Rescatar(); // lo que dejó escondido un puente anterior que se cayó o se reinició
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
// El título del mundo de cada conexión: con dos mundos abiertos (el clic derecho abrió otro), al
// cerrarse el que se estaba usando se vuelve al que queda, en vez de quedarse sin mundo (uso real:
// "the space hasn't connected to the bridge yet" con el mundo de siempre aún abierto).
var mundosPorConexion = new ConcurrentDictionary<WebSocket, string>();
var agentes = new Agentes(mundo, Difundir);
var repo = Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(mundo)))!;
var regenerador = new Regenerador(repo, Difundir, agentes.Releer);

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
        // El mundo se cerró o recargó a mitad: que la ventana no se quede aparcada fuera, y lo
        // escondido al minimizarlo se minimiza de verdad. Si queda otro mundo conectado, ese.
        // Solo si la conexión que se cierra ERA un mundo: cualquier otra (una prueba, una
        // herramienta) sacaba de la pantalla en la que se estaba escribiendo (medido).
        if (mundosPorConexion.TryRemove(ws, out _))
        {
            Ventanas.Salir();
            if (mundosPorConexion.IsEmpty) Ventanas.MundoCerrado();
            else if (mundosPorConexion.Values.LastOrDefault() is { } otro && Ventanas.Presentar(otro))
                Registro.Anotar($"se cerró un mundo; sigue el otro, \"{otro}\"");
        }
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
    // Y los minimizados: fuera de contexto, el evento también llega por la cola de este hilo.
    Win.SetWinEventHook(0x0016 /*EVENT_SYSTEM_MINIMIZESTART*/, 0x0016, IntPtr.Zero, Win.alMinimizar, 0, 0, 0);
    Win.SetWinEventHook(0x0003 /*EVENT_SYSTEM_FOREGROUND*/, 0x0003, IntPtr.Zero, Win.alActivar, 0, 0, 0);
    Win.SetWinEventHook(0x8002 /*EVENT_OBJECT_SHOW*/, 0x8002, IntPtr.Zero, Win.alMostrarse, 0, 0, 0);
    listo.Set();
    while (Win.GetMessage(out var m, IntPtr.Zero, 0, 0) > 0)
        if (m.message == 0x0312) { Ventanas.Salir(); _ = Difundir(new { evento = "salir" }); }
}) { IsBackground = true }.Start();
listo.Wait();
if (atajo == null) Console.Error.WriteLine("ningún atajo libre: se sale con clic fuera de la pantalla");

AppDomain.CurrentDomain.ProcessExit += (_, _) => { Ventanas.Salir(); Ventanas.MundoCerrado(); };

File.WriteAllText(config,
    "// Lo escribe infinite-desk-bridge al arrancar (ADR 0002); no se versiona.\n" +
    $"window.INFINITE_DESK_PUENTE = {{ puerto: {PUERTO}, token: \"{token}\", atajo: {JsonSerializer.Serialize(atajo)} }};\n");
// Al arrancar (= al entrar en el mundo) los grafos se ponen al día solos, en segundo plano.
regenerador.Pedir("al entrar");
regenerador.Vigilar();
agentes.Empezar();
Console.WriteLine($"infinite-desk-bridge en ws://127.0.0.1:{PUERTO} · atajo {atajo ?? "ninguno"} · config en {config}");
await app.RunAsync();
return 0;

async Task Atender(WebSocket ws)
{
    var buffer = new byte[16 * 1024];
    while (ws.State == WebSocketState.Open)
    {
        var r = await ws.ReceiveAsync(buffer, CancellationToken.None);
        if (r.MessageType == WebSocketMessageType.Close) break;
        if (!r.EndOfMessage) continue; // los mensajes del mundo son pequeños
        object? respuesta;
        try { respuesta = Responder(JsonDocument.Parse(buffer.AsMemory(0, r.Count)).RootElement, ws); }
        catch (Exception e) { respuesta = new { ok = false, error = e.Message }; }
        if (respuesta != null) await Enviar(ws, respuesta);
    }
}

object? Responder(JsonElement m, WebSocket ws)
{
    int id = m.TryGetProperty("id", out var i) ? i.GetInt32() : 0;
    string op = m.GetProperty("op").GetString() ?? "";
    IntPtr h = m.TryGetProperty("hwnd", out var hw) ? (IntPtr)hw.GetInt64() : IntPtr.Zero;
    switch (op)
    {
        case "titulo":
            // Se pregunta al capturarla: desde ahora es una pantalla del mundo.
            Ventanas.Capturada(h, true);
            Registro.Anotar($"pantalla {h}: \"{Ventanas.Titulo(h)}\"");
            return new { id, ok = Ventanas.Existe(h), titulo = Ventanas.Titulo(h) };
        case "soltar":
            Ventanas.Capturada(h, false);
            return new { id, ok = true };
        case "entrar":
            var error = Ventanas.Entrar(h);
            Registro.Anotar($"entrar {h} \"{Ventanas.Titulo(h)}\": {error ?? "ok"}");
            return new { id, ok = error == null, error };
        case "mundo":
            // La página se presenta por su título (único): su ventana pasa a ser en capas.
            var tituloMundo = m.GetProperty("titulo").GetString() ?? "";
            mundosPorConexion[ws] = tituloMundo;
            var presentado = Ventanas.Presentar(tituloMundo);
            Registro.Anotar($"mundo \"{tituloMundo}\": {(presentado ? "ok" : "aún no está: se reintenta")}");
            // La página se presenta nada más conectar, y Edge puede tardar en poner el título en
            // su ventana: sin reintentar, el mundo se quedaba sin puente (uso real: "dice que el
            // espacio no está conectado al bridge"). Cada 250 ms, hasta 5 s.
            if (!presentado) _ = Task.Run(async () =>
            {
                for (int n = 0; n < 20; n++)
                {
                    await Task.Delay(250);
                    if (!Ventanas.Presentar(tituloMundo)) continue;
                    Registro.Anotar($"mundo \"{tituloMundo}\": ok tras {(n + 1) * 250} ms");
                    return;
                }
                Registro.Anotar($"mundo \"{tituloMundo}\": NO ENCONTRADO en 5 s");
            });
            return new { id, ok = presentado };
        case "escritorio":
            return new { id, ok = true, cosas = Escritorio.Listar() };
        case "vscode":
            // La carpeta de proyectos se lee cada vez: se puede cambiar con la P sin reiniciar.
            var antesDeCode = Ventanas.DePrimerNivel();
            var sinAbrir = Escritorio.AbrirRepo(Texto(m, "ruta"), Proyectos.Carpeta(repo));
            if (sinAbrir == null) Ventanas.QueNoNazcanMinimizadas(antesDeCode, t => _ = Difundir(new { evento = "lista", titulo = t }));
            Registro.Anotar($"vscode {Texto(m, "ruta")}: {sinAbrir ?? "ok"}");
            return new { id, ok = sinAbrir == null, error = sinAbrir };
        case "carpetaEnVSCode":
            var antesDeCarpeta = Ventanas.DePrimerNivel();
            var sinCarpeta = Escritorio.AbrirCarpetaEnVSCode(Proyectos.Carpeta(repo));
            Registro.Anotar($"carpeta en VS Code: {sinCarpeta ?? "ok"}");
            if (sinCarpeta == null) Ventanas.QueNoNazcanMinimizadas(antesDeCarpeta, t => _ = Difundir(new { evento = "lista", titulo = t }));
            return new { id, ok = sinCarpeta == null, error = sinCarpeta };
        case "carpeta":
            var actual = Proyectos.Carpeta(repo);
            return new { id, ok = true, ruta = actual, repos = Proyectos.Repos(actual) };
        case "elegirCarpeta":
            // El selector del sistema; al elegir, las islas se rehacen solas y se vigila la nueva.
            var elegida = Proyectos.Elegir(Proyectos.Carpeta(repo));
            if (elegida == null) return new { id, ok = false, error = "cancelled" };
            Proyectos.Guardar(repo, elegida);
            Registro.Anotar($"carpeta de proyectos: {elegida} ({Proyectos.Repos(elegida)} repos)");
            regenerador.Revigilar();
            agentes.Revigilar();
            regenerador.Pedir("carpeta de proyectos nueva");
            return new { id, ok = true, ruta = elegida, repos = Proyectos.Repos(elegida) };
        case "abrir":
            var antes = Ventanas.DePrimerNivel();
            var fallo = Escritorio.Abrir(Texto(m, "ruta"), Texto(m, "especial"));
            if (fallo == null) Ventanas.QueNoNazcanMinimizadas(antes, t => _ = Difundir(new { evento = "lista", titulo = t }));
            Registro.Anotar($"abrir {Texto(m, "ruta") ?? Texto(m, "especial")}: {fallo ?? "ok"}");
            return new { id, ok = fallo == null, error = fallo };
        case "agentes":
            return new { id, ok = true, repos = agentes.Foto() };
        case "regenerar":
            return new { id, ok = true, empezado = regenerador.Pedir("R") };
        case "antesDeCapturar":
            // N: que el selector pueda ofrecer también lo minimizado (no ofrece minimizadas).
            // Y lo que no saldrá en él por no tener escritorio virtual, para avisar.
            var restauradas = Ventanas.RestaurarParaCapturar();
            var sinEscritorio = Ventanas.SinEscritorio();
            if (sinEscritorio.Count > 0) Registro.Anotar($"N: sin escritorio virtual (no salen en el selector): {string.Join(" · ", sinEscritorio)}");
            return new { id, ok = true, restauradas, sinEscritorio };
        case "alEscritorio":
            Ventanas.AlEscritorio();
            return new { id, ok = true };
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
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr contexto);
    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")] public static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
    public delegate void WinEvento(IntPtr gancho, uint evento, IntPtr h, int objeto, int hijo, uint hilo, uint ms);
    // Referencia viva: si el GC se lleva el delegado, Windows llama a la nada.
    public static readonly WinEvento alMinimizar = (_, _, h, objeto, _, _, _) => { if (objeto == 0) Ventanas.AlMinimizar(h); };
    public static readonly WinEvento alActivar = (_, _, h, objeto, _, _, _) => { if (objeto == 0) Ventanas.AlActivar(h); };
    public static readonly WinEvento alMostrarse = (_, _, h, objeto, hijo, _, _) => { if (objeto == 0 && hijo == 0) Ventanas.AlMostrarse(h); };
    [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEvento f, uint pid, uint hilo, uint flags);
}
