// Abrir desde el mundo lo que hay en el escritorio (ficheros, carpetas, accesos directos a
// programas y webs), más dos fijos: el Explorador y el navegador. Lo pidió el primer uso real:
// "poder acceder a los archivos del escritorio para abrirlos desde aquí, de forma general".
// Solo se abre lo que está en las carpetas de Escritorio (la del usuario y la pública) o uno de
// los fijos: la página no puede pedir que se ejecute una ruta cualquiera.
using System.Diagnostics;

namespace Mirador.Puente;

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
            // El navegador por defecto: una URL la abre él, sea el que sea.
            if (especial == "navegador") return Lanzar("https://www.google.com", null);
            if (ruta == null) return "nada que abrir";
            var completa = Path.GetFullPath(ruta);
            bool delEscritorio = Carpetas().Any(c =>
                string.Equals(Path.GetDirectoryName(completa), c, StringComparison.OrdinalIgnoreCase));
            if (!delEscritorio) return "solo se abre lo que está en el escritorio";
            if (!File.Exists(completa) && !Directory.Exists(completa)) return "ya no está en el escritorio";
            return Lanzar(completa, null);
        }
        catch (Exception e) { return e.Message; }
    }

    static string? Lanzar(string que, string? argumento)
    {
        var psi = new ProcessStartInfo(que) { UseShellExecute = true };
        if (argumento != null) psi.ArgumentList.Add(argumento);
        Process.Start(psi);
        return null;
    }
}
