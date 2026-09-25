// La carpeta de proyectos (cada repo dentro es una isla), la misma que usa el export: la de
// infinite-desk.local.json (`npm run carpeta`, o la P en el mundo), o la que contiene al repo si no
// se eligió ninguna. Así, en otra máquina, los proyectos no tienen por qué estar junto a infinite-desk.
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

namespace InfiniteDesk.Puente;

static class Proyectos
{
    static string Fichero(string repo) => Path.Combine(repo, "infinite-desk.local.json");

    /// <param name="repo">la raíz de infinite-desk</param>
    public static string Carpeta(string repo)
    {
        try
        {
            var fichero = Fichero(repo);
            if (File.Exists(fichero)
                && JsonDocument.Parse(File.ReadAllText(fichero)).RootElement.TryGetProperty("proyectos", out var p)
                && p.GetString() is { } ruta && Directory.Exists(ruta))
                return Path.TrimEndingDirectorySeparator(Path.GetFullPath(ruta));
        }
        catch (Exception) { /* roto: lo de siempre */ }
        return Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(repo))!;
    }

    /// <summary>Cuántos repos (carpetas con `.git`) hay justo dentro: cada uno será una isla.</summary>
    public static int Repos(string carpeta) =>
        Directory.Exists(carpeta) ? Directory.EnumerateDirectories(carpeta).Count(d => Path.Exists(Path.Combine(d, ".git"))) : 0;

    public static void Guardar(string repo, string carpeta) =>
        File.WriteAllText(Fichero(repo), JsonSerializer.Serialize(new { proyectos = carpeta }, new JsonSerializerOptions { WriteIndented = true }) + "\n");

    /// <summary>
    /// El selector de carpetas de Windows, en un hilo STA propio, o null si se cancela. Con un
    /// dueño siempre-encima: si no, salía detrás del mundo a pantalla completa, como los diálogos
    /// de las pantallas.
    /// </summary>
    public static string? Elegir(string actual) =>
        ElegirCarpeta(actual, "Folder with your projects (each repo inside becomes an island)");

    /// <summary>El selector de carpetas del sistema, por encima de todo (el mundo incluido), o null si se cancela.</summary>
    public static string? ElegirCarpeta(string actual, string descripcion)
    {
        string? elegida = null;
        var hilo = new Thread(() =>
        {
            Application.EnableVisualStyles();
            using var dueño = new Form
            {
                TopMost = true, ShowInTaskbar = false, FormBorderStyle = FormBorderStyle.None,
                StartPosition = FormStartPosition.Manual, Location = new(-32000, -32000), Size = new(1, 1), Opacity = 0,
            };
            dueño.Show();
            // Windows solo deja pasar al frente a quien tiene la última entrada: una pulsación de
            // F24 (ninguna app la usa) se la da, como al entrar en una pantalla (Ventanas.Activar).
            keybd_event(0x87, 0, 0, UIntPtr.Zero);
            keybd_event(0x87, 0, 2, UIntPtr.Zero);
            dueño.Activate();
            using var dialogo = new FolderBrowserDialog
            {
                Description = descripcion,
                UseDescriptionForTitle = true,
                SelectedPath = actual,
                ShowNewFolderButton = false,
            };
            var reloj = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                var resultado = dialogo.ShowDialog(dueño);
                Registro.Anotar($"selector de carpetas: {resultado} en {reloj.ElapsedMilliseconds} ms");
                if (resultado == DialogResult.OK) elegida = dialogo.SelectedPath;
            }
            catch (Exception e) { Registro.Anotar($"selector de carpetas: FALLÓ tras {reloj.ElapsedMilliseconds} ms: {e.GetType().Name}: {e.Message}"); }
        });
        hilo.SetApartmentState(ApartmentState.STA);
        hilo.Start();
        hilo.Join();
        return elegida;
    }

    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
}
