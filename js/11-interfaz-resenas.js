// ==============================
// CARRUSEL DE ANUNCIOS NIVAN
// ==============================

let anuncios =
    document.querySelectorAll(".anuncio");

const contenedorIndicadores =
    document.getElementById(
        "indicadoresAnuncios"
    );

let anuncioActual = 0;

let intervaloAnuncios;


// CREAR LOS PUNTITOS (uno por anuncio)

function crearIndicadoresAnunciosNivan() {

    contenedorIndicadores.innerHTML = "";

    anuncios.forEach(function(anuncio, indice) {

        const indicador =
            document.createElement("div");

        indicador.classList.add(
            "indicadorAnuncio"
        );


        if (indice === anuncioActual) {

            indicador.classList.add(
                "activo"
            );

        }


        indicador.addEventListener(
            "click",
            function() {

                mostrarAnuncio(indice);

                reiniciarCarrusel();

            }
        );


        contenedorIndicadores.appendChild(
            indicador
        );

    });

}

crearIndicadoresAnunciosNivan();


// ANUNCIOS PAGOS (plan "Tienda destacada"): se suman al final del carrusel.

function htmlAnuncioPagoNivan(anuncio) {

    return `
        <div class="anuncio anuncioPago" data-anuncio="${escaparHTMLNivan(anuncio.clave)}">
            <img class="anuncioImagen" src="${escaparHTMLNivan(anuncio.imagen)}"${atributosImagenNivan()} alt="${escaparHTMLNivan(anuncio.nombre)}" onclick="${anuncio.alClick}">
            <div class="anuncioTexto">
                <span class="etiquetaPublicidadNivan">Publicidad</span>
                <h3>${escaparHTMLNivan(anuncio.nombre)}</h3>
                <strong class="anuncioPrecio">${escaparHTMLNivan(anuncio.precio)}</strong>
                <button type="button" class="anuncioBtn" onclick="${anuncio.alClick}">Ver prenda →</button>
            </div>
        </div>
    `;

}

function renderizarCarruselAnunciosNivan() {

    clearInterval(intervaloAnuncios);

    carrusel.querySelectorAll(".anuncioPago").forEach(function(anuncio) {
        anuncio.remove();
    });

    contenedorIndicadores.insertAdjacentHTML(
        "beforebegin",
        anunciosPremiumActivosNivan("home").map(htmlAnuncioPagoNivan).join("")
    );

    anuncios = carrusel.querySelectorAll(".anuncio");

    anuncioActual = 0;

    crearIndicadoresAnunciosNivan();

    mostrarAnuncio(0);

    iniciarCarrusel();

}


// MOSTRAR ANUNCIO

function mostrarAnuncio(indice) {

    anuncios.forEach(function(anuncio) {

        anuncio.classList.remove(
            "activo"
        );

    });


    const indicadores =
        document.querySelectorAll(
            ".indicadorAnuncio"
        );


    indicadores.forEach(function(indicador) {

        indicador.classList.remove(
            "activo"
        );

    });


    anuncios[indice].classList.add(
        "activo"
    );


    indicadores[indice].classList.add(
        "activo"
    );


    anuncioActual = indice;


    // Si es un anuncio pago, cuenta una vista (solo si el carrusel está a la vista).

    const clave = anuncios[indice].dataset.anuncio;

    if (clave && carrusel.offsetParent && !document.hidden) {

        const partes = clave.split("|");

        registrarEventoAnuncioNivan(partes[0], partes[1], "vistas");

    }

}


// SIGUIENTE ANUNCIO

function siguienteAnuncio() {

    anuncioActual++;


    if (
        anuncioActual >= anuncios.length
    ) {

        anuncioActual = 0;

    }


    mostrarAnuncio(anuncioActual);

}


  
// INICIAR CARRUSEL

function iniciarCarrusel() {

    intervaloAnuncios =
        setInterval(
            siguienteAnuncio,
            5000
        );

}

// ==============================
// DESLIZAR ANUNCIOS CON EL DEDO
// ==============================

const carrusel =
    document.getElementById(
        "carruselAnuncios"
    );

let inicioX = 0;

let finalX = 0;


// CUANDO TOCA LA PANTALLA (DEDO O MOUSE)
// Se pausa el carrusel mientras se mantiene presionado, para
// poder leerlo. Usamos Pointer Events porque unifican touch y
// mouse en un solo evento y evitan que se disparen los dos a la
// vez (lo que antes podía hacer que el carrusel se trabara).

let punteroPresionadoCarrusel = false;

carrusel.addEventListener(
    "pointerdown",
    function(event) {

        punteroPresionadoCarrusel = true;

        inicioX = event.clientX;

        pausarCarrusel();

    }
);


carrusel.addEventListener(
    "pointerup",
    function(event) {

        if (!punteroPresionadoCarrusel) {

            return;

        }

        punteroPresionadoCarrusel = false;

        finalX = event.clientX;


        manejarDeslizamiento();


        // SE REANUDA SIEMPRE AL SOLTAR, AUNQUE NO HAYA DESLIZADO

        reiniciarCarrusel();

    }
);


// SI EL DEDO/MOUSE SE VA O SE CANCELA (ej: llega una notificación,
// se hace scroll de la página), TAMBIÉN SE REANUDA EL CARRUSEL PARA
// QUE NUNCA QUEDE TRABADO.

carrusel.addEventListener(
    "pointercancel",
    function() {

        punteroPresionadoCarrusel = false;

        reiniciarCarrusel();

    }
);


carrusel.addEventListener(
    "pointerleave",
    function() {

        if (punteroPresionadoCarrusel) {

            punteroPresionadoCarrusel = false;

            reiniciarCarrusel();

        }

    }
);


// DETECTAR HACIA QUÉ LADO DESLIZÓ

function manejarDeslizamiento() {

    const diferencia =
        inicioX - finalX;


    // EVITAR QUE UN TOQUE PEQUEÑO
    // CAMBIE EL ANUNCIO

    if (
        Math.abs(diferencia) < 50
    ) {

        return;

    }


    // DESLIZA HACIA LA IZQUIERDA
    // → SIGUIENTE ANUNCIO

    if (diferencia > 0) {

        siguienteAnuncio();

    }


    // DESLIZA HACIA LA DERECHA
    // → ANUNCIO ANTERIOR

    if (diferencia < 0) {

        anuncioActual--;


        if (anuncioActual < 0) {

            anuncioActual =
                anuncios.length - 1;

        }


        mostrarAnuncio(
            anuncioActual
        );

    }

}
  
// PAUSAR MIENTRAS SE MANTIENE PRESIONADO

function pausarCarrusel() {

    clearInterval(
        intervaloAnuncios
    );

}

// REINICIAR CUANDO TOCAN UN PUNTITO O SUELTAN LA PRESIÓN

function reiniciarCarrusel() {

    clearInterval(
        intervaloAnuncios
    );

    iniciarCarrusel();

}


// FUNCIONES DE LOS BOTONES


function irAMedida() {
    irAPagina('paginaHome');
    const seccion = document.getElementById('aMedida');
    if (seccion && !seccion.classList.contains('abierta')) seccion.classList.add('abierta');
    sincronizarMedidasConSolicitud();
    if (seccion) seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mostrarMensajeReferidos() {

    alert(
        "Próximamente vas a poder invitar amigos y obtener beneficios en NIVAN."
    );

}


function explorarDisenos() {
    irAPagina('paginaHome');
    document.getElementById('productos').scrollIntoView({ behavior: 'smooth' });
}

// (El arrastre con mouse y dedo ahora se maneja todo junto arriba
// con Pointer Events, así que ya no hace falta código aparte acá.)

// INICIAR (suma los anuncios pagos, si hay, y arranca el carrusel)

renderizarCarruselAnunciosNivan();




// ==============================
// PESTAÑA PERFIL: BUSCADOR DE PERSONAS + FEED DE PUBLICACIONES PERSONALES
// (solo publicaciones/videos de perfiles personales, no de tiendas)
// ==============================
let postFeedAbiertoNivan = null;

function abrirMiPerfilNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }
    vistaPerfilLateralActual = modoCuentaNivan();
    renderizarPerfilLateral();
    document.getElementById("panelMiPerfilNivan").classList.add("abierto");
    document.getElementById("overlayMiPerfilNivan").classList.add("abierto");
}

