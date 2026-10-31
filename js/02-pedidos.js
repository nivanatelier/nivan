  // ==============================
// FAVORITOS
// ==============================

// Los favoritos son de cada cuenta: se guardan con el id de quien tiene la sesión
// iniciada. Sin sesión se guardan aparte (como invitado) y, al iniciar sesión,
// pasan a la cuenta para no perderlos.
function claveFavoritosNivan() {
    return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id)
        ? "nivanFavoritos_" + usuarioActual.id
        : "nivanFavoritos";
}

// Vuelve a cargar los favoritos de quien está usando la app ahora.
// Se llama al abrir la app y cada vez que se inicia o se cierra una sesión.
function sincronizarFavoritosConCuentaNivan(refrescar) {
    const deInvitado = leerJSONNivan("nivanFavoritos", []);
    const invitado = Array.isArray(deInvitado) ? deInvitado : [];
    let lista;

    if (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) {
        const propios = leerJSONNivan(claveFavoritosNivan(), []);
        lista = Array.isArray(propios) ? propios : [];

        if (invitado.length) {
            invitado.forEach(function(id) { if (lista.indexOf(id) === -1) lista.push(id); });
            if (guardarJSONNivan(claveFavoritosNivan(), lista)) {
                try { localStorage.removeItem("nivanFavoritos"); } catch (e) {}
            }
        }
    } else {
        lista = invitado;
    }

    favoritos = lista;

    if (!refrescar) return;
    try {
        actualizarFavoritos();
        mostrarProductos(productos);
        mostrarProductos(productos, "productosBusqueda");
        if (typeof renderizarFavoritos === "function") renderizarFavoritos();
    } catch (e) {}
}

function toggleFavorito(id) {
    if (favoritos.includes(id)) {
        favoritos = favoritos.filter(function(favoritoId) { return favoritoId !== id; });
        mostrarToastNivan('Producto eliminado de favoritos');
    } else {
        favoritos.push(id);
        registrarPrecioSeguido(id);
        registrarActividadProducto(id, "favorito");
        mostrarToastNivan('Producto agregado a favoritos ♡');
    }
    guardarJSONNivan(claveFavoritosNivan(), favoritos);
    actualizarFavoritos();
    mostrarProductos(productos);
    mostrarProductos(productos, "productosBusqueda");
    renderizarFavoritos();
}


function actualizarFavoritos() {

    document
        .getElementById("cantidadFavoritos")
        .textContent =
        favoritos.length;

}

// COMPARTIR PUBLICACIÓN

// Arma un link a la publicación. Si la app ya está online (http/https)
// arma "?producto=ID" para que, al abrirlo, se abra directo esa ficha
// (ver abrirProductoDesdeURL). Si se está probando local (file://,
// como al abrir el HTML desde Acode) no hay una URL real para
// compartir, así que devolvemos null y compartirProducto() se apoya
// solo en el texto.
function construirUrlProducto(idProducto) {
    if (location.protocol !== "http:" && location.protocol !== "https:") {
        return null;
    }

    const base = location.origin + location.pathname;
    return base + "?producto=" + idProducto;
}

// Copia texto al portapapeles probando primero la Clipboard API
// (requiere contexto seguro: https, o localhost) y, si no está
// disponible, con el método viejo de textarea + execCommand, que
// funciona en más navegadores/webviews (como el de Acode).
function copiarAlPortapapeles(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        return navigator.clipboard.writeText(texto).then(
            function() { return true; },
            function() { return copiarConExecCommand(texto); }
        );
    }
    return Promise.resolve(copiarConExecCommand(texto));
}

function copiarConExecCommand(texto) {
    try {
        const textarea = document.createElement("textarea");
        textarea.value = texto;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copiado = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copiado;
    } catch (error) {
        return false;
    }
}

function compartirProducto(idProducto) {
    const producto = productos.find(function(p) {
        return p.id === idProducto;
    });

    if (!producto) return;

    const url = construirUrlProducto(idProducto);
    const texto = `Mirá "${escaparHTMLNivan(producto.nombre)}" en NIVAN — ${simboloMonedaNivan(producto.pais)}${producto.precio.toLocaleString("es-AR")}`;
    const textoCompleto = url ? texto + " " + url : texto;

    // navigator.share no existe (o falla siempre) en contextos no
    // seguros como file://, que es como se suele abrir el HTML
    // mientras se lo desarrolla en Acode. Por eso, si falla, en vez
    // de quedarnos en silencio pasamos directo al respaldo manual.
    if (navigator.share && window.isSecureContext) {
        // Ojo: si estamos en file:// no mandamos "url" (mandar la ruta
        // del archivo local como URL hace que algunos navegadores
        // rechacen el share() al toque, y ese rechazo a veces ni
        // siquiera llega como promesa rechazada sino como excepción
        // sincrónica que corta la ejecución sin avisar nada).
        const datosCompartir = url
            ? { title: "NIVAN", text: texto, url: url }
            : { title: "NIVAN", text: texto };

        try {
            navigator.share(datosCompartir).catch(function(error) {
                if (error && error.name === "AbortError") return;
                abrirCompartirManual(textoCompleto);
            });
        } catch (error) {
            abrirCompartirManual(textoCompleto);
        }

        return;
    }

    copiarAlPortapapeles(textoCompleto).then(function(copiado) {
        if (copiado) {
            mostrarToastNivan("Copiado para compartir 🔗");
        } else {
            abrirCompartirManual(textoCompleto);
        }
    });
}

// Respaldo cuando no se pudo compartir ni copiar solo: mostramos
// el texto en un campo seleccionable, un botón para copiarlo a
// mano y un link directo a WhatsApp (muy usado para vender ropa),
// que abre igual aunque la Web Share API no esté disponible.
function abrirCompartirManual(texto) {
    const input = document.getElementById("textoCompartirManual");
    const botonWhatsapp = document.getElementById("botonCompartirWhatsapp");

    if (input) {
        input.value = texto;
    }

    if (botonWhatsapp) {
        botonWhatsapp.onclick = function() {
            window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank");
        };
    }

    document.getElementById("overlayCompartirNivan").classList.add("abierto");

    if (input) {
        setTimeout(function() {
            input.select();
        }, 100);
    }
}

function cerrarCompartirManual() {
    document.getElementById("overlayCompartirNivan").classList.remove("abierto");
}

function copiarTextoCompartirManual() {
    const input = document.getElementById("textoCompartirManual");
    if (!input) return;

    copiarAlPortapapeles(input.value).then(function(copiado) {
        if (copiado) {
            mostrarToastNivan("Copiado para compartir 🔗");
        } else {
            input.select();
            alert("No se pudo copiar automáticamente. El texto ya está seleccionado: usá copiar del menú del celular.");
        }
    });
}

// Si se entra a la app con un link de "compartir" (?producto=ID),
// abrimos directo la ficha de esa publicación.
function abrirProductoDesdeURL() {
    const parametros = new URLSearchParams(location.search);
    const idProducto = Number(parametros.get("producto"));

    if (!idProducto) return;

    const existe = productos.some(function(p) {
        return p.id === idProducto;
    });

    if (existe) {
        abrirProducto(idProducto);
    }
}

