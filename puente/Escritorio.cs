// Abrir desde el mundo lo que hay en el escritorio (ficheros, carpetas, accesos directos a
// programas y webs), más dos fijos: el Explorador y el navegador. Lo pidió el primer uso real:
// "poder acceder a los archivos del escritorio para abrirlos desde aquí, de forma general".
// Solo se abre lo que está en las carpetas de Escritorio (la del usuario y la pública) o uno de
// los fijos: la página no puede pedir que se ejecute una ruta cualquiera.
using System.Diagnostics;

namespace InfiniteDesk.Puente;

static class Escritorio
{
    static string[] Carpetas() =>
    [
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
        Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
    ];

    /// <summary>Lo del escritorio, carpetas primero y por nombre; sin ocultos ni desktop.ini.</summary>
    public static object[] Listar() =>
        Carpetas().Where(Directory.Exists)
            .SelectMany(c => new DirectoryInfo(c).EnumerateFileSystemInfos())
            .Where(f => (f.Attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0)
            .GroupBy(f => f.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()) // el mismo en las dos: uno
            .OrderBy(f => f is FileInfo).ThenBy(f => f.Name, StringComparer.CurrentCultureIgnoreCase)
            .Select(f => (object)new
            {
                nombre = f is FileInfo && f.Extension is ".lnk" or ".url" ? Path.GetFileNameWithoutExtension(f.Name) : f.Name,
                ruta = f.FullName,
                tipo = f is DirectoryInfo ? "carpeta" : f.Extension.ToLowerInvariant() switch
                {
                    ".lnk" or ".exe" => "programa",
                    ".url" => "web",
                    _ => "fichero",
                },
            })
            .ToArray();

    /// <summary>Abre con su programa (como un doble clic). Devuelve el error, o null.</summary>
    public static string? Abrir(string? ruta, string? especial)
    {
        try
        {
            if (especial == "explorador") return Lanzar("explorer.exe", Carpetas()[0]);
            if (especial == "navegador") return NuevaVentanaDelNavegador("https://www.google.com");
            if (ruta == null) return "nothing to open";
            var completa = Path.GetFullPath(ruta);
            bool delEscritorio = Carpetas().Any(c =>
                string.Equals(Path.GetDirectoryName(completa), c, StringComparison.OrdinalIgnoreCase));
            if (!delEscritorio) return "only things on the desktop can be opened";
            if (!File.Exists(completa) && !Directory.Exists(completa)) return "it is no longer on the desktop";
            // Un acceso directo a un programa de una sola instancia: abrirlo a secas trae al frente
            // la ventana que ya hay (que suele ser ya una pantalla). Con --new-window, una nueva.
            if (completa.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) && DestinoDe(completa) is { } destino
                && UnaInstancia.Contains(Path.GetFileName(destino).ToLowerInvariant()))
                return Lanzar(destino, "--new-window");
            return Lanzar(completa, null);
        }
        catch (Exception e) { return e.Message; }
    }

    /// <summary>Programas que se abren en la ventana que ya tienen salvo que se les pida --new-window.</summary>
    static readonly string[] UnaInstancia = ["code.exe", "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe"];

    /// <summary>
    /// Un repo en una ventana NUEVA de VS Code (Enter sobre una isla). `vscode://` lo mandaba a la
    /// ventana que ya hubiera (uso real: "no me deja abrir otra instancia de VS Code"). Solo
    /// carpetas justo debajo de dev/, que es de donde salen las islas: la página no elige qué se ejecuta.
    /// </summary>
    public static string? AbrirRepo(string? ruta, string dev)
    {
        try
        {
            if (ruta == null) return "nothing to open";
            var completa = Path.TrimEndingDirectorySeparator(Path.GetFullPath(ruta));
            if (!string.Equals(Path.GetDirectoryName(completa), Path.TrimEndingDirectorySeparator(dev), StringComparison.OrdinalIgnoreCase))
                return "only repos in your projects folder can be opened";
            if (!Directory.Exists(completa)) return "that repo is no longer there";
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            var code = new[] { Path.Combine(local, @"Programs\Microsoft VS Code\Code.exe"), Path.Combine(pf, @"Microsoft VS Code\Code.exe") }
                .FirstOrDefault(File.Exists);
            if (code == null) return "VS Code not found";
            var psi = new ProcessStartInfo(code) { UseShellExecute = false };
            psi.ArgumentList.Add("--new-window");
            psi.ArgumentList.Add(completa);
            Process.Start(psi);
            return null;
        }
        catch (Exception e) { return e.Message; }
    }

    /// <summary>A qué apunta un .lnk (con WScript.Shell, que viene con Windows), o null.</summary>
    static string? DestinoDe(string lnk)
    {
        try
        {
            if (!OperatingSystem.IsWindows() || Type.GetTypeFromProgID("WScript.Shell") is not { } tipo) return null;
            dynamic shell = Activator.CreateInstance(tipo)!;
            string destino = shell.CreateShortcut(lnk).TargetPath;
            return File.Exists(destino) ? destino : null;
        }
        catch { return null; }
    }

    /// <summary>
    /// El navegador por defecto en una ventana NUEVA: abrir la URL sin más la mete como pestaña en
    /// la ventana que ya hay, que suele ser ya otra pantalla, y no sale nada nuevo que capturar
    /// (uso real). Chrome, Edge y Firefox entienden --new-window. Si no se sabe cuál es, la URL a pelo.
    /// </summary>
    static string? NuevaVentanaDelNavegador(string url)
    {
        var exe = NavegadorPorDefecto();
        if (exe == null) return Lanzar(url, null);
        var psi = new ProcessStartInfo(exe) { UseShellExecute = false };
        psi.ArgumentList.Add("--new-window");
        psi.ArgumentList.Add(url);
        Process.Start(psi);
        return null;
    }

    /// <summary>El .exe que abre https, según tu elección (UserChoice -> ProgId -> shell\open\command).</summary>
    static string? NavegadorPorDefecto()
    {
        if (!OperatingSystem.IsWindows()) return null;
        using var eleccion = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice");
        if (eleccion?.GetValue("ProgId") is not string progId) return null;
        using var orden = Microsoft.Win32.Registry.ClassesRoot.OpenSubKey($@"{progId}\shell\open\command");
        if (orden?.GetValue(null) is not string linea) return null;
        // "C:\...\chrome.exe" --single-argument %1  ->  C:\...\chrome.exe
        var exe = linea.StartsWith('"') ? linea[1..linea.IndexOf('"', 1)] : linea.Split(' ')[0];
        return File.Exists(exe) ? exe : null;
    }

    static string? Lanzar(string que, string? argumento)
    {
        var psi = new ProcessStartInfo(que) { UseShellExecute = true };
        if (argumento != null) psi.ArgumentList.Add(argumento);
        Process.Start(psi);
        return null;
    }
}