function cerrarMiPerfilNivan() {
    const panel = document.getElementById("panelMiPerfilNivan");
    if (!panel || !panel.classList.contains("abierto")) return;
    panel.classList.remove("abierto");
    document.getElementById("overlayMiPerfilNivan").classList.remove("abierto");
    renderizarFeedPersonalNivan();
}

function usuarioVisibleEnFeedNivan(u) {
    const miId = usuarioActual ? usuarioActual.id : null;
    if (miId === u.id) return true;
    if (cuentaInactivaNivan(u.id)) return false;
    if (miId && hayBloqueoEntreNivan(miId, u.id)) return false;
    return true;
}

// Feed de la pestaña Perfil: SOLO publicaciones de perfiles personales públicos (de cualquier
// país). Las tiendas no salen acá: tienen su lugar en Home y Buscar.
function obtenerPublicacionesFeedNivan() {
    const miId = usuarioActual ? usuarioActual.id : null;
    const lista = [];
    const usuarios = obtenerUsuariosNivan();

    usuarios.forEach(function(u) {
        if (!Array.isArray(u.portafolio) || !u.portafolio.length) return;
        if (!usuarioVisibleEnFeedNivan(u)) return;
        // En el feed solo salen las publicaciones de perfiles públicos (visibles para todos).
        // Si la cuenta es privada, sus publicaciones no salen acá, ni siquiera para su dueño.
        if (obtenerPrivacidadUsuarioNivan(u.id).verPerfil !== "todos") return;
        u.portafolio.forEach(function(item, indice) {
            if (item && (item.src || (item.tipo === "texto" && item.texto))) lista.push({ ambito: "personal", usuario: u, indice: indice, item: item });
        });
    });

    // En el feed de Perfiles salen primero los más antiguos; los nuevos van cargando al bajar.
    lista.sort(function(a, b) { return (a.item.fecha || 0) - (b.item.fecha || 0); });
    return lista;
}

function renderizarFeedPersonalNivan() {
    const feed = document.getElementById("feedPersonalNivan");
    const resultados = document.getElementById("resultadosPersonasNivan");
    if (!feed || !resultados) return;

    const btn = document.getElementById("botonMiPerfilNivan");
    if (btn) {
        const idActivo = datosIdentidadNivan(usuarioActual, modoCuentaNivan());
        btn.innerHTML = usuarioActual && idActivo.foto
            ? `<img src="${escaparHTMLNivan(idActivo.foto)}" alt="Mi perfil">`
            : (usuarioActual ? idActivo.vacio : "👤");
    }

    actualizarBadgePerfilNivan();

    const buscador = document.getElementById("buscadorPersonasNivan");
    const q = buscador ? buscador.value.trim().toLowerCase() : "";

    if (q) {
        const miId = usuarioActual ? usuarioActual.id : null;
        const personas = obtenerUsuariosNivan().filter(function(u) {
            if (u.id === miId || !usuarioVisibleEnFeedNivan(u)) return false;
            const texto = [obtenerNombreMostradoUsuario(u), u.nombre, u.idPublico].join(" ").toLowerCase();
            return texto.indexOf(q) !== -1;
        }).slice(0, 30);

        feed.style.display = "none";
        resultados.innerHTML = personas.length
            ? personas.map(function(u) {
                const foto = u.foto
                    ? `<img src="${escaparHTMLNivan(u.foto)}" alt="">`
                    : `<div class="avatarVacioFeedNivan">👤</div>`;
                return `<div class="filaPersonaFeedNivan" onclick="abrirPerfilPersonalNivan('${escaparHTMLNivan(u.id)}', true)">
                    ${foto}
                    <div>
                        <p class="nombrePerfilLateral">${escaparHTMLNivan(obtenerNombreMostradoUsuario(u))}</p>
                        <p class="subTextoPerfilLateral">ID: ${escaparHTMLNivan(u.idPublico || "—")}</p>
                    </div>
                </div>`;
            }).join("")
            : `<p class="vacioPublicacionesPerfilLateral">No encontramos personas con ese nombre.</p>`;
        return;
    }

    resultados.innerHTML = "";
    feed.style.display = "";
    const posts = obtenerPublicacionesFeedNivan();

    feed.innerHTML = posts.length
        ? htmlFeedPerfilNivan(posts, {
            alClick: function(x) { return `abrirPostFeedNivan('${escaparHTMLNivan(x.usuario.id)}', ${x.indice})`; }
        })
        : `<p class="vacioPublicacionesPerfilLateral" style="grid-column:1/-1;">Todavía no hay publicaciones. Tocá tu foto arriba a la derecha para subir la primera.</p>`;
    if (typeof activarPublicidadComunNivan === "function") activarPublicidadComunNivan();
    if (typeof activarCargaProgresivaFeedNivan === "function") activarCargaProgresivaFeedNivan();
}

// ---- Etiquetas @ID: el @ apunta al ID público de una persona o al ID de una tienda ----

function buscarCuentaPorIdNivan(idTexto, usuarios) {
    const q = String(idTexto || "").trim().toLowerCase();
    if (!q) return null;
    const lista = usuarios || obtenerUsuariosNivan();
    for (let i = 0; i < lista.length; i++) {
        const u = lista[i];
        if (u.idPublico && String(u.idPublico).toLowerCase() === q) return { tipo: "personal", usuario: u };
        if (u.idTienda && String(u.idTienda).toLowerCase() === q) return { tipo: "tienda", usuario: u };
    }
    return null;
}

// Devuelve HTML seguro: escapa el texto y convierte en link solo los @ID que existen.
function textoConEtiquetasNivan(texto) {
    const crudo = String(texto == null ? "" : texto);
    const patron = /(^|[^A-Za-z0-9_])@([A-Za-z0-9][A-Za-z0-9-]{1,40})/g;
    const usuarios = obtenerUsuariosNivan();
    let salida = "";
    let ultimo = 0;
    let m;
    while ((m = patron.exec(crudo)) !== null) {
        const posArroba = m.index + m[1].length;
        const id = m[2].replace(/-+$/, "");
        salida += escaparHTMLNivan(crudo.slice(ultimo, posArroba));
        if (buscarCuentaPorIdNivan(id, usuarios)) {
            salida += `<a class="etiquetaNivan" href="#" onclick="return irAEtiquetaNivan('${escaparHTMLNivan(id)}', event)">@${escaparHTMLNivan(id)}</a>`;
        } else {
            salida += escaparHTMLNivan("@" + id);
        }
        ultimo = posArroba + 1 + id.length;
        patron.lastIndex = ultimo;
    }
    salida += escaparHTMLNivan(crudo.slice(ultimo));
    return salida.replace(/\n/g, "<br>");
}

