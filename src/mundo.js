// El mundo: primera persona, una isla por repo, pantallas flotantes con su grafo detrás.
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { colocarIslas, firmaGrafos, islasNuevas } from "./islas.js";
import { crearGrafo3D } from "./grafo3d.js";
import { rotulo } from "./rotulo.js";
import { capturaDeDemostracion, capturarVentana, crearPantalla, puedeCapturar } from "./pantallas.js";
import { colorDeAgente, encendidosPorAgentes, repoDeTitulo, senalesDeAgentes, siguienteRepo, vigorOnda } from "./vinculo.js";
import { crearConsola } from "./consola3d.js";
import { paletaDeHora, vidaDeRepo } from "./ambiente.js";
import { crearCielo, crearCristales, crearFaro } from "./decorado.js";
import { crearPalantir } from "./palantir.js";
import { crearLector } from "./lector.js";
import { crearChispas } from "./chispas.js";
import { crearHolograma } from "./maestra3d.js";
import { crearMaestra } from "./maestra.js";
import { fuerzaDeFallo, nodoDeFichero } from "./fallos.js";
import { mostrarIsla, mostrarNodo } from "./nodo.js";
import { crearPuente, releerScript } from "./puente.js";
import { crearPanelFicheros } from "./ficheros.js";
import { crearPanelAjustes } from "./ajustes.js";

const VELOCIDAD = 9; // metros por segundo; Shift la triplica
const ALTURA_OJOS = 1.7;
const RECIENTE_MS = 120000; // lo abierto con Enter hace menos de esto es el candidato de la próxima captura
const REPOSO_MS = 30000; // en el fondo, sin tocarlo este rato vuelve a girar solo
const RELEER_FONDO_MS = 120000; // el fondo (sin puente) relee grafos.js cada tanto
const RELEER_NOTICIAS_MS = 5 * 60000; // noticias.js lo rehace el puente cada 30 min (npm run noticias)

/**
 * @typedef {import("./grafo3d.js").GrafoExportado} GrafoExportado
 * @typedef {import("./grafo3d.js").Grafo3D} Grafo3D
 * @typedef {import("./pantallas.js").Pantalla} Pantalla
 * @typedef {{portada: HTMLElement, info: HTMLElement, aviso: HTMLElement, ayuda: HTMLElement, ficheros: HTMLElement | null, nodo: HTMLElement | null, ajustes?: HTMLElement | null, lector?: HTMLElement | null, juego?: HTMLElement | null, maestra?: HTMLElement | null}} Interfaz
 */

/**
 * @param {HTMLElement} contenedor
 * @param {GrafoExportado[]} grafos
 * @param {Interfaz} ui
 * @param {{vista?: string | null}} [opciones] vista "aerea": cámara alta y sin portada (capturas);
 *   "fondo": solo ratón y sin pointer lock, detrás de los iconos (ADR 0004); "dentro": Esc sale al escritorio
 */
