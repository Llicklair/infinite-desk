// infinite-desk-bridge: servidor WebSocket en 127.0.0.1 para el mundo web (ADR 0002).
//
// Seguridad: controlar ventanas desde una página es peligroso si CUALQUIER web puede hacerlo.
// Por eso (1) solo escucha en 127.0.0.1, (2) exige el origen de una página abierta desde disco
// ("null" en file://) o servida por él mismo (http://127.0.0.1:47800/mundo/) y (3) un token,
// escrito en wallpaper/puente-config.js: una web no puede leer un fichero local, y el puente no se
// lo sirve a otra web (Sec-Fetch-Site); la página del mundo sí lo carga como script.
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
Ventanas.RescatarAparcadas(); // y lo que dejó fuera de los monitores
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
// El oído (más abajo, /oido): el Chrome que transcribe, y las escuchas en curso de cada mundo.
WebSocket? oido = null;
var oidoListo = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var escuchas = new ConcurrentDictionary<string, (WebSocket mundo, int id)>();
DateTime oidoLanzado = DateTime.MinValue;
var agentes = new Agentes(mundo, Difundir);
var repo = Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(mundo)))!;
var regenerador = new Regenerador(repo, Difundir, agentes.Releer);

var builder = WebApplication.CreateSlimBuilder();
builder.WebHost.UseUrls($"http://127.0.0.1:{PUERTO}");
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();
app.UseWebSockets();

// El mundo, servido desde aquí (http://127.0.0.1:47800/mundo/): abierto desde disco (file://),
// Edge no guarda permisos y pedía el micrófono cada vez (uso real: "me pide permitir todo el
// rato"). Solo ficheros de la carpeta del mundo, solo GET, solo a quien los pide para sí mismo:
// una web cualquiera que intente cargar puente-config.js (lleva el token) como <script> manda
// Sec-Fetch-Site: cross-site y se rechaza; un Host que no es este (rebinding de DNS), también.
const string ORIGEN_PROPIO = "http://127.0.0.1:47800";
bool OrigenValido(string origen) => origen is "null" or "" or ORIGEN_PROPIO;
var tipos = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
{
    [".html"] = "text/html; charset=utf-8", [".js"] = "text/javascript; charset=utf-8", [".css"] = "text/css; charset=utf-8",
    [".json"] = "application/json", [".png"] = "image/png", [".jpg"] = "image/jpeg", [".svg"] = "image/svg+xml",
    [".ico"] = "image/x-icon", [".woff2"] = "font/woff2", [".mp3"] = "audio/mpeg", [".ogg"] = "audio/ogg", [".webp"] = "image/webp",
};
var raizMundo = Path.GetFullPath(mundo).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
app.MapGet("/mundo/{**ruta}", async (HttpContext ctx, string? ruta) =>
{
    var sitio = ctx.Request.Headers["Sec-Fetch-Site"].ToString();
    if (ctx.Request.Host.Value != $"127.0.0.1:{PUERTO}" || (sitio != "" && sitio != "same-origin" && sitio != "none"))
    {
        ctx.Response.StatusCode = 403;
        return;
    }
    var fichero = Path.GetFullPath(Path.Combine(raizMundo, string.IsNullOrEmpty(ruta) ? "index.html" : ruta));
    if (!fichero.StartsWith(raizMundo, StringComparison.OrdinalIgnoreCase) || !File.Exists(fichero) || !tipos.TryGetValue(Path.GetExtension(fichero), out var tipo))
    {
        ctx.Response.StatusCode = 404;
        return;
    }
    ctx.Response.ContentType = tipo;
    ctx.Response.Headers.CacheControl = "no-store"; // grafos.js, noticias.js y la config cambian: siempre los de ahora
    await ctx.Response.SendFileAsync(fichero);
});

