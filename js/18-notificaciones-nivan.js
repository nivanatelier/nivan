// =====================================================
// NOTIFICACIONES EXTRA
//   ❤️ Le gustó tu publicación
//   🎟️ La tienda que seguís lanzó un cupón (solo si se ve en su tienda)
//   ✨ Recomendaciones (también aparecen como filas en el Home):
//        "Porque guardaste vestidos"
//        "Parecidos a lo que viste"
//        "De las tiendas que seguís"
//   Todas se pueden tocar y te llevan a su sección.
//
// Ya existían y NO se tocan: nuevo seguidor, pedido confirmado,
// pedido enviado, te calificaron, te llegó un cupón, nueva
// publicación de una tienda que seguís y bajó el precio.
// =====================================================

// ---- 0) crearNotificacion guarda también un campo "extra" ----
// (para recordar a qué post / sección lleva cada aviso)
const _crearNotificacionOriginalNivan = crearNotificacion;
crearNotificacion = function (idUsuario, datos) {
    _crearNotificacionOriginalNivan(idUsuario, datos);
    if (!idUsuario || !datos || !datos.extra) return;
    const todas = obtenerTodasLasNotificaciones();
    const lista = todas[idUsuario];
    if (lista && lista[0]) {
        lista[0].extra = datos.extra;
        guardarTodasLasNotificaciones(todas);
    }
};


// ---- 1) ❤️ Le gustó tu publicación ----
const _alternarLikePostOriginalNivan = alternarLikePostNivan;
alternarLikePostNivan = function () {
    const ctx = postInteraccionActualNivan;
    if (!usuarioActual || !ctx) { _alternarLikePostOriginalNivan(); return; }

    const antes = likesDePostNivan(ctx.idPost).indexOf(usuarioActual.id) !== -1;
    _alternarLikePostOriginalNivan();
    const despues = likesDePostNivan(ctx.idPost).indexOf(usuarioActual.id) !== -1;

    // Solo cuando se agrega el like, y nunca a uno mismo
    if (antes || !despues || ctx.idUsuario === usuarioActual.id) return;

    // Un solo aviso por persona y por publicación (aunque ponga y saque el like)
    const todas = obtenerTodasLasNotificaciones();
    todas[ctx.idUsuario] = (todas[ctx.idUsuario] || []).filter(function (n) {
        return !(n.tipo === "likePost" && n.extra && n.extra.postId === ctx.idPost && n.extra.quien === usuarioActual.id);
    });
    guardarTodasLasNotificaciones(todas);

    crearNotificacion(ctx.idUsuario, {
        tipo: "likePost",
        icono: "❤️",
        titulo: "Le gustó tu publicación",
        cuenta: "personal",
        texto: escaparHTMLNivan(obtenerNombreMostradoUsuario(usuarioActual)) + " le dio like a tu publicación.",
        extra: {
            postId: ctx.idPost,
            fecha: ctx.idPost.slice(ctx.idUsuario.length + 1),   // para encontrar el post aunque cambie el orden
            quien: usuarioActual.id
        }
    });
};


// ---- 2) 🎟️ La tienda que seguís lanzó un cupón ----
const _crearCuponOriginalNivan = crearCuponNivan;
crearCuponNivan = function () {
    const idsAntes = obtenerCuponesNivan().map(function (c) { return c.id; });
    _crearCuponOriginalNivan();
    if (!usuarioActual) return;

    const nuevo = obtenerCuponesNivan().find(function (c) {
        return idsAntes.indexOf(c.id) === -1 && c.vendedorId === usuarioActual.id;
    });
    if (!nuevo || !cuponUsableNivan(nuevo)) return;

    // Solo si se ve en su tienda (cualquiera o seguidores). "Solo con el código"
    // o "solo clientes" no se anuncian.
    const aud = audienciaCuponNivan(nuevo);
    if (aud.indexOf("publico") === -1 && aud.indexOf("seguidores") === -1) return;

    try {
        const nombreTienda = escaparHTMLNivan(obtenerNombreVendedorUsuario(usuarioActual));
        const claveTienda = claveCuentaNivan(usuarioActual.id, "tienda");
        idsSeguidoresNivan(claveTienda).forEach(function (claveSeguidor) {
            const seguidor = datosClaveCuentaNivan(claveSeguidor);
            crearNotificacion(seguidor.id, {
                tipo: "cuponTienda",
                icono: "🎟️",
                titulo: nombreTienda + " lanzó un cupón",
                texto: "Entrá a su tienda para reclamarlo.",
                usuarioId: claveTienda,
                cuenta: seguidor.ambito
            });
        });
    } catch (e) {}
};


