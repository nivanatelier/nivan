// ==============================
// FEED DE LA PESTAÑA PERFILES
// Orden que se repite hacia abajo:
//   6 publicaciones (cuadrícula 3x2)
//   hasta 3 espacios de publicidad3D (anuncios pagos; no aparece si no hay)
//   publicidadComun: hasta 5 cuadros en una sola línea que se desliza (anuncios pagos; no aparece si no hay)
//   4 posts en grande
// Arriba salen los más ANTIGUOS y, a medida que se baja, van cargando los más nuevos.
// ==============================
const FEED_PERFIL_CONFIG = {
    publicacionesPorBloque: 6,
    espaciosPublicidad3D: 3,
    anunciosPublicidadComun: 5,
    postsPorBloque: 4,
    bloquesIniciales: 1                    // cuántos bloques se cargan al entrar; el resto va cargando al bajar
};

// "post" o "publicacion". Lo viejo (sin formato) se deduce: solo texto = post, foto/video = publicación.
function formatoPortafolioItemNivan(item) {
    if (item && (item.formato === "post" || item.formato === "publicacion")) return item.formato;
    return item && item.tipo === "texto" ? "post" : "publicacion";
}

// ---- publicidad3D ----
// Anuncios pagos (planes Vidriera 3D y Tienda destacada). Solo se dibuja si hay anunciantes.
function htmlPublicidad3DNivan(bloque) {
    const modelos = anunciosPremiumPorBloqueNivan("d3", bloque, FEED_PERFIL_CONFIG.espaciosPublicidad3D);
    if (!modelos.length) return "";

    const espacios = modelos.map(function(m) {
        return `<div class="espacioPublicidad3DNivan" data-anuncio="${escaparHTMLNivan(m.clave)}" onclick="${m.alClick}">
                <img src="${escaparHTMLNivan(m.imagen)}" alt="${escaparHTMLNivan(m.nombre)}">
                <span class="etiquetaPublicidadNivan">Publicidad</span>
                <span class="pieAnuncio3DNivan">${escaparHTMLNivan(m.nombre)}</span>
           </div>`;
    }).join("");
    return `<div class="publicidad3DNivan">${espacios}</div>`;
}

// ---- publicidadComun ----
// Anuncios pagos de todos los planes (tira de una sola línea). Solo se dibuja si hay anunciantes.
function htmlPublicidadComunNivan(bloque) {
    const anuncios = anunciosPremiumPorBloqueNivan("feed", bloque, FEED_PERFIL_CONFIG.anunciosPublicidadComun);
    if (!anuncios.length) return "";

    const cuadros = anuncios.map(function(a) {
        return `<div class="anuncioPublicidadComunNivan" data-anuncio="${escaparHTMLNivan(a.clave)}" onclick="${a.alClick}">
                <img src="${escaparHTMLNivan(a.imagen)}" alt="${escaparHTMLNivan(a.nombre)}">
                <span class="etiquetaPublicidadNivan">Publicidad</span>
           </div>`;
    }).join("");
    return `<div class="publicidadComunNivan">${cuadros}</div>`;
}

// Se desliza sola cada 3 segundos; si la persona la toca, la deja tranquila 8 segundos.
let timerPublicidadComunNivan = null;
function activarPublicidadComunNivan() {
    if (timerPublicidadComunNivan) return;
    timerPublicidadComunNivan = setInterval(function() {
        if (document.hidden) return;
        document.querySelectorAll(".publicidadComunNivan").forEach(function(tira) {
            if (!tira.offsetParent) return;
            if (Date.now() < Number(tira.dataset.pausaHasta || 0)) return;
            const paso = tira.firstElementChild ? tira.firstElementChild.offsetWidth + 6 : 100;
            const llegoAlFinal = tira.scrollLeft + tira.clientWidth >= tira.scrollWidth - 4;
            tira.scrollTo({ left: llegoAlFinal ? 0 : tira.scrollLeft + paso, behavior: "smooth" });
        });
    }, 3000);

    ["touchstart", "mousedown", "wheel"].forEach(function(evento) {
        document.addEventListener(evento, function(e) {
            const tira = e.target && e.target.closest ? e.target.closest(".publicidadComunNivan") : null;
            if (tira) tira.dataset.pausaHasta = String(Date.now() + 8000);
        }, { passive: true });
    });
}

// ---- Post en grande ----
function htmlPostGrandeNivan(e, onclick) {
    const u = e.usuario;
    const avatar = u.foto
        ? `<img src="${escaparHTMLNivan(u.foto)}" alt="">`
        : `<div class="avatarVacioFeedNivan">👤</div>`;
    const idVisible = u.idPublico ? `<span class="idTarjetaPostNivan">@${escaparHTMLNivan(u.idPublico)}</span>` : "";
    const src = escaparHTMLNivan(e.item.src || "");
    const medio = !e.item.src ? ""
        : e.item.tipo === "video"
            ? `<video class="fotoTarjetaPostNivan" src="${src}" muted playsinline${preloadVideoNivan()}></video>`
            : `<img class="fotoTarjetaPostNivan" src="${src}" alt="Post">`;
    const texto = e.item.texto
        ? `<p class="textoTarjetaPostNivan">${textoConEtiquetasNivan(e.item.texto)}</p>`
        : "";
    const editado = typeof htmlEditadoNivan === "function" ? htmlEditadoNivan(e.item) : "";
    return `<div class="tarjetaPostTextoNivan tarjetaPostGrandeNivan"${onclick ? ` onclick="${onclick}"` : ""}>
        <div class="autorTarjetaPostNivan">${avatar}<div class="nombreTarjetaPostNivan">${escaparHTMLNivan(obtenerNombreMostradoUsuario(u))}${idVisible}</div></div>
        ${texto}
        ${medio}
        ${editado}
    </div>`;
}