app.Map("/", async (HttpContext ctx) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var origen = ctx.Request.Headers.Origin.ToString();
    if (ctx.Request.Query["token"] != token || !OrigenValido(origen))
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
        Envios.Olvidar(ws);
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

// El oído: el reconocimiento de voz de Edge devuelve texto vacío en este equipo (medido con una frase
// grabada: "" en castellano; en inglés, "Please open." de toda la frase) y el de Windows sin conexión
// se atasca; el de Chrome, ya instalado, la transcribe entera. Así que el puente abre un Chrome
// pequeño fuera de la pantalla (perfil propio) con /mundo/oido.html, que solo escucha: el mundo le
// pide "escucha" por aquí, el oído transcribe con el micrófono elegido y el texto vuelve al mundo.
app.Map("/oido", async (HttpContext ctx) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    if (ctx.Request.Query["token"] != token || ctx.Request.Headers.Origin.ToString() != ORIGEN_PROPIO) { ctx.Response.StatusCode = 403; return; }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    oido = ws;
    oidoListo.TrySetResult();
    Registro.Anotar("oído: conectado");
    try
    {
        while (ws.State == WebSocketState.Open)
        {
            var mensaje = await Recibir(ws);
            if (mensaje == null) break;
            var m = JsonDocument.Parse(mensaje).RootElement;
            var escucha = Texto(m, "escucha") ?? "";
            if (Texto(m, "t") == "parcial" && escuchas.TryGetValue(escucha, out var q))
                await Enviar(q.mundo, new { evento = "oido", escucha, parcial = Texto(m, "texto") });
            else if (Texto(m, "t") == "fin" && escuchas.TryRemove(escucha, out var f))
                await Enviar(f.mundo, new { id = f.id, ok = true, texto = Texto(m, "texto"), error = Texto(m, "error"), eventos = Texto(m, "eventos"), alternativas = Texto(m, "alternativas") });
        }
    }
    catch (WebSocketException) { /* se cerró Chrome */ }
    finally
    {
        oido = null;
        oidoListo = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        foreach (var (e, q) in escuchas) if (escuchas.TryRemove(e, out _)) await Enviar(q.mundo, new { id = q.id, ok = false, error = "the listener (Chrome) closed" });
        Registro.Anotar("oído: desconectado");
    }
});
// El Chrome del oído: fuera de la pantalla, que no deje de funcionar tapado, y con el permiso del
// micrófono ya dado (solo carga nuestra página local, en su perfil propio).
string? LanzarOido()
{
    var chrome = new[] {
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
    }.FirstOrDefault(File.Exists);
    if (chrome == null) return "Chrome isn't installed (it's what listens: Edge's speech recognition doesn't work here)";
    if (DateTime.Now - oidoLanzado < TimeSpan.FromSeconds(15)) return null; // ya va de camino
    oidoLanzado = DateTime.Now;
    var psi = new System.Diagnostics.ProcessStartInfo(chrome) { UseShellExecute = false };
    foreach (var a in new[] {
        $"--user-data-dir={Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "chrome-oido")}",
        "--no-first-run", "--no-default-browser-check", "--use-fake-ui-for-media-stream",
        "--window-size=320,200", "--window-position=-4000,-4000",
        "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
        $"--app=http://127.0.0.1:{PUERTO}/mundo/oido.html" })
        psi.ArgumentList.Add(a);
    System.Diagnostics.Process.Start(psi);
    Registro.Anotar("oído: lanzando Chrome");
    return null;
}

