// En las pantallas que abren Kiri y Atlas (el Edge de las pantallas, puente/Ventanas.Web.cs): en
// cuanto YouTube ofrece su botón de "Saltar" en un anuncio, se pulsa. Uso real: "que se dé al botón
// de saltar si el anuncio lo permite, para no perder el hilo de trabajo pasando anuncios". Solo hace
// lo que haría uno: los anuncios que no se pueden saltar se ven enteros, y no se bloquea nada.
(() => {
  // Los nombres del botón han cambiado con los años; se miran todos.
  const BOTONES = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-ad-skip-button-container",
  ].join(",");

  /** El botón de saltar, si está a la vista y se puede pulsar. */
  function boton() {
    for (const b of document.querySelectorAll(BOTONES)) {
      const el = /** @type {HTMLElement} */ (b);
      if (el.offsetParent !== null && !el.hasAttribute("disabled") && getComputedStyle(el).visibility !== "hidden") return el;
    }
    return null;
  }

  let ultimo = 0;
  function mirar() {
    const b = boton();
    if (!b || Date.now() - ultimo < 800) return;
    ultimo = Date.now();
    // Como un clic de verdad: YouTube escucha el puntero, no solo "click".
    for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      b.dispatchEvent(new (tipo.startsWith("pointer") ? PointerEvent : MouseEvent)(tipo, { bubbles: true, cancelable: true, view: window }));
    }
    b.click();
  }

  // El botón aparece a los ~5 s del anuncio: mirar cada 400 ms basta y es barato (un
  // querySelectorAll). Con un MutationObserver saltaría a cada fotograma: la barra de progreso de
  // YouTube cambia su estilo sin parar.
  setInterval(mirar, 400);
})();
