// La vista directa de una pantalla mientras se escribe en ella (Enter): el puente la captura con
// Windows Graphics Capture y manda al mundo solo los trozos que cambian. La captura de Chromium
// (getDisplayMedia) tardaba ~200 ms de la tecla a la página; WGC nativo, ~13 ms (medido: la misma
// ventana, la misma tecla, docs/evidencia.md 2026-09-26). Fuera de Enter, las pantallas siguen con la
// captura de Chromium: de lejos no se nota, y así no hay un flujo por pantalla.
//
// Mensaje binario (little-endian): u16 ancho, u16 alto, u16 n, y n rectángulos (u16 x, y, w, h)
// seguidos de sus píxeles BGRA (como los da Windows), fila a fila. El primero es la ventana entera.
// Delante, un byte de formato (Empaquetar): 0, tal cual; 1, comprimido con deflate.
using System.Buffers.Binary;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using WinRT;

namespace InfiniteDesk.Puente;

static class Vista
{
    const int LADO = 64; // trozos de 64x64: al escribir cambian unos pocos

    static readonly object gpu = new();
    static IntPtr d3d, ctx;
    static IDirect3DDevice? dispositivo;

    /// <summary>La vista de <paramref name="h"/> por este WebSocket, hasta que se cierre (o la ventana).</summary>
    public static async Task Servir(WebSocket ws, IntPtr h)
    {
        if (!Ventanas.Existe(h)) return;
        Preparar();
        var item = Elemento(h);
        var señal = new SemaphoreSlim(0, 1);
        var pool = Direct3D11CaptureFramePool.CreateFreeThreaded(dispositivo!, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, item.Size);
        pool.FrameArrived += (_, _) => { if (señal.CurrentCount == 0) try { señal.Release(); } catch (SemaphoreFullException) { } };
        using var sesion = pool.CreateCaptureSession(item);
        try { sesion.IsCursorCaptureEnabled = false; } catch { /* Windows 10 antiguo: sale el cursor */ }
        item.Closed += (_, _) => { try { señal.Release(); } catch (SemaphoreFullException) { } };
        sesion.StartCapture();

        // Lo que se capturó y lo que ya tiene el mundo: se compara uno con otro por trozos.
        byte[] actual = [], enviado = [];
        int ancho = 0, alto = 0;
        bool entero = true; // el primero (o tras cambiar de tamaño) va entero
        bool sinMandar = false; // hay un fotograma leído que el mundo aún no tiene
        IntPtr staging = IntPtr.Zero;
        // Créditos: la página confirma cada mensaje que ha pintado, y nunca hay más de 2 sin confirmar.
        // Son diferencias (no se pueden tirar): sin esto, con la ventana entera cambiando (scroll),
        // se iban acumulando en la página y la latencia crecía. Los fotogramas se leen siempre al
        // llegar (si no, con el pool lleno, Windows tira los nuevos y el último estado se perdía); lo
        // que espera es el envío, y cuando hay crédito se manda lo último leído.
        var creditos = new SemaphoreSlim(3, 3);
        var cierre = Escuchar(ws, creditos, señal);
        // Comprimir y enviar, en otra tarea: mientras, se lee y compara el siguiente fotograma.
        var cola = System.Threading.Channels.Channel.CreateBounded<byte[]>(1);
        var envio = Task.Run(async () =>
        {
            await foreach (var m in cola.Reader.ReadAllAsync())
                await ws.SendAsync(Empaquetar(m), WebSocketMessageType.Binary, true, CancellationToken.None);
        });
        try
        {
            while (ws.State == WebSocketState.Open && Ventanas.Existe(h))
            {
                if (await Task.WhenAny(señal.WaitAsync(), cierre) == cierre) break;
                // Solo el último: los que se acumularon mientras tanto sobran.
                Direct3D11CaptureFrame? marco = null;
                for (var f = pool.TryGetNextFrame(); f != null; f = pool.TryGetNextFrame()) { marco?.Dispose(); marco = f; }
                if (marco != null)
                    using (marco)
                    {
                        int w = Math.Min(marco.ContentSize.Width, marco.Surface.Description.Width);
                        int hh = Math.Min(marco.ContentSize.Height, marco.Surface.Description.Height);
                        if (w > 0 && hh > 0)
                        {
                            bool nuevo = w != ancho || hh != alto;
                            if (nuevo)
                            {
                                // Cambió de tamaño: otra textura de lectura, y todo de nuevo.
                                if (staging != IntPtr.Zero) Marshal.Release(staging);
                                staging = Lectura(w, hh);
                                ancho = w; alto = hh;
                                actual = new byte[w * hh * 4];
                                enviado = new byte[w * hh * 4];
                                entero = true;
                            }
                            if (Leer(marco, staging, actual, w, hh)) sinMandar = true;
                            // El pool, al tamaño nuevo de la ventana (después de leer: el fotograma es del viejo).
                            if (nuevo && (marco.ContentSize.Width != marco.Surface.Description.Width || marco.ContentSize.Height != marco.Surface.Description.Height))
                                pool.Recreate(dispositivo!, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, marco.ContentSize);
                        }
                    }
                if (!sinMandar || creditos.CurrentCount == 0) continue; // sin crédito: al volver, con el último
                sinMandar = false;
                var mensaje = Diferencia(actual, enviado, ancho, alto, entero);
                if (mensaje == null) continue;
                await creditos.WaitAsync();
                await cola.Writer.WriteAsync(mensaje);
                entero = false;
                // Lo enviado es ahora lo que tiene el mundo; el siguiente fotograma se lee entero encima del otro.
                (actual, enviado) = (enviado, actual);
            }
        }
        catch (WebSocketException) { /* el mundo cerró la vista */ }
        finally
        {
            cola.Writer.TryComplete();
            try { await envio; } catch (WebSocketException) { /* cerrada a medio envío */ }
            if (staging != IntPtr.Zero) Marshal.Release(staging);
            pool.Dispose();
        }
    }

