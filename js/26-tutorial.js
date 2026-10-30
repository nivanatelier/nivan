// ==============================
// TUTORIAL DE USO
// ==============================
// Guía paso a paso ("1/9") que se puede saltear en cualquier momento.
// Cada paso puede resaltar un elemento (objetivo) y mostrar un globo con
// punta (como la pestaña "Tipo de cuerpo") apuntando hacia él. Si el paso
// no tiene objetivo, o no se ve en pantalla, el globo va en el centro.
//
// Paso: { pagina, objetivo, titulo, texto }
//   pagina:   pestaña de la barra de abajo que se abre antes del paso
//   objetivo: selector CSS del elemento a resaltar
//   panel:    true = abre el menú lateral (las tres rayitas) para mostrar un botón de adentro

const CLAVE_TUTORIAL_VISTO_NIVAN = "nivanTutorialVisto";
const NAV_TUTORIAL_NIVAN = ".navItem[data-pagina='";

const PASOS_TUTORIAL_NIVAN = [
    { pagina: "paginaHome", titulo: "👋 ¡Bienvenido a NIVAN!", texto: "Comprá, vendé, probá ropa en 3D y diseñá tus propios moldes, todo en un solo lugar. Te mostramos lo mejor en menos de un minuto." },
    { pagina: "paginaHome", objetivo: "#productos .producto", titulo: "🛍️ Comprás en 2 pasos · 1", texto: "Tocá la prenda que te guste, elegí talle y color y agregala al carrito. Con el corazón la guardás en favoritos para después." },
    { pagina: "paginaHome", objetivo: "#carritoBtn", titulo: "🛒 Comprás en 2 pasos · 2", texto: "Abrí tu carrito, sumá un cupón si tenés y pagá. Listo. Después seguís tu pedido en Mis compras." },
    { pagina: "paginaMedidas", objetivo: NAV_TUTORIAL_NIVAN + "paginaMedidas']", titulo: "🧍 Tu modelo 3D", texto: "Armá un modelo 3D con tu cuerpo y mirá cómo te quedaría la ropa antes de comprarla. ¿Vendés? Creá un modelo para que tus clientes previsualicen tus prendas." },
    { pagina: "paginaMedidas", objetivo: "#botonTipoCuerpoBarra", titulo: "📏 Tus medidas", texto: "Elegí tu tipo de cuerpo y cargá tus medidas. Por ahora son aproximadas: sirven como referencia de tu modelo, no como medidas exactas." },
    { pagina: "paginaHome", panel: true, objetivo: "#botonVerificacionLateralNivan", titulo: "✅ Estado de verificación", texto: "Acá confirmás que sos vos subiendo tu documento (DNI o cédula) y una selfie. Hace falta para comprar y publicar, y cuida a la comunidad de cuentas falsas. Ahí mismo ves si tu verificación está pendiente, aprobada o rechazada." },
    { pagina: "paginaHome", panel: true, objetivo: "#botonVenderLateralNivan", titulo: "💸 Vendé tu ropa", texto: "Desde el menú de arriba a la izquierda entrás a Panel de Vendedor: publicá con fotos, talles, colores y medidas, y gestioná todos tus pedidos." },
    { pagina: "paginaHome", panel: true, objetivo: "#botonHerramientasLateralNivan", titulo: "✂️ Herramientas avanzadas, gratis", texto: "En este botón del menú hacés los moldes de cualquier prenda que se te ocurra: trazalos, trabajalos en capas, deformalos y descargá el patrón en PDF a escala real para imprimir. Es gratis (beta) y también está en el Panel de Vendedor." },
    { pagina: "paginaPerfil", objetivo: "#buscadorPersonasNivan", titulo: "🔎 Feed de perfiles", texto: "Buscá tiendas y personas, y mirá lo que publican en el feed." },
    { pagina: "paginaPerfil", objetivo: "#botonMiPerfilNivan", titulo: "🎉 Tu perfil", texto: "Tu foto abre tu perfil: publicaciones, seguidores y mensajes. ¡Listo, a disfrutar NIVAN!" }
];


let pasoTutorialNivan = 0;
let tutorialActivoNivan = false;
let temporizadorTutorialNivan = null;

function tutorialVistoNivan() {
    try { return localStorage.getItem(CLAVE_TUTORIAL_VISTO_NIVAN) === "1"; } catch (e) { return false; }
}

function marcarTutorialVistoNivan() {
    try { localStorage.setItem(CLAVE_TUTORIAL_VISTO_NIVAN, "1"); } catch (e) {}
}