// ---- 3) ✨ Recomendaciones: filas del Home + avisos ----
const DEFINICIONES_RECO_NIVAN = [
    { id: "guardaste", icono: "💜" },
    { id: "parecidos", icono: "👀" },
    { id: "tiendas",   icono: "🛍️" }
];
const MAX_ITEMS_RECO_NIVAN = 8;
const DIAS_ENTRE_AVISOS_RECO_NIVAN = 3;

function productoAjenoNivan(p) {
    return !(usuarioActual && p.vendedorId === usuarioActual.id);
}

function categoriaBonitaNivan(c) {
    return String(c || "").trim().toLowerCase();
}

// Cada función devuelve { titulo, lista } o null si no hay nada para mostrar.
function recoGuardasteNivan() {
    const guardados = (typeof favoritos !== "undefined" ? favoritos : [])
        .map(function (id) { return productos.find(function (p) { return p.id === id; }); })
        .filter(Boolean);
    if (!guardados.length) return null;

    const cuenta = {};
    guardados.forEach(function (p) { if (p.categoria) cuenta[p.categoria] = (cuenta[p.categoria] || 0) + 1; });
    const top = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; })[0];
    if (!top) return null;

    const lista = productos.filter(function (p) {
        return p.categoria === top && favoritos.indexOf(p.id) === -1 && productoAjenoNivan(p);
    }).slice(0, MAX_ITEMS_RECO_NIVAN);

    return lista.length ? { titulo: "Porque guardaste " + categoriaBonitaNivan(top), lista: lista } : null;
}

function recoParecidosNivan() {
    const limite = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const vistosIds = [];
    leerJSONNivan("nivanActividadProductos", []).forEach(function (e) {
        if (e.k === "vista" && e.t >= limite && vistosIds.indexOf(e.i) === -1) vistosIds.push(e.i);
    });
    const vistos = vistosIds.map(function (id) { return productos.find(function (p) { return p.id === id; }); }).filter(Boolean);
    if (!vistos.length) return null;

    const categorias = {};
    const etiquetas = {};
    vistos.forEach(function (p) {
        if (p.categoria) categorias[p.categoria] = true;
        (Array.isArray(p.etiquetas) ? p.etiquetas : []).forEach(function (t) { etiquetas[String(t).toLowerCase()] = true; });
    });

    const lista = productos.map(function (p) {
        if (vistosIds.indexOf(p.id) !== -1 || !productoAjenoNivan(p)) return null;
        let puntos = categorias[p.categoria] ? 2 : 0;
        (Array.isArray(p.etiquetas) ? p.etiquetas : []).forEach(function (t) { if (etiquetas[String(t).toLowerCase()]) puntos++; });
        return puntos ? { p: p, puntos: puntos } : null;
    }).filter(Boolean).sort(function (a, b) { return b.puntos - a.puntos; })
      .slice(0, MAX_ITEMS_RECO_NIVAN).map(function (x) { return x.p; });

    return lista.length ? { titulo: "Parecidos a lo que viste", lista: lista } : null;
}

function recoTiendasNivan() {
    if (!usuarioActual) return null;
    const lista = productos.filter(function (p) {
        return p.vendedorId && productoAjenoNivan(p)
            && personaSigueCuentaNivan(usuarioActual.id, claveCuentaNivan(p.vendedorId, "tienda"));
    }).sort(function (a, b) { return (b.fechaCreacion || 0) - (a.fechaCreacion || 0); })
      .slice(0, MAX_ITEMS_RECO_NIVAN);

    return lista.length ? { titulo: "De las tiendas que seguís", lista: lista } : null;
}