// ==============================
// SISTEMA DE NOTIFICACIONES
// ==============================
// Por ahora todo vive en este mismo dispositivo (localStorage), así
// que las notificaciones son un resumen de lo que ya pasó (preguntas,
// respuestas, reseñas, pedidos) filtrado por usuario. El día que haya
// backend real, guardarNotificacion() es el único lugar que hay que
// cambiar para que en vez de guardar local, mande la notificación al
// servidor/push.

// Todas las notificaciones de todos los usuarios, agrupadas por id
// de usuario, para poder simular varias cuentas en el mismo celular.
function obtenerTodasLasNotificaciones() {
    return leerJSONNivan("nivanNotificaciones", {});
}

function guardarTodasLasNotificaciones(todas) {
    guardarJSONNivan("nivanNotificaciones", todas);
}

// País del pedido al que apunta una notificación (si lo hay).
let cachePaisPedidosNivan = { crudo: null, mapa: null };

function paisPedidoNotificacionNivan(idPedido) {
    if (!idPedido) return null;

    let crudo = "";
    try { crudo = localStorage.getItem("nivanPedidos") || ""; } catch (e) {}

    if (cachePaisPedidosNivan.crudo !== crudo || !cachePaisPedidosNivan.mapa) {
        const mapa = {};
        obtenerPedidosNivan().forEach(function(p) {
            if (p && !(p.id in mapa)) mapa[p.id] = p.pais || null;
        });
        cachePaisPedidosNivan = { crudo: crudo, mapa: mapa };
    }

    return cachePaisPedidosNivan.mapa[idPedido] || null;
}

// País al que pertenece una notificación. Las viejas, sin país guardado,
// toman el del pedido y, si no tienen, cuentan como de Argentina.
function paisDeNotificacionNivan(n) {
    return n.pais || paisPedidoNotificacionNivan(n.pedidoId) || "AR";
}

// Avisos que son de la tienda; el resto es del perfil personal. Los que dependen
// de un pedido o de un chat se resuelven mirando de qué lado estaba esta persona.
const TIPOS_NOTIFICACION_DE_TIENDA_NIVAN = ["pregunta", "resenia", "venta", "ventaEstado", "calificacion"];

// A qué cuenta ("tienda" | "personal") pertenece una notificación.
// `cache` sirve para no leer los chats y pedidos una vez por aviso.
function cuentaDeNotificacionNivan(n, idUsuario, cache) {
    if (n.cuenta === "tienda" || n.cuenta === "personal") return n.cuenta;

    if (n.tipo === "mensaje" && n.chatId) {
        if (!cache.chats) cache.chats = obtenerChatsNivan();
        const chat = cache.chats.find(function(c) { return c.id === n.chatId; });
        return chat ? identidadEnChatNivan(chat, idUsuario) : "personal";
    }

    if (n.tipo === "solicitudPerfil") return n.ambito === "personal" ? "personal" : "tienda";

    if (n.pedidoId) {
        if (!cache.pedidos) cache.pedidos = obtenerPedidosNivan();
        const pedido = cache.pedidos.find(function(p) { return p.id === n.pedidoId; });
        if (pedido) return pedido.vendedorId === idUsuario ? "tienda" : "personal";
    }

    return TIPOS_NOTIFICACION_DE_TIENDA_NIVAN.indexOf(n.tipo) !== -1 ? "tienda" : "personal";
}

// Quien tiene tienda ve solo las notificaciones de la cuenta que está usando.
function notifEsDeCuentaActivaNivan(n, cache) {
    if (!usuarioActual || !usuarioTieneCuentaTiendaNivan(usuarioActual.id)) return true;
    return cuentaDeNotificacionNivan(n, usuarioActual.id, cache || {}) === modoCuentaNivan();
}

// Solo devuelve las notificaciones del país en el que está la app ahora
// y, si tenés tienda, de la cuenta que estás usando.
function obtenerNotificacionesDeUsuario(idUsuario) {
    const todas = obtenerTodasLasNotificaciones();
    const paisActual = paisNivan() || "AR";
    const cache = {};
    const filtrarCuenta = !!usuarioActual && usuarioActual.id === idUsuario && usuarioTieneCuentaTiendaNivan(idUsuario);
    const modo = filtrarCuenta ? modoCuentaNivan() : null;

    return (todas[idUsuario] || []).filter(function(n) {
        if (paisDeNotificacionNivan(n) !== paisActual) return false;
        return !filtrarCuenta || cuentaDeNotificacionNivan(n, idUsuario, cache) === modo;
    });
}

// tipo: "pregunta" | "respuesta" | "resenia" | "venta" | "pedido"
//       | "pedidoEstado" (al comprador: cambió el estado de su pedido)
//       | "ventaEstado" (al vendedor: el comprador confirmó la entrega)
function crearNotificacion(idUsuario, datos) {
    if (!idUsuario) return;

    const todas = obtenerTodasLasNotificaciones();
    const lista = todas[idUsuario] || [];

    lista.unshift({
        id: "NOT-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        tipo: datos.tipo,
        icono: datos.icono || "🔔",
        titulo: datos.titulo,
        texto: datos.texto,
        productoId: datos.productoId || null,
        pedidoId: datos.pedidoId || null,
        chatId: datos.chatId || null,
        usuarioId: datos.usuarioId || null,
        cuponCodigo: datos.cuponCodigo || null,
        ambito: datos.ambito || null,
        cuenta: datos.cuenta || null,
        pais: datos.pais || paisPedidoNotificacionNivan(datos.pedidoId) || paisNivan() || "AR",
        fecha: Date.now(),
        leida: false
    });

    todas[idUsuario] = lista;
    guardarTodasLasNotificaciones(todas);

    // Si el que recibe la notificación es quien tiene la app abierta
    // ahora mismo, refrescamos el contador de la campanita al toque.
    if (usuarioActual && usuarioActual.id === idUsuario) {
        actualizarBadgeNotificaciones();
    }
}

function formatearFechaNotificacion(timestamp) {
    const diferenciaMinutos = Math.round((Date.now() - timestamp) / 60000);

    if (diferenciaMinutos < 1) return "Recién";
    if (diferenciaMinutos < 60) return diferenciaMinutos + " min";

    const diferenciaHoras = Math.round(diferenciaMinutos / 60);
    if (diferenciaHoras < 24) return diferenciaHoras + " h";

    return new Date(timestamp).toLocaleDateString("es-AR");
}

function actualizarBadgeNotificaciones() {
    actualizarContadoresChatNivan();

    const badge = document.getElementById("badgeNotificaciones");
    if (!badge) return;

    if (!usuarioActual) {
        badge.classList.remove("visible");
        return;
    }

    const noLeidas = obtenerNotificacionesDeUsuario(usuarioActual.id).filter(function(n) {
        return !n.leida;
    }).length;

    if (noLeidas > 0) {
        badge.textContent = noLeidas > 9 ? "9+" : noLeidas;
        badge.classList.add("visible");
    } else {
        badge.classList.remove("visible");
    }
}