function irAEtiquetaNivan(id, evento) {
    if (evento) { evento.preventDefault(); evento.stopPropagation(); }
    const cuenta = buscarCuentaPorIdNivan(id);
    if (!cuenta) { alert("No encontramos ese perfil."); return false; }

    cerrarPostFeedNivan();
    cerrarPosteoPerfilLateral();
    cerrarMiPerfilNivan();

    const u = cuenta.usuario;
    if (cuenta.tipo === "tienda") abrirPerfilVendedor(u.id);
    else if (usuarioActual && usuarioActual.id === u.id) abrirMiPerfilNivan();
    else abrirPerfilPersonalNivan(u.id, true);
    return false;
}

// Arma las publicaciones personales: 6 en cuadrícula (3 columnas x 2 filas) y a continuación
// 1 tarjeta de solo texto (avatar + nombre + texto + foto si tiene), y así se repite.
function htmlPublicacionesPersonalesNivan(entradas, opciones) {
    opciones = opciones || {};
    const medios = [];
    const textos = [];
    // En el perfil (propio o ajeno) los nuevos salen arriba y los viejos abajo.
    entradas = entradas.slice().sort(function(a, b) { return (b.item.fecha || 0) - (a.item.fecha || 0); });
    entradas.forEach(function(e) { (formatoPortafolioItemNivan(e.item) === "post" ? textos : medios).push(e); });

    function onclickDe(e) {
        const fn = opciones.alClick ? opciones.alClick(e) : "";
        return fn ? ` onclick="${fn}"` : "";
    }

    function celda(e) {
        const src = escaparHTMLNivan(e.item.src);
        const medio = e.item.tipo === "video"
            ? (opciones.controlesVideo
                ? `<video src="${src}" controls></video>`
                : `<video src="${src}" muted${preloadVideoNivan()}></video><span class="insigniaVideoFeedNivan">▶</span>`)
            : `<img src="${src}" alt="Publicación">`;
        return `<div class="itemPublicacionGridPerfil"${onclickDe(e)}>${medio}</div>`;
    }

    function tarjeta(e) {
        const u = e.usuario;
        const avatar = u.foto
            ? `<img src="${escaparHTMLNivan(u.foto)}" alt="">`
            : `<div class="avatarVacioFeedNivan">👤</div>`;
        const idVisible = u.idPublico ? `<span class="idTarjetaPostNivan">@${escaparHTMLNivan(u.idPublico)}</span>` : "";
        const foto = e.item.src ? `<img class="fotoTarjetaPostNivan" src="${escaparHTMLNivan(e.item.src)}" alt="Publicación">` : "";
        return `<div class="tarjetaPostTextoNivan"${onclickDe(e)}>
            <div class="autorTarjetaPostNivan">${avatar}<div class="nombreTarjetaPostNivan">${escaparHTMLNivan(obtenerNombreMostradoUsuario(u))}${idVisible}</div></div>
            <p class="textoTarjetaPostNivan">${textoConEtiquetasNivan(e.item.texto || "")}</p>
            ${foto}
            ${typeof htmlEditadoNivan === "function" ? htmlEditadoNivan(e.item) : ""}
        </div>`;
    }

    let html = "";
    let m = 0;
    let t = 0;
    while (m < medios.length || t < textos.length) {
        if (m < medios.length) {
            const n = t < textos.length ? Math.min(6, medios.length - m) : medios.length - m;
            html += `<div class="gridPublicacionesPerfilLateral">${medios.slice(m, m + n).map(celda).join("")}</div>`;
            m += n;
        }
        if (t < textos.length) { html += tarjeta(textos[t]); t++; }
    }
    return html;
}

function abrirPostFeedNivan(idUsuario, indice) {
    const u = obtenerUsuarioPorIdNivan(idUsuario);
    const item = u && Array.isArray(u.portafolio) ? u.portafolio[indice] : null;
    if (!item) return;

    postFeedAbiertoNivan = { idUsuario: idUsuario, indice: indice };
    const esMio = !!(usuarioActual && usuarioActual.id === idUsuario);

    document.getElementById("autorPostFeedNivan").innerHTML =
        (u.foto ? `<img src="${escaparHTMLNivan(u.foto)}" alt="">` : `<div class="avatarVacioFeedNivan" style="width:34px;height:34px;">👤</div>`) +
        `<span>${escaparHTMLNivan(obtenerNombreMostradoUsuario(u))}</span>`;

    document.getElementById("mediaPosteoFeedNivan").innerHTML = !item.src ? ""
        : item.tipo === "video"
            ? `<video src="${escaparHTMLNivan(item.src)}" controls${preloadVideoNivan()}></video>`
            : `<img src="${escaparHTMLNivan(item.src)}" alt="Publicación">`;
    document.getElementById("textoPosteoFeedNivan").innerHTML = textoConEtiquetasNivan(item.texto || "")
        + (typeof htmlEditadoNivan === "function" ? htmlEditadoNivan(item) : "");
    document.getElementById("botonBorrarPostFeedNivan").style.display = esMio ? "" : "none";
    const botonEditarFeed = document.getElementById("botonEditarPostFeedNivan");
    if (botonEditarFeed) botonEditarFeed.style.display = (esMio && typeof puedeEditarPostNivan === "function" && puedeEditarPostNivan(item)) ? "" : "none";
    document.getElementById("overlayPosteoFeedNivan").classList.add("abierto");
}

function cerrarPostFeedNivan() {
    document.getElementById("overlayPosteoFeedNivan").classList.remove("abierto");
    document.getElementById("mediaPosteoFeedNivan").innerHTML = "";
    postFeedAbiertoNivan = null;
}

function irAlAutorPostFeedNivan() {
    if (!postFeedAbiertoNivan) return;
    const id = postFeedAbiertoNivan.idUsuario;
    cerrarPostFeedNivan();
    if (usuarioActual && usuarioActual.id === id) abrirMiPerfilNivan();
    else abrirPerfilPersonalNivan(id, true);
}

function borrarPostFeedNivan() {
    if (!usuarioActual || !postFeedAbiertoNivan || postFeedAbiertoNivan.idUsuario !== usuarioActual.id) return;
    const indice = postFeedAbiertoNivan.indice;

    mostrarConfirmacionNivan("¿Querés borrar esta publicación?", function() {
        const actual = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio.slice() : [];
        actual.splice(indice, 1);
        persistirUsuarioActual({ portafolio: actual });
        cerrarPostFeedNivan();
        renderizarFeedPersonalNivan();
    });
}

