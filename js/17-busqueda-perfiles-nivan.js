// =====================================================
// BUSCADOR DE PERFILES: elegir "posts" o "usuarios"
//
//  - Al tocar el buscador aparecen los dos botones (posts / usuarios).
//  - Si no tocás ninguno, se buscan las dos cosas.
//  - "usuarios" sin escribir nada = todos los usuarios.
//  - "@id" busca por ID. Con "posts" salen los posts donde
//    etiquetaron a esa cuenta; con "usuarios", la persona.
//  - Sin escribir nada y sin filtro, queda el feed de siempre.
// =====================================================
let filtroBusquedaPerfilNivan = null;   // null = las dos cosas | "posts" | "usuarios"

// ---- Botones posts / usuarios ----
function actualizarChipsBusquedaPerfilNivan() {
    const cont = document.getElementById("filtrosBusquedaPerfilNivan");
    const buscador = document.getElementById("buscadorPersonasNivan");
    if (!cont || !buscador) return;

    const visible = document.activeElement === buscador
        || buscador.value.trim() !== ""
        || filtroBusquedaPerfilNivan !== null;
    cont.classList.toggle("visible", visible);

    const chipPosts = document.getElementById("chipPostsNivan");
    const chipUsuarios = document.getElementById("chipUsuariosNivan");
    if (chipPosts) chipPosts.classList.toggle("activo", filtroBusquedaPerfilNivan === "posts");
    if (chipUsuarios) chipUsuarios.classList.toggle("activo", filtroBusquedaPerfilNivan === "usuarios");
}

function elegirFiltroBusquedaPerfilNivan(filtro) {
    // tocar el botón que ya estaba elegido lo desactiva (vuelve a las dos cosas)
    filtroBusquedaPerfilNivan = filtroBusquedaPerfilNivan === filtro ? null : filtro;

    const buscador = document.getElementById("buscadorPersonasNivan");
    // si no escribió nada, cerramos el teclado para ver la lista
    if (buscador && buscador.value.trim() === "") buscador.blur();

    renderizarFeedPersonalNivan();
}

// ---- Etiquetas @ de un post ----
function etiquetasDeTextoNivan(texto) {
    const ids = [];
    const patron = /(^|[^A-Za-z0-9_])@([A-Za-z0-9][A-Za-z0-9-]{1,40})/g;
    const t = String(texto == null ? "" : texto);
    let m;
    while ((m = patron.exec(t)) !== null) ids.push(m[2].toLowerCase());
    return ids;
}

// ---- Búsquedas ----
function buscarUsuariosPerfilNivan(q, esArroba) {
    const miId = usuarioActual ? usuarioActual.id : null;
    return obtenerUsuariosNivan().filter(function (u) {
        if (u.id === miId || !usuarioVisibleEnFeedNivan(u)) return false;
        if (!q) return true;
        if (esArroba) {
            return !!u.idPublico && String(u.idPublico).toLowerCase().indexOf(q) !== -1;
        }
        const texto = [obtenerNombreMostradoUsuario(u), u.nombre, u.idPublico].join(" ").toLowerCase();
        return texto.indexOf(q) !== -1;
    });
}

function buscarPostsPerfilNivan(q, esArroba) {
    const todos = obtenerPublicacionesFeedNivan();
    if (!q) return todos;

    if (esArroba) {
        // posts donde etiquetaron a esa cuenta (persona @id o tienda @T-id)
        return todos.filter(function (e) {
            return etiquetasDeTextoNivan(e.item.texto).some(function (t) { return t.indexOf(q) === 0; });
        });
    }

    return todos.filter(function (e) {
        const texto = String(e.item.texto || "").toLowerCase();
        const autor = [obtenerNombreMostradoUsuario(e.usuario), e.usuario.idPublico].join(" ").toLowerCase();
        return texto.indexOf(q) !== -1 || autor.indexOf(q) !== -1;
    });
}

function htmlFilaUsuarioBusquedaNivan(u) {
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
}

// ---- Reemplazo del dibujado de la pestaña Perfiles ----
const _renderizarFeedPersonalOriginalNivan = renderizarFeedPersonalNivan;