// ---- Botones en los avisos de compra: charlar con el vendedor, devolución y reembolso ----

function botonUsarCuponNotifHTMLNivan(codigo) {
    const guardado = !!usuarioActual && obtenerCuponesGuardadosNivan().map(normalizarCodigoCuponNivan).indexOf(normalizarCodigoCuponNivan(codigo)) !== -1;
    return guardado
        ? `<button type="button" class="botonUsarCuponNotifNivan" disabled>Agregado ✓</button>`
        : `<button type="button" class="botonUsarCuponNotifNivan" onclick="usarCuponEnviadoNivan('${escaparHTMLNivan(codigo)}', event)">Usar</button>`;
}

// Botones del pedido en Mis compras. Si la compra no tiene vendedor, no hace nada.
function accionPedidoTarjetaNivan(idPedido, accion) {
    const p = obtenerPedidosNivan().find(function(x) { return x.id === idPedido; });
    if (!p || !p.vendedorId) return;
    ejecutarAccionPedidoNivan(idPedido, accion);
}

function ejecutarAccionPedidoNivan(idPedido, accion) {
    const p = obtenerPedidosNivan().find(function(x) { return x.id === idPedido; });
    if (!p) return;

    if (accion === "chat") {
        if (!p.vendedorId) {
            alert("Esta compra es de una prenda del catálogo de NIVAN: no tiene un vendedor con quien charlar.");
            return;
        }
        abrirChatDePedidoNivan(idPedido);
        return;
    }

    abrirReclamoNivan(idPedido, accion);
}