// ==============================
// NAVEGACION PRINCIPAL NIVAN
// ==============================
function cambiarPagina(idPagina, boton) {

    // Si había una sección tipo "Vender", "Mis publicaciones",
    // "Crear publicación", etc. abierta encima, la cerramos
    // antes de cambiar de pestaña.
    document.querySelectorAll('.pantallaCompleta.abierta').forEach(function(pantalla) {
        pantalla.classList.remove('abierta');
    });

    // También cerramos el carrito si estaba abierto.
    const carritoAbierto = document.getElementById('carrito');
    if (carritoAbierto) {
        carritoAbierto.classList.remove('abierta');
        carritoAbierto.classList.remove('abierto');
    }
    document.body.style.overflow = '';

    document.querySelectorAll('.pagina').forEach(function(pagina) {
        pagina.classList.remove('activa');
    });

    const pagina = document.getElementById(idPagina);

    if (pagina) {
        pagina.classList.add('activa');
    }

    // Solo Home muestra el rectángulo de arriba.
    document.body.classList.toggle('sinHeaderNivan', idPagina !== 'paginaHome');

    document.querySelectorAll('.navItem').forEach(function(item) {
        item.classList.remove('activo');
    });

    if (boton) {
        boton.classList.add('activo');
    }

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });

    // 🔍 AL ENTRAR A BUSCAR, MOSTRAR TODAS LAS PUBLICACIONES
    if (idPagina === 'paginaBuscador') {
        const buscador = document.getElementById('buscador');

        if (buscador) {
            buscador.value = '';
        }

        resultadosBuscadorActuales = productos;

        const selectOrden = document.getElementById('ordenBuscador');
        if (selectOrden) {
            selectOrden.value = ordenActual;
        }

        mostrarProductos(ordenarProductos(productos, ordenActual), 'productosBusqueda');
    }

    if (idPagina === 'paginaHome') {
        renderizarFeedNivan();
        renderizarRecomendadosNivan();
    }

    if (idPagina === 'paginaFavoritos') {
        revisarBajasDePrecio();
        renderizarFavoritos();
    }

    if (idPagina === 'paginaNotificaciones') {
        revisarBajasDePrecio();
        renderizarNotificaciones();
    }

    if (idPagina === 'paginaPerfil') {
        actualizarContadoresChatNivan();
        renderizarFeedPersonalNivan();
    }

    if (idPagina === 'paginaMedidas') {
        cargarPerfilCorporal();
        // El modelo 3D (y su render loop) recién se cargan
        // acá, la primera vez que el usuario entra a esta
        // pestaña. Así el resto de la app arranca liviana.
        if (typeof iniciarCuerpo3D === 'function') {
            iniciarCuerpo3D();
        }
    } else if (typeof pausarBucle3D === 'function') {
        // Si estamos saliendo de "Medidas", frenamos el render
        // 3D en segundo plano para no gastar batería/CPU.
        pausarBucle3D();
    }
  }

function obtenerBotonNav(idPagina) {
    return document.querySelector('.navItem[data-pagina="' + idPagina + '"]');
}

function irAPagina(idPagina) {
    cambiarPagina(idPagina, obtenerBotonNav(idPagina));
}

// ==============================
// VISTOS RECIENTEMENTE
// ==============================

function obtenerVistosRecientes() {
    return leerJSONNivan("nivanVistosRecientemente", []);
}

function registrarVistoReciente(idProducto) {
    registrarActividadProducto(idProducto, "vista");

    let vistos = obtenerVistosRecientes();

    vistos = vistos.filter(function(id) {
        return id !== idProducto;
    });

    vistos.unshift(idProducto);
    vistos = vistos.slice(0, 10);

    guardarJSONNivan("nivanVistosRecientemente", vistos);
    renderizarVistosRecientemente();
}

// El botón "Vistos recientemente" vive en la página de Buscador y
// categorías, debajo de "Todo". Se muestra solo si hay algo para
// mostrar, y al tocarlo abre/cierra el panel con la lista.
function renderizarVistosRecientemente() {
    const boton = document.getElementById("botonVistosRecientementeBuscador");
    const panel = document.getElementById("panelVistosRecientemente");
    const lista = document.getElementById("listaVistosRecientemente");

    if (!boton || !panel || !lista) return;

    const productosVistos = obtenerVistosRecientes()
        .map(function(id) {
            return productos.find(function(p) {
                return p.id === id;
            });
        })
        .filter(Boolean);

    if (!productosVistos.length) {
        boton.style.display = "none";
        boton.classList.remove("activo");
        panel.style.display = "none";
        lista.innerHTML = "";
        return;
    }

    boton.style.display = "inline-block";

    lista.innerHTML = productosVistos.map(function(producto) {
        return `
            <div class="itemVistoReciente" onclick="abrirProducto(${producto.id})">
                <img src="${escaparHTMLNivan(urlImagenNivan(producto.imagen))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(producto.nombre)}">
                <p>${escaparHTMLNivan(producto.nombre)}</p>
            </div>
        `;
    }).join("");
}

// Abre/cierra el panel de vistos recientemente al tocar el botón.
function toggleVistosRecientementeBuscador() {
    const boton = document.getElementById("botonVistosRecientementeBuscador");
    const panel = document.getElementById("panelVistosRecientemente");

    if (!boton || !panel) return;

    const abierto = panel.style.display === "block";

    panel.style.display = abierto ? "none" : "block";
    boton.classList.toggle("activo", !abierto);
}

// ==============================
// AYUDA "¿QUÉ TALLE ME QUEDA?"
// ==============================
// Lleva directo a la pestaña "Medidas", donde ya está armado el
// perfil corporal / cuerpo 3D para calcular el talle.

function irAAyudaTalle() {
    cerrarProducto();
    irAPagina("paginaMedidas");
}

function guardarPerfilCorporal() {
    const datos = {
        tipo: document.getElementById('perfilTipoCuerpo').value,
        busto: document.getElementById('perfilBusto').value,
        cintura: document.getElementById('perfilCintura').value,
        cadera: document.getElementById('perfilCadera').value,
        altura: document.getElementById('perfilAltura').value
    };
    if (!datos.tipo || !datos.busto || !datos.cintura || !datos.cadera || !datos.altura) {
        document.getElementById('estadoMedidas').textContent = 'Elegí tu género y completá todas las medidas.';
        return;
    }
    if ([datos.busto, datos.cintura, datos.cadera, datos.altura].some(function(v){ return Number(v) > 250 || Number(v) < 1; })) {
        document.getElementById('estadoMedidas').textContent = 'Las medidas deben estar entre 1 y 250 cm.';
        return;
    }
    guardarJSONNivan('nivanPerfilCorporal', datos);
    sincronizarMedidasConSolicitud();
    document.getElementById('estadoMedidas').textContent = '✓ Medidas guardadas en este dispositivo.';
}

function cargarPerfilCorporal() {
    const guardado = localStorage.getItem('nivanPerfilCorporal');
    if (!guardado) return;
    try {
        const datos = JSON.parse(guardado);
        document.getElementById('perfilTipoCuerpo').value = datos.tipo || '';
        marcarGeneroActivo();
        document.getElementById('perfilBusto').value = datos.busto || '';
        document.getElementById('perfilCintura').value = datos.cintura || '';
        document.getElementById('perfilCadera').value = datos.cadera || '';
        document.getElementById('perfilAltura').value = datos.altura || '';
        document.getElementById('estadoMedidas').textContent = '✓ Tus medidas guardadas están cargadas.';
        sincronizarMedidasConSolicitud();
    } catch(e) {}
}

// ==============================
// MEDIDAS: BARRA SUPERIOR
// ==============================

function toggleTipoCuerpoBarra() {
    const tarjeta = document.getElementById('medidasCard');
    const abierto = tarjeta.classList.toggle('tipoCuerpoAbierto');
    document.getElementById('botonTipoCuerpoBarra').setAttribute('aria-expanded', abierto ? 'true' : 'false');
    if (!abierto) {
        cerrarGeneroMenu();
        tarjeta.classList.remove('panelMedidasAbierto');
    }
}

function toggleGeneroMenu(evento) {
    if (evento) evento.stopPropagation();
    marcarGeneroActivo();
    document.getElementById('generoMenu').classList.toggle('abierto');
}

function cerrarGeneroMenu() {
    const menu = document.getElementById('generoMenu');
    if (menu) menu.classList.remove('abierto');
}

function elegirGenero(valor) {
    const select = document.getElementById('perfilTipoCuerpo');
    if (select) select.value = valor;
    marcarGeneroActivo();
    cerrarGeneroMenu();
}

function marcarGeneroActivo() {
    const select = document.getElementById('perfilTipoCuerpo');
    const actual = select ? select.value : '';
    document.querySelectorAll('.generoOpcion').forEach(function(op) {
        op.classList.toggle('activa', op.dataset.genero === actual);
    });
}

function toggleMedidasPanel() {
    cerrarGeneroMenu();
    document.getElementById('medidasCard').classList.toggle('panelMedidasAbierto');
}