function crearElementosTutorialNivan() {
    let raiz = document.getElementById("tutorialNivan");
    if (raiz) return raiz;

    raiz = document.createElement("div");
    raiz.id = "tutorialNivan";
    raiz.className = "tutorialNivan";
    raiz.innerHTML = `
        <div class="capaTutorialNivan"></div>
        <div class="focoTutorialNivan" id="focoTutorialNivan"></div>
        <div class="globoTutorialNivan" id="globoTutorialNivan" role="dialog" aria-live="polite" aria-label="Tutorial">
            <div class="globoTutorialInteriorNivan">
                <div class="contadorTutorialNivan" id="contadorTutorialNivan"></div>
                <div class="progresoTutorialNivan"><span id="progresoTutorialNivan"></span></div>
                <h3 id="tituloTutorialNivan"></h3>
                <p id="textoTutorialNivan"></p>
                <div class="botonesTutorialNivan">
                    <button type="button" class="saltarTutorialNivan" id="saltarTutorialNivan" onclick="saltarTutorialNivan()">Saltar</button>
                    <button type="button" class="atrasTutorialNivan" id="atrasTutorialNivan" onclick="tutorialAtrasNivan()">Atrás</button>
                    <button type="button" class="siguienteTutorialNivan" id="siguienteTutorialNivan" onclick="tutorialSiguienteNivan()">Siguiente</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(raiz);
    return raiz;
}

function abrirTutorialNivan() {
    // Cerramos lo que pudiera estar abierto para que no tape la guía.
    document.querySelectorAll(".pantallaCompleta.abierta, .panelPerfilLateral.abierto, .overlayPerfilLateral.abierto, #carrito.abierto").forEach(function(el) {
        el.classList.remove("abierta", "abierto");
    });
    if (typeof cerrarProducto === "function") cerrarProducto();

    crearElementosTutorialNivan().classList.add("activo");
    tutorialActivoNivan = true;
    mostrarPasoTutorialNivan(0);
}

function cerrarTutorialNivan() {
    tutorialActivoNivan = false;
    clearTimeout(temporizadorTutorialNivan);
    const raiz = document.getElementById("tutorialNivan");
    if (raiz) raiz.classList.remove("activo");
    cerrarPanelLateralTutorialNivan();
    marcarTutorialVistoNivan();
}

function saltarTutorialNivan() {
    cerrarTutorialNivan();
    irAPaginaTutorialNivan("paginaHome");
}

function tutorialSiguienteNivan() {
    if (pasoTutorialNivan >= PASOS_TUTORIAL_NIVAN.length - 1) {
        saltarTutorialNivan();
        return;
    }
    mostrarPasoTutorialNivan(pasoTutorialNivan + 1);
}

function tutorialAtrasNivan() {
    if (pasoTutorialNivan > 0) mostrarPasoTutorialNivan(pasoTutorialNivan - 1);
}

// El menú lateral (tres rayitas) se abre solo en los pasos que lo piden.
function panelLateralAbiertoTutorialNivan() {
    const panel = document.getElementById("panelPerfilLateral");
    return !!panel && panel.classList.contains("abierto");
}

function cerrarPanelLateralTutorialNivan() {
    if (panelLateralAbiertoTutorialNivan() && typeof cerrarPerfilLateral === "function") cerrarPerfilLateral();
}

function irAPaginaTutorialNivan(idPagina) {
    const pagina = document.getElementById(idPagina);
    if (!pagina || pagina.classList.contains("activa")) return false;

    const boton = document.querySelector(NAV_TUTORIAL_NIVAN + idPagina + "']");
    if (typeof cambiarPagina === "function" && boton) cambiarPagina(idPagina, boton);
    return true;
}

function mostrarPasoTutorialNivan(indice) {
    pasoTutorialNivan = indice;
    const paso = PASOS_TUTORIAL_NIVAN[indice];
    const globo = document.getElementById("globoTutorialNivan");
    const foco = document.getElementById("focoTutorialNivan");

    // Mientras cambia la pantalla ocultamos el globo y oscurecemos todo,
    // así no queda flotando en el lugar del paso anterior.
    globo.style.visibility = "hidden";
    foco.classList.add("sinObjetivoTutorialNivan");
    foco.style.cssText = "";

    // Menú lateral: se abre en los pasos que lo piden y se cierra en el resto.
    let cambioPanel = false;
    if (paso.panel && !panelLateralAbiertoTutorialNivan()) {
        if (typeof abrirPerfilLateral === "function") { abrirPerfilLateral(); cambioPanel = true; }
    } else if (!paso.panel && panelLateralAbiertoTutorialNivan()) {
        cerrarPanelLateralTutorialNivan();
        cambioPanel = true;
    }

    const cambioPagina = paso.pagina ? irAPaginaTutorialNivan(paso.pagina) : false;

    document.getElementById("contadorTutorialNivan").textContent = (indice + 1) + "/" + PASOS_TUTORIAL_NIVAN.length;
    document.getElementById("progresoTutorialNivan").style.width = ((indice + 1) / PASOS_TUTORIAL_NIVAN.length * 100) + "%";
    document.getElementById("tituloTutorialNivan").textContent = paso.titulo;
    document.getElementById("textoTutorialNivan").textContent = paso.texto;

    const ultimo = indice === PASOS_TUTORIAL_NIVAN.length - 1;
    document.getElementById("siguienteTutorialNivan").textContent = ultimo ? "¡Listo!" : "Siguiente";
    document.getElementById("atrasTutorialNivan").hidden = indice === 0;
    document.getElementById("saltarTutorialNivan").hidden = ultimo;

    // Esperamos a que termine de deslizar el menú o de cambiar la pestaña antes de medir.
    clearTimeout(temporizadorTutorialNivan);
    temporizadorTutorialNivan = setTimeout(function() {
        const objetivo = paso.objetivo ? document.querySelector(paso.objetivo) : null;
        if (objetivo && objetivo.getBoundingClientRect().width > 0) {
            objetivo.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        }
        posicionarTutorialNivan();
    }, cambioPanel ? 450 : (cambioPagina ? 280 : 60));
}

function posicionarTutorialNivan() {
    if (!tutorialActivoNivan) return;

    const paso = PASOS_TUTORIAL_NIVAN[pasoTutorialNivan];
    const foco = document.getElementById("focoTutorialNivan");
    const globo = document.getElementById("globoTutorialNivan");
    const objetivo = paso.objetivo ? document.querySelector(paso.objetivo) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGEN = 12;
    const PUNTA = 14;
    const HOLGURA = 6;

    const ancho = Math.min(320, vw - MARGEN * 2);
    globo.style.width = ancho + "px";
    globo.classList.remove("puntaArriba", "puntaAbajo", "centrado");
    globo.style.visibility = "hidden";
    const alto = globo.offsetHeight;

    let rect = objetivo ? objetivo.getBoundingClientRect() : null;
    if (rect && (rect.width < 4 || rect.height < 4 || rect.bottom < 0 || rect.top > vh)) rect = null;

    function centrar() {
        foco.classList.add("sinObjetivoTutorialNivan");
        foco.style.cssText = "";
        globo.classList.add("centrado");
        globo.style.left = Math.round((vw - ancho) / 2) + "px";
        globo.style.top = Math.round(Math.max(MARGEN, (vh - alto) / 2)) + "px";
        globo.style.visibility = "visible";
    }

    if (!rect) { centrar(); return; }

    // Resaltado: el objetivo recortado a lo que se ve en pantalla.
    const top = Math.max(rect.top - HOLGURA, 0);
    const left = Math.max(rect.left - HOLGURA, 0);
    const bottom = Math.min(rect.bottom + HOLGURA, vh);
    const right = Math.min(rect.right + HOLGURA, vw);

    const espacioAbajo = vh - bottom - MARGEN;
    const espacioArriba = top - MARGEN;
    let abajo;

    if (alto <= espacioAbajo) abajo = true;
    else if (alto <= espacioArriba) abajo = false;
    else { centrar(); return; } // el objetivo ocupa casi toda la pantalla

    foco.classList.remove("sinObjetivoTutorialNivan");
    foco.style.top = top + "px";
    foco.style.left = left + "px";
    foco.style.width = (right - left) + "px";
    foco.style.height = (bottom - top) + "px";

    const centroX = (left + right) / 2;
    const izquierda = Math.min(Math.max(centroX - ancho / 2, MARGEN), vw - MARGEN - ancho);
    const puntaX = Math.min(Math.max(centroX - izquierda, PUNTA + 10), ancho - PUNTA - 10);

    globo.style.setProperty("--puntaX", puntaX + "px");
    globo.style.left = Math.round(izquierda) + "px";
    globo.style.top = Math.round(abajo ? bottom + 2 : top - alto - 2) + "px";
    globo.classList.add(abajo ? "puntaArriba" : "puntaAbajo");
    globo.style.visibility = "visible";
}

window.addEventListener("resize", posicionarTutorialNivan);
window.addEventListener("scroll", function() {
    if (tutorialActivoNivan) requestAnimationFrame(posicionarTutorialNivan);
}, true);
document.addEventListener("keydown", function(e) {
    if (tutorialActivoNivan && e.key === "Escape") saltarTutorialNivan();
});

// Buscador de Configuración.
if (typeof BUSCADOR_CONFIG_NIVAN !== "undefined") {
    BUSCADOR_CONFIG_NIVAN.push({
        texto: "Tutorial de uso",
        ruta: "Configuración",
        accion: function () { abrirTutorialNivan(); }
    });
}

// La primera vez que se abre la app (con el país ya elegido) se ofrece la guía.
window.addEventListener("load", function() {
    if (tutorialVistoNivan() || !paisNivan()) return;
    setTimeout(function() { if (!tutorialActivoNivan) abrirTutorialNivan(); }, 1200);
});