    /// <summary>
    /// Lo que manda el mundo: cada mensaje es "pintado" (un crédito más, y se despierta el bucle por si
    /// tenía algo esperando), hasta que la cierra.
    /// </summary>
    static async Task Escuchar(WebSocket ws, SemaphoreSlim creditos, SemaphoreSlim despertar)
    {
        var b = new byte[64];
        try
        {
            while ((await ws.ReceiveAsync(b, CancellationToken.None)).MessageType != WebSocketMessageType.Close)
            {
                try { creditos.Release(); } catch (SemaphoreFullException) { /* confirmó de más */ }
                try { if (despertar.CurrentCount == 0) despertar.Release(); } catch (SemaphoreFullException) { }
            }
        }
        catch (WebSocketException) { }
    }

    /// <summary>
    /// Los trozos que cambian respecto a lo enviado (o todos, la primera vez), juntando los
    /// seguidos de una misma fila en un rectángulo; null si no cambió nada.
    /// </summary>
    static byte[]? Diferencia(byte[] actual, byte[] enviado, int w, int h, bool todo)
    {
        // Cada fila de trozos por su lado, en paralelo (medido: en serie, ~8 ms con la ventana entera
        // cambiando, la mitad del tiempo del puente por fotograma).
        int filas = (h + LADO - 1) / LADO;
        var porFila = new List<(int x, int y, int w, int h)>[filas];
        Parallel.For(0, filas, f =>
        {
            int ty = f * LADO, th = Math.Min(LADO, h - ty);
            var lista = new List<(int x, int y, int w, int h)>();
            int inicio = -1;
            for (int tx = 0; tx < w; tx += LADO)
            {
                bool cambia = todo || TrozoCambia(actual, enviado, w, tx, ty, Math.Min(LADO, w - tx), th);
                if (cambia && inicio < 0) inicio = tx;
                if (!cambia && inicio >= 0) { lista.Add((inicio, ty, tx - inicio, th)); inicio = -1; }
            }
            // El tramo que llega hasta el borde derecho (el ancho no tiene por qué ser múltiplo de 64).
            if (inicio >= 0) lista.Add((inicio, ty, w - inicio, th));
            porFila[f] = lista;
        });
        var rects = porFila.SelectMany(l => l).ToList();
        if (rects.Count == 0) return null;
        long bytes = 6 + rects.Count * 8 + rects.Sum(r => (long)r.w * r.h * 4);
        var m = new byte[bytes];
        BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(0), (ushort)w);
        BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(2), (ushort)h);
        BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(4), (ushort)rects.Count);
        var desde = new long[rects.Count];
        long o = 6 + rects.Count * 8;
        for (int k = 0; k < rects.Count; k++)
        {
            var r = rects[k];
            int c = 6 + k * 8;
            BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(c), (ushort)r.x);
            BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(c + 2), (ushort)r.y);
            BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(c + 4), (ushort)r.w);
            BinaryPrimitives.WriteUInt16LittleEndian(m.AsSpan(c + 6), (ushort)r.h);
            desde[k] = o;
            o += (long)r.w * r.h * 4;
        }
        // Tal cual, BGRA: el mundo intercambia los canales en el shader (medido: reordenarlos aquí, píxel
        // a píxel, se comía la mayor parte del tiempo con la ventana entera cambiando).
        Parallel.For(0, rects.Count, k =>
        {
            var r = rects[k];
            long d = desde[k];
            for (int y = r.y; y < r.y + r.h; y++, d += r.w * 4)
                actual.AsSpan((y * w + r.x) * 4, r.w * 4).CopyTo(m.AsSpan((int)d));
        });
        return m;
    }

    /// <summary>
    /// Un byte de formato delante: 0, tal cual; 1, comprimido (deflate). Solo los grandes: las
    /// ventanas son de colores planos y comprimen mucho, y recibir 14 MB le costaba al navegador de
    /// 70 a 450 ms (medido); los pequeños (al escribir) no ganan nada. (Probado partirlo en bandas
    /// comprimidas a la vez: el puente ganaba unos ms, pero la página tardaba más en descomprimir
    /// muchas pequeñas que una grande, ~35 ms por mensaje: peor.)
    /// </summary>
    static ArraySegment<byte> Empaquetar(byte[] mensaje)
    {
        if (mensaje.Length < 256 * 1024)
        {
            var raw = new byte[mensaje.Length + 1];
            mensaje.CopyTo(raw, 1);
            return raw;
        }
        var ms = new MemoryStream(mensaje.Length / 8);
        ms.WriteByte(1);
        using (var z = new System.IO.Compression.DeflateStream(ms, System.IO.Compression.CompressionLevel.Fastest, leaveOpen: true))
            z.Write(mensaje);
        return new ArraySegment<byte>(ms.GetBuffer(), 0, (int)ms.Length);
    }

    static bool TrozoCambia(byte[] a, byte[] b, int w, int x, int y, int tw, int th)
    {
        for (int f = y; f < y + th; f++)
        {
            int i = (f * w + x) * 4;
            if (!a.AsSpan(i, tw * 4).SequenceEqual(b.AsSpan(i, tw * 4))) return true;
        }
        return false;
    }

    // --- Direct3D: un dispositivo para todas las vistas, y la lectura de un fotograma a la CPU -----

    static void Preparar()
    {
        lock (gpu)
        {
            if (dispositivo != null) return;
            Marcar(D3D11CreateDevice(IntPtr.Zero, 1 /*HARDWARE*/, IntPtr.Zero, 0x20 /*BGRA*/, IntPtr.Zero, 0, 7, out d3d, out _, out ctx), "D3D11CreateDevice");
            var iid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c"); // IDXGIDevice
            Marshal.QueryInterface(d3d, ref iid, out var dxgi);
            Marcar(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out var inspectable), "CreateDirect3D11DeviceFromDXGIDevice");
            Marshal.Release(dxgi);
            dispositivo = MarshalInterface<IDirect3DDevice>.FromAbi(inspectable);
        }
    }

    static GraphicsCaptureItem Elemento(IntPtr h)
    {
        var interop = ActivationFactory.Get("Windows.Graphics.Capture.GraphicsCaptureItem").AsInterface<IGraphicsCaptureItemInterop>();
        var iid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760"); // IGraphicsCaptureItem
        return GraphicsCaptureItem.FromAbi(interop.CreateForWindow(h, ref iid));
    }

    /// <summary>Una textura de la GPU que la CPU puede leer (STAGING), del tamaño dado.</summary>
    static unsafe IntPtr Lectura(int w, int h)
    {
        var d = new D3D11_TEXTURE2D_DESC { Width = (uint)w, Height = (uint)h, MipLevels = 1, ArraySize = 1, Format = 87 /*B8G8R8A8_UNORM*/, SampleCount = 1, Usage = 3 /*STAGING*/, CPUAccessFlags = 0x20000 /*READ*/ };
        IntPtr t;
        var crear = (delegate* unmanaged[Stdcall]<IntPtr, D3D11_TEXTURE2D_DESC*, IntPtr, IntPtr*, int>)(*(IntPtr**)d3d)[5];
        Marcar(crear(d3d, &d, IntPtr.Zero, &t), "CreateTexture2D");
        return t;
    }

    /// <summary>El fotograma a <paramref name="destino"/> (BGRA, filas seguidas).</summary>
    static unsafe bool Leer(Direct3D11CaptureFrame marco, IntPtr staging, byte[] destino, int w, int h)
    {
        var iidTex = new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c"); // ID3D11Texture2D
        var tex = marco.Surface.As<IDirect3DDxgiInterfaceAccess>().GetInterface(ref iidTex);
        try
        {
            lock (gpu)
            {
                var vt = *(IntPtr**)ctx;
                var caja = new D3D11_BOX { right = (uint)w, bottom = (uint)h, back = 1 };
                ((delegate* unmanaged[Stdcall]<IntPtr, IntPtr, uint, uint, uint, uint, IntPtr, uint, D3D11_BOX*, void>)vt[46])(ctx, staging, 0, 0, 0, 0, tex, 0, &caja);
                D3D11_MAPPED m;
                if (((delegate* unmanaged[Stdcall]<IntPtr, IntPtr, uint, uint, uint, D3D11_MAPPED*, int>)vt[14])(ctx, staging, 0, 1 /*READ*/, 0, &m) != 0) return false;
                try
                {
                    var origen = (IntPtr)m.pData;
                    long paso = m.RowPitch;
                    fixed (byte* d = destino)
                    {
                        var dd = (IntPtr)d;
                        // Por franjas de filas, en paralelo: 14 MB de una ventana a 2560x1440.
                        Parallel.For(0, 8, franja =>
                        {
                            int y0 = h * franja / 8, y1 = h * (franja + 1) / 8;
                            for (int y = y0; y < y1; y++)
                                Buffer.MemoryCopy((byte*)origen + y * paso, (byte*)dd + (long)y * w * 4, (long)w * 4, (long)w * 4);
                        });
                    }
                }
                finally { ((delegate* unmanaged[Stdcall]<IntPtr, IntPtr, uint, void>)vt[15])(ctx, staging, 0); }
            }
            return true;
        }
        finally { Marshal.Release(tex); }
    }

    static void Marcar(int hr, string que) { if (hr < 0) throw new InvalidOperationException($"{que}: 0x{hr:X8}"); }

    [DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr a, int t, IntPtr s, uint f, IntPtr l, uint n, uint v, out IntPtr d, out int nivel, out IntPtr c);
    [DllImport("d3d11.dll")] static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi, out IntPtr inspectable);

    [StructLayout(LayoutKind.Sequential)]
    struct D3D11_TEXTURE2D_DESC { public uint Width, Height, MipLevels, ArraySize, Format, SampleCount, SampleQuality, Usage, BindFlags, CPUAccessFlags, MiscFlags; }
    [StructLayout(LayoutKind.Sequential)]
    struct D3D11_BOX { public uint left, top, front, right, bottom, back; }
    [StructLayout(LayoutKind.Sequential)]
    unsafe struct D3D11_MAPPED { public void* pData; public uint RowPitch, DepthPitch; }

    [ComImport, Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IGraphicsCaptureItemInterop
    {
        IntPtr CreateForWindow([In] IntPtr window, [In] ref Guid iid);
        IntPtr CreateForMonitor([In] IntPtr monitor, [In] ref Guid iid);
    }
    [ComImport, Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDirect3DDxgiInterfaceAccess
    {
        IntPtr GetInterface([In] ref Guid iid);
    }
}