// Tocar fuera del menú de género lo cierra.
document.addEventListener('click', function(e) {
    if (!e.target.closest('#generoMenu')) cerrarGeneroMenu();
});

function sincronizarMedidasConSolicitud() {
    const guardado = localStorage.getItem('nivanPerfilCorporal');
    if (!guardado) return;
    try {
        const datos = JSON.parse(guardado);
        const tipo = document.getElementById('tipoCuerpo');
        if (tipo) tipo.value = datos.tipo || '';
        const mapa = { busto: 'bustoMedida', cintura: 'cinturaMedida', cadera: 'caderaMedida', altura: 'alturaMedida' };
        Object.keys(mapa).forEach(function(k) { const campo=document.getElementById(mapa[k]); if(campo) campo.value=datos[k] || ''; });
    } catch(e) {}
}

function renderizarFavoritos() {
    const favoritosProductos = productos.filter(function(producto) { return favoritos.includes(producto.id); });
    if (favoritosProductos.length === 0) {
        document.getElementById('productosFavoritos').innerHTML = '<div class="paginaVacia" style="grid-column:1/-1"><div class="paginaIcono">♡</div><strong>Todavía no tenés favoritos</strong><span>Guardá una prenda tocando el corazón.</span></div>';
        return;
    }
    mostrarProductos(favoritosProductos, 'productosFavoritos');
}

cargarPerfilCorporal();

  // ==============================
// LÍMITE DE MEDIDAS
// ==============================

function validarMedida(idCampo, idError) {

    const campo =
        document.getElementById(idCampo);

    const error =
        document.getElementById(idError);


    campo.addEventListener(
        "input",
        function() {

            const valor =
                Number(this.value);


            if (valor > 250) {

                error.textContent =
                    "El límite máximo es 250 cm.";

                error.style.display =
                    "block";
              campo.classList.add("medidaInvalida");

            } else {

                error.textContent =
                    "";

                error.style.display =
                    "none";

            campo.classList.remove("medidaInvalida");

            
            }

        }
    )
}


// APLICAR VALIDACIÓN

validarMedida(
    "bustoMedida",
    "errorBustoMedida"
);

validarMedida(
    "cinturaMedida",
    "errorCinturaMedida"
);

validarMedida(
    "caderaMedida",
    "errorCaderaMedida"
);

validarMedida(
    "alturaMedida",
    "errorAlturaMedida"
);
  
  
// ==============================
// ABRIR Y CERRAR PUBLICACIONES
// ==============================

// Arma los "chips" de colores para el detalle de la publicación.
// Son clickeables (como los talles): al tocar uno queda marcado
// como el color elegido para pedir la prenda, y ese color se manda
// junto con el talle cuando se agrega al carrito.
// Soporta tanto el formato nuevo ({nombre, hex}) como publicaciones
// viejas que sólo tenían el nombre como texto (les busca un tono
// aproximado en NIVAN_COLOR_HEX_POR_NOMBRE).
function renderizarColoresDetalle(colores) {
    if (!Array.isArray(colores) || !colores.length) {
        return "<p>Consultar al vendedor</p>";
    }

    const chips = colores.map(function(color, indice) {
        let nombre;
        let hex;

        if (typeof color === "string") {
            nombre = color;
            hex = NIVAN_COLOR_HEX_POR_NOMBRE[color.toLowerCase()] || "#888888";
        } else {
            nombre = color.nombre;
            hex = color.hex;
        }

        return `
            <span
                class="colorChipDetalle ${indice === 0 ? "activo" : ""}"
                data-hex="${hex}"
                onclick="seleccionarColorDetalle(this)"
            >
                <span class="puntoColorDetalle" style="background:${hex};"></span>
                ${hex.toUpperCase()}
            </span>
        `;
    }).join("");

    return `<div class="listaColoresDetalle">${chips}</div>`;
}

// Igual que seleccionarTalle: marca el color tocado como el
// elegido y desmarca el resto.
function seleccionarColorDetalle(chip) {
    document.querySelectorAll(".colorChipDetalle").forEach(function(el) {
        el.classList.remove("activo");
    });

    chip.classList.add("activo");
}

// Arma la tabla de medidas que el vendedor cargó al crear la
// publicación, para que se vea también dentro del detalle.
function renderizarTablaMedidasDetalle(producto) {
    const tablaMedidas = producto.tablaMedidas;
    const talles = Array.isArray(producto.talles) ? producto.talles : [];

    const hayMedidasNumericas = tablaMedidas && Object.keys(tablaMedidas).length;
    const hayAMedida = talles.some(function(t) {
        return t.toLowerCase() === "a medida";
    });

    if (!hayMedidasNumericas && !hayAMedida) {
        return "";
    }

    let filas = "";

    if (hayMedidasNumericas) {
        filas += Object.keys(tablaMedidas).map(function(talle) {
            const m = tablaMedidas[talle] || {};
            return `
                <tr>
                    <td>${talle}</td>
                    <td>${m.busto || "-"}</td>
                    <td>${m.cintura || "-"}</td>
                    <td>${m.cadera || "-"}</td>
                    <td>${m.largo || "-"}</td>
                </tr>
            `;
        }).join("");
    }

    if (hayAMedida) {
        filas += `
            <tr>
                <td>A medida</td>
                <td colspan="4">Se cotiza según las medidas que envíes al pedirla.</td>
            </tr>
        `;
    }

    return `
        <div class="detalleSeccion">
            <h3>Tabla de medidas</h3>
            <table class="tablaMedidasDetalle">
                <thead>
                    <tr>
                        <th>Talle</th>
                        <th>Busto (cm)</th>
                        <th>Cintura (cm)</th>
                        <th>Cadera (cm)</th>
                        <th>Largo (cm)</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
    `;
}

// "Historia de esta prenda": solo muestra los datos que el vendedor cargó.
const TEXTOS_PRODUCCION_NIVAN = { mano: "Hecha a mano", produccion: "Producción", reventa: "Reventa" };