function renderizarNotificaciones() {
    const contenedor = document.getElementById("listaNotificacionesNivan");
    const botonMarcarLeidas = document.getElementById("marcarLeidasBtn");
    const botonBorrarTodas = document.getElementById("borrarNotifBtn");
    if (!contenedor) return;

    if (!usuarioActual) {
        botonMarcarLeidas.style.display = "none";
        if (botonBorrarTodas) botonBorrarTodas.style.display = "none";
        contenedor.innerHTML = `
            <div class="paginaVacia">
                <div class="paginaIcono">🔔</div>
                <strong>Iniciá sesión para ver tus notificaciones</strong>
                <span>Ahí vas a ver preguntas, respuestas, reseñas, pedidos y bajas de precio.</span>
            </div>
        `;
        return;
    }

    const notificaciones = obtenerNotificacionesDeUsuario(usuarioActual.id);

    if (!notificaciones.length) {
        botonMarcarLeidas.style.display = "none";
        if (botonBorrarTodas) botonBorrarTodas.style.display = "none";
        contenedor.innerHTML = `
            <div class="paginaVacia">
                <div class="paginaIcono">🔔</div>
                <strong>No tenés notificaciones nuevas</strong>
                <span>Te avisaremos cuando haya novedades.</span>
            </div>
        `;
        return;
    }

    const hayNoLeidas = notificaciones.some(function(n) {
        return !n.leida;
    });
    botonMarcarLeidas.style.display = hayNoLeidas ? "block" : "none";
    if (botonBorrarTodas) botonBorrarTodas.style.display = "block";

    contenedor.innerHTML = `
        <div class="listaNotificacionesNivan">
            ${notificaciones.map(function(n) {
                return `
                    <div class="notificacionItem ${n.leida ? "" : "noLeida"}" onclick="abrirNotificacion('${n.id}')">
                        <div class="notificacionIcono">${n.icono}</div>
                        <div class="notificacionTexto">
                            <strong>${n.titulo}</strong>
                            <span>${n.texto}</span>
                            <small>${formatearFechaNotificacion(n.fecha)}</small>
                            ${n.tipo === "cupon" && n.cuponCodigo ? botonUsarCuponNotifHTMLNivan(n.cuponCodigo) : ""}
                        </div>
                        <button type="button" class="eliminarNotifItemBtn" onclick="eliminarNotificacion(event, '${n.id}')" aria-label="Eliminar notificación" title="Eliminar">✕</button>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

// Saca una notificación puntual, sin tocar las demás.
function eliminarNotificacion(evento, idNotificacion) {
    if (evento) evento.stopPropagation();
    if (!usuarioActual) return;

    const todas = obtenerTodasLasNotificaciones();
    const lista = todas[usuarioActual.id] || [];

    todas[usuarioActual.id] = lista.filter(function(n) {
        return n.id !== idNotificacion;
    });

    guardarTodasLasNotificaciones(todas);
    actualizarBadgeNotificaciones();
    renderizarNotificaciones();
}

// Pide confirmación antes de borrar todo, porque no se puede deshacer.
function confirmarEliminarTodasLasNotificaciones() {
    if (!usuarioActual) return;
    if (!confirm("¿Borrar todas las notificaciones? Esta acción no se puede deshacer.")) return;
    eliminarTodasLasNotificaciones();
}

function eliminarTodasLasNotificaciones() {
    if (!usuarioActual) return;

    const todas = obtenerTodasLasNotificaciones();
    const paisActual = paisNivan() || "AR";

    // Sólo se borran las del país en el que está la app ahora, igual que
    // "marcar todas como leídas": las de otros países quedan intactas.
    const lista = todas[usuarioActual.id] || [];
    const cacheBorrar = {};
    todas[usuarioActual.id] = lista.filter(function(n) {
        return !(paisDeNotificacionNivan(n) === paisActual && notifEsDeCuentaActivaNivan(n, cacheBorrar));
    });

    guardarTodasLasNotificaciones(todas);
    actualizarBadgeNotificaciones();
    renderizarNotificaciones();
}

function marcarNotificacionLeida(idNotificacion) {
    if (!usuarioActual) return;

    const todas = obtenerTodasLasNotificaciones();
    const lista = todas[usuarioActual.id] || [];

    const notificacion = lista.find(function(n) {
        return n.id === idNotificacion;
    });

    if (notificacion) {
        notificacion.leida = true;
        todas[usuarioActual.id] = lista;
        guardarTodasLasNotificaciones(todas);
        actualizarBadgeNotificaciones();
    }

    return notificacion;
}

function marcarTodasLasNotificacionesLeidas() {
    if (!usuarioActual) return;

    const todas = obtenerTodasLasNotificaciones();
    const lista = todas[usuarioActual.id] || [];

    const paisActual = paisNivan() || "AR";

    const cacheLeidas = {};
    lista.forEach(function(n) {
        if (paisDeNotificacionNivan(n) === paisActual && notifEsDeCuentaActivaNivan(n, cacheLeidas)) n.leida = true;
    });

    todas[usuarioActual.id] = lista;
    guardarTodasLasNotificaciones(todas);
    actualizarBadgeNotificaciones();
    renderizarNotificaciones();
}

// Al tocar una notificación la marcamos como leída y, si tiene una
// publicación asociada, llevamos directo a esa ficha (con el panel
// de preguntas abierto si era justo ese el motivo del aviso).
function abrirNotificacion(idNotificacion) {
    const notificacion = marcarNotificacionLeida(idNotificacion);
    renderizarNotificaciones();

    if (!notificacion) return;

    // Avisos de pedidos: llevan a Mis compras (comprador) o Mis ventas (vendedor).
    if (notificacion.tipo === "pedido" || notificacion.tipo === "pedidoEstado") {
        abrirMisCompras();
        return;
    }

    if (notificacion.tipo === "venta" && notificacion.pedidoId) {
        abrirGestionPedidosNivan();
        return;
    }

    if (notificacion.tipo === "ventaEstado" || notificacion.tipo === "calificacion") {
        abrirMisVentas();
        return;
    }

    // Alguien se postuló a una vacante de la tienda.
    if (notificacion.tipo === "postulacion") {
        abrirPanelVacantesNivan();
        return;
    }

    if (notificacion.tipo === "mensaje" && notificacion.chatId) {
        abrirChatDesdeListaNivan(notificacion.chatId);
        return;
    }

    // Aviso de verificación (aprobada o rechazada): lleva al estado de verificación.
    if (notificacion.tipo === "verificacion") {
        abrirEstadoVerificacionNivan();
        return;
    }

    if (notificacion.tipo === "seguidor" && notificacion.usuarioId) {
        abrirPerfilDeClaveNivan(notificacion.usuarioId);
        return;
    }

    if (notificacion.tipo === "solicitudPerfil") {
        abrirSolicitudPerfilDesdeNotificacionNivan(notificacion);
        return;
    }

    if (notificacion.tipo === "solicitudAceptada" && notificacion.usuarioId) {
        abrirPerfilDeClaveNivan(notificacion.usuarioId);
        return;
    }

    if (notificacion.tipo === "cupon") {
        abrirTusCuponesNivan();
        return;
    }

    if (!notificacion.productoId) return;

    const existeProducto = productos.some(function(p) {
        return p.id === notificacion.productoId;
    });

    if (!existeProducto) return;

    if (notificacion.tipo === "pregunta") {
        abrirPreguntasComoVendedor(notificacion.productoId);
    } else if (notificacion.tipo === "respuesta") {
        abrirPreguntaVendedor(notificacion.productoId);
    } else {
        abrirProducto(notificacion.productoId);
    }
}

// ==============================
// PEDIDOS: MIS COMPRAS / MIS VENTAS
// ==============================
// Cada compra se guarda en "nivanPedidos" (localStorage). Si el carrito
// tenía prendas de varios vendedores, se parte en un pedido por vendedor
// (mismo N.º de compra, sufijo -1, -2...) para que cada uno pueda marcar
// SU envío. Estados: pendiente -> preparando -> listo -> enviado (los marca
// el vendedor, ver js/25-gestion-pedidos.js) -> entregado (lo confirma el
// comprador). "cancelado" lo marca el vendedor. Cada cambio avisa por notificación.

const ESTADOS_PEDIDO_NIVAN = {
    pendiente: { icono: "⏳", texto: "Pendiente" },
    preparando: { icono: "🧵", texto: "Preparando" },
    listo: { icono: "📦", texto: "Listo" },
    enviado: { icono: "🚚", texto: "Enviado" },
    entregado: { icono: "✅", texto: "Entregado" },
    cancelado: { icono: "🚫", texto: "Cancelado" }
};

function escaparHTMLNivan(texto) {
    return String(texto == null ? "" : texto).replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

function obtenerPedidosNivan() {
    return leerJSONNivan("nivanPedidos", []);
}

// Pedidos del país en el que está la app ahora (los viejos sin país cuentan como de Argentina).
function obtenerPedidosDelPaisNivan() {
    const paisActual = paisNivan() || "AR";
    return obtenerPedidosNivan().filter(function(p) {
        return (p.pais || "AR") === paisActual;
    });
}

function guardarPedidosNivan(lista) {
    try {
        localStorage.setItem("nivanPedidos", JSON.stringify(lista));
    } catch (e) {
        console.warn("No se pudieron guardar los pedidos", e);
    }
}

// Se llama al confirmar la compra, con el carrito todavía cargado.
function registrarPedidosNivan(numeroPedido, datos) {
    const grupos = [];

    carrito.forEach(function(item) {
        const clave = item.vendedorId || "";
        let grupo = grupos.find(function(g) { return g.vendedorId === clave; });

        if (!grupo) {
            grupo = { vendedorId: clave, vendedorNombre: obtenerNombreVendedorProducto(item), items: [] };
            grupos.push(grupo);
        }

        grupo.items.push({
            id: item.id,
            nombre: item.nombre,
            cantidad: Number(item.cantidad) || 1,
            precioUnitario: item.precioUnitario != null ? Number(item.precioUnitario) : Number(item.precio),
            talle: item.talleElegido || "",
            color: item.colorElegido || ""
        });
    });

    const ahora = Date.now();

    // El cupón (si hay uno aplicado) sólo descuenta del pedido del
    // vendedor al que pertenece, nunca del de otro vendedor del mismo
    // carrito.
    const cuponParaRegistro = datos.cupon || null;

    const nuevos = grupos.map(function(g, i) {
        const subtotalGrupo = g.items.reduce(function(acum, it) { return acum + it.precioUnitario * it.cantidad; }, 0);
        const aplicaCupon = cuponParaRegistro && cuponParaRegistro.vendedorId === (g.vendedorId || "");
        const descuentoGrupo = aplicaCupon ? Math.min(cuponParaRegistro.descuento, subtotalGrupo) : 0;

        return {
            id: grupos.length > 1 ? numeroPedido + "-" + (i + 1) : numeroPedido,
            numeroPedido: numeroPedido,
            compradorId: usuarioActual ? usuarioActual.id : null,
            compradorNombre: datos.nombre,
            compradorEmail: datos.email,
            compradorTelefono: datos.telefono,
            vendedorId: g.vendedorId || null,
            vendedorNombre: g.vendedorNombre,
            envio: datos.envio,
            pago: datos.pago,
            direccion: datos.direccion,
            ciudad: datos.ciudad,
            codigoPostal: datos.codigoPostal,
            items: g.items,
            subtotal: subtotalGrupo,
            cupon: aplicaCupon ? { codigo: cuponParaRegistro.codigo, descuento: descuentoGrupo } : null,
            total: Math.max(0, subtotalGrupo - descuentoGrupo),
            pais: paisNivan() || "AR",
            fecha: ahora,
            estado: "pendiente",
            historial: [{ estado: "pendiente", fecha: ahora }]
        };
    });

    guardarPedidosNivan(nuevos.concat(obtenerPedidosNivan()));
    return nuevos;
}

function esCompradorDelPedidoNivan(pedido) {
    if (!usuarioActual) return false;
    if (pedido.compradorId) return pedido.compradorId === usuarioActual.id;
    // Compra hecha sin sesión: la reconocemos por el email que puso.
    return !!pedido.compradorEmail && !!usuarioActual.email &&
        pedido.compradorEmail.toLowerCase() === usuarioActual.email.toLowerCase();
}

function obtenerImagenItemPedidoNivan(item) {
    const producto = productos.find(function(p) { return p.id === item.id; });
    if (!producto) return "";

    if (Array.isArray(producto.medios)) {
        const medio = producto.medios.find(function(m) { return m.tipo === "imagen" && m.src; });
        if (medio) return medio.src;
    }

    return producto.imagen || "";
}

// Empresa y código de seguimiento que el vendedor cargó al despachar (opcional).
function textoSeguimientoPedidoNivan(p) {
    const s = p.seguimiento;
    if (!s || (!s.codigo && !s.empresa)) return "";
    return `<span>📮 ${[s.empresa, s.codigo].filter(Boolean).map(escaparHTMLNivan).join(" · ")}</span>`;
}

function generarTarjetaPedidoNivan(p, modo) {
    const pasos = ["pendiente", "preparando", "listo", "enviado", "entregado"];
    const cancelado = p.estado === "cancelado";
    const indiceActual = Math.max(0, pasos.indexOf(p.estado));
    const est = ESTADOS_PEDIDO_NIVAN[p.estado] || ESTADOS_PEDIDO_NIVAN.pendiente;
    const ultimo = (p.historial && p.historial.length) ? p.historial[p.historial.length - 1] : null;

    const tracker = cancelado
        ? `<div class="calificacionPedidoNivan">
            <strong>🚫 Pedido cancelado${modo === "compra" ? " por el vendedor" : ""}</strong>
            ${p.cancelacion && p.cancelacion.motivo ? `<p>Motivo: ${escaparHTMLNivan(p.cancelacion.motivo)}</p>` : ""}
            ${p.cancelacion && p.cancelacion.comentario ? `<p>${escaparHTMLNivan(p.cancelacion.comentario)}</p>` : ""}
        </div>`
        : pasos.map(function(paso, i) {
            return `
            <div class="pasoPedidoNivan ${i <= indiceActual ? "activo" : ""}">
                <span>${ESTADOS_PEDIDO_NIVAN[paso].icono}</span>
                <small>${ESTADOS_PEDIDO_NIVAN[paso].texto}</small>
            </div>
        `;
        }).join("");

    const items = p.items.map(function(it) {
        const img = obtenerImagenItemPedidoNivan(it);
        const foto = img
            ? `<img src="${escaparHTMLNivan(urlImagenNivan(img))}"${atributosImagenNivan()} alt="">`
            : `<div class="itemPedidoNivanSinFoto">👕</div>`;
        const opciones = [];
        if (it.talle) opciones.push("Talle " + escaparHTMLNivan(it.talle));
        if (it.color) opciones.push("Color " + escaparHTMLNivan(String(it.color).toUpperCase()));

        return `
            <div class="itemPedidoNivan">
                ${foto}
                <div class="textoItemPedidoNivan">
                    <strong>${escaparHTMLNivan(it.nombre)}</strong>
                    ${opciones.length ? `<p>${opciones.join(" · ")}</p>` : ""}
                    <p>${it.cantidad > 1
                        ? `${it.cantidad} × ${simboloMonedaNivan(p.pais)}${formatearDineroNivan(it.precioUnitario)}`
                        : `${simboloMonedaNivan(p.pais)}${formatearDineroNivan(it.precioUnitario)}`}</p>
                </div>
            </div>
        `;
    }).join("");

    const datos = modo === "venta"
        ? `
            <span>👤 Comprador: ${escaparHTMLNivan(p.compradorNombre)}</span>
            <span>📍 Entrega: ${escaparHTMLNivan(p.direccion)}, ${escaparHTMLNivan(p.ciudad)}, CP ${escaparHTMLNivan(p.codigoPostal)}</span>
            <span>🚚 ${escaparHTMLNivan(p.envio)} · 💳 ${escaparHTMLNivan(p.pago)}</span>
            ${textoSeguimientoPedidoNivan(p)}
        `
        : `
            <span>🏪 Vendido por ${escaparHTMLNivan(p.vendedorNombre)}</span>
            <span>📍 ${escaparHTMLNivan(p.direccion)}, ${escaparHTMLNivan(p.ciudad)}</span>
            <span>🚚 ${escaparHTMLNivan(p.envio)} · 💳 ${escaparHTMLNivan(p.pago)}</span>
            ${textoSeguimientoPedidoNivan(p)}
        `;

    let accion = "";

    if (modo === "venta" && (p.estado === "pendiente" || p.estado === "preparando" || p.estado === "listo")) {
        accion = `<button type="button" class="accionPedidoNivan" onclick="cambiarEstadoPedidoNivan('${p.id}', 'enviado')">🚚 Marcar como enviado</button>`;
    } else if (modo === "compra" && p.estado !== "entregado" && p.estado !== "cancelado" && (!p.vendedorId || p.estado === "enviado")) {
        accion = `<button type="button" class="accionPedidoNivan" onclick="cambiarEstadoPedidoNivan('${p.id}', 'entregado')">✅ Ya lo recibí</button>`;
    }

    // Calificación al vendedor: el comprador la deja una vez que el pedido
    // está entregado; el vendedor la ve en Mis ventas.
    let calificacionHTML = "";
    const calif = p.calificacionVendedor;

    if (calif && calif.estrellas) {
        calificacionHTML = `
            <div class="calificacionPedidoNivan">
                <strong>${modo === "venta" ? "El comprador te calificó" : "Tu calificación al vendedor"}</strong>
                <span class="estrellasCalifNivan">${"★".repeat(calif.estrellas)}${"☆".repeat(5 - calif.estrellas)}</span>
                ${calif.comentario ? `<p>${escaparHTMLNivan(calif.comentario)}</p>` : ""}
            </div>
        `;
    } else if (modo === "compra" && p.estado === "entregado" && p.vendedorId) {
        accion = `<button type="button" class="accionPedidoNivan" onclick="abrirCalificarVendedorNivan('${escaparHTMLNivan(p.id)}')">⭐ Calificar al vendedor</button>`;
    }

    // Chat directo entre comprador y vendedor (solo si los dos tienen cuenta).
    let botonChat = (p.vendedorId && p.compradorId)
        ? `<button type="button" class="accionPedidoNivan secundaria" onclick="abrirChatDePedidoNivan('${escaparHTMLNivan(p.id)}')">💬 ${modo === "venta" ? "Chatear con el comprador" : "Chatear con el vendedor"}</button>`
        : "";

    if (modo === "compra") {
        const idSeguro = escaparHTMLNivan(p.id);
        botonChat = `<div class="accionesPedidoFilaNivan">
            <button type="button" class="principalNivan" onclick="accionPedidoTarjetaNivan('${idSeguro}', 'chat')">💬 Chatear con el vendedor</button>
            ${p.reclamo ? "" : `<div class="derechaAccionesNivan">
                <button type="button" onclick="accionPedidoTarjetaNivan('${idSeguro}', 'devolucion')">↩️ Devolución</button>
                <button type="button" onclick="accionPedidoTarjetaNivan('${idSeguro}', 'reembolso')">💸 Reembolso</button>
            </div>`}
        </div>`;
    }

    return `
        <div class="tarjetaPedidoNivan">
            <div class="cabeceraPedidoNivan">
                <div>
                    <strong>Pedido ${escaparHTMLNivan(p.id)}</strong>
                    <small>${new Date(p.fecha).toLocaleDateString("es-AR")}${ultimo && ultimo.estado !== "pendiente" ? " · " + est.texto.toLowerCase() + " el " + new Date(ultimo.fecha).toLocaleDateString("es-AR") : ""}</small>
                </div>
                <span class="estadoPedidoNivan ${p.estado}">${est.icono} ${est.texto}</span>
            </div>
            <div class="trackerPedidoNivan">${tracker}</div>
            ${items}
            <div class="datosPedidoNivan">${datos}</div>
            <div class="totalPedidoNivan"><span>Total</span><span>${simboloMonedaNivan(p.pais)}${formatearDineroNivan(p.total)}</span></div>
            ${calificacionHTML}
            ${reclamoHTMLNivan(p, modo)}
            ${accion}
            ${botonChat}
        </div>
    `;
}

// ==============================
// DEVOLUCIONES Y REEMBOLSOS
// ==============================
// pedido.reclamo = { tipo: "devolucion"|"reembolso", motivo, comentario, fecha,
//   estado: "solicitado"|"aprobado"|"rechazado"|"completado", respuesta, historial }
// Solo el comprador de un pedido entregado, dentro de DIAS_RECLAMO_NIVAN días.
// "completado" lo marca el vendedor: el dinero todavía no se mueve desde la app.

const DIAS_RECLAMO_NIVAN = 10;
const MOTIVOS_RECLAMO_NIVAN = ["No es lo que pedí", "Llegó dañada o con fallas", "Talle incorrecto", "No me gustó", "Otro motivo"];
const ESTADOS_RECLAMO_NIVAN = {
    solicitado: { icono: "⏳", texto: "Solicitud enviada" },
    aprobado: { icono: "✅", texto: "Aprobada" },
    rechazado: { icono: "❌", texto: "Rechazada" },
    completado: { icono: "💸", texto: "Reembolsado" }
};
let pedidoReclamoNivan = null;

function fechaEntregadoPedidoNivan(p) {
    const h = (p.historial || []).filter(function(x) { return x.estado === "entregado"; });
    return h.length ? h[h.length - 1].fecha : p.fecha;
}

function puedeReclamarPedidoNivan(p) {
    return p.estado === "entregado" && !!p.vendedorId && !!p.compradorId && !p.reclamo &&
        (Date.now() - fechaEntregadoPedidoNivan(p)) <= DIAS_RECLAMO_NIVAN * 24 * 60 * 60 * 1000;
}

function reclamoHTMLNivan(p, modo) {
    const r = p.reclamo;

    if (!r) return "";

    const est = ESTADOS_RECLAMO_NIVAN[r.estado] || ESTADOS_RECLAMO_NIVAN.solicitado;
    const titulo = r.tipo === "devolucion" ? "Devolución" : "Reembolso";
    let botones = "";
    let aviso = "";

    if (modo === "venta" && r.estado === "solicitado") {
        botones = `<button type="button" class="accionPedidoNivan" onclick="responderReclamoNivan('${escaparHTMLNivan(p.id)}', 'aprobado')">✅ Aceptar</button>
            <button type="button" class="accionPedidoNivan secundaria" onclick="responderReclamoNivan('${escaparHTMLNivan(p.id)}', 'rechazado')">❌ Rechazar</button>`;
    } else if (modo === "venta" && r.estado === "aprobado") {
        botones = `<button type="button" class="accionPedidoNivan" onclick="completarReclamoNivan('${escaparHTMLNivan(p.id)}')">💸 Marcar como reembolsado</button>`;
    } else if (modo === "compra" && r.estado === "aprobado" && r.tipo === "devolucion") {
        aviso = "<p>Enviá la prenda de vuelta al vendedor. Podés coordinarlo por el chat del pedido.</p>";
    }

    return `<div class="calificacionPedidoNivan">
        <strong>${est.icono} ${titulo}: ${est.texto}</strong>
        <p>Motivo: ${escaparHTMLNivan(r.motivo)}</p>
        ${r.comentario ? `<p>${escaparHTMLNivan(r.comentario)}</p>` : ""}
        ${r.respuesta ? `<p>Respuesta del vendedor: ${escaparHTMLNivan(r.respuesta)}</p>` : ""}
        ${aviso}
        ${botones}
    </div>`;
}

// Por qué un pedido no admite todavía (o ya) una devolución o un reembolso.
function mensajeNoPuedeReclamarPedidoNivan(p) {
    if (p.reclamo) return "Ya enviaste una solicitud de devolución o reembolso para este pedido. Podés ver cómo va en Mis compras.";
    if (!p.vendedorId || !p.compradorId) return "Esta compra es del catálogo de NIVAN: no tiene un vendedor al que pedirle una devolución o un reembolso.";
    if (p.estado !== "entregado") return "Vas a poder pedir la devolución o el reembolso cuando el pedido esté entregado. Desde ahí tenés " + DIAS_RECLAMO_NIVAN + " días.";
    return "Pasaron más de " + DIAS_RECLAMO_NIVAN + " días desde la entrega: ya no se puede pedir una devolución ni un reembolso.";
}

function abrirReclamoNivan(idPedido, tipoInicial) {
    if (!usuarioActual) return;
    if (!exigirPuedeReclamarNivan()) return;

    const p = obtenerPedidosNivan().find(function(x) { return x.id === idPedido; });
    if (!p || !esCompradorDelPedidoNivan(p)) {
        alert("Este pedido ya no admite devolución ni reembolso.");
        return;
    }
    if (!puedeReclamarPedidoNivan(p)) {
        alert(mensajeNoPuedeReclamarPedidoNivan(p));
        return;
    }

    pedidoReclamoNivan = idPedido;
    let overlay = document.getElementById("overlayReclamoNivan");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "overlayCalifNivan";
        overlay.id = "overlayReclamoNivan";
        document.body.appendChild(overlay);
    }

    const estiloCampo = "width:100%;padding:10px;border-radius:8px;border:1px solid #444;background:#111;color:#fff;margin-bottom:10px;font-family:Arial,sans-serif;";
    overlay.innerHTML = `
        <div class="cajaCalifNivan">
            <h3>Devolución o reembolso</h3>
            <p class="subCalifNivan">Pedido ${escaparHTMLNivan(p.id)} · tenés ${DIAS_RECLAMO_NIVAN} días desde la entrega.</p>
            <select id="tipoReclamoNivan" style="${estiloCampo}">
                <option value="devolucion"${tipoInicial !== "reembolso" ? " selected" : ""}>Quiero devolver la prenda</option>
                <option value="reembolso"${tipoInicial === "reembolso" ? " selected" : ""}>Quiero que me reembolsen</option>
            </select>
            <select id="motivoReclamoNivan" style="${estiloCampo}">
                ${MOTIVOS_RECLAMO_NIVAN.map(function(m) { return `<option>${escaparHTMLNivan(m)}</option>`; }).join("")}
            </select>
            <textarea id="comentarioReclamoNivan" maxlength="300" placeholder="Contanos qué pasó (opcional)" style="${estiloCampo}min-height:80px;resize:none;"></textarea>
            <div class="botonesCalifNivan">
                <button type="button" class="cancelar" onclick="cerrarReclamoNivan()">Ahora no</button>
                <button type="button" class="enviar" onclick="enviarReclamoNivan()">Enviar</button>
            </div>
        </div>`;
    overlay.classList.add("abierto");
}

function cerrarReclamoNivan() {
    const overlay = document.getElementById("overlayReclamoNivan");
    if (overlay) overlay.classList.remove("abierto");
    pedidoReclamoNivan = null;
}

function enviarReclamoNivan() {
    if (!usuarioActual || !pedidoReclamoNivan) return;
    if (!exigirPuedeReclamarNivan()) return;

    const pedidos = obtenerPedidosNivan();
    const p = pedidos.find(function(x) { return x.id === pedidoReclamoNivan; });
    if (!p || !esCompradorDelPedidoNivan(p) || !puedeReclamarPedidoNivan(p)) {
        cerrarReclamoNivan();
        return;
    }

    const ahora = Date.now();
    const motivo = document.getElementById("motivoReclamoNivan").value;
    p.reclamo = {
        tipo: document.getElementById("tipoReclamoNivan").value === "reembolso" ? "reembolso" : "devolucion",
        motivo: MOTIVOS_RECLAMO_NIVAN.indexOf(motivo) !== -1 ? motivo : "Otro motivo",
        comentario: document.getElementById("comentarioReclamoNivan").value.trim().slice(0, 300),
        fecha: ahora,
        estado: "solicitado",
        respuesta: "",
        historial: [{ estado: "solicitado", fecha: ahora }]
    };
    guardarPedidosNivan(pedidos);

    crearNotificacion(p.vendedorId, {
        tipo: "reclamo",
        icono: "↩️",
        titulo: p.reclamo.tipo === "devolucion" ? "Pidieron una devolución" : "Pidieron un reembolso",
        texto: `Pedido ${escaparHTMLNivan(p.id)}: ${escaparHTMLNivan(p.reclamo.motivo)}`,
        pedidoId: p.id
    });

    cerrarReclamoNivan();
    renderizarMisCompras();
    renderizarMisVentas();
}

function cambiarEstadoReclamoNivan(idPedido, estadoActual, nuevoEstado, respuesta, aviso) {
    if (!usuarioActual) return;
    const pedidos = obtenerPedidosNivan();
    const p = pedidos.find(function(x) { return x.id === idPedido; });
    if (!p || !p.reclamo || p.vendedorId !== usuarioActual.id || p.reclamo.estado !== estadoActual) return;

    p.reclamo.estado = nuevoEstado;
    if (respuesta != null) p.reclamo.respuesta = String(respuesta).slice(0, 200);
    p.reclamo.historial.push({ estado: nuevoEstado, fecha: Date.now() });
    guardarPedidosNivan(pedidos);

    if (p.compradorId) {
        crearNotificacion(p.compradorId, {
            tipo: "reclamo",
            icono: aviso.icono,
            titulo: aviso.titulo,
            texto: `Pedido ${escaparHTMLNivan(p.id)}`,
            pedidoId: p.id
        });
    }

    renderizarMisCompras();
    renderizarMisVentas();
}

function responderReclamoNivan(idPedido, decision) {
    if (decision === "aprobado") {
        cambiarEstadoReclamoNivan(idPedido, "solicitado", "aprobado", "", { icono: "✅", titulo: "Aceptaron tu solicitud" });
        return;
    }

    const motivo = prompt("¿Por qué la rechazás? (opcional)", "");
    if (motivo === null) return;
    cambiarEstadoReclamoNivan(idPedido, "solicitado", "rechazado", motivo.trim(), { icono: "❌", titulo: "Rechazaron tu solicitud" });
}

function completarReclamoNivan(idPedido) {
    if (!confirm("¿Confirmás que ya reembolsaste al comprador?")) return;
    cambiarEstadoReclamoNivan(idPedido, "aprobado", "completado", null, { icono: "💸", titulo: "Te reembolsaron" });
}

function renderizarMisCompras() {
    const contenedor = document.getElementById("listaMisCompras");
    if (!contenedor) return;

    const pedidos = obtenerPedidosDelPaisNivan()
        .filter(esCompradorDelPedidoNivan)
        .sort(function(a, b) { return b.fecha - a.fecha; });

    contenedor.innerHTML = pedidos.length
        ? pedidos.map(function(p) { return generarTarjetaPedidoNivan(p, "compra"); }).join("")
        : `<p class="pedidosVaciosNivan">Todavía no hiciste ninguna compra. Cuando compres algo, vas a ver acá el estado de tu pedido.</p>`;
}

function renderizarMisVentas() {
    const contenedor = document.getElementById("listaMisVentas");
    if (!contenedor || !usuarioActual) return;

    const pedidos = obtenerPedidosDelPaisNivan()
        .filter(function(p) { return p.vendedorId === usuarioActual.id; })
        .sort(function(a, b) { return b.fecha - a.fecha; });

    contenedor.innerHTML = pedidos.length
        ? pedidos.map(function(p) { return generarTarjetaPedidoNivan(p, "venta"); }).join("")
        : `<p class="pedidosVaciosNivan">Todavía no tenés ventas. Cuando alguien te compre, el pedido aparece acá.</p>`;
}

function abrirMisCompras() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    renderizarMisCompras();
    abrirPantallaCompleta("pantallaMisCompras");
}

function abrirTusCuponesNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    const input = document.getElementById("codigoCuponGuardarNivan");
    if (input) input.value = "";

    renderizarTusCuponesNivan();
    abrirPantallaCompleta("pantallaTusCupones");
}

function abrirMisVentas() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    renderizarMisVentas();
    abrirPantallaCompleta("pantallaMisVentas");
}

function cambiarEstadoPedidoNivan(idPedido, nuevoEstado) {
    if (!usuarioActual) return;

    const pedidos = obtenerPedidosNivan();
    const pedido = pedidos.find(function(p) { return p.id === idPedido; });
    if (!pedido) return;

    const esVendedor = !!pedido.vendedorId && pedido.vendedorId === usuarioActual.id;
    const esComprador = esCompradorDelPedidoNivan(pedido);

    if (nuevoEstado === "enviado") {
        if (!esVendedor || ["pendiente", "preparando", "listo"].indexOf(pedido.estado) === -1) return;
    } else if (nuevoEstado === "entregado") {
        if (!esComprador || pedido.estado === "entregado" || pedido.estado === "cancelado") return;
        if (pedido.vendedorId && pedido.estado !== "enviado") return;
    } else {
        return;
    }

    pedido.estado = nuevoEstado;
    pedido.historial = pedido.historial || [];
    pedido.historial.push({ estado: nuevoEstado, fecha: Date.now() });
    guardarPedidosNivan(pedidos);

    if (nuevoEstado === "enviado" && pedido.compradorId) {
        crearNotificacion(pedido.compradorId, {
            tipo: "pedidoEstado",
            icono: "🚚",
            titulo: "Tu pedido está en camino",
            texto: `${escaparHTMLNivan(pedido.vendedorNombre)} envió tu pedido ${escaparHTMLNivan(pedido.id)}`,
            pedidoId: pedido.id
        });
    }

    if (nuevoEstado === "entregado") {
        if (pedido.compradorId) {
            crearNotificacion(pedido.compradorId, {
                tipo: "pedidoEstado",
                icono: "✅",
                titulo: "Pedido entregado",
                texto: `Confirmaste la entrega del pedido ${escaparHTMLNivan(pedido.id)}. Ya podés puntuar las prendas (tenés ${PLAZO_RESENIA_DIAS_NIVAN} días).`,
                pedidoId: pedido.id
            });
        }

        if (pedido.vendedorId) {
            crearNotificacion(pedido.vendedorId, {
                tipo: "ventaEstado",
                icono: "✅",
                titulo: "Pedido entregado",
                texto: `${escaparHTMLNivan(pedido.compradorNombre)} confirmó que recibió el pedido ${escaparHTMLNivan(pedido.id)}`,
                pedidoId: pedido.id
            });
        }
    }

    renderizarMisCompras();
    renderizarMisVentas();

    // Al confirmar que recibió el pedido, le ofrecemos calificar al vendedor.
    if (nuevoEstado === "entregado" && esComprador && pedido.vendedorId) {
        abrirCalificarVendedorNivan(pedido.id);
    }
}