function datosRecoNivan(id) {
    if (id === "guardaste") return recoGuardasteNivan();
    if (id === "parecidos") return recoParecidosNivan();
    if (id === "tiendas") return recoTiendasNivan();
    return null;
}

// Dibuja las filas debajo de "Recomendaciones para vos" en el Home
function renderizarFilasRecoNivan() {
    const base = document.getElementById("recomendadosNivan");
    if (!base) return;

    let cont = document.getElementById("filasRecoNivan");
    if (!cont) {
        cont = document.createElement("div");
        cont.id = "filasRecoNivan";
        base.insertAdjacentElement("afterend", cont);
    }

    cont.innerHTML = DEFINICIONES_RECO_NIVAN.map(function (def) {
        const r = datosRecoNivan(def.id);
        if (!r) return "";
        return `<section class="recomendadosNivan" id="reco-${def.id}">
            <h3>${escaparHTMLNivan(r.titulo)}</h3>
            <div class="feedLista">${r.lista.map(function (p) {
                const img = p.imagen || ((Array.isArray(p.medios) && p.medios.find(function (m) { return m.tipo === "imagen" && m.src; })) || {}).src || "";
                return `<div class="feedItem" onclick="abrirProducto(${JSON.stringify(p.id)})">
                    <img src="${escaparHTMLNivan(urlImagenNivan(img))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(p.nombre)}">
                    <h4>${escaparHTMLNivan(p.nombre)}</h4>
                    <div class="feedPrecio">${simboloMonedaNivan(p.pais)}${Number(p.precio).toLocaleString("es-AR")}</div>
                </div>`;
            }).join("")}</div>
        </section>`;
    }).join("");
}

const _renderizarRecomendadosOriginalNivan = renderizarRecomendadosNivan;
renderizarRecomendadosNivan = function () {
    _renderizarRecomendadosOriginalNivan();
    try { renderizarFilasRecoNivan(); } catch (e) {}
};

// Avisos: como mucho uno por tipo cada 3 días, solo si hay algo para mostrar
function generarAvisosRecoNivan() {
    if (!usuarioActual) return;
    const clave = "nivanAvisosReco_" + usuarioActual.id;
    const hechos = leerJSONNivan(clave, {});
    const espera = DIAS_ENTRE_AVISOS_RECO_NIVAN * 24 * 60 * 60 * 1000;
    let cambio = false;

    DEFINICIONES_RECO_NIVAN.forEach(function (def) {
        if (hechos[def.id] && Date.now() - hechos[def.id] < espera) return;
        const r = datosRecoNivan(def.id);
        if (!r) return;

        crearNotificacion(usuarioActual.id, {
            tipo: "recomendacion",
            cuenta: "personal",
            icono: def.icono,
            titulo: r.titulo,
            texto: r.lista.length === 1 ? "Encontramos 1 prenda para vos." : "Encontramos " + r.lista.length + " prendas para vos.",
            extra: { seccion: def.id }
        });
        hechos[def.id] = Date.now();
        cambio = true;
    });

    if (cambio) guardarJSONNivan(clave, hechos);
}

window.addEventListener("load", function () {
    setTimeout(function () { try { generarAvisosRecoNivan(); } catch (e) {} }, 1500);
});