function formatearFechaHistoriaNivan(valor) {
    const m = /^(\d{4})-(\d{2})/.exec(valor || "");
    if (!m) return valor || "";
    return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function renderizarHistoriaDetalle(producto) {
    const h = producto.historia;
    if (!h) return "";

    const filas = [
        ["✏️", "Diseñada por", h.disenadaPor],
        ["🧵", "Fabricada por", h.fabricadaPor],
        ["🧶", "Materiales", h.materiales],
        ["📅", "Fecha de creación", formatearFechaHistoriaNivan(h.fechaCreacion)],
        ["🪡", "Técnica", h.tecnica]
    ].filter(function(f) { return f[2]; });

    const produccion = TEXTOS_PRODUCCION_NIVAN[h.produccion];
    if (!filas.length && !produccion) return "";

    return `
        <div class="detalleSeccion historiaPrendaDetalleNivan">
            <h3>Historia de esta prenda</h3>
            ${produccion ? `<span class="etiquetaProduccionNivan ${escaparHTMLNivan(h.produccion)}">${produccion}</span>` : ""}
            <dl>
                ${filas.map(function(f) {
                    return `<div><dt>${f[0]} ${f[1]}</dt><dd>${escaparHTMLNivan(f[2])}</dd></div>`;
                }).join("")}
            </dl>
        </div>
    `;
}

// Busca otras publicaciones para recomendar debajo del detalle:
// prioriza las que comparten etiquetas con esta (más etiquetas en
// común = más arriba) y, si no hay ninguna etiqueta en común, cae a
// publicaciones de la misma categoría.
function obtenerPublicacionesRecomendadas(producto, limite) {
    limite = limite || 8;

    const etiquetasProducto = Array.isArray(producto.etiquetas)
        ? producto.etiquetas.map(function(e) { return e.toLowerCase(); })
        : [];

    const conPuntaje = productos
        .filter(function(p) {
            return p.id !== producto.id && p.activo !== false;
        })
        .map(function(p) {
            const etiquetasP = Array.isArray(p.etiquetas)
                ? p.etiquetas.map(function(e) { return e.toLowerCase(); })
                : [];

            const etiquetasEnComun = etiquetasP.filter(function(e) {
                return etiquetasProducto.includes(e);
            }).length;

            let puntaje = etiquetasEnComun * 10;

            if (producto.categoria && p.categoria === producto.categoria) {
                puntaje += 1;
            }

            return { producto: p, puntaje: puntaje };
        })
        .filter(function(item) {
            return item.puntaje > 0;
        });

    conPuntaje.sort(function(a, b) {
        return b.puntaje - a.puntaje;
    });

    return conPuntaje.slice(0, limite).map(function(item) {
        return item.producto;
    });
}

function abrirProducto(id) {
    const producto = productos.find(function(p) {
        return p.id === id;
    });

    if (!producto) return;

    registrarVistoReciente(id);

    estrellaSeleccionada = 0;

    const modal = document.getElementById("modalProducto");
    const contenido = document.getElementById("contenidoProducto");

    let talles = Array.isArray(producto.talles) && producto.talles.length
        ? producto.talles
        : ["Consultar"];

    // Si el producto es "de reventa" (revendedor puro, o diseñador+revendedor
    // que en ESTA publicación dijo que es reventa), nunca se ofrece "a medida".
    if (actuaComoRevendedorEnPublicacion(producto)) {
        talles = talles.filter(function(talle) {
            return talle.toLowerCase() !== "a medida";
        });
    }

    const colores = renderizarColoresDetalle(producto.colores);

    const tablaMedidasHTML = renderizarTablaMedidasDetalle(producto);

    const todosLosComentarios = [
        ...(Array.isArray(producto.comentarios) ? producto.comentarios : []),
        ...obtenerReseniasGuardadas(producto.id)
    ];

    const comentarios = todosLosComentarios.length
        ? todosLosComentarios.map(function(comentario) {
            return `
                <div class="comentario">
                    <strong>${escaparHTMLNivan(comentario.usuario || "Cliente")}</strong>
                    <div>${escaparHTMLNivan(comentario.estrellas || "")}</div>
                    <p>${escaparHTMLNivan(comentario.texto || "")}</p>
                </div>
            `;
        }).join("")
        : "<p>Todavía no hay comentarios sobre esta publicación.</p>";

    // Las etiquetas van al final de la publicación (después de todo lo
    // demás) y son clickeables: tocarlas manda a Buscador y categorías
    // ya filtrado por ese hashtag.
    const etiquetasHTML = Array.isArray(producto.etiquetas) && producto.etiquetas.length
        ? `
            <div class="detalleSeccion">
                <h3>Etiquetas</h3>
                <div class="listaEtiquetasDetalle">${producto.etiquetas.map(function(etiqueta) {
                    return `<span class="etiquetaDetalle" onclick="buscarPorEtiqueta('${etiqueta.replace(/'/g, "\\'")}')">${etiqueta}</span>`;
                }).join("")}</div>
            </div>
        `
        : "";

    const recomendadas = obtenerPublicacionesRecomendadas(producto);

    const recomendadasHTML = recomendadas.length
        ? `
            <div class="detalleSeccion">
                <h3>También te puede interesar</h3>
                <div class="listaRecomendadasDetalle">
                    ${recomendadas.map(function(p) {
                        return `
                            <div class="tarjetaRecomendadaDetalle" onclick="abrirProducto(${p.id})">
                                <img src="${escaparHTMLNivan(urlImagenNivan(p.imagen))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(p.nombre)}">
                                <p class="nombreRecomendadaDetalle">${escaparHTMLNivan(p.nombre)}</p>
                                <p class="precioRecomendadaDetalle">${simboloMonedaNivan()}${Number(p.precio).toLocaleString("es-AR")}</p>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `
        : "";

    // Galería de fotos/videos: si la publicación tiene varios medios
    // cargados (producto.medios) se arma un carrusel cuadrado con
    // todos; si es una publicación vieja con una sola imagen, se
    // muestra igual pero sin carrusel.
    const medios = Array.isArray(producto.medios) && producto.medios.length
        ? producto.medios
        : [{ tipo: "imagen", src: producto.imagen }];

    const galeriaHTML = medios.length > 1
        ? `
            <div class="galeriaProductoDetalle" id="galeriaProductoDetalle">
                ${medios.map(function(medio) {
                    return medio.tipo === "video"
                        ? `<video class="detalleProductoImagen" src="${medio.src}" controls playsinline${preloadVideoNivan()}></video>`
                        : `<img class="detalleProductoImagen" src="${urlImagenNivan(medio.src)}"${atributosImagenNivan()} alt="${escaparHTMLNivan(producto.nombre)}">`;
                }).join("")}
            </div>
            <div class="puntosGaleriaDetalle">
                ${medios.map(function(_, indice) {
                    return `<span class="puntoGaleriaDetalle ${indice === 0 ? "activo" : ""}"></span>`;
                }).join("")}
            </div>
        `
        : (medios[0].tipo === "video"
            ? `<video class="detalleProductoImagen" src="${medios[0].src}" controls playsinline${preloadVideoNivan()}></video>`
            : `<img class="detalleProductoImagen" src="${urlImagenNivan(medios[0].src)}"${atributosImagenNivan()} alt="${escaparHTMLNivan(producto.nombre)}">`);

    contenido.innerHTML = `
        <button type="button" class="cerrarProducto" onclick="cerrarProducto()">×</button>

        <div class="detalleProductoGrid">
            <div>
                ${galeriaHTML}
            </div>

            <div class="detalleProductoInfo">
                <h2>${escaparHTMLNivan(producto.nombre)}</h2>

                ${producto.marca ? `<p class="marcaProducto">${escaparHTMLNivan(producto.marca)}</p>` : ""}

                <p class="detallePrecio">
                    ${simboloMonedaNivan()}${Number(producto.precio).toLocaleString("es-AR")}
                </p>
                <p class="precioSinImpuestosNivan">${textoSinImpuestosNivan(producto.precio, producto.pais || "AR")}</p>

                <div class="avisoTipoVentaDetalle">${obtenerTextoTipoVentaPublicacion(producto)}</div>

                ${Array.isArray(producto.tramosPrecioMayor) && producto.tramosPrecioMayor.length ? `
                    <table class="tablaMayorDetalle">
                        <tr><th>Cantidad</th><th>Precio por unidad</th><th>Días para tenerla</th></tr>
                        ${producto.tramosPrecioMayor.map(function(tramo) {
                            const dias = tramo.dias != null ? tramo.dias : null;
                            const textoDias = dias == null ? "A consultar" : (dias === 0 ? "Al toque" : (dias + (dias === 1 ? " día" : " días")));
                            return `<tr><td>${tramo.cantidadMinima}+ unidades</td><td>${simboloMonedaNivan()}${Number(tramo.precio).toLocaleString("es-AR")}</td><td>${textoDias}</td></tr>`;
                        }).join("")}
                    </table>
                ` : ""}

                <div class="selectorCantidadDetalle">
                    <label for="cantidadCompraDetalle">Cantidad:</label>
                    <input
                        type="number"
                        id="cantidadCompraDetalle"
                        min="${producto.tipoVenta === "mayor" ? (producto.cantidadMinimaMayor || 1) : 1}"
                        value="${producto.tipoVenta === "mayor" ? (producto.cantidadMinimaMayor || 1) : 1}"
                        oninput="actualizarPrecioSegunCantidadDetalle(${producto.id})"
                    >
                </div>

                <p class="precioSegunCantidadDetalle" id="precioSegunCantidadDetalle"></p>

                <p>${producto.descripcion || "Prenda publicada en NIVAN."}</p>

                <div class="detalleTienda">
                    <strong class="vendedorClickeable" onclick="abrirPerfilVendedorDesdeProducto(${producto.id})">
                        Vendido por ${obtenerNombreVendedorProducto(producto)}
                    </strong>
                    ${obtenerEtiquetaVendedorHTML(producto)}
                    ${producto.reputacion ? `<p>${producto.reputacion}</p>` : ""}
                    ${producto.ventas ? `<p>${producto.ventas}</p>` : ""}
                </div>

                <p><strong>Colores:</strong></p>
                ${colores}

                <div class="infoStockEntrega">
                    <span>
                        <strong>Stock disponible</strong>
                        ${producto.stock !== undefined ? (producto.stock > 0 ? producto.stock + " unidad(es)" : "Sin stock por ahora") : "Consultar al vendedor"}
                    </span>
                    <span>
                        <strong>Tiempo a tener el producto disponible</strong>
                        ${producto.diasEntrega !== undefined ? producto.diasEntrega + " día(s)" : "Consultar al vendedor"}
                    </span>
                </div>

                <div class="detalleSeccion">
                    <h3>Elegí tu talle</h3>

                    <button type="button" class="ayudaTalleBtn" onclick="irAAyudaTalle()">
                        📏 ¿Qué talle me queda?
                    </button>

                    <div class="selectorTalle">
                        ${talles.map(function(talle, indice) {
                            return `
                                <button type="button"
                                    class="talleBtn ${indice === 0 ? "activo" : ""}"
                                    onclick="seleccionarTalle(this, ${producto.id})"
                                >
                                    ${talle}
                                </button>
                            `;
                        }).join("")}
                    </div>
                </div>

                <button type="button"
                    class="botonComprarDetalle"
                    onclick="comprarAhoraNivan(${producto.id}); cerrarProducto();"
                    style="margin-top:20px;"
                >
                    Comprar
                </button>

                <button type="button"
                    class="botonAgregarCarritoDetalle"
                    onclick="agregarAlCarrito(${producto.id}); cerrarProducto();"
                    style="margin-top:10px;"
                >
                    Agregar al carrito
                </button>

                <button type="button"
                    onclick="compartirProducto(${producto.id})"
                    style="margin-top:10px; background:transparent; border:1px solid #fff; color:#fff;"
                >
                    ↗ Compartir
                </button>

                <button type="button"
                    onclick="abrirPreguntaVendedor(${producto.id})"
                    style="margin-top:10px; background:transparent; border:1px solid #fff; color:#fff;"
                >
                    ❓ Preguntarle al vendedor
                </button>

                ${!usuarioActual || usuarioActual.id !== producto.vendedorId ? `
                    <button type="button"
                        class="botonAbrirReporteNivan"
                        onclick="abrirReporteNivan('publicacion', ${producto.id}, '${escaparHTMLNivan(producto.nombre).replace(/'/g, "\\'")}')"
                    >
                        🚩 Reportar publicación
                    </button>
                ` : ""}

                ${producto.vendedorId && (!usuarioActual || usuarioActual.id !== producto.vendedorId) ? `
                    <button type="button"
                        onclick="abrirChatConVendedorNivan(${producto.id})"
                        style="margin-top:10px; background:transparent; border:1px solid #fff; color:#fff;"
                    >
                        💬 Chatear con el vendedor
                    </button>
                ` : ""}

                ${actuaComoRevendedorEnPublicacion(producto) ? `
                    <div class="bloqueAMedidaDesdeReventa">
                        <p>¿Buscás algo parecido o te gustó pero lo querés a medida?</p>
                        <button type="button" onclick="pedirAMedidaDesdeProducto(${producto.id})">
                            Diseñame algo
                        </button>
                    </div>
                ` : ""}
            </div>
        </div>

        ${recomendadasHTML}

        ${tablaMedidasHTML}

        <div class="detalleSeccion">
            <h3>Comentarios</h3>
            ${comentarios}

            ${renderizarBloqueReseniaNivan(producto.id)}
        </div>

        ${renderizarHistoriaDetalle(producto)}

        ${etiquetasHTML}

    `;

    modal.classList.add("abierto");
    contenido.dataset.productoId = producto.id;
    document.body.style.overflow = "hidden";

    actualizarPrecioSegunCantidadDetalle(producto.id);

    // Si hay galería con varios medios, los puntitos de abajo se van
    // actualizando según qué foto/video quedó centrado al deslizar.
    const galeria = document.getElementById("galeriaProductoDetalle");
    if (galeria) {
        galeria.addEventListener("scroll", function() {
            const indice = Math.round(galeria.scrollLeft / galeria.clientWidth);
            document.querySelectorAll(".puntoGaleriaDetalle").forEach(function(punto, i) {
                punto.classList.toggle("activo", i === indice);
            });
        });
    }
}

// Recalcula, mientras el comprador cambia la cantidad en la ficha
// del producto, qué precio por unidad le corresponde (según los
// tramos mayoristas de la publicación) y muestra el subtotal.
function actualizarPrecioSegunCantidadDetalle(id) {
    const producto = productos.find(function(p) {
        return p.id === id;
    });

    const inputCantidad = document.getElementById("cantidadCompraDetalle");
    const textoPrecio = document.getElementById("precioSegunCantidadDetalle");

    if (!producto || !inputCantidad || !textoPrecio) return;

    let cantidad = Number(inputCantidad.value) || 1;

    const minimo = producto.tipoVenta === "mayor" ? (producto.cantidadMinimaMayor || 1) : 1;
    if (cantidad < minimo) {
        cantidad = minimo;
        inputCantidad.value = minimo;
    }

    const precioUnitario = calcularPrecioUnitarioSegunCantidad(producto, cantidad);
    const subtotal = precioUnitario * cantidad;

    textoPrecio.textContent = cantidad > 1
        ? `${simboloMonedaNivan()}${Number(precioUnitario).toLocaleString("es-AR")} c/u × ${cantidad} = ${simboloMonedaNivan()}${subtotal.toLocaleString("es-AR")}`
        : "";
}

function cerrarProducto() {
    const modal = document.getElementById("modalProducto");

    if (modal) {
        modal.classList.remove("abierto");
    }

    document.body.style.overflow = "";
}

// ==============================
// RESEÑAS REALES (con reglas)
// ==============================
// Solo puntúa quien compró la prenda y ya la recibió (pedido "entregado").
// Una sola puntuación con estrellas por persona y publicación, y hasta
// 2 comentarios en total. Pasado el plazo desde la entrega, o al usar los
// 2 comentarios, se cierra y solo quedan las preguntas al vendedor.
// Borrar un comentario NO devuelve el cupo (se guarda aparte).

const PLAZO_RESENIA_DIAS_NIVAN = 30;
const MAX_COMENTARIOS_PRODUCTO_NIVAN = 2;
const MAX_CARACTERES_RESENIA_NIVAN = 250;

let estrellaSeleccionada = 0;

function obtenerReseniasGuardadas(idProducto) {
    const todas = leerJSONNivan("nivanResenias", {});
    return todas[idProducto] || [];
}

function guardarResenia(idProducto, resenia) {
    const todas = leerJSONNivan("nivanResenias", {});
    if (!todas[idProducto]) todas[idProducto] = [];
    todas[idProducto].push(resenia);
    guardarJSONNivan("nivanResenias", todas);
}

function obtenerUsoReseniaNivan(idProducto) {
    const clave = idProducto + "|" + usuarioActual.id;
    const guardado = leerJSONNivan("nivanUsoResenias", {})[clave] || { puntuo: false, comentarios: 0 };
    // Cuenta también lo ya publicado (comentarios de antes de estas reglas).
    const propios = obtenerReseniasGuardadas(idProducto).filter(function(r) {
        return r.usuarioId ? r.usuarioId === usuarioActual.id : r.usuario === usuarioActual.nombre;
    });
    return {
        puntuo: !!guardado.puntuo || propios.some(function(r) { return r.estrellas && r.estrellas.indexOf("★") !== -1; }),
        comentarios: Math.max(guardado.comentarios || 0, propios.length)
    };
}

function registrarUsoReseniaNivan(idProducto, puntuo) {
    const todo = leerJSONNivan("nivanUsoResenias", {});
    const clave = idProducto + "|" + usuarioActual.id;
    const uso = obtenerUsoReseniaNivan(idProducto);
    todo[clave] = { puntuo: uso.puntuo || puntuo, comentarios: uso.comentarios + 1 };
    guardarJSONNivan("nivanUsoResenias", todo);
}

function fechaEntregaPedidoNivan(pedido) {
    const h = (pedido.historial || []).filter(function(x) { return x.estado === "entregado"; });
    return h.length ? h[h.length - 1].fecha : pedido.fecha;
}

function obtenerEstadoReseniaNivan(idProducto) {
    const r = function(puedeComentar, yaPuntuo, mensaje) {
        return { puedeComentar: puedeComentar, yaPuntuo: yaPuntuo, mensaje: mensaje };
    };

    if (!usuarioActual) return r(false, false, "Consultá al vendedor.");

    const producto = productos.find(function(p) { return String(p.id) === String(idProducto); });
    if (producto && producto.vendedorId && producto.vendedorId === usuarioActual.id) return r(false, false, "No podés puntuar tus propias publicaciones.");

    const pedidos = obtenerPedidosNivan().filter(function(p) {
        return esCompradorDelPedidoNivan(p) && (p.items || []).some(function(it) { return String(it.id) === String(idProducto); });
    });

    if (!pedidos.length) return r(false, false, "Solo pueden puntuar quienes compraron esta prenda y ya la recibieron. Podés hacer preguntas al vendedor.");

    const entregados = pedidos.filter(function(p) { return p.estado === "entregado"; });
    if (!entregados.length) return r(false, false, "Tu pedido todavía no llegó. Cuando confirmes que lo recibiste vas a poder puntuar. Mientras tanto, podés hacer preguntas.");

    const uso = obtenerUsoReseniaNivan(idProducto);
    const entrega = Math.max.apply(null, entregados.map(fechaEntregaPedidoNivan));
    const diasRestantes = Math.ceil((PLAZO_RESENIA_DIAS_NIVAN * 86400000 - (Date.now() - entrega)) / 86400000);

    if (uso.comentarios >= MAX_COMENTARIOS_PRODUCTO_NIVAN) return r(false, true, "Ya usaste tus " + MAX_COMENTARIOS_PRODUCTO_NIVAN + " comentarios en esta publicación. Ahora solo podés hacer preguntas al vendedor.");
    if (diasRestantes <= 0) return r(false, uso.puntuo, "Pasaron " + PLAZO_RESENIA_DIAS_NIVAN + " días desde que recibiste la prenda y ya no se puede puntuar. Solo podés hacer preguntas al vendedor.");

    const quedan = MAX_COMENTARIOS_PRODUCTO_NIVAN - uso.comentarios;
    return r(true, uso.puntuo, (uso.puntuo ? "Ya puntuaste con estrellas (es una sola vez). " : "Podés puntuar una sola vez. ") +
        "Te " + (quedan === 1 ? "queda 1 comentario" : "quedan " + quedan + " comentarios") + " y " + diasRestantes + (diasRestantes === 1 ? " día" : " días") + " para hacerlo.");
}

function renderizarBloqueReseniaNivan(idProducto) {
    estrellaSeleccionada = 0;
    const est = obtenerEstadoReseniaNivan(idProducto);
    const id = Number(idProducto);

    // Sin compra, sin entrega, o sin cupo: no se muestra nada (ni explicación).
    if (!est.puedeComentar) return "";

    const aviso = `<div class="avisoReseniaNivan"><p>${escaparHTMLNivan(est.mensaje)}</p></div>`;

    const estrellas = est.yaPuntuo ? "" : `
        <div class="estrellasInput" id="estrellasInput">
            ${[1, 2, 3, 4, 5].map(function(n) {
                return `<span class="estrellaInput" onclick="seleccionarEstrella(${n})">★</span>`;
            }).join("")}
        </div>`;

    return `
        <div class="formResenia">
            <h4>${est.yaPuntuo ? "Dejá otro comentario" : "Dejá tu reseña"}</h4>
            ${aviso}
            ${estrellas}
            <textarea id="textoResenia" maxlength="${MAX_CARACTERES_RESENIA_NIVAN}" placeholder="Contá cómo te quedó, la calidad, la atención..."></textarea>
            <button type="button" onclick="enviarResenia(${id})">Enviar ${est.yaPuntuo ? "comentario" : "reseña"}</button>
        </div>`;
}

function seleccionarEstrella(valor) {
    estrellaSeleccionada = valor;

    document.querySelectorAll("#estrellasInput .estrellaInput").forEach(function(el, indice) {
        el.classList.toggle("activa", indice < valor);
    });
}

function enviarResenia(idProducto) {
    if (!usuarioActual) {
        alert("Iniciá sesión para dejar una reseña.");
        abrirCuenta();
        return;
    }
    if (!exigirPuedeReclamarNivan()) return;

    // Se vuelve a chequear todo acá (no alcanza con esconder el formulario).
    const est = obtenerEstadoReseniaNivan(idProducto);

    if (!est.puedeComentar) {
        alert("No podés comentar esta publicación.");
        abrirProducto(idProducto);
        return;
    }

    if (!est.yaPuntuo && estrellaSeleccionada === 0) {
        alert("Elegí una cantidad de estrellas antes de enviar.");
        return;
    }

    const texto = limpiarTextoNivan(document.getElementById("textoResenia").value, MAX_CARACTERES_RESENIA_NIVAN).trim();

    if (!texto) {
        alert("Escribí tu opinión antes de enviarla.");
        return;
    }

    const resenia = {
        usuario: obtenerNombreMostradoUsuario(usuarioActual),
        usuarioId: usuarioActual.id,
        texto: texto,
        estrellas: est.yaPuntuo ? "" : "★".repeat(estrellaSeleccionada) + "☆".repeat(5 - estrellaSeleccionada)
    };

    guardarResenia(idProducto, resenia);
    registrarUsoReseniaNivan(idProducto, !est.yaPuntuo);

    const productoResenado = productos.find(function(p) {
        return p.id === idProducto;
    });

    if (productoResenado && productoResenado.vendedorId && productoResenado.vendedorId !== usuarioActual.id) {
        crearNotificacion(productoResenado.vendedorId, {
            tipo: "resenia",
            icono: "⭐",
            titulo: "Nueva reseña",
            texto: `${escaparHTMLNivan(usuarioActual.nombre)} dejó ${resenia.estrellas || "un comentario"} en "${escaparHTMLNivan(productoResenado.nombre)}"`,
            productoId: idProducto
        });
    }

    abrirProducto(idProducto);

    const despues = obtenerEstadoReseniaNivan(idProducto);
    if (!despues.puedeComentar) alert("Llegaste al límite de comentarios.");
}