// ==============================
// CALIFICAR AL VENDEDOR (después de una compra)
// ==============================
// El comprador califica al vendedor una sola vez por pedido, y solo cuando
// el pedido ya figura como "entregado". La calificación queda guardada
// dentro del propio pedido (pedido.calificacionVendedor), se suma a la
// reputación del vendedor y le llega una notificación.

let pedidoCalificandoNivan = null;
let estrellasCalifNivan = 0;
const TEXTOS_CALIFICACION_NIVAN = ["", "Muy mala experiencia", "Mala", "Regular", "Buena", "Excelente"];

function mostrarAvisoCalifNivan(texto) {
    const aviso = document.getElementById("avisoErrorCalifNivan");
    if (!aviso) return;
    aviso.textContent = texto || "";
    aviso.classList.toggle("visible", !!texto);
}

function elegirEstrellasCalifNivan(valor) {
    estrellasCalifNivan = valor;

    document.querySelectorAll("#estrellasElegirCalifNivan button").forEach(function(boton, indice) {
        boton.classList.toggle("activa", indice < valor);
    });

    document.getElementById("textoEstrellasCalifNivan").textContent = TEXTOS_CALIFICACION_NIVAN[valor] || "";
    mostrarAvisoCalifNivan("");
}

function abrirCalificarVendedorNivan(idPedido) {
    if (!usuarioActual) return;
    if (!exigirPuedeReclamarNivan()) return;

    const pedido = obtenerPedidosNivan().find(function(p) { return p.id === idPedido; });

    if (!pedido || !pedido.vendedorId || pedido.estado !== "entregado") return;
    if (!esCompradorDelPedidoNivan(pedido) || pedido.calificacionVendedor) return;

    const usuarioVendedor = obtenerUsuarioPorIdNivan(pedido.vendedorId);
    const nombreVendedor = usuarioVendedor
        ? obtenerNombreVendedorUsuario(usuarioVendedor)
        : pedido.vendedorNombre;

    pedidoCalificandoNivan = idPedido;

    document.getElementById("tituloCalifNivan").textContent = "¿Cómo te fue con " + nombreVendedor + "?";
    document.getElementById("subCalifNivan").textContent = "Pedido " + pedido.id + ". Tu calificación ayuda a otros compradores.";
    document.getElementById("comentarioCalifNivan").value = "";
    elegirEstrellasCalifNivan(0);
    mostrarAvisoCalifNivan("");

    document.getElementById("overlayCalifNivan").classList.add("abierto");
}