// ---- 4) Tocar la notificación te lleva a su sección ----
const _abrirNotificacionOriginalNivan = abrirNotificacion;
abrirNotificacion = function (idNotificacion) {
    const n = usuarioActual
        ? obtenerNotificacionesDeUsuario(usuarioActual.id).find(function (x) { return x.id === idNotificacion; })
        : null;

    if (!n || ["likePost", "cuponTienda", "recomendacion", "comentarioPost", "respuestaComentario", "likeComentario", "etiquetaPost"].indexOf(n.tipo) === -1) {
        _abrirNotificacionOriginalNivan(idNotificacion);
        return;
    }

    marcarNotificacionLeida(idNotificacion);
    renderizarNotificaciones();

    if (["likePost", "comentarioPost", "respuestaComentario", "likeComentario", "etiquetaPost"].indexOf(n.tipo) !== -1) {
        // el post puede ser tuyo o de otra persona; lo buscamos por su fecha
        const dueno = obtenerUsuarioPorIdNivan((n.extra && n.extra.duenoId) || usuarioActual.id);
        const lista = dueno && Array.isArray(dueno.portafolio) ? dueno.portafolio : [];
        const indice = lista.findIndex(function (it) { return String(it && it.fecha) === String(n.extra && n.extra.fecha); });
        if (indice === -1) { mostrarToastNivan("Esa publicación ya no existe."); return; }
        abrirPostFeedNivan(dueno.id, indice);
        return;
    }

    if (n.tipo === "cuponTienda") {
        if (n.usuarioId) abrirPerfilDeClaveNivan(n.usuarioId);
        return;
    }

    if (n.tipo === "recomendacion") {
        irAPagina("paginaHome");
        renderizarRecomendadosNivan();
        setTimeout(function () {
            const fila = document.getElementById("reco-" + (n.extra && n.extra.seccion));
            if (fila) fila.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
    }
};


// ---- 5) 💬 Notificaciones de comentarios ----
// Comentaron tu publicación / Respondieron tu comentario / Le gustó tu comentario
function extraComentarioNivan(ctx, comentarioId) {
    return {
        duenoId: ctx.idUsuario,                                  // de quién es el post
        postId: ctx.idPost,
        fecha: ctx.idPost.slice(ctx.idUsuario.length + 1),       // para encontrar el post
        comentarioId: comentarioId,
        quien: usuarioActual.id
    };
}

const _enviarComentarioPostOriginalNivan = enviarComentarioPostNivan;
enviarComentarioPostNivan = function () {
    const ctx = postInteraccionActualNivan;
    if (!usuarioActual || !ctx) { _enviarComentarioPostOriginalNivan(); return; }

    const idsAntes = leerComentariosPostNivan(ctx.idPost).map(function (c) { return c.id; });
    _enviarComentarioPostOriginalNivan();

    const todos = leerComentariosPostNivan(ctx.idPost);
    const nuevo = todos.find(function (c) { return idsAntes.indexOf(c.id) === -1 && c.idUsuario === usuarioActual.id; });
    if (!nuevo) return;

    const nombre = escaparHTMLNivan(obtenerNombreMostradoUsuario(usuarioActual));
    const resumen = escaparHTMLNivan(nuevo.texto.slice(0, 60)) + (nuevo.texto.length > 60 ? "…" : "");
    const extra = extraComentarioNivan(ctx, nuevo.id);

    // Es una respuesta: se avisa a quien escribió el comentario original
    if (nuevo.idPadre) {
        const padre = todos.find(function (c) { return c.id === nuevo.idPadre; });
        if (padre && padre.idUsuario !== usuarioActual.id) {
            crearNotificacion(padre.idUsuario, {
                tipo: "respuestaComentario", cuenta: "personal", icono: "↩️",
                titulo: "Respondieron tu comentario",
                texto: nombre + ': "' + resumen + '"',
                extra: extra
            });
        }
        return;
    }

    // Es un comentario nuevo: se avisa al dueño de la publicación (si no es uno mismo)
    if (ctx.idUsuario !== usuarioActual.id) {
        crearNotificacion(ctx.idUsuario, {
            tipo: "comentarioPost", cuenta: "personal", icono: "💬",
            titulo: "Comentaron tu publicación",
            texto: nombre + ': "' + resumen + '"',
            extra: extra
        });
    }
};

const _alternarLikeComentarioOriginalNivan = alternarLikeComentarioPostNivan;
alternarLikeComentarioPostNivan = function (idComentario) {
    const ctx = postInteraccionActualNivan;
    if (!usuarioActual || !ctx) { _alternarLikeComentarioOriginalNivan(idComentario); return; }

    function buscar() {
        return leerComentariosPostNivan(ctx.idPost).find(function (c) { return c.id === idComentario; });
    }
    function tieneMiLike(c) { return !!(c && (c.likes || []).indexOf(usuarioActual.id) !== -1); }

    const teniaLike = tieneMiLike(buscar());
    _alternarLikeComentarioOriginalNivan(idComentario);
    const despues = buscar();

    // Solo cuando se agrega el like, y nunca a uno mismo
    if (teniaLike || !tieneMiLike(despues) || despues.idUsuario === usuarioActual.id) return;

    // Un solo aviso por persona y por comentario
    const todas = obtenerTodasLasNotificaciones();
    todas[despues.idUsuario] = (todas[despues.idUsuario] || []).filter(function (n) {
        return !(n.tipo === "likeComentario" && n.extra && n.extra.comentarioId === idComentario && n.extra.quien === usuarioActual.id);
    });
    guardarTodasLasNotificaciones(todas);

    crearNotificacion(despues.idUsuario, {
        tipo: "likeComentario", cuenta: "personal", icono: "❤️",
        titulo: "Le gustó tu comentario",
        texto: escaparHTMLNivan(obtenerNombreMostradoUsuario(usuarioActual)) + " le dio like a tu comentario.",
        extra: extraComentarioNivan(ctx, idComentario)
    });
};

// ---- 6) 🔖 Te etiquetaron en un post ----
// Se avisa cuando alguien escribe tu @id (o el @T-id de tu tienda) al
// publicar un post, o al editarlo si la etiqueta es nueva.
function avisarEtiquetasNuevasNivan(antes, despues) {
    if (!usuarioActual) return;

    const previos = {};
    antes.forEach(function (it) { if (it && it.fecha) previos[it.fecha] = it; });

    despues.forEach(function (item) {
        if (!item || !item.fecha) return;

        const viejo = previos[item.fecha];
        const tagsViejas = viejo ? etiquetasDeTextoNivan(viejo.texto) : [];
        const tagsNuevas = etiquetasDeTextoNivan(item.texto).filter(function (t, i, arr) {
            return tagsViejas.indexOf(t) === -1 && arr.indexOf(t) === i;
        });

        tagsNuevas.forEach(function (idTexto) {
            const cuenta = buscarCuentaPorIdNivan(idTexto);          // solo cuentas que existen
            if (!cuenta || cuenta.usuario.id === usuarioActual.id) return;   // no a uno mismo
            if (hayBloqueoEntreNivan(usuarioActual.id, cuenta.usuario.id)) return;

            // Si ya había un aviso igual de este mismo post, no se repite
            const todas = obtenerTodasLasNotificaciones();
            todas[cuenta.usuario.id] = (todas[cuenta.usuario.id] || []).filter(function (n) {
                return !(n.tipo === "etiquetaPost" && n.extra
                    && n.extra.duenoId === usuarioActual.id && String(n.extra.fecha) === String(item.fecha)
                    && n.cuenta === cuenta.tipo);
            });
            guardarTodasLasNotificaciones(todas);

            crearNotificacion(cuenta.usuario.id, {
                tipo: "etiquetaPost",
                cuenta: cuenta.tipo,                                  // "personal" o "tienda"
                icono: "🔖",
                titulo: cuenta.tipo === "tienda" ? "Etiquetaron a tu tienda en un post" : "Te etiquetaron en un post",
                texto: escaparHTMLNivan(obtenerNombreMostradoUsuario(usuarioActual)) + " te etiquetó en una publicación.",
                extra: { duenoId: usuarioActual.id, fecha: item.fecha }
            });
        });
    });
}

// Se engancha a cada vez que se guardan las publicaciones del perfil
// (publicar nuevo, con foto o sin foto, y editar).
const _persistirUsuarioActualOriginalNivan = persistirUsuarioActual;
persistirUsuarioActual = function (campos) {
    const antes = usuarioActual && Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio.slice() : null;
    const resultado = _persistirUsuarioActualOriginalNivan(campos);

    if (resultado !== false && antes && campos && Array.isArray(campos.portafolio)) {
        try { avisarEtiquetasNuevasNivan(antes, campos.portafolio); } catch (e) {}
    }
    return resultado;
};