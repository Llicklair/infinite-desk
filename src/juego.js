// Chispas, el minijuego del palantír (núcleo puro, probado en Node): las cuentas, sin 3D ni sonido.
// Pensado para el TDAH: rondas cortas, recompensa en el acto, una racha que sube y suena cada vez
// más aguda, y fallar no castiga más que cortar la racha. src/chispas.js lo pinta y lo hace sonar.

export const DURACION_S = 45;
export const HITOS = [5, 10, 20, 35, 50]; // rachas que se celebran aparte

/**
 * Los puntos de un acierto: más cuanto más larga la racha (×1 hasta 4, ×2 desde 5, ×3 desde 10,
 * ×5 desde 20), para que mantenerla importe más que acertar suelto.
 * @param {number} racha los aciertos seguidos, contando este
 */
export function puntos(racha) {
  const multiplicador = racha >= 20 ? 5 : racha >= 10 ? 3 : racha >= 5 ? 2 : 1;
  return 10 * multiplicador;
}

// Escala pentatónica mayor: suene la nota que suene, nunca desentona con la anterior.
const PENTATONICA = [0, 2, 4, 7, 9];

/**
 * La frecuencia (Hz) del sonido de un acierto: sube con la racha por la escala pentatónica, una
 * octava cada 5 aciertos, hasta un techo (para no acabar en un pitido).
 * @param {number} racha
 */
export function notaDeRacha(racha) {
  const paso = Math.min(Math.max(racha - 1, 0), 19);
  const semitonos = 12 * Math.floor(paso / 5) + PENTATONICA[paso % 5];
  return 440 * Math.pow(2, (semitonos - 9) / 12); // la primera, do4 (262 Hz): la4 menos 9 semitonos
}

/**
 * Cada cuánto sale una chispa nueva (s) según lo que va de ronda: al principio despacio, al final
 * deprisa, para que la ronda acabe en un subidón.
 * @param {number} transcurrido segundos desde que empezó
 */
export function intervaloDeAparicion(transcurrido) {
  const t = Math.min(Math.max(transcurrido / DURACION_S, 0), 1);
  return 1.1 - 0.75 * t;
}

/**
 * Cuánto vive una chispa antes de escaparse (s): también menos al final.
 * @param {number} transcurrido
 */
export function vidaDeChispa(transcurrido) {
  const t = Math.min(Math.max(transcurrido / DURACION_S, 0), 1);
  return 3.6 - 1.4 * t;
}

/** ¿Esta racha es un hito que se celebra? @param {number} racha */
export const esHito = (racha) => HITOS.includes(racha);
