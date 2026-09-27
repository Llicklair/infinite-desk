// Lo que llega por voz, corregido donde se puede (sin DOM ni red; se prueba en Node). El dictado no
// conoce "Kiri", "Atlas", "palantír" ni los repos, y los cambia por palabras parecidas ("quiri",
// "galaxy brain"). Aquí se buscan los trozos de la frase que SUENAN como un nombre conocido y se
// cambian por él. Uso real: "a veces me detecta mal algunas palabras".

/** Sin tildes, en minúsculas, solo letras y números. @param {string} s */
const plano = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, "");

/**
 * Cómo suena (a la española, a grandes rasgos): lo que se pronuncia igual se escribe igual.
 * "quiri", "kiri" y "kirí" dan lo mismo; "galaxy brain" y "galaxibrein", casi.
 * @param {string} s
 */
export function sonido(s) {
  return plano(s)
    .replace(/ph/g, "f").replace(/sh|ch/g, "x").replace(/ll/g, "y")
    .replace(/qu/g, "k").replace(/c([eiy])/g, "s$1").replace(/c/g, "k").replace(/q/g, "k")
    .replace(/g([ei])/g, "j$1").replace(/w/g, "u").replace(/v/g, "b").replace(/z/g, "s").replace(/x/g, "ks")
    .replace(/h/g, "").replace(/y/g, "i").replace(/ai|ei|ey/g, "e")
    .replace(/(.)\1+/g, "$1");
}

/** Distancia de edición (Levenshtein). @param {string} a @param {string} b */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/**
 * La frase con los nombres conocidos en su sitio: cada trozo de tantas palabras como el nombre que
 * suena como él (igual en los cortos; en los largos, una letra de margen de cada cinco; y la misma
 * inicial) se cambia por él. Lo que ya está bien escrito no se toca.
 * @param {string} texto @param {string[]} nombres
 */
export function corregirNombres(texto, nombres) {
  const conocidos = nombres.filter((n) => plano(n).length >= 4).map((n) => ({ nombre: n, son: sonido(n), largo: n.split(/[\s_-]+/).length }));
  const palabras = texto.split(/(\s+)/); // con los espacios, para devolverlo igual
  const solo = palabras.filter((_, i) => i % 2 === 0);
  const fuera = /** @type {string[]} */ ([]);
  for (let i = 0; i < solo.length;) {
    let cambio = null;
    for (const n of [3, 2, 1]) {
      if (i + n > solo.length) continue;
      const trozo = solo.slice(i, i + n).join(" ");
      const limpio = trozo.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const son = sonido(limpio);
      if (son.length < 3) continue;
      const k = conocidos.find((c) => {
        if (plano(limpio) === plano(c.nombre)) return true;
        // Mismas palabras que el nombre, misma inicial; y de margen, nada en los cortos (sonar igual:
        // "forma" no es "forja") y una letra de cada cinco en los largos.
        if (son[0] !== c.son[0] || n !== c.largo) return false;
        return distancia(son, c.son) <= (c.son.length <= 5 ? 0 : Math.floor(c.son.length / 5));
      });
      if (k) { cambio = { n, texto: trozo.replace(limpio, k.nombre) }; break; }
    }
    if (cambio) { fuera.push(cambio.texto); i += cambio.n; } else { fuera.push(solo[i]); i++; }
  }
  return fuera.join(" ");
}