export function montarMundo(contenedor, grafos, ui, opciones = {}) {
  // Mutables: al regenerar los grafos (R, o solos) se rellenan de nuevo, sin recargar la página.
  /** @type {Map<string, GrafoExportado>} */
  const porNombre = new Map();
  /** @type {string[]} */
  const nombres = [];

  // Sin antialiasing en pantallas de alta densidad (≥150 %): los píxeles ya son pequeños y suavizar
  // bordes costaba mucho (medido: el mundo a casi 2 núcleos de CPU en un 200 %).
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5 });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  contenedor.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  // El cielo (degradado, nebulosa y estrellas) sigue la hora de verdad; la niebla toma su color de
  // horizonte para que el suelo se funda con él. Se repasa cada minuto.
  const niebla = new THREE.FogExp2("#070912", 0.0065);
  escena.fog = niebla;
  const cielo = crearCielo(renderer);
  escena.add(cielo.objeto);
  /** @type {((p: import("./ambiente.js").Paleta) => void)[]} lo que sigue a la hora, además del cielo (el palantír) */
  const alCambiarHora = [];
  const paletaDeAhora = () => {
    const d = new Date();
    return paletaDeHora(d.getHours() + d.getMinutes() / 60);
  };
  function ponerHora() {
    const p = paletaDeAhora();
    cielo.paleta(p);
    niebla.color.setRGB(...p.horizonte, THREE.SRGBColorSpace); // el cielo pinta sRGB tal cual: la niebla, igual
    for (const f of alCambiarHora) f(p);
  }
  ponerHora();
  setInterval(ponerHora, 60000);

  const camara = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 2000);
  // Se aparece delante del palantír (en el centro), mirándolo, con la primera isla detrás de él. A
  // 20 se ven a la vez sus dos anillos (a 15, el de arriba quedaba fuera del encuadre); con pocas
  // islas el círculo es pequeño y se queda más cerca, para no aparecer dentro de una.
  const radioInicial = grafos.length ? Math.hypot(colocarIslas(grafos.length)[0].x, colocarIslas(grafos.length)[0].z) : 22;
  camara.position.set(0, ALTURA_OJOS, Math.min(20, radioInicial - 9));
  // Mirando un poco hacia arriba, al palantír: así caben de una vez las noticias, la esfera, los
  // repos del mes y la consola maestra encima.
  camara.lookAt(0, 6.5, 0);
  escena.add(camara);

  escena.add(new THREE.HemisphereLight("#c8d0ff", "#2a1d40", 1.4));
  const sol = new THREE.DirectionalLight("#ffffff", 1.8);
  sol.position.set(20, 40, 10);
  escena.add(sol);

  // Suelo: una rejilla oscura que se pierde en la niebla, estilo holodeck.
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: "#0a0d1a", roughness: 1 }),
  );
  suelo.rotation.x = -Math.PI / 2;
  escena.add(suelo);
  const rejilla = new THREE.GridHelper(1200, 300, "#26306a", "#141a3a");
  rejilla.position.y = 0.01;
  escena.add(rejilla);

  // Islas: pedestal, anillo de color, el grafo flotando y el cartel del repo. Y la decoración que
  // cuenta cosas: cristales según la vida del repo (su último commit) y un faro si hay agentes.
  /** @type {{g3d: Grafo3D, base: THREE.Group, pedestal: THREE.Mesh, grafo: GrafoExportado, color: THREE.Color, cristales: ReturnType<typeof crearCristales>, faro: ReturnType<typeof crearFaro>}[]} */
  const islas = [];
  let firma = "";
  // T: cada isla con gb puede verse también como su árbol de carpetas (`alt`, ADR 0003).
  let verCarpetas = false;
  /** @type {GrafoExportado[]} */
  let actuales = [];
  /** @param {GrafoExportado} g */
  const vista = (g) => (verCarpetas && g.alt ? { ...g, ...g.alt } : g);
  /** El grafo de un repo tal y como se está viendo ahora. @param {string} nombre */
  const grafoDe = (nombre) => {
    const g = porNombre.get(nombre);
    return g ? vista(g) : null;
  };

  /**
   * Pone las islas de estos grafos, quitando las que hubiera: al arrancar y al regenerar.
   * @param {GrafoExportado[]} nuevos
   */
  function ponerIslas(nuevos) {
    for (const { base } of islas) {
      escena.remove(base);
      base.traverse((o) => {
        const m = /** @type {THREE.Mesh | THREE.Sprite} */ (o);
        // Compartidas, no se tocan: la esfera de los nodos (grafo3d) y el cuadrado de los sprites (three).
        if (o instanceof THREE.InstancedMesh) o.dispose();
        else if (m.geometry && !(o instanceof THREE.Sprite)) m.geometry.dispose();
        for (const mat of [m.material].flat()) {
          if (!mat) continue;
          /** @type {any} */ (mat).map?.dispose();
          mat.dispose();
        }
      });
    }
    islas.length = 0;
    porNombre.clear();
    nombres.length = 0;
    for (const g of nuevos) {
      porNombre.set(g.nombre, g);
      nombres.push(g.nombre);
    }
    firma = firmaGrafos(nuevos);
    actuales = nuevos;
    colocarIslas(nuevos.length).forEach(({ x, z, angulo }, i) => ponerIsla(vista(nuevos[i]), i, nuevos.length, x, z, angulo));
  }

  /**
   * @param {GrafoExportado} grafo @param {number} i @param {number} total
   * @param {number} x @param {number} z @param {number} angulo
   */
  function ponerIsla(grafo, i, total, x, z, angulo) {
    const color = new THREE.Color().setHSL(i / total, 0.7, 0.6);
    const base = new THREE.Group();
    base.position.set(x, 0, z);
    base.rotation.y = angulo;

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(6.5, 7, 0.5, 48),
      new THREE.MeshStandardMaterial({ color: "#111633", roughness: 0.6 }),
    );
    pedestal.position.y = 0.25;
    const vida = vidaDeRepo(grafo.ultimoCommit, Date.now() / 1000);
    // Una isla olvidada tiene el anillo apagado, pero se sigue viendo de qué color es.
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.07, 8, 96),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.35 + 0.65 * vida) }));
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.y = 0.52;

    const g3d = crearGrafo3D(grafo, 5);
    g3d.objeto.position.y = 7.5;
    const ciclos = grafo.ciclos ? ` · ${grafo.ciclos} cycle${grafo.ciclos === 1 ? "" : "s"}` : "";
    const cartel = rotulo(
      [grafo.nombre, grafo.fuente === "carpetas"
        ? `${grafo.nodos.length} folders and files · no gb` // ADR 0003: estructura, no dependencias
        : `${grafo.nodos.length} modules · ${grafo.aristas.length} edges${ciclos}`],
      { alto: 1.2, color: `#${color.getHexString()}` },
    );
    cartel.position.y = 14.8;

    const cristales = crearCristales(color, vida);
    const faro = crearFaro();
    base.add(pedestal, anillo, cristales.objeto, faro.objeto, g3d.objeto, cartel);
    escena.add(base);
    islas.push({ g3d, base, pedestal, grafo, color, cristales, faro });
  }
  ponerIslas(grafos);

  // El palantír, en el centro del círculo de islas: lo último sobre IA en las redes.
  // En el fondo se mira desde la órbita, lejos: crece con el círculo de islas (hasta ×3).
  const palantir = crearPalantir(opciones.vista === "fondo" ? THREE.MathUtils.clamp(radioInicial / 22, 1, 3) : 1);
  escena.add(palantir.objeto);
  palantir.paleta(paletaDeAhora());
  // Chispas: clic en la esfera del palantír (en primera persona: se apunta con la mira).
  const chispas = ui.juego && opciones.vista !== "fondo"
    ? crearChispas(escena, ui.juego, {
      origen: () => palantir.esfera.getWorldPosition(new THREE.Vector3()),
      alHito: () => palantir.avivar(),
      avisar: (t) => avisar(t),
    })
    : null;
  alCambiarHora.push((p) => palantir.paleta(p));
  async function releerNoticias() {
    await releerScript("noticias.js");
    palantir.actualizar(window.INFINITE_DESK_NOTICIAS, Date.now());
    lector?.actualizar(window.INFINITE_DESK_NOTICIAS);
    // `?vista=demo&chispas`: una ronda que se juega sola (un disparo cada medio segundo, a la
    // primera chispa), para ver rachas, estallidos y marcador sin manos (capturas).
    if (opciones.vista === "demo" && chispas && !chispas.activo && new URLSearchParams(location.search).has("chispas")) {
      chispas.empezar();
      const juego = setInterval(() => {
        if (!chispas.activo) return clearInterval(juego);
        const blanco = chispas.objetivos[0];
        if (blanco) chispas.disparar(new THREE.Ray(camara.position.clone(), blanco.sub(camara.position).normalize()));
      }, 500);
    }
    // `?vista=demo&leer=N`: el lector abierto en la tarjeta N, para verlo sin manos (capturas).
    const n = opciones.vista === "demo" ? new URLSearchParams(location.search).get("leer") : null;
    const tarjeta = n === null ? undefined : palantir.tarjetas[Number(n)];
    const enlace = tarjeta && palantir.enlaceDe(tarjeta);
    if (enlace && lector && !lector.abierto) lector.abrir(enlace);
  }
  releerNoticias();
  setInterval(releerNoticias, RELEER_NOTICIAS_MS);

  /** @type {Pantalla[]} */
  const pantallas = [];
  const vivos = () => [
    ...islas.map((i) => i.g3d),
    ...pantallas.flatMap((p) => (p.grafo3d ? [p.grafo3d] : [])),
  ];

  // --- controles de primera persona ---------------------------------------------------------
  const mirar = new PointerLockControls(camara, renderer.domElement);
  mirar.addEventListener("lock", () => (ui.portada.hidden = true));
  // Al entrar a escribir en una pantalla se suelta el ratón, pero no es para salir del mundo.
  // Con el lector abierto también: se suelta el ratón para leer, y la portada lo tapaba.
  mirar.addEventListener("unlock", () => (ui.portada.hidden = escribiendo !== null || Boolean(panel?.abierto) || Boolean(ajustes?.abierto) || Boolean(lector?.abierto) || Boolean(maestra?.abierto)));
  // Soltar el ratón (Esc) a media ronda de Chispas la acaba.
  mirar.addEventListener("unlock", () => chispas?.terminar());
  ui.portada.addEventListener("click", () => mirar.lock());
  // "dentro": el mundo a pantalla completa, abierto desde el clic derecho del escritorio
  // (npm run fondo). Con el ratón ya suelto, Esc cierra la ventana y vuelve a verse el fondo.
  // Esc con el ratón suelto: al escritorio, pero el mundo sigue abierto (el puente lo minimiza) y
  // el clic derecho → Enter vuelve a él con sus pantallas. Cerrarlo del todo: Shift+Esc. Uso real:
  // "sin querer le di a Escape dos veces y perdí lo que tenía abierto".
  if (opciones.vista === "dentro") {
    const pie = ui.portada.querySelector("p");
    if (pie) pie.textContent = "Click to enter · Esc: back to the desktop (the space stays open) · Shift+Esc: close it";
    document.addEventListener("keydown", async (e) => {
      if (e.code !== "Escape" || mirar.isLocked || escribiendo || panel?.abierto || ajustes?.abierto || lector?.abierto || maestra?.abierto) return;
      if (e.shiftKey) return window.close();
      // Sin puente no hay quien lo minimice: se cierra, como antes.
      if (!(puente?.conectado && await puente.alEscritorio())) window.close();
    });
  }
  if (opciones.vista === "aerea") {
    ui.portada.hidden = true;
    camara.position.set(0, 60, 95);
    camara.lookAt(0, 0, -5);
  }

  // --- modo fondo: el puente reenvía el ratón del escritorio, pero ni pointer lock ni teclado
  // Se orbita en vez de caminar: arrastrar gira, la rueda acerca, doble clic vuela a la isla
  // bajo el cursor, y en reposo la vista gira sola. Se apunta con el cursor, no con la mira.
  const fondo = opciones.vista === "fondo";
  // El fondo pinta un Chrome por monitor (ADR 0004): cada uno sabe cuál es por ?monitor=N.
  const monitor = Number(new URLSearchParams(location.search).get("monitor") ?? 0);
  /** @type {OrbitControls | null} */
  let orbita = null;
  const puntero = new THREE.Vector2(0, 0); // en primera persona es la mira, el centro
  let hayPuntero = !fondo;
  let ultimoToque = 0;
  /** @type {{objetivo: THREE.Vector3, posicion: THREE.Vector3, aerea?: boolean} | null} */
  let vuelo = null;
  /** @type {(() => void) | null} */
  let volverAerea = null;
  if (fondo) {
    ui.portada.hidden = true;
    ui.ayuda.innerHTML = "<b>drag</b> rotate · <b>wheel</b> zoom · <b>click</b> a node: its details · <b>double-click</b> fly to an island (on empty space or <b>Esc</b>: back up)";
    camara.position.set(0, 45, 95);
    const o = new OrbitControls(camara, renderer.domElement);
    o.target.set(0, 6, 0);
    o.enableDamping = true;
    o.enablePan = false; // el botón derecho es del menú del escritorio
    o.autoRotate = true;
    o.autoRotateSpeed = 0.25;
    o.minDistance = 4;
    o.maxDistance = 260;
    o.maxPolarAngle = Math.PI / 2 - 0.08; // nunca bajo el suelo
    o.addEventListener("start", () => {
      vuelo = null;
      o.autoRotate = false;
      ultimoToque = performance.now();
    });
    o.addEventListener("end", () => (ultimoToque = performance.now()));
    orbita = o;
    const aerea = { posicion: camara.position.clone(), objetivo: o.target.clone() };
    // Esc (si llega el teclado), doble clic en el vacío o un rato quieto: de vuelta a la
    // vista aérea que gira sola, la de arrancar.
    volverAerea = () => {
      vuelo = { objetivo: aerea.objetivo.clone(), posicion: aerea.posicion.clone(), aerea: true };
      o.autoRotate = false;
    };
    document.addEventListener("keydown", (e) => { if (e.code === "Escape") volverAerea?.(); });
    const lienzo = renderer.domElement;
    lienzo.addEventListener("pointermove", (e) => {
      puntero.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      hayPuntero = true;
    });
    lienzo.addEventListener("pointerleave", () => (hayPuntero = false));
    lienzo.addEventListener("dblclick", () => dobleClic());
    // Detrás de los iconos (puente --fondo, ADR 0004) el ratón NO llega como entrada: el puente
    // manda mensajes y aquí se gira, se acerca o se vuela con ellos. Pasárselo como entrada de
    // verdad hacía que el navegador capturase el ratón en su ventana invisible, y Windows dejaba
    // de responder (barra de tareas, iconos) hasta cerrarlo (uso real).
    /** @type {{x: number, y: number} | null} */
    let arrastre = null;
    let recorrido = 0;
    const esfera = new THREE.Spherical();
    const desplazamiento = new THREE.Vector3();
    /** @param {number} x @param {number} y en píxeles de la página */
    const apuntarA = (x, y) => {
      puntero.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      hayPuntero = true;
    };
    /** @param {(s: THREE.Spherical) => void} cambio */
    const orbitar = (cambio) => {
      vuelo = null;
      o.autoRotate = false;
      ultimoToque = performance.now();
      desplazamiento.copy(camara.position).sub(o.target);
      esfera.setFromVector3(desplazamiento);
      cambio(esfera);
      esfera.phi = THREE.MathUtils.clamp(esfera.phi, 0.05, o.maxPolarAngle);
      esfera.radius = THREE.MathUtils.clamp(esfera.radius, o.minDistance, o.maxDistance);
      camara.position.copy(o.target).add(desplazamiento.setFromSpherical(esfera));
      camara.lookAt(o.target);
    };
    /** @type {{addEventListener(t: string, f: (e: {data: any}) => void): void} | undefined} */
    const webview = /** @type {any} */ (window).chrome?.webview;
    webview?.addEventListener("message", ({ data: m }) => {
      // El puente manda píxeles físicos; la página va en píxeles CSS.
      const x = (m.x ?? 0) / window.devicePixelRatio;
      const y = (m.y ?? 0) / window.devicePixelRatio;
      if (m.t === "fuera") { hayPuntero = false; arrastre = null; return; }
      apuntarA(x, y);
      if (m.t === "bajar") { arrastre = { x, y }; recorrido = 0; }
      else if (m.t === "mover" && arrastre) {
        const dx = x - arrastre.x, dy = y - arrastre.y;
        recorrido += Math.hypot(dx, dy);
        arrastre = { x, y };
        orbitar((s) => { s.theta -= (2 * Math.PI * dx) / window.innerHeight; s.phi -= (2 * Math.PI * dy) / window.innerHeight; });
      } else if (m.t === "subir") {
        if (arrastre && recorrido <= 5) { apuntado = apuntar(); clicSuelto(); }
        arrastre = null;
      } else if (m.t === "doble") { apuntado = apuntar(); dobleClic(); }
      else if (m.t === "rueda") orbitar((s) => { s.radius *= m.d > 0 ? 1 / 1.1 : 1.1; });
    });
  }
  /** Doble clic en el fondo: vuela a la isla bajo el cursor; en el vacío, de vuelta arriba. */
  function dobleClic() {
    const o = orbita;
    if (!o) return;
    {
      const a = apuntado;
      const isla = a?.tipo === "isla" ? a.isla
        : a?.tipo === "nodo" ? islas.find((i) => i.g3d === a.g3d) : undefined;
      if (!isla) {
        volverAerea?.();
        return;
      }
      const objetivo = isla.g3d.objeto.getWorldPosition(new THREE.Vector3());
      const desde = camara.position.clone().sub(objetivo).setY(0).normalize();
      vuelo = { objetivo, posicion: objetivo.clone().addScaledVector(desde, 24).setY(objetivo.y + 6) };
      o.autoRotate = false;
      ultimoToque = performance.now();
    }
  }

  /** @type {Set<string>} */
  const teclas = new Set();
  document.addEventListener("keydown", (e) => {
    if (!mirar.isLocked) return;
    if (e.code === "Space") e.preventDefault();
    if (!e.repeat) accion(e.code);
    teclas.add(e.code);
  });
  document.addEventListener("keyup", (e) => teclas.delete(e.code));
  window.addEventListener("blur", () => teclas.clear());

  // --- a qué apunta la mira -----------------------------------------------------------------
  /**
   * @typedef {{tipo: "nodo", g3d: Grafo3D, i: number}
   *   | {tipo: "pantalla", pantalla: Pantalla}
   *   | {tipo: "isla", isla: typeof islas[number], base?: boolean}
   *   | {tipo: "consola", consola: import("./consola3d.js").Consola}
   *   | {tipo: "titular", enlace: import("./palantir.js").Enlace, tarjeta: THREE.Object3D}
   *   | {tipo: "palantir"}
   *   | {tipo: "maestra"}
   *   | null} Apuntado
   */
  /** @type {Apuntado} */
  let apuntado = null;
  /** @type {{g3d: Grafo3D, i: number} | null} el nodo con las aristas encendidas */
  let encendido = null;
  const rayo = new THREE.Raycaster();
  rayo.far = fondo ? 400 : 120; // desde el fondo se mira de lejos
  const esfera = new THREE.Sphere();

  /** @returns {Apuntado} */
  function apuntar() {
    rayo.setFromCamera(puntero, camara);
    let mejor = Infinity;
    /** @type {Apuntado} */
    let res = null;

    const golpeP = rayo
      .intersectObjects(pantallas.map((p) => p.objeto), true)
      .find((h) => h.object.userData.pantalla);
    if (golpeP) {
      const pantalla = pantallas.find((p) => golpeP.object.parent === p.objeto);
      if (pantalla) {
        mejor = golpeP.distance;
        res = { tipo: "pantalla", pantalla };
      }
    }

    // La terminal de un agente (se agarra y se mueve, como las pantallas).
    const golpeC = rayo.intersectObjects([...consolas].map((c) => c.cartel), false)[0];
    if (golpeC && golpeC.distance < mejor) {
      const consola = [...consolas].find((c) => c.cartel === golpeC.object);
      if (consola) {
        mejor = golpeC.distance;
        res = { tipo: "consola", consola };
      }
    }

    // El holograma de la consola maestra.
    if (holograma) {
      const golpeH = rayo.intersectObject(holograma.objeto, false)[0];
      if (golpeH && golpeH.distance < mejor) {
        mejor = golpeH.distance;
        res = { tipo: "maestra" };
      }
    }

    // La esfera del palantír (Chispas).
    if (chispas) {
      const golpeE = rayo.intersectObject(palantir.esfera, false)[0];
      if (golpeE && golpeE.distance < mejor) {
        mejor = golpeE.distance;
        res = { tipo: "palantir" };
      }
    }

    // La base de una isla (su pedestal): clic, su ficha con el resumen del README.
    const golpeB = rayo.intersectObjects(islas.map((i) => i.pedestal), false)[0];
    if (golpeB && golpeB.distance < mejor) {
      const isla = islas.find((i) => i.pedestal === golpeB.object);
      if (isla) {
        mejor = golpeB.distance;
        res = { tipo: "isla", isla, base: true };
      }
    }

    // Una tarjeta del palantír (un titular o un repo).
    const golpeT = rayo.intersectObjects(palantir.tarjetas, false)[0];
    if (golpeT && golpeT.distance < mejor) {
      const enlace = palantir.enlaceDe(golpeT.object);
      if (enlace) {
        mejor = golpeT.distance;
        res = { tipo: "titular", enlace, tarjeta: golpeT.object };
      }
    }

    // Nodos: primero la esfera envolvente de cada grafo, que es barata; el detalle solo
    // en los grafos que el rayo atraviesa.
    for (const g3d of vivos()) {
      const bs = g3d.esferas.boundingSphere;
      if (!bs) continue;
      esfera.copy(bs).applyMatrix4(g3d.esferas.matrixWorld);
      if (!rayo.ray.intersectsSphere(esfera)) continue;
      const h = rayo.intersectObject(g3d.esferas, false)[0];
      if (h && h.instanceId !== undefined && h.distance < mejor) {
        mejor = h.distance;
        res = { tipo: "nodo", g3d, i: h.instanceId };
      }
    }
    if (res) return res;

    // Sin nada exacto bajo la mira: la isla hacia la que miras, si está cerca y centrada.
    const dir = rayo.ray.direction;
    let mejorIsla = null;
    let mejorCos = 0.93;
    for (const isla of islas) {
      const hacia = isla.g3d.objeto.getWorldPosition(new THREE.Vector3()).sub(camara.position);
      const d = hacia.length();
      const cos = hacia.normalize().dot(dir);
      if (d < rayo.far / 2 && cos > mejorCos) {
        mejorCos = cos;
        mejorIsla = isla;
      }
    }
    return mejorIsla ? { tipo: "isla", isla: mejorIsla } : null;
  }

  /** El grafo al que afectan Q/E y la rueda según lo apuntado. */
  function grafoApuntado() {
    if (!apuntado) return null;
    if (apuntado.tipo === "nodo") return apuntado.g3d;
    if (apuntado.tipo === "isla") return apuntado.isla.g3d;
    if (apuntado.tipo === "titular" || apuntado.tipo === "palantir" || apuntado.tipo === "maestra") return null;
    if (apuntado.tipo === "consola") {
      const padre = apuntado.consola.objeto.parent;
      return vivos().find((g) => g.objeto === padre) ?? null;
    }
    return apuntado.pantalla.grafo3d;
  }
  /** El repo de lo apuntado, para abrirlo en VS Code. */
  function repoApuntado() {
    const g = grafoApuntado();
    return g ? g.grafo : null;
  }

  function describir() {
    if (!apuntado) return "";
    // En plena ronda de Chispas no se describe lo apuntado: los clics son disparos, no "mover pantalla".
    if (chispas?.activo) return "";
    if (apuntado.tipo === "nodo") {
      const { g3d, i } = apuntado;
      const n = g3d.grafo.nodos[i];
      if (g3d.grafo.fuente === "carpetas") return `${g3d.grafo.nombre} · ${n.id}${n.fanOut ? ` · contains ${n.fanOut}` : ""}`;
      return `${g3d.grafo.nombre} · ${n.id} · imported by ${n.fanIn} · imports ${n.fanOut}` +
        (n.enCiclo ? " · IN A CYCLE" : "");
    }
    if (apuntado.tipo === "isla" && apuntado.base) {
      return `${apuntado.isla.grafo.nombre} — click: what it is · Enter: open in VS Code`;
    }
    if (apuntado.tipo === "isla") {
      return fondo
        ? `${apuntado.isla.grafo.nombre} — double-click: go`
        : `${apuntado.isla.grafo.nombre} — Enter: open in VS Code · Q/E: rotate · wheel: size`;
    }
    if (apuntado.tipo === "consola") return `${apuntado.consola.nombre}'s console — hold click: move it · wheel (while holding): closer/farther`;
    if (apuntado.tipo === "titular") return `${apuntado.enlace.etiqueta} — click: read it here`;
    if (apuntado.tipo === "palantir") return chispas?.activo ? "" : "The palantír — click: play Sparks (45 s)";
    if (apuntado.tipo === "maestra") return "Master console — click (or O): accounts, repos and agents";
    const p = apuntado.pantalla;
    const enter = p.hwnd === null ? "Enter: go to VS Code" : puente?.conectado ? "Enter: work in it" : "no bridge";
    return `${p.repo ?? "no repo"} · ${p.titulo} — ${enter} · hold click: move · wheel: size · G: graph · X: close`;
  }

  // --- acciones -----------------------------------------------------------------------------
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let temporizadorAviso;
  /** @param {string} texto */
  function avisar(texto) {
    ui.aviso.textContent = texto;
    ui.aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => (ui.aviso.hidden = true), 6000);
  }

  /** @type {{repo: string, cuando: number} | null} */
  let ultimoAbierto = null;

  /** @param {GrafoExportado} grafo */
  function abrirEnVSCode(grafo) {
    if (puente?.conectado) {
      // Con el puente, en una ventana NUEVA: vscode:// lo mandaba a la que ya hubiera abierta.
      puente.vscode(grafo.raiz).then((error) => { if (error) avisar(`Couldn't open VS Code: ${error}`); });
    } else {
      const enlace = document.createElement("a");
      enlace.href = "vscode://file/" + grafo.raiz.replace(/\\/g, "/");
      enlace.click();
    }
    ultimoAbierto = { repo: grafo.nombre, cuando: Date.now() };
    // Si ya está abierto, VS Code solo trae esa ventana al frente: es la forma de escribir en
    // una pantalla, porque el navegador no puede reenviarle teclado ni ratón (SCOPE, fase 2).
    const yaCapturado = pantallas.some((p) => p.repo === grafo.nombre);
    avisar(yaCapturado ? `Going to VS Code (${grafo.nombre})… Alt+Tab to come back.` : `Opening ${grafo.nombre} in VS Code…`);
    // VS Code se abre en el escritorio, encima del mundo: el aviso útil es al volver aquí.
    if (!yaCapturado) window.addEventListener("focus", () => avisar(
      `Press N and pick the VS Code window for ${grafo.nombre}: it stays here, behind the space on your desktop.`,
    ), { once: true });
  }

  /** @param {string} [recienAbierto] lo que se acaba de abrir desde el panel: su ventana aún puede tardar */
  async function nuevaPantalla(recienAbierto) {
    if (!puedeCapturar()) {
      avisar("This browser can't capture windows here. Open it with `npm run mundo`.");
      return;
    }
    mirar.unlock(); // el selector del sistema necesita el ratón
    if (recienAbierto) avisar(`Opening ${recienAbierto}: pick its window in the picker when it shows up (Window tab).`);
    let captura;
    try {
      // Lo minimizado no sale en el selector: el puente lo restaura (detrás del mundo) antes.
      if (puente?.conectado) {
        // Windows a veces deja de dar escritorio virtual a las ventanas nuevas y el selector no
        // las ofrece: mejor decirlo que dejar que falten sin más (docs/evidencia.md, 2026-09-25).
        const faltan = await puente.antesDeCapturar();
        if (faltan.length) avisar(`⚠ Windows didn't put ${faltan.length === 1 ? `"${faltan[0]}"` : `${faltan.length} windows`} on a virtual desktop, so the picker won't show ${faltan.length === 1 ? "it" : "them"}. Fix: restart Explorer (npm run parar -- --explorador)`);
      }
      captura = await capturarVentana();
      // Edge no da el título de la ventana, sino su HWND: el título se lo pide al puente.
      if (puente?.conectado && captura.hwnd !== null) captura.titulo = (await puente.titulo(captura.hwnd)) ?? captura.titulo;
    } catch (e) {
      // NotAllowedError es cerrar el selector; cualquier otro es un fallo y se enseña tal cual.
      const err = /** @type {Error} */ (e);
      avisar(err.name === "NotAllowedError" ? "Capture cancelled." : `Couldn't capture: ${err.name}: ${err.message}`);
      return;
    }
    colocarPantalla(captura);
  }

  /** @param {Parameters<typeof crearPantalla>[0]} captura */
  function colocarPantalla(captura) {
    const p = crearPantalla(captura);
    const dir = camara.getWorldDirection(new THREE.Vector3());
    p.objeto.position.copy(camara.position).addScaledVector(dir, 5);
    p.objeto.lookAt(camara.position);

    let repo = repoDeTitulo(captura.titulo, nombres);
    let porque = "from its title";
    if (!repo && ultimoAbierto && Date.now() - ultimoAbierto.cuando < RECIENTE_MS) {
      repo = ultimoAbierto.repo;
      porque = "it's what you opened last";
    }
    p.enganchar(repo ? grafoDe(repo) : null);
    escena.add(p.objeto);
    pantallas.push(p);
    p.alTerminar(() => quitar(p));
    avisar(repo
      ? `Screen with the ${repo} graph (${porque}). Wrong one? Aim at it and press G. Click to go back in.`
      : `No repo recognised in "${captura.titulo}": aim at the screen and press G. Click to go back in.`);
    return p;
  }

  // `?vista=demo&isla=<repo>`: la ficha de esa isla abierta (capturas sin manos).
  const islaDemo = opciones.vista === "demo" ? new URLSearchParams(location.search).get("isla") : null;
  if (islaDemo) setTimeout(() => { const i = islas.find((x) => x.grafo.nombre === islaDemo); if (i) fichaDeIsla(i); }, 500);
  if (opciones.vista === "demo") {
    // Una pantalla de VS Code "abierta" en galaxy-brain (o el primer repo), vista de lado
    // para que se vea el grafo detrás y encima.
    ui.portada.hidden = true;
    const repo = porNombre.has("galaxy-brain") ? "galaxy-brain" : nombres[0];
    // `&agentes`: sin pantalla, que taparía la isla con los agentes de mentira (abajo).
    if (!new URLSearchParams(location.search).has("agentes")) capturaDeDemostracion(`cli.py - ${repo} - Visual Studio Code`).then((c) => {
      // Relativo a donde se aparece (delante del palantír): en el centro está él.
      const z = camara.position.z;
      colocarPantalla(c);
      camara.position.set(3.2, 2.6, z + 2.2);
      camara.lookAt(0, 3.2, z - 5.5);
    });
  }

  /** @param {Pantalla} p */
  function quitar(p) {
    const i = pantallas.indexOf(p);
    if (i === -1) return;
    if (escribiendo === p) dejarDeEscribir();
    pantallas.splice(i, 1);
    if (agarrada?.pantalla === p) agarrada = null;
    if (encendido?.g3d === p.grafo3d) encendido = null;
    if (p.hwnd !== null) puente?.soltar(p.hwnd);
    p.cerrar();
  }

  // --- escribir dentro de una pantalla (fase 2, ADR 0002) -----------------------------------
  // Con el puente, Enter sobre una pantalla aparca la ventana real fuera de la vista y le da
  // el teclado de verdad; el ratón sobre la pantalla se traduce a su imagen y se le envía. El
  // teclado ya no es del mundo: se vuelve con clic fuera de la pantalla o el atajo del puente.
  // En el fondo (detrás de los iconos) no hay teclado que dar: ni se intenta.
  // Título único: por él encuentra el puente la ventana del mundo (no hay otra forma de que una
  // página sepa su HWND). Nadie lo ve: el mundo va a pantalla completa.
  if (!fondo) document.title = `infinite-desk · ${Math.random().toString(36).slice(2, 10)}`;
  // La demo tampoco: es para comprobar sin manos, y el puente de verdad le pisaría los agentes
  // de mentira (y le presentaría otra "ventana del mundo").
  const puente = fondo || opciones.vista === "demo" ? null : crearPuente(document.title);
  puente?.alSalir(() => dejarDeEscribir(false));
  puente?.alConectar(() => { for (const p of pantallas) if (p.hwnd !== null) puente.titulo(p.hwnd); });

  // F: el panel del escritorio. Lo que se abre desde él sale en el selector de ventanas justo
  // después (el clic en el panel es el gesto que el navegador exige para capturar).
  const panel = ui.ficheros && !fondo
    // Lo abierto no se captura en el acto: la ventana aún no existe. El puente avisa cuando está
    // lista y se trae con N (uso real: "el pipeline es: creo la instancia con F y después la invoco con N").
    ? crearPanelFicheros(ui.ficheros, () => puente, (nombre) => avisar(`Opening ${nombre}…`), avisar, () => {
      if (!mirar.isLocked && !escribiendo) ui.portada.hidden = false;
    })
    : null;
  // P: los ajustes (la carpeta de proyectos, cuyos repos son las islas).
  const ajustes = ui.ajustes && !fondo
    ? crearPanelAjustes(ui.ajustes, () => puente, avisar, () => {
      if (!mirar.isLocked && !escribiendo) ui.portada.hidden = false;
    })
    : null;
  // El lector del palantír: el post o la noticia entera, dentro del mundo.
  const lector = ui.lector && !fondo
    ? crearLector(ui.lector, (enlace) => abrirEnlace(enlace), () => {
      if (!mirar.isLocked && !escribiendo) ui.portada.hidden = false;
    })
    : null;
  // La consola maestra: su holograma encima del palantír y, al hacer clic (u O), la consola entera.
  // Solo dentro del mundo: el fondo no tiene puente, y sin él no hay nada que gestionar.
  const demoMaestra = opciones.vista === "demo" && new URLSearchParams(location.search).has("maestra");
  // Bien por encima del anillo de arriba: más bajo, desde donde se aparece caía detrás de la
  // tarjeta de repo de delante (medido en captura).
  const holograma = !fondo ? crearHolograma(palantir.cima + 6.1) : null;
  if (holograma) escena.add(holograma.objeto);
  const maestra = ui.maestra && holograma
    ? crearMaestra(ui.maestra,
      (args) => (demoMaestra ? Promise.resolve(args[0] === "estado" ? { ok: true, datos: estadoDeDemostracion(nombres) } : { ok: false, error: "demo" })
        : puente ? puente.orquestador(args) : Promise.resolve({ ok: false, error: "no bridge" })),
      (e) => { holograma.actualizar(e); aplicarFallos(e.fallos ?? []); actividad = e.actividad ?? []; },
      () => { if (!mirar.isLocked && !escribiendo) ui.portada.hidden = false; },
      () => void regenerar())
    : null;
  // --- fallos (gb list, por la consola maestra cada minuto): en rojo en su isla ------------------
  /** @type {import("./fallos.js").Fallo[]} */
  let fallos = [];
  /** @type {import("./actividad.js").Evento[]} el registro de actividad (el más reciente primero) */
  let actividad = [];
  /** @type {Map<string, THREE.Sprite>} el aviso "⚠ N" sobre la base de cada isla con fallos */
  const avisosDeFallos = new Map();
  /** Los de un repo que aún pesan (de la última semana). @param {string} repo */
  const fallosDe = (repo) => fallos.filter((f) => f.repo === repo && fuerzaDeFallo(f, Date.now()) > 0);
  /** @param {import("./fallos.js").Fallo[]} nuevos */
  function aplicarFallos(nuevos) {
    fallos = nuevos;
    const ahora = Date.now();
    for (const g3d of vivos()) {
      const ids = g3d.grafo.nodos.map((n) => n.id);
      /** @type {Map<number, number>} */
      const fuerza = new Map();
      for (const f of fallos) {
        if (f.repo !== g3d.grafo.nombre || !f.fichero) continue;
        const i = nodoDeFichero(f.fichero, ids);
        const k = fuerzaDeFallo(f, ahora);
        if (i >= 0 && k > 0) fuerza.set(i, Math.max(fuerza.get(i) ?? 0, k));
      }
      g3d.marcarFallos([...fuerza].map(([i, k]) => ({ i, fuerza: k })));
    }
    for (const isla of islas) {
      const n = fallosDe(isla.grafo.nombre).length;
      const viejo = avisosDeFallos.get(isla.grafo.nombre);
      if (viejo) {
        isla.base.remove(viejo);
        viejo.material.map?.dispose();
        viejo.material.dispose();
        avisosDeFallos.delete(isla.grafo.nombre);
      }
      if (!n) continue;
      const aviso = rotulo([`⚠ ${n} error${n === 1 ? "" : "s"}`], { alto: 0.9, color: "#ff5566" });
      aviso.position.set(0, 1.6, 0);
      isla.base.add(aviso);
      avisosDeFallos.set(isla.grafo.nombre, aviso);
    }
  }

  function abrirMaestra() {
    if (!maestra) return;
    maestra.abrir();
    mirar.unlock();
  }
  if (maestra) {
    if (puente) {
      holograma?.actualizar(null, "Waiting for the bridge…");
      puente.alConectar(() => void maestra.refrescar());
      if (puente.conectado) void maestra.refrescar(); // ya conectado antes de llegar aquí: alConectar no volverá a saltar
      setInterval(() => { if (puente.conectado) void maestra.refrescar(); }, 60000);
    } else if (demoMaestra) {
      // `&maestra=errores`: la demo con la pestaña Errors abierta.
      void maestra.refrescar().then(() => { maestra.abrir(new URLSearchParams(location.search).get("maestra") || undefined); });
    } else holograma?.actualizar(null, "No bridge: come in from the desktop right-click menu");
  }
  document.addEventListener("keydown", (e) => {
    if (maestra?.abierto && !mirar.isLocked && e.code === "Escape") maestra.cerrar();
    if (lector?.abierto && !mirar.isLocked && e.code === "Escape") lector.cerrar();
    // Con el ratón aún bloqueado es la misma F (o P) que acaba de abrirlo: no se cierra.
    if (panel?.abierto && !mirar.isLocked && (e.code === "Escape" || e.code === "KeyF")) panel.cerrar();
    if (ajustes?.abierto && !mirar.isLocked && (e.code === "Escape" || e.code === "KeyP")) ajustes.cerrar();
  });
  /** @type {Pantalla | null} */
  let escribiendo = null;
  const rayoRaton = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** @param {Pantalla} p */
  async function escribirEn(p) {
    if (!puente?.conectado || p.hwnd === null) return;
    escribiendo = p;
    document.body.dataset.escribiendo = "";
    mirar.unlock();
    const error = await puente.entrar(p.hwnd);
    if (error) {
      dejarDeEscribir(false);
      avisar(`Couldn't work in that screen: ${error}`);
      return;
    }
    const atajo = puente.atajo ? ` or ${puente.atajo}` : "";
    avisar(`Working in ${p.repo ?? p.titulo}. Click outside the screen${atajo} to come back.`);
  }

  function dejarDeEscribir(avisarAlPuente = true) {
    if (!escribiendo) return;
    escribiendo = null;
    delete document.body.dataset.escribiendo;
    if (avisarAlPuente) puente?.salir();
    ui.portada.hidden = false; // clic para volver a moverse
  }

  /** Dónde cae el ratón sobre la imagen de la pantalla, 0..1 desde arriba a la izquierda. @param {MouseEvent} e */
  function uvBajo(e) {
    if (!escribiendo) return null;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    rayoRaton.setFromCamera(ndc, camara);
    const h = rayoRaton.intersectObject(escribiendo.lienzo, false)[0];
    return h?.uv ? { u: h.uv.x, v: 1 - h.uv.y } : null;
  }

  /**
   * @param {MouseEvent} e
   * @param {"mover" | "bajar" | "doble" | "subir" | "rueda"} tipo
   * @param {number} [delta]
   */
  function reenviar(e, tipo, delta) {
    const uv = uvBajo(e);
    if (uv && puente && escribiendo?.hwnd != null) puente.raton(escribiendo.hwnd, tipo, uv.u, uv.v, e, delta);
    return uv;
  }

  const superficie = renderer.domElement;
  superficie.addEventListener("mousemove", (e) => reenviar(e, "mover"));
  superficie.addEventListener("mousedown", (e) => {
    if (!escribiendo) return;
    // Fuera de la pantalla: se vuelve al mundo.
    if (!reenviar(e, e.detail === 2 ? "doble" : "bajar")) dejarDeEscribir();
  });
  superficie.addEventListener("mouseup", (e) => reenviar(e, "subir"));
  superficie.addEventListener("wheel", (e) => reenviar(e, "rueda", -Math.sign(e.deltaY) * 120));
  superficie.addEventListener("contextmenu", (e) => { if (escribiendo) e.preventDefault(); });

  // --- regenerar los grafos sin salir (R, o solos) --------------------------------------------
  // El puente corre `npm run grafo` (con R, al entrar y cuando aparece un repo en dev/) y avisa;
  // el fondo, que no tiene puente, relee grafos.js cada tanto. Las islas se rehacen en el sitio:
  // las pantallas capturadas no sobrevivirían a recargar la página.
  async function releerGrafos() {
    const antes = [...nombres];
    await releerScript("grafos.js");
    const nuevos = window.GB_GRAFOS;
    if (!nuevos?.length || firmaGrafos(nuevos) === firma) return false;
    apuntado = null;
    encendido = null;
    ponerIslas(nuevos);
    // Cada pantalla vuelve a enganchar su repo con los datos nuevos (o se queda sin él si ya no hay isla).
    for (const p of pantallas) if (p.repo) p.enganchar(grafoDe(p.repo));
    aplicarAgentes();
    aplicarFallos(fallos); // las islas son nuevas: sin esto, sin rojo hasta el siguiente estado
    const recien = islasNuevas(antes, nombres);
    // Sin galaxy-brain son árboles de carpetas: se dice cómo tener los grafos de dependencias.
    const sinGb = nuevos.every((g) => g.fuente === "carpetas") ? " · folder trees (no galaxy-brain: O → Accounts to install it)" : "";
    avisar(recien.length
      ? `New island${recien.length === 1 ? "" : "s"}: ${recien.join(", ")}${sinGb}`
      : `Islands up to date: ${nombres.length} repos${sinGb}`);
    return true;
  }
  let esperandoR = false;
  puente?.alGrafos(async (r) => {
    if (!r.ok) {
      avisar(`Couldn't regenerate the graphs: ${r.resumen}`);
    } else if (!(await releerGrafos()) && esperandoR) {
      avisar("Graphs regenerated: nothing new");
    }
    esperandoR = false;
  });
  if (fondo) setInterval(releerGrafos, RELEER_FONDO_MS);
  if (fondo) setInterval(() => releerScript("fondo-estado.js"), 1000);

  async function regenerar() {
    if (!puente?.conectado) {
      avisar("No bridge, so no regenerating: run `npm run grafo` and come back in.");
      return;
    }
    esperandoR = true;
    const empezado = await puente.regenerar();
    avisar(empezado ? "Regenerating graphs… (about a minute; keep going)" : "Already regenerating: it'll run again when done.");
  }

  // --- agentes de gb sobre los nodos --------------------------------------------------------
  // Como el mapa de gb (viz.py): el puente pregunta `gb who --json` cuando cambia algo en un repo
  // (y cada 5 s mientras haya agentes). Los módulos que toca cada agente llevan un halo de su
  // color que late (anillo quieto si solo lo commiteó; blanco si hay cruce), por cada arista
  // con un extremo tocado viaja una señal hacia el otro, y encima de su primer módulo flota su
  // terminal con lo que dice su consola. Todo se apaga como en gb: entero 3 min, nada a los 10.
  // Solo en la vista gb: en el árbol de carpetas los nodos no son módulos.
  /** @type {Map<string, {estado: import("./puente.js").EstadoAgentes, recibido: number}>} */
  const agentesDe = new Map();
  /** @type {WeakMap<Grafo3D, Map<string, import("./consola3d.js").Consola>>} */
  const consolasDe = new WeakMap();
  /** @type {Set<import("./consola3d.js").Consola>} las que hay que animar en cada fotograma */
  const consolas = new Set();

  /** @param {Grafo3D} g3d */
  function encenderGrafo(g3d) {
    const propias = consolasDe.get(g3d) ?? new Map();
    consolasDe.set(g3d, propias);
    const dato = agentesDe.get(g3d.grafo.nombre);
    const agentes = g3d.grafo.fuente === "gb" ? dato?.estado.agentes ?? [] : [];
    const ahora = performance.now();
    const nombres = agentes.map((a) => a.nombre);
    // Lo que dice gb es de cuando se preguntó: la edad sigue corriendo aunque no llegue nada.
    const vigor = new Map(agentes.map((a) => [a.nombre, vigorOnda(a.hace_seg == null ? null : a.hace_seg + (ahora - (dato?.recibido ?? ahora)) / 1000)]));
    const enc = encendidosPorAgentes(g3d.grafo.nodos.map((n) => n.id), agentes);
    const colorDe = (/** @type {{agentes: string[], cruce?: boolean}} */ e) =>
      new THREE.Color(e.agentes.length > 1 ? "#ffffff" : colorDeAgente(e.agentes[0], nombres));
    const vigorDe = (/** @type {{agentes: string[]}} */ e) => Math.max(...e.agentes.map((n) => vigor.get(n) ?? 0));
    g3d.iluminar([...enc].map(([i, e]) => ({ i, color: colorDe(e), pulso: !e.commit, vigor: vigorDe(e) })));
    g3d.senalar(senalesDeAgentes(g3d.grafo.aristas, enc).map((s) => ({ ...s, color: colorDe(s), vigor: vigorDe(s) })));

    // Una terminal por agente con algo encendido; las de agentes que se fueron, fuera.
    for (const [nombre, c] of propias) {
      if (nombres.includes(nombre) && (vigor.get(nombre) ?? 0) > 0) continue;
      c.cerrar();
      consolas.delete(c);
      propias.delete(nombre);
    }
    let piso = 0;
    for (const a of agentes) {
      if ((vigor.get(a.nombre) ?? 0) <= 0) continue;
      const i = [...enc].find(([, e]) => e.agentes.includes(a.nombre))?.[0];
      if (i === undefined) continue;
      let c = propias.get(a.nombre);
      if (!c) {
        c = crearConsola(a.nombre, colorDeAgente(a.nombre, nombres));
        propias.set(a.nombre, c);
        consolas.add(c);
        g3d.objeto.add(c.objeto);
      }
      c.actualizar(a, dato?.recibido ?? ahora);
      // Por encima del grafo y del rótulo de la isla (que llega a ~1,7 radios sobre su centro).
      c.colocar(g3d.posicion(i), g3d.radio * 1.3, g3d.radio * 1.8, piso++);
    }
  }
  function aplicarAgentes() {
    for (const g3d of vivos()) encenderGrafo(g3d);
    // El faro: sobre la isla, del color del agente más fresco, con su vigor (se apaga como en gb).
    const ahora = performance.now();
    for (const { grafo, faro } of islas) {
      const dato = agentesDe.get(grafo.nombre);
      const agentes = dato ? trabajando(dato.estado) : [];
      const nombresAg = agentes.map((a) => a.nombre);
      const recibido = dato?.recibido ?? ahora;
      let fuerza = 0;
      let color = "#ffffff";
      for (const a of agentes) {
        const v = vigorOnda(a.hace_seg == null ? null : a.hace_seg + (ahora - recibido) / 1000);
        if (v > fuerza) { fuerza = v; color = colorDeAgente(a.nombre, nombresAg); }
      }
      faro.encender(fuerza, color);
    }
  }
  // Trabajando = toca algo y no se ha apagado (uso real: el repo principal sin cambios desde
  // hace un mes salía anunciado como "working").
  const trabajando = (/** @type {import("./puente.js").EstadoAgentes} */ m) => m.agentes.filter((a) =>
    ((a.nodos ?? []).length || (a.commitados ?? []).length) && vigorOnda(a.hace_seg) > 0);
  // Lo abierto con F (o Enter en una isla) ya tiene ventana, restaurada y detrás del mundo.
  puente?.alLista((titulo) => avisar(`${titulo} is ready: press N to bring it in`));
  puente?.alAgentes((m) => {
    const antes = agentesDe.get(m.repo);
    agentesDe.set(m.repo, { estado: m, recibido: performance.now() });
    aplicarAgentes();
    const ahora = trabajando(m);
    if (ahora.length && !(antes && trabajando(antes.estado).length)) avisar(`🤖 ${ahora.map((a) => a.nombre).join(", ")} working on ${m.repo}`);
  });
  // Sin noticias también se apagan: la edad corre sola (gb: vigorOnda con haceAhora).
  setInterval(aplicarAgentes, 5000);
  if (opciones.vista === "demo") {
    // Dos agentes de mentira en el repo de la demo, para ver halos, señales, cruce y consolas sin
    // agentes de verdad (capturas sin manos). El primero además commiteó otro módulo hace poco.
    const g = porNombre.get("galaxy-brain") ?? porNombre.get(nombres[0]);
    const ids = g?.nodos.map((n) => n.id) ?? [];
    if (g && ids.length > 8) {
      agentesDe.set(g.nombre, {
        recibido: performance.now(),
        estado: {
          repo: g.nombre, cruces: [ids[1]], agentes: [
            { nombre: "agente-1", nodos: [ids[0], ids[1]], commitados: [ids[8]], hace_seg: 4, consola: [
              "[14:02:11] $ agente T3", "[14:02:15] Voy a leer el modulo carrito", `[14:02:16] > Read src/${ids[0]}.py`,
              "[14:02:40] > Bash pytest -q tests/", "[14:03:02] = Hecho: total() acepta descuento"] },
            { nombre: "agente-2", nodos: [ids[1], ids[5]], hace_seg: 30, cambios: [`${ids[5]}.f: (a, b) -> (a, b, extra)`] },
          ],
        },
      });
      aplicarAgentes();
      // `?vista=demo&agentes`: la cámara delante de esa isla, para ver a los agentes de cerca.
      const isla = islas.find((x) => x.grafo.nombre === g.nombre);
      if (isla && new URLSearchParams(location.search).has("agentes")) {
        const centro = isla.g3d.objeto.getWorldPosition(new THREE.Vector3());
        const hacia = centro.clone().setY(0).normalize();
        camara.position.copy(centro).addScaledVector(hacia, -isla.g3d.radio * 2.4).setY(centro.y + isla.g3d.radio * 1.1);
        camara.lookAt(centro.clone().setY(centro.y + isla.g3d.radio * 0.9));
      }
    }
  }

  // --- ficha de un nodo (clic) ------------------------------------------------------------
  /** @param {Grafo3D} g3d @param {number} i */
  function fichaDe(g3d, i) {
    if (!ui.nodo) return;
    const id = g3d.grafo.nodos[i]?.id;
    const suyos = fallosDe(g3d.grafo.nombre).filter((f) => f.fichero && g3d.grafo.nodos[nodoDeFichero(f.fichero, g3d.grafo.nodos.map((n) => n.id))]?.id === id);
    mostrarNodo(ui.nodo, g3d.grafo, i, agentesDe.get(g3d.grafo.nombre)?.estado.agentes ?? [], suyos);
    encendido?.g3d.resaltar(null);
    g3d.resaltar(i);
    encendido = { g3d, i };
  }
  /** @param {typeof islas[number]} isla */
  function fichaDeIsla(isla) {
    if (!ui.nodo) return;
    encendido?.g3d.resaltar(null);
    encendido = null;
    mostrarIsla(ui.nodo, isla.grafo, agentesDe.get(isla.grafo.nombre)?.estado.agentes ?? [], fallosDe(isla.grafo.nombre),
      actividad.filter((e) => e.repo === isla.grafo.nombre));
  }
  function cerrarFicha() {
    if (ui.nodo) ui.nodo.hidden = true;
  }
  if (fondo) {
    // En el fondo, un clic (sin arrastrar: arrastrar es girar) sobre un nodo abre su ficha.
    let desde = { x: 0, y: 0 };
    renderer.domElement.addEventListener("pointerdown", (e) => (desde = { x: e.clientX, y: e.clientY }));
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - desde.x, e.clientY - desde.y) > 5 || e.button !== 0) return;
      clicSuelto();
    });
  }
  /** Un clic (sin arrastrar) en el fondo: la ficha del nodo apuntado, o se cierra. */
  function clicSuelto() {
    if (apuntado?.tipo === "nodo") fichaDe(apuntado.g3d, apuntado.i);
    else if (apuntado?.tipo === "isla" && apuntado.base) fichaDeIsla(apuntado.isla);
    else if (apuntado?.tipo === "titular") abrirEnlace(apuntado.enlace);
    else cerrarFicha();
  }

  /**
   * Clic en una tarjeta: se lee aquí mismo (el lector), con el ratón suelto para hacer scroll. Sin
   * lector (el fondo), al navegador.
   * @param {import("./palantir.js").Enlace} enlace
   */
  function leer(enlace) {
    if (!lector) return void abrirEnlace(enlace);
    lector.abrir(enlace);
    mirar.unlock();
  }

  /**
   * Una tarjeta del palantír (titular o repo), en una ventana NUEVA del navegador (por el puente:
   * desde la página se abriría dentro del perfil del mundo). Cuando la ventana está, el puente
   * avisa ("… is ready: press N") y se trae como cualquier otra.
   * @param {import("./palantir.js").Enlace} enlace
   */
  async function abrirEnlace(enlace) {
    if (!puente?.conectado) {
      avisar(fondo ? "Open it from the space: right-click the desktop → Enter infinite-desk" : "No bridge, so it can't open the browser.");
      return;
    }
    const error = await puente.abrirUrl(enlace.url);
    avisar(error ? `Couldn't open it: ${error}` : `Opening ${enlace.etiqueta} in the browser…`);
  }

  /** @param {string} codigo */
  function accion(codigo) {
    if (codigo === "KeyN") nuevaPantalla();
    else if (codigo === "KeyO" && maestra) abrirMaestra();
    else if (codigo === "KeyF" && panel) {
      panel.abrir();
      mirar.unlock();
    }
    else if (codigo === "KeyP" && ajustes) {
      ajustes.abrir();
      mirar.unlock();
    }
    else if (codigo === "KeyR") regenerar();
    else if (codigo === "KeyT") {
      verCarpetas = !verCarpetas;
      apuntado = null;
      encendido = null;
      cerrarFicha();
      ponerIslas(actuales);
      for (const p of pantallas) if (p.repo) p.enganchar(grafoDe(p.repo));
      aplicarAgentes();
      aplicarFallos(fallos);
      avisar(verCarpetas ? "View: folder tree (T for galaxy-brain again)" : "View: galaxy-brain (dependencies)");
    }
    else if (codigo === "KeyH") ui.ayuda.hidden = !ui.ayuda.hidden;
    else if (codigo === "Enter" && apuntado?.tipo === "pantalla" && apuntado.pantalla.hwnd !== null) {
      // Una ventana real: se escribe EN ella, nunca se abre otra (primer uso real: Enter abría un
      // VS Code nuevo porque la página no tenía puente).
      if (puente?.conectado) escribirEn(apuntado.pantalla);
      else avisar("No bridge, so you can't work in the screen. Leave (Esc twice) and come back in from the desktop right-click menu.");
    } else if (codigo === "Enter") {
      const g = repoApuntado();
      if (g) abrirEnVSCode(g);
      else avisar("Look at an island (or its graph) to open that repo.");
    } else if (apuntado?.tipo === "pantalla") {
      const p = apuntado.pantalla;
      if (codigo === "KeyX") quitar(p);
      if (codigo === "KeyV") avisar(p.alternarGrafo() ? "Graph on top of the window" : "Graph hidden (V to show it)");
      if (codigo === "KeyG") {
        if (encendido?.g3d === p.grafo3d) encendido = null;
        const repo = siguienteRepo(p.repo, nombres);
        p.enganchar(repo ? grafoDe(repo) : null);
        avisar(repo ? `${repo} graph` : "Screen with no graph");
      }
    }
  }

  /** @type {{pantalla: Pantalla, distancia: number} | null} */
  let agarrada = null;
  /** @type {{consola: import("./consola3d.js").Consola, distancia: number} | null} la terminal que se está moviendo */
  let arrastrada = null;
  document.addEventListener("mousedown", (e) => {
    if (!mirar.isLocked || e.button !== 0) return;
    // En plena ronda de Chispas, cada clic es un disparo y nada más; y justo después, nada (un
    // clic de inercia cogía una pantalla).
    if (chispas?.activo) {
      rayo.setFromCamera(puntero, camara);
      chispas.disparar(rayo.ray);
      return;
    }
    if (chispas?.enGracia) return;
    if (apuntado?.tipo === "palantir") return chispas?.empezar();
    if (apuntado?.tipo === "maestra") return abrirMaestra();
    // Clic con la mira en un nodo: su ficha. En el vacío: se cierra.
    if (apuntado?.tipo === "nodo") return fichaDe(apuntado.g3d, apuntado.i);
    if (apuntado?.tipo === "isla" && apuntado.base) return fichaDeIsla(apuntado.isla);
    if (apuntado?.tipo === "titular") return void leer(apuntado.enlace);
    if (apuntado?.tipo === "consola") {
      const d = apuntado.consola.cartel.getWorldPosition(new THREE.Vector3()).distanceTo(camara.position);
      arrastrada = { consola: apuntado.consola, distancia: d };
      return;
    }
    if (apuntado?.tipo !== "pantalla") return cerrarFicha();
    const d = apuntado.pantalla.objeto.position.distanceTo(camara.position);
    agarrada = { pantalla: apuntado.pantalla, distancia: d };
  });
  document.addEventListener("mouseup", () => {
    agarrada = null;
    arrastrada = null;
  });
  document.addEventListener("wheel", (e) => {
    if (!mirar.isLocked) return; // en el fondo la rueda es de la órbita
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    if (arrastrada) {
      arrastrada.distancia = THREE.MathUtils.clamp(arrastrada.distancia * f, 1.5, 80);
    } else if (agarrada) {
      // Con una pantalla en la mano, la rueda la acerca o la aleja.
      agarrada.distancia = THREE.MathUtils.clamp(agarrada.distancia * f, 1.5, 60);
    } else if (apuntado?.tipo === "pantalla") {
      const s = THREE.MathUtils.clamp(apuntado.pantalla.objeto.scale.x * f, 0.3, 8);
      apuntado.pantalla.objeto.scale.setScalar(s);
    } else {
      const g = grafoApuntado();
      if (g) g.objeto.scale.setScalar(THREE.MathUtils.clamp(g.objeto.scale.x * f, 0.3, 4));
    }
  });

  window.addEventListener("resize", () => {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- bucle --------------------------------------------------------------------------------
  const reloj = new THREE.Clock();
  const dir = new THREE.Vector3();
  let fotograma = 0;
  let ultimoPintado = 0;
  renderer.setAnimationLoop((instante) => {
    // Como mucho 60 fotogramas por segundo: las capturas no dan más, y en un monitor de más Hz se
    // pintaba de sobra.
    // El fondo, en reposo, a 30: gira despacio y es decoración (medido: ~50 % de CPU a 60 en un
    // monitor a la vista). Mientras se arrastra, se acerca o vuela a una isla, a 60.
    const enReposo = fondo && !vuelo && performance.now() - ultimoToque > 2000;
    if (instante - ultimoPintado < 1000 / (enReposo ? 31 : 61)) return;
    ultimoPintado = instante;
    const dt = Math.min(reloj.getDelta(), 0.1);
    if (document.hidden) return;
    // El fondo, con algo a pantalla completa o maximizado delante, no se ve: no se pinta.
    // Pero nunca antes de haber pintado: si arranca ya tapado, se quedaba en blanco (uso real).
    if (fondo && fotograma > 30 && window.INFINITE_DESK_FONDO?.tapado?.[monitor]) return;

    if (mirar.isLocked) {
      const correr = teclas.has("ShiftLeft") || teclas.has("ShiftRight") ? 3 : 1;
      const v = VELOCIDAD * correr * dt;
      if (teclas.has("KeyW")) mirar.moveForward(v);
      if (teclas.has("KeyS")) mirar.moveForward(-v);
      if (teclas.has("KeyD")) mirar.moveRight(v);
      if (teclas.has("KeyA")) mirar.moveRight(-v);
      if (teclas.has("Space")) camara.position.y += v;
      if (teclas.has("KeyC")) camara.position.y = Math.max(0.6, camara.position.y - v);
    }

    if (orbita) {
      if (vuelo) {
        const k = 1 - Math.exp(-dt * 2.5);
        orbita.target.lerp(vuelo.objetivo, k);
        camara.position.lerp(vuelo.posicion, k);
        if (camara.position.distanceTo(vuelo.posicion) < 0.2) {
          if (vuelo.aerea) orbita.autoRotate = true;
          vuelo = null;
        }
      } else if (!orbita.autoRotate && performance.now() - ultimoToque > REPOSO_MS) {
        // Quieto un rato: si estabas cerca de una isla, de vuelta a la vista aérea; si no, gira.
        if (volverAerea && orbita.getDistance() < 60) volverAerea();
        else orbita.autoRotate = true;
      }
      orbita.update(dt);
    }

    for (const { g3d } of islas) g3d.objeto.rotation.y += dt * 0.08;
    const t = reloj.elapsedTime;
    cielo.tick(t, camara);
    palantir.tick(t, dt);
    chispas?.tick(dt);
    holograma?.tick(t, camara);
    for (const { cristales, faro } of islas) { cristales.tick(t); faro.tick(t); }
    for (const g3d of vivos()) g3d.latir(t);
    const ahora = performance.now();
    for (const c of consolas) c.tick(ahora);
    const giro = (teclas.has("KeyE") ? 1 : 0) - (teclas.has("KeyQ") ? 1 : 0);
    if (giro) {
      const g = grafoApuntado();
      if (g) g.objeto.rotation.y += giro * dt * 1.6;
    }

    if (agarrada) {
      camara.getWorldDirection(dir);
      agarrada.pantalla.objeto.position.copy(camara.position).addScaledVector(dir, agarrada.distancia);
      agarrada.pantalla.objeto.lookAt(camara.position);
    }

    if (arrastrada) {
      // La terminal sigue a la mira; se guarda en coordenadas de su grafo, así gira con la isla.
      camara.getWorldDirection(dir);
      const donde = camara.position.clone().addScaledVector(dir, arrastrada.distancia);
      const grafo = arrastrada.consola.objeto.parent;
      if (grafo) arrastrada.consola.mover(grafo.worldToLocal(donde));
    }

    // Apuntar cuesta rayos contra cientos de esferas: uno de cada dos fotogramas sobra.
    if (fotograma++ % 2 === 0) {
      apuntado = agarrada ? { tipo: "pantalla", pantalla: agarrada.pantalla }
        : arrastrada ? { tipo: "consola", consola: arrastrada.consola }
        : hayPuntero ? apuntar() : null;
      const nuevo = apuntado?.tipo === "nodo" ? apuntado : null;
      if (nuevo?.g3d !== encendido?.g3d || nuevo?.i !== encendido?.i) {
        encendido?.g3d.resaltar(null);
        nuevo?.g3d.resaltar(nuevo.i);
        encendido = nuevo ? { g3d: nuevo.g3d, i: nuevo.i } : null;
      }
      palantir.resaltar(apuntado?.tipo === "titular" ? apuntado.tarjeta : null);
      ui.info.textContent = describir();
      ui.info.hidden = !apuntado || !ui.info.textContent;
    }

    renderer.render(escena, camara);
  });
}

/**
 * Un estado de mentira para `?vista=demo&maestra`: las islas como repos, con cambios y agentes
 * inventados (capturas sin manos, sin puente).
 * @param {string[]} repos
 * @returns {import("./maestra.js").EstadoMaestra}
 */
function estadoDeDemostracion(repos) {
  const ahora = Date.now();
  return {
    carpeta: "C:/dev",
    cuentas: {
      claude: { instalado: true, sesion: true, cuenta: "you@example.com", plan: "max" },
      codex: { instalado: true, sesion: false, detalle: "Not logged in" },
      gemini: { instalado: false, sesion: false, detalle: "not installed" },
      github: { instalado: true, sesion: true, cuenta: "you" },
    },
    repos: repos.map((nombre, i) => ({ nombre, rama: i % 7 === 3 ? "feature/x" : "main", cambios: i % 4 === 0 ? i + 1 : 0, delante: i % 5 === 1 ? 2 : 0, detras: i % 6 === 2 ? 1 : 0, sinRemoto: i % 9 === 8, ultimoCommit: Math.round(ahora / 1000 - i * 36000) })),
    agentes: [
      { id: "a", repo: repos[0] ?? "repo", proveedor: "claude", tarea: "Update the dependencies and make the tests pass", rama: "agente/20260926-1210-update-the-dependencies", worktree: "", inicio: new Date(ahora - 4 * 60000).toISOString(), estado: "trabajando" },
      { id: "b", repo: repos[1] ?? "repo", proveedor: "claude", tarea: "Add a README section about the architecture", rama: "agente/20260926-1150-add-a-readme-section", worktree: "", inicio: new Date(ahora - 30 * 60000).toISOString(), fin: new Date(ahora - 22 * 60000).toISOString(), estado: "hecho", cambios: 2, commit: true },
    ],
    uso: { claude: { trabajando: 1, hoy: 2, minutosHoy: 12 }, codex: { trabajando: 0, hoy: 0, minutosHoy: 0 }, gemini: { trabajando: 0, hoy: 0, minutosHoy: 0 } },
    galaxyBrain: { instalado: false, python: "3.11", avisoPython: "Python 3.11: repos using Python 3.12+ syntax may not parse", local: null },
    actividad: [
      { ts: new Date(ahora - 4 * 60000).toISOString(), tipo: "agente", repo: repos[0] ?? "repo", texto: "Claude Code: Update the dependencies and make the tests pass", ref: "a" },
      { ts: new Date(ahora - 22 * 60000).toISOString(), tipo: "agente-hecho", repo: repos[1] ?? "repo", texto: "Claude Code finished: 2 file(s) committed on agente/20260926-1150-add-a-readme-section", ref: "b" },
      { ts: new Date(ahora - 60 * 60000).toISOString(), tipo: "fallo", repo: repos.includes("galaxy-brain") ? "galaxy-brain" : repos[0] ?? "repo", texto: "NameError: name 're' is not defined (cli.py:2489)", ref: "d1" },
      { ts: new Date(ahora - 3 * 3600000).toISOString(), tipo: "commit", repo: repos[2] ?? "repo", texto: "Marcos: feat: something new" },
      { ts: new Date(ahora - 30 * 3600000).toISOString(), tipo: "pull", repo: repos[3] ?? "repo", texto: "Fast-forward 3 files changed" },
    ],
    fallos: [
      { id: "d1", repo: repos.includes("galaxy-brain") ? "galaxy-brain" : repos[0] ?? "repo", tipo: "NameError", mensaje: "name 're' is not defined", fichero: "src/galaxybrain/cli.py", linea: 2489, veces: 20, ultimo: new Date(ahora - 3600000).toISOString(), primero: new Date(ahora - 5 * 86400000).toISOString() },
      { id: "d2", repo: repos[0] ?? "repo", tipo: "OSError", mensaje: "[Errno 22] Invalid argument", fichero: null, linea: null, veces: 38, ultimo: new Date(ahora - 7200000).toISOString(), primero: new Date(ahora - 20 * 86400000).toISOString() },
    ],
  };
}