function cerrarCalificarVendedorNivan() {
    document.getElementById("overlayCalifNivan").classList.remove("abierto");
    pedidoCalificandoNivan = null;
}

function enviarCalificacionVendedorNivan() {
    if (!usuarioActual || !pedidoCalificandoNivan) return;
    if (!exigirPuedeReclamarNivan()) return;

    if (!estrellasCalifNivan) {
        mostrarAvisoCalifNivan("Elegí de 1 a 5 estrellas antes de enviar.");
        return;
    }

    const comentario = document.getElementById("comentarioCalifNivan").value.trim();

    const pedidos = obtenerPedidosNivan();
    const pedido = pedidos.find(function(p) { return p.id === pedidoCalificandoNivan; });

    if (!pedido || !pedido.vendedorId || pedido.estado !== "entregado" ||
        !esCompradorDelPedidoNivan(pedido) || pedido.calificacionVendedor) {
        cerrarCalificarVendedorNivan();
        return;
    }

    pedido.calificacionVendedor = {
        estrellas: estrellasCalifNivan,
        comentario: comentario,
        fecha: Date.now()
    };

    guardarPedidosNivan(pedidos);

    crearNotificacion(pedido.vendedorId, {
        tipo: "calificacion",
        icono: "⭐",
        titulo: "Te calificaron",
        texto: `Un comprador te dejó ${"★".repeat(estrellasCalifNivan)} por el pedido ${escaparHTMLNivan(pedido.id)}`,
        pedidoId: pedido.id
    });

    cerrarCalificarVendedorNivan();
    renderizarMisCompras();
    renderizarMisVentas();
}