renderizarFeedPersonalNivan = function () {
    actualizarChipsBusquedaPerfilNivan();

    const buscador = document.getElementById("buscadorPersonasNivan");
    const crudo = buscador ? buscador.value.trim() : "";
    const filtro = filtroBusquedaPerfilNivan;

    // Sin texto y sin "usuarios": feed normal (con "posts" solo = todos los posts)
    if (!crudo && filtro !== "usuarios") {
        _renderizarFeedPersonalOriginalNivan();
        return;
    }

    const feed = document.getElementById("feedPersonalNivan");
    const resultados = document.getElementById("resultadosPersonasNivan");
    if (!feed || !resultados) return;

    // avatar de "mi perfil" y puntito de notificaciones (igual que el original)
    const btn = document.getElementById("botonMiPerfilNivan");
    if (btn) {
        const idActivo = datosIdentidadNivan(usuarioActual, modoCuentaNivan());
        btn.innerHTML = usuarioActual && idActivo.foto
            ? `<img src="${escaparHTMLNivan(idActivo.foto)}" alt="Mi perfil">`
            : (usuarioActual ? idActivo.vacio : "👤");
    }
    actualizarBadgePerfilNivan();

    const esArroba = crudo.charAt(0) === "@";
    const q = (esArroba ? crudo.slice(1) : crudo).trim().toLowerCase();
    const verUsuarios = filtro !== "posts";
    const verPosts = filtro !== "usuarios";

    const usuarios = verUsuarios ? buscarUsuariosPerfilNivan(q, esArroba) : [];
    let posts = verPosts ? buscarPostsPerfilNivan(q, esArroba) : [];
    // los más nuevos primero, máximo 60 para no trabar el celu
    posts = posts.slice().sort(function (a, b) { return (b.item.fecha || 0) - (a.item.fecha || 0); }).slice(0, 60);

    let html = "";

    if (usuarios.length) {
        if (verPosts) html += `<p class="tituloSeccionBusquedaNivan">Usuarios</p>`;
        html += usuarios.map(htmlFilaUsuarioBusquedaNivan).join("");
    }

    if (posts.length) {
        if (verUsuarios) html += `<p class="tituloSeccionBusquedaNivan">Posts</p>`;
        html += htmlPublicacionesPersonalesNivan(posts, {
            alClick: function (e) { return `abrirPostFeedNivan('${escaparHTMLNivan(e.usuario.id)}', ${e.indice})`; }
        });
    }

    if (!html) {
        let mensaje = "No encontramos resultados.";
        if (esArroba && filtro === "posts") mensaje = "Todavía no hay posts donde hayan etiquetado a @" + escaparHTMLNivan(q) + ".";
        else if (filtro === "usuarios") mensaje = "No encontramos usuarios con ese nombre o ID.";
        else if (filtro === "posts") mensaje = "No encontramos posts con eso.";
        html = `<p class="vacioPublicacionesPerfilLateral">${mensaje}</p>`;
    }

    feed.style.display = "none";
    resultados.innerHTML = html;
};

// Mostrar / ocultar los botones al entrar o salir del buscador
(function () {
    const buscador = document.getElementById("buscadorPersonasNivan");
    if (!buscador) return;
    buscador.addEventListener("focus", actualizarChipsBusquedaPerfilNivan);
    buscador.addEventListener("blur", function () { setTimeout(actualizarChipsBusquedaPerfilNivan, 250); });
})();


// =====================================================
// FEED PERSONALIZADO ("Para vos") en Publicaciones
//
// Con la sesión iniciada, el feed de Perfiles se ordena por lo que
// más te interesa, en vez de solo por fecha:
//   + cuentas que seguís
//   + personas a las que ya les diste like o comentaste
//   + posts donde te etiquetaron
//   + posts populares (likes y comentarios)
//   + que sean recientes (pierden fuerza con los días)
//   - los que ya les diste like y los tuyos bajan un poco
// Sin sesión iniciada queda el orden de siempre.
// =====================================================
const FEED_PARA_VOS_NIVAN = {
    mitadDeVidaHoras: 48,   // cada 48 h un post pierde la mitad de su fuerza por antigüedad
    sigueAlAutor: 5,
    porLikeAlAutor: 1.5, maxLikesAlAutor: 4.5,
    porComentarioAlAutor: 1, maxComentariosAlAutor: 3,
    meEtiquetaron: 4,
    porLikeDelPost: 0.5, maxLikesDelPost: 3,
    porComentarioDelPost: 0.5, maxComentariosDelPost: 2,
    yaLeDiLike: -3,
    esMio: -2
};

