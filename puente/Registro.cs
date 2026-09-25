// Lo que hace el puente, apuntado en %LOCALAPPDATA%\infinite-desk: cuando algo "no funciona" con
// las manos del usuario, se lee aquí en vez de adivinar (uso real: "no me deja interactuar con el
// Enter" sin más pista). Cada proceso en su fichero (puente.log, fondo.log): compartían uno y el
// puente, al arrancar, se llevaba por delante lo del fondo. Se empieza de cero en cada arranque.
namespace InfiniteDesk.Puente;

static class Registro
{
    static readonly object cerrojo = new();
    static string fichero = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "infinite-desk", "puente.log");

    public static void Empezar(string nombre = "puente.log")
    {
        fichero = Path.Combine(Path.GetDirectoryName(fichero)!, nombre);
        Directory.CreateDirectory(Path.GetDirectoryName(fichero)!);
        lock (cerrojo) File.WriteAllText(fichero, "");
    }

    public static void Anotar(string que)
    {
        try { lock (cerrojo) File.AppendAllText(fichero, $"{DateTime.Now:HH:mm:ss.fff} {que}\n"); }
        catch (IOException) { /* nunca tumba el puente por no poder escribir el registro */ }
    }
}