// Calificaciones de compradores que se muestran en el perfil del vendedor.
function renderizarCalificacionesPerfilVendedorNivan(idVendedor) {
    const contenedor = document.getElementById("calificacionesPerfilVendedor");
    if (!contenedor) return;

    const calificaciones = idVendedor
        ? obtenerPedidosNivan()
            .filter(function(p) { return p.vendedorId === idVendedor && p.calificacionVendedor && p.calificacionVendedor.estrellas; })
            .sort(function(a, b) { return b.calificacionVendedor.fecha - a.calificacionVendedor.fecha; })
            .slice(0, 10)
        : [];

    if (!calificaciones.length) {
        contenedor.innerHTML = "";
        return;
    }

    contenedor.innerHTML = `
        <p class="tituloCalifVendedorNivan">Calificaciones de compradores</p>
        ${calificaciones.map(function(p) {
            const c = p.calificacionVendedor;
            return `
                <div class="itemCalifVendedorNivan">
                    <span class="estrellasCalifNivan">${"★".repeat(c.estrellas)}${"☆".repeat(5 - c.estrellas)}</span>
                    ${c.comentario ? `<p>${escaparHTMLNivan(c.comentario)}</p>` : ""}
                    <small>✅ Compra verificada · ${new Date(c.fecha).toLocaleDateString("es-AR")}</small>
                </div>
            `;
        }).join("")}
    `;
}