function puntuarFeedParaVosNivan(entradas) {
    const C = FEED_PARA_VOS_NIVAN;
    const yo = usuarioActual;
    const likes = leerJSONNivan("nivanLikesPosts", {});
    const comentarios = leerJSONNivan("nivanComentariosPosts", {});
    const miId = yo.id;
    const miTag = yo.idPublico ? String(yo.idPublico).toLowerCase() : null;
    const miTagTienda = yo.idTienda ? String(yo.idTienda).toLowerCase() : null;
    const ahora = Date.now();

    // Cuánto interactuaste con cada autor (una sola pasada por tus likes y comentarios)
    const likesAAutor = {};
    const comentariosAAutor = {};
    Object.keys(likes).forEach(function (idPost) {
        if ((likes[idPost] || []).indexOf(miId) === -1) return;
        const autor = idPost.split("_")[0];
        likesAAutor[autor] = (likesAAutor[autor] || 0) + 1;
    });
    Object.keys(comentarios).forEach(function (idPost) {
        const autor = idPost.split("_")[0];
        (comentarios[idPost] || []).forEach(function (c) {
            if (c.idUsuario === miId) comentariosAAutor[autor] = (comentariosAAutor[autor] || 0) + 1;
        });
    });

    const siguea = {};   // se calcula una sola vez por autor

    return entradas.map(function (e) {
        const u = e.usuario;
        const idPost = u.id + "_" + (e.item.fecha || e.indice);
        let puntos = 0;

        // Recencia: 1 al publicarse, 0,5 a las 48 h, 0,25 a las 96 h...
        const horas = Math.max(0, (ahora - (e.item.fecha || 0)) / 3600000);
        puntos += 4 * Math.pow(0.5, horas / C.mitadDeVidaHoras);

        if (u.id === miId) {
            puntos += C.esMio;
        } else {
            if (siguea[u.id] === undefined) siguea[u.id] = !!personaSigueCuentaNivan(miId, claveCuentaNivan(u.id, "personal"));
            if (siguea[u.id]) puntos += C.sigueAlAutor;

            puntos += Math.min(C.maxLikesAlAutor, (likesAAutor[u.id] || 0) * C.porLikeAlAutor);
            puntos += Math.min(C.maxComentariosAlAutor, (comentariosAAutor[u.id] || 0) * C.porComentarioAlAutor);
        }

        const tags = typeof etiquetasDeTextoNivan === "function" ? etiquetasDeTextoNivan(e.item.texto) : [];
        if ((miTag && tags.indexOf(miTag) !== -1) || (miTagTienda && tags.indexOf(miTagTienda) !== -1)) puntos += C.meEtiquetaron;

        const nLikes = (likes[idPost] || []).length;
        const nComentarios = (comentarios[idPost] || []).length;
        puntos += Math.min(C.maxLikesDelPost, nLikes * C.porLikeDelPost);
        puntos += Math.min(C.maxComentariosDelPost, nComentarios * C.porComentarioDelPost);

        if ((likes[idPost] || []).indexOf(miId) !== -1) puntos += C.yaLeDiLike;

        return { e: e, puntos: puntos };
    });
}

function ordenarFeedParaVosNivan(entradas) {
    return puntuarFeedParaVosNivan(entradas).sort(function (a, b) {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        return (b.e.item.fecha || 0) - (a.e.item.fecha || 0);   // empate: el más nuevo
    }).map(function (x) { return x.e; });
}

// Se engancha al armado del feed: con sesión iniciada usa el orden personalizado.
const _htmlFeedPerfilOriginalNivan = htmlFeedPerfilNivan;
htmlFeedPerfilNivan = function (entradas, opciones) {
    if (!usuarioActual) return _htmlFeedPerfilOriginalNivan(entradas, opciones);

    let ordenadas = entradas;
    try { ordenadas = ordenarFeedParaVosNivan(entradas); } catch (e) { return _htmlFeedPerfilOriginalNivan(entradas, opciones); }

    return _htmlFeedPerfilOriginalNivan(ordenadas, Object.assign({}, opciones, { conservarOrden: true }));
};