// ---- Armado del feed por bloques (carga progresiva) ----
let estadoFeedPerfilNivan = { bloques: [], mostrados: 0 };
let bloquesVistosFeedPerfilNivan = 0;   // para no perder el lugar si el feed se vuelve a dibujar
let observadorFeedPerfilNivan = null;

function armarBloquesFeedPerfilNivan(entradas, opciones) {
    function clickDe(e) { return opciones.alClick ? opciones.alClick(e) : ""; }

    function celda(e) {
        const src = escaparHTMLNivan(e.item.src);
        const medio = e.item.tipo === "video"
            ? `<video src="${src}" muted${preloadVideoNivan()}></video><span class="insigniaVideoFeedNivan">▶</span>`
            : `<img src="${src}" alt="Publicación">`;
        const fn = clickDe(e);
        return `<div class="itemPublicacionGridPerfil"${fn ? ` onclick="${fn}"` : ""}>${medio}</div>`;
    }

    // Más antiguos primero (por fecha), dentro de cada tipo. Con el feed
    // personalizado (opciones.conservarOrden) se respeta el orden recibido.
    const ordenadas = opciones && opciones.conservarOrden
        ? entradas.slice()
        : entradas.slice().sort(function(a, b) { return (a.item.fecha || 0) - (b.item.fecha || 0); });
    const publicaciones = [];
    const posts = [];
    ordenadas.forEach(function(e) {
        (formatoPortafolioItemNivan(e.item) === "post" ? posts : publicaciones).push(e);
    });

    const bloques = [];
    let iPub = 0;
    let iPost = 0;

    while (iPub < publicaciones.length || iPost < posts.length) {
        let html = "";

        if (iPub < publicaciones.length) {
            const trozo = publicaciones.slice(iPub, iPub + FEED_PERFIL_CONFIG.publicacionesPorBloque);
            html += `<div class="gridPublicacionesPerfilLateral">${trozo.map(celda).join("")}</div>`;
            iPub += trozo.length;
        }

        html += htmlPublicidad3DNivan(bloques.length);
        html += htmlPublicidadComunNivan(bloques.length);

        if (iPost < posts.length) {
            posts.slice(iPost, iPost + FEED_PERFIL_CONFIG.postsPorBloque).forEach(function(e) {
                html += htmlPostGrandeNivan(e, clickDe(e));
            });
            iPost += FEED_PERFIL_CONFIG.postsPorBloque;
        }
        bloques.push(html);
    }
    return bloques;
}

function htmlFeedPerfilNivan(entradas, opciones) {
    estadoFeedPerfilNivan.bloques = armarBloquesFeedPerfilNivan(entradas, opciones || {});
    const cuantos = Math.min(
        estadoFeedPerfilNivan.bloques.length,
        Math.max(FEED_PERFIL_CONFIG.bloquesIniciales, bloquesVistosFeedPerfilNivan)
    );
    estadoFeedPerfilNivan.mostrados = cuantos;
    const hayMas = cuantos < estadoFeedPerfilNivan.bloques.length;
    return estadoFeedPerfilNivan.bloques.slice(0, cuantos).join("")
        + (hayMas ? `<div id="centinelaFeedPerfilNivan" class="centinelaFeedPerfilNivan">Cargando más…</div>` : "");
}

// Cuando se llega al final de lo cargado, se agrega el siguiente bloque (más nuevo).
function activarCargaProgresivaFeedNivan() {
    if (observadorFeedPerfilNivan) { observadorFeedPerfilNivan.disconnect(); observadorFeedPerfilNivan = null; }
    const centinela = document.getElementById("centinelaFeedPerfilNivan");
    if (!centinela || typeof IntersectionObserver === "undefined") {
        // Sin soporte: se muestran todos de una vez.
        if (centinela) {
            centinela.insertAdjacentHTML("beforebegin", estadoFeedPerfilNivan.bloques.slice(estadoFeedPerfilNivan.mostrados).join(""));
            centinela.remove();
            estadoFeedPerfilNivan.mostrados = estadoFeedPerfilNivan.bloques.length;
        }
        return;
    }

    observadorFeedPerfilNivan = new IntersectionObserver(function(registros) {
        if (!registros.some(function(r) { return r.isIntersecting; })) return;
        const st = estadoFeedPerfilNivan;
        if (st.mostrados >= st.bloques.length) return;

        centinela.insertAdjacentHTML("beforebegin", st.bloques[st.mostrados]);
        st.mostrados++;
        bloquesVistosFeedPerfilNivan = Math.max(bloquesVistosFeedPerfilNivan, st.mostrados);

        if (st.mostrados >= st.bloques.length) {
            observadorFeedPerfilNivan.disconnect();
            observadorFeedPerfilNivan = null;
            centinela.remove();
        } else {
            // Si todavía quedó a la vista (pantalla grande), seguimos cargando.
            observadorFeedPerfilNivan.unobserve(centinela);
            observadorFeedPerfilNivan.observe(centinela);
        }
    }, { rootMargin: "600px 0px" });

    observadorFeedPerfilNivan.observe(centinela);
}
