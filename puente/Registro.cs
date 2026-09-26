// Lo que hace el puente, apuntado en %LOCALAPPDATA%\infinite-desk: cuando algo "no funciona" con
// las manos del usuario, se lee aquí en vez de adivinar (uso real: "no me deja interactuar con el
// Enter" sin más pista). Cada proceso en su fichero (puente.log, fondo.log): compartían uno y el
// puente, al arrancar, se llevaba por delante lo del fondo. Se empieza de cero en cada arranque, y el anterior queda en .anterior.log.
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
        // El de la vez anterior se guarda (puente.anterior.log): tras un cuelgue del equipo, al volver
        // a entrar se borraba justo lo que contaba qué pasó (uso real, 2026-09-26).
        lock (cerrojo)
        {
            try { if (File.Exists(fichero)) File.Move(fichero, Path.ChangeExtension(fichero, ".anterior.log"), overwrite: true); }
            catch (IOException) { /* otro lo tiene abierto: se pierde, como antes */ }
            File.WriteAllText(fichero, "");
        }
    }

    public static void Anotar(string que)
    {
        try { lock (cerrojo) File.AppendAllText(fichero, $"{DateTime.Now:HH:mm:ss.fff} {que}\n"); }
        catch (IOException) { /* nunca tumba el puente por no poder escribir el registro */ }
    }
}