// La vista directa de una pantalla mientras se escribe en ella (Vista.cs): un WebSocket propio, solo
// binario, para no mezclar los fotogramas con las respuestas del canal de arriba.
app.Map("/vista", async (HttpContext ctx) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var origen = ctx.Request.Headers.Origin.ToString();
    if (ctx.Request.Query["token"] != token || !OrigenValido(origen) || !long.TryParse(ctx.Request.Query["hwnd"], out var hv))
    {
        ctx.Response.StatusCode = 403;
        return;
    }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    try { await Vista.Servir(ws, (IntPtr)hv); }
    catch (Exception e) { Registro.Anotar($"vista directa de {hv}: {e.Message} [{e.GetType().Name} en {e.StackTrace?.Split('\n').FirstOrDefault()?.Trim()}]"); }
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
    // Cambia el orden de las ventanas: si la pantalla en la que se escribe se ha puesto delante del
    // mundo (un clic la sube), vuelve detrás en ese momento, no al siguiente repaso.
    Win.SetWinEventHook(0x8004 /*EVENT_OBJECT_REORDER*/, 0x8004, IntPtr.Zero, Win.alReordenar, 0, 0, 0);
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
// Las noticias del palantír: ahora y cada 30 minutos.
new Noticias(repo).Empezar();
Hijos.VigilarSalud(() => Vista.Vivas);
Console.WriteLine($"infinite-desk-bridge en ws://127.0.0.1:{PUERTO} · atajo {atajo ?? "ninguno"} · config en {config}");
await app.RunAsync();
return 0;

async Task Atender(WebSocket ws)
{
    while (ws.State == WebSocketState.Open)
    {
        var mensaje = await Recibir(ws);
        if (mensaje == null) break;
        object? respuesta;
        try { respuesta = Responder(JsonDocument.Parse(mensaje).RootElement, ws); }
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
        case "vscodeComoPantalla":
        {
            // Atlas abre un repo: en VS Code y dentro del mundo, en vivo (Ventanas.Web.cs).
            var rutaCode = Texto(m, "ruta");
            _ = Task.Run(async () =>
            {
                var (hc, tituloCode, errorCode) = await Ventanas.AbrirRepoComoPantalla(rutaCode, Proyectos.Carpeta(repo));
                Registro.Anotar($"vscode como pantalla {rutaCode}: {errorCode ?? $"ok ({hc})"}");
                await Enviar(ws, new { id, ok = errorCode == null, hwnd = (long)hc, titulo = tituloCode, error = errorCode });
            });
            return null;
        }
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
        case "abrirUrl":
            var antesDeUrl = Ventanas.DePrimerNivel();
            var sinUrl = Escritorio.AbrirUrl(Texto(m, "url"));
            if (sinUrl == null) Ventanas.QueNoNazcanMinimizadas(antesDeUrl, t => _ = Difundir(new { evento = "lista", titulo = t }));
            Registro.Anotar($"abrir enlace {Texto(m, "url")}: {sinUrl ?? "ok"}");
            return new { id, ok = sinUrl == null, error = sinUrl };
        case "escuchar":
        {
            // Una frase por el oído (Chrome): contesta al acabar; mientras, eventos "oido" con lo parcial.
            var escucha = Texto(m, "escucha") ?? Guid.NewGuid().ToString("N");
            var micro = Texto(m, "micro");
            var idioma = Texto(m, "idioma") ?? "es-ES";
            escuchas[escucha] = (ws, id);
            _ = Task.Run(async () =>
            {
                if (oido == null)
                {
                    var sinOido = LanzarOido();
                    if (sinOido != null || await Task.WhenAny(oidoListo.Task, Task.Delay(15000)) != oidoListo.Task)
                    {
                        if (escuchas.TryRemove(escucha, out _)) await Enviar(ws, new { id, ok = false, error = sinOido ?? "the listener (Chrome) didn't start" });
                        return;
                    }
                }
                if (oido is { } o) await Enviar(o, new { t = "escuchar", escucha, micro, idioma });
            });
            return null;
        }
        case "pararEscucha":
            if (oido is { } oidoAhora) _ = Enviar(oidoAhora, new { t = "parar", escucha = Texto(m, "escucha") });
            return new { id, ok = true };
        case "espacio":
        {
            // El espacio de trabajo del mundo (src/espacio.js): qué pantallas había y dónde. Un
            // fichero en DATOS; el puente solo lo guarda y lo da, no lo interpreta.
            var ficheroEspacio = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "espacio.json");
            if (Texto(m, "accion") == "guardar" && m.TryGetProperty("datos", out var datosEspacio))
            {
                var json = datosEspacio.GetRawText();
                if (json.Length > 200_000) return new { id, ok = false, error = "workspace too large" };
                File.WriteAllText(ficheroEspacio + ".tmp", json);
                File.Move(ficheroEspacio + ".tmp", ficheroEspacio, overwrite: true);
                return new { id, ok = true };
            }
            try { return new { id, ok = true, datos = File.Exists(ficheroEspacio) ? JsonDocument.Parse(File.ReadAllText(ficheroEspacio)).RootElement.Clone() : (JsonElement?)null }; }
            catch (JsonException) { return new { id, ok = true, datos = (JsonElement?)null }; }
        }
        case "ventanas":
            // Las ventanas de aplicación abiertas ahora (para emparejarlas con el espacio guardado).
            return new { id, ok = true, ventanas = Ventanas.DeAplicacion() };
        case "traer":
            // Una ventana del espacio guardado, viva detrás del mundo (sin minimizar: así se captura).
            Ventanas.Traer(h);
            return new { id, ok = Ventanas.Existe(h) };
        case "anotar":
            // Lo que la página quiere dejar en el registro para diagnosticar (la voz: qué micrófono,
            // qué eventos, qué error). Corto y en una línea: nunca lo que se dice, solo cómo fue.
            var nota = (Texto(m, "texto") ?? "").Replace('\n', ' ').Replace('\r', ' ');
            Registro.Anotar($"página: {(nota.Length > 300 ? nota[..300] : nota)}");
            return new { id, ok = true };
        case "abrirWeb":
            // Un asistente abre una web como pantalla, sin el selector de N (Ventanas.Web.cs).
            var urlWeb = Texto(m, "url");
            _ = Task.Run(async () =>
            {
                var (hw, tituloWeb, errorWeb) = await Ventanas.AbrirWeb(urlWeb, Path.Combine(repo, "extensiones"));
                Registro.Anotar($"abrir como pantalla {urlWeb}: {errorWeb ?? $"ok ({hw})"}");
                await Enviar(ws, new { id, ok = errorWeb == null, hwnd = (long)hw, titulo = tituloWeb, error = errorWeb });
            });
            return null;
        case "orquestador":
            // La consola maestra: en segundo plano, y contesta cuando acaba.
            var ordenes = m.TryGetProperty("args", out var aa) && aa.ValueKind == JsonValueKind.Array
                ? aa.EnumerateArray().Select(x => x.GetString() ?? "").ToArray() : [];
            _ = Task.Run(async () =>
            {
                var (okO, datos, errorO) = await Orquestador.Correr(repo, ordenes);
                if (ordenes.FirstOrDefault() is "lanzar" or "descartar" or "accion")
                    Registro.Anotar($"orquestador {string.Join(' ', ordenes.Take(2))}{(ordenes.Length > 2 ? $" ({ordenes.Length - 2} repo(s))" : "")}: {errorO ?? "ok"}");
                await Enviar(ws, new { id, ok = okO, datos, error = errorO });
            });
            return null;
        case "agentes":
            return new { id, ok = true, repos = agentes.Foto() };
        case "regenerar":
            // Sin "repos", todas las islas (R); con ellos, solo esas (R sobre una isla, "Rebuild maps").
            var soloEstos = m.TryGetProperty("repos", out var rr) && rr.ValueKind == JsonValueKind.Array
                ? rr.EnumerateArray().Select(x => x.GetString() ?? "").ToArray() : null;
            return new { id, ok = true, empezado = regenerador.Pedir(soloEstos == null ? "R" : "R (algunas islas)", soloEstos) };
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

// Un mensaje entero (a trozos si hace falta), o null si se cerró. Antes se leían 16 KB y lo que no
// cabía se tiraba sin más: una charla larga con Kiri (va entera, en base64) se perdía. Tope, 1 MB.
static async Task<byte[]?> Recibir(WebSocket ws)
{
    var buffer = new byte[16 * 1024];
    using var todo = new MemoryStream();
    while (true)
    {
        var r = await ws.ReceiveAsync(buffer, CancellationToken.None);
        if (r.MessageType == WebSocketMessageType.Close) return null;
        todo.Write(buffer, 0, r.Count);
        if (todo.Length > 1024 * 1024) throw new WebSocketException("message too large");
        if (r.EndOfMessage) return todo.ToArray();
    }
}

static int Num(JsonElement m, string k) => m.TryGetProperty(k, out var v) ? v.GetInt32() : 0;
static string? Texto(JsonElement m, string k) => m.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

// Un envío a la vez por conexión: un WebSocket no admite dos SendAsync en marcha, y las respuestas
// (algunas ya desde otro hilo, como las del orquestador) se cruzan con los avisos de agentes.
static async Task Enviar(WebSocket ws, object o)
{
    var cerrojo = Envios.De(ws);
    await cerrojo.WaitAsync();
    try { await ws.SendAsync(JsonSerializer.SerializeToUtf8Bytes(o), WebSocketMessageType.Text, true, CancellationToken.None); }
    catch (WebSocketException) { /* se cerró mientras tanto */ }
    finally { cerrojo.Release(); }
}

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
    public static readonly WinEvento alReordenar = (_, _, _, _, _, _, _) => Ventanas.Recolocar();
    [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEvento f, uint pid, uint hilo, uint flags);
}
