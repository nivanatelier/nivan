// =====================================================
// OJO PARA VER / OCULTAR CONTRASEÑAS
// Se pone solo en TODOS los campos de contraseña,
// también en los paneles que se dibujan después.
// =====================================================
const OJO_ABIERTO_NIVAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_CERRADO_NIVAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function ponerOjoEnPasswordNivan(input) {
    if (input.dataset.ojoNivan) return;
    input.dataset.ojoNivan = "1";

    const estilo = getComputedStyle(input);
    const envoltura = document.createElement("div");
    envoltura.className = "envolturaPasswordNivan";
    envoltura.style.marginTop = estilo.marginTop;
    envoltura.style.marginBottom = estilo.marginBottom;
    input.style.margin = "0";
    input.parentNode.insertBefore(envoltura, input);
    envoltura.appendChild(input);

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "ojoPasswordNivan";
    boton.setAttribute("aria-label", "Mostrar contraseña");
    boton.innerHTML = OJO_CERRADO_NIVAN;

    // Evita que el campo pierda el foco (y el teclado se cierre) al tocar el ojo
    boton.addEventListener("mousedown", function (e) { e.preventDefault(); });
    boton.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    boton.addEventListener("click", function () {
        const teniaFoco = document.activeElement === input;
        // Si no tenía foco, el cursor va al final del texto
        const inicio = teniaFoco && input.selectionStart !== null ? input.selectionStart : input.value.length;
        const fin = teniaFoco && input.selectionEnd !== null ? input.selectionEnd : input.value.length;

        const mostrar = input.type === "password";
        input.type = mostrar ? "text" : "password";
        boton.innerHTML = mostrar ? OJO_ABIERTO_NIVAN : OJO_CERRADO_NIVAN;
        boton.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");

        function devolverCursor() {
            if (teniaFoco) input.focus();
            try { input.setSelectionRange(inicio, fin); } catch (e) {}
        }
        devolverCursor();
        // Algunos navegadores del celu lo vuelven a resetear un instante después
        setTimeout(devolverCursor, 0);
    });
    envoltura.appendChild(boton);
}

function revisarPasswordsNivan() {
    document.querySelectorAll('input[type="password"]').forEach(ponerOjoEnPasswordNivan);
}
revisarPasswordsNivan();
new MutationObserver(revisarPasswordsNivan).observe(document.body, { childList: true, subtree: true });


// =====================================================
// LIKES, COMENTARIOS Y REPORTES EN PUBLICACIONES
// Se guardan aparte (nivanLikesPosts / nivanComentariosPosts),
// el id de cada post es  idUsuario_fecha.
// =====================================================
let postInteraccionActualNivan = null;

// ---- Estado de los comentarios ----
let comentarioRespondiendoNivan = null;  // { idPadre, nombre }
let menuComentarioAbiertoNivan = null;   // id del comentario con el ⋮ abierto

function likesDePostNivan(idPost) {
    return leerJSONNivan("nivanLikesPosts", {})[idPost] || [];
}

function leerComentariosPostNivan(idPost) {
    return leerJSONNivan("nivanComentariosPosts", {})[idPost] || [];
}

function guardarComentariosPostNivan(idPost, lista) {
    const todos = leerJSONNivan("nivanComentariosPosts", {});
    todos[idPost] = lista;
    return guardarJSONNivan("nivanComentariosPosts", todos);
}

function comentariosVisiblesPostNivan(idPost) {
    return leerComentariosPostNivan(idPost).filter(function (c) {
        if (yaReportadoNivan("comentario", c.id)) return false;                          // lo que reportaste se te oculta
        if (usuarioActual && hayBloqueoEntreNivan(usuarioActual.id, c.idUsuario)) return false; // bloqueados
        return true;
    });
}

function montarInteraccionPostNivan(idOverlay, idUsuario, indice) {
    const u = obtenerUsuarioPorIdNivan(idUsuario);
    const item = u && Array.isArray(u.portafolio) ? u.portafolio[indice] : null;
    if (!item) return;
    comentarioRespondiendoNivan = null;
    menuComentarioAbiertoNivan = null;
    postInteraccionActualNivan = {
        overlay: idOverlay,
        idUsuario: idUsuario,
        idPost: idUsuario + "_" + (item.fecha || indice),
        titulo: "de " + obtenerNombreMostradoUsuario(u)
    };
    dibujarInteraccionPostNivan();
}

function htmlComentarioPostNivan(c, esDuenoPost, esRespuesta) {
    const mio = !!(usuarioActual && c.idUsuario === usuarioActual.id);
    const likes = Array.isArray(c.likes) ? c.likes : [];
    const yoLike = !!(usuarioActual && likes.indexOf(usuarioActual.id) !== -1);
    const puedeBorrar = mio || esDuenoPost;
    const abierto = menuComentarioAbiertoNivan === c.id;
    const autor = obtenerUsuarioPorIdNivan(c.idUsuario);
    const avatar = autor && autor.foto
        ? `<img class="avatarComentarioPostNivan" src="${escaparHTMLNivan(autor.foto)}" alt="">`
        : `<div class="avatarComentarioPostNivan avatarVacio">👤</div>`;

    return `<div class="comentarioPostNivan">
        ${avatar}
        <div class="cuerpoComentarioPostNivan">
            <div class="cabeceraComentarioPostNivan">
                <strong>${escaparHTMLNivan(c.nombre)}</strong>
                <small>${new Date(c.fecha).toLocaleDateString("es-AR")}</small>
                <div class="menuComentarioPostNivan">
                    <button type="button" class="puntosComentarioPostNivan" onclick="alternarMenuComentarioPostNivan('${c.id}')" aria-label="Más opciones">⋮</button>
                    ${abierto ? `<div class="desplegableComentarioPostNivan">
                        ${mio ? "" : `<button type="button" onclick="reportarComentarioPostNivan('${c.id}')">${esAdminNivan() ? "🛡️ Moderar" : "🚩 Reportar"}</button>`}
                        ${puedeBorrar ? `<button type="button" onclick="borrarComentarioPostNivan('${c.id}')">🗑 Borrar</button>` : ""}
                    </div>` : ""}
                </div>
            </div>
            <p>${escaparHTMLNivan(c.texto)}</p>
            <div class="accionesComentarioPostNivan">
                <button type="button" class="${yoLike ? "activo" : ""}" onclick="alternarLikeComentarioPostNivan('${c.id}')">${yoLike ? "❤️" : "🤍"} ${likes.length || ""}</button>
                <button type="button" onclick="responderComentarioPostNivan('${c.id}')">💬 Responder</button>
            </div>
        </div>
    </div>`;
}

function dibujarInteraccionPostNivan() {
    const ctx = postInteraccionActualNivan;
    if (!ctx) return;
    const overlay = document.getElementById(ctx.overlay);
    const cuerpo = overlay && overlay.querySelector(".cuerpoPosteoPerfil");
    if (!cuerpo) return;

    let caja = cuerpo.querySelector(".interaccionPostNivan");
    const textoEscrito = caja && caja.querySelector("input") ? caja.querySelector("input").value : "";
    if (!caja) {
        caja = document.createElement("div");
        caja.className = "interaccionPostNivan";
        const parrafo = cuerpo.querySelector("p");
        if (parrafo) parrafo.insertAdjacentElement("afterend", caja);
        else cuerpo.appendChild(caja);
    }

    const likes = likesDePostNivan(ctx.idPost);
    const yoLike = !!(usuarioActual && likes.indexOf(usuarioActual.id) !== -1);
    const comentarios = comentariosVisiblesPostNivan(ctx.idPost);
    const principales = comentarios.filter(function (c) { return !c.idPadre; });
    const esDuenoPost = !!(usuarioActual && usuarioActual.id === ctx.idUsuario);
    const yaReporte = yaReportadoNivan("post", ctx.idPost);

    const htmlComentarios = principales.map(function (c) {
        const respuestas = comentarios
            .filter(function (r) { return r.idPadre === c.id; })
            .map(function (r) { return htmlComentarioPostNivan(r, esDuenoPost, true); })
            .join("");
        return htmlComentarioPostNivan(c, esDuenoPost, false)
            + (respuestas ? `<div class="respuestasComentarioPostNivan">${respuestas}</div>` : "");
    }).join("") || `<p class="sinComentariosPostNivan">Todavía no hay comentarios. ¡Sé el primero!</p>`;

    const avisoResponder = comentarioRespondiendoNivan
        ? `<div class="avisoRespondiendoNivan">Respondiendo a <b>${escaparHTMLNivan(comentarioRespondiendoNivan.nombre)}</b>
             <button type="button" onclick="cancelarRespuestaPostNivan()" aria-label="Cancelar">✕</button></div>`
        : "";

    caja.innerHTML = `
        <div class="barraAccionesPostNivan">
            <button type="button" class="${yoLike ? "activo" : ""}" onclick="alternarLikePostNivan()">${yoLike ? "❤️" : "🤍"} ${likes.length}</button>
            <span>💬 ${comentarios.length}</span>
            ${esDuenoPost ? "" : `<button type="button" onclick="reportarPostNivan()" ${yaReporte && !esAdminNivan() ? "disabled" : ""}>${esAdminNivan() ? "🛡️ Moderar" : (yaReporte ? "🚩 Reportado" : "🚩 Reportar")}</button>`}
        </div>
        <div class="listaComentariosPostNivan">${htmlComentarios}</div>
        ${avisoResponder}
        <div class="nuevoComentarioPostNivan">
            <input type="text" id="inputComentarioPostNivan" maxlength="300" placeholder="${comentarioRespondiendoNivan ? "Escribí tu respuesta…" : "Escribí un comentario…"}" onkeydown="if(event.key==='Enter')enviarComentarioPostNivan()">
            <button type="button" onclick="enviarComentarioPostNivan()">Enviar</button>
        </div>`;
    caja.querySelector("input").value = textoEscrito;
}

function pedirLoginPostNivan() {
    alert("Iniciá sesión para continuar.");
    if (typeof cerrarPostFeedNivan === "function") cerrarPostFeedNivan();
    abrirCuenta();
}

function alternarLikePostNivan() {
    if (!usuarioActual) { pedirLoginPostNivan(); return; }
    const id = postInteraccionActualNivan.idPost;
    const todos = leerJSONNivan("nivanLikesPosts", {});
    const lista = todos[id] || [];
    const i = lista.indexOf(usuarioActual.id);
    if (i === -1) lista.push(usuarioActual.id); else lista.splice(i, 1);
    todos[id] = lista;
    if (guardarJSONNivan("nivanLikesPosts", todos)) dibujarInteraccionPostNivan();
}

// ---- Like en un comentario ----
function alternarLikeComentarioPostNivan(idComentario) {
    if (!usuarioActual) { pedirLoginPostNivan(); return; }
    const idPost = postInteraccionActualNivan.idPost;
    const lista = leerComentariosPostNivan(idPost);
    const c = lista.find(function (x) { return x.id === idComentario; });
    if (!c) return;
    c.likes = Array.isArray(c.likes) ? c.likes : [];
    const i = c.likes.indexOf(usuarioActual.id);
    if (i === -1) c.likes.push(usuarioActual.id); else c.likes.splice(i, 1);
    if (guardarComentariosPostNivan(idPost, lista)) dibujarInteraccionPostNivan();
}

// ---- Responder (comentar un comentario) ----
function responderComentarioPostNivan(idComentario) {
    if (!usuarioActual) { pedirLoginPostNivan(); return; }
    const c = leerComentariosPostNivan(postInteraccionActualNivan.idPost)
        .find(function (x) { return x.id === idComentario; });
    if (!c) return;
    // Si se responde a una respuesta, queda dentro del mismo hilo
    comentarioRespondiendoNivan = { idPadre: c.idPadre || c.id, nombre: c.nombre };
    menuComentarioAbiertoNivan = null;
    dibujarInteraccionPostNivan();
    const input = document.getElementById("inputComentarioPostNivan");
    if (input) input.focus();
}

function cancelarRespuestaPostNivan() {
    comentarioRespondiendoNivan = null;
    dibujarInteraccionPostNivan();
}

function enviarComentarioPostNivan() {
    if (!usuarioActual) { pedirLoginPostNivan(); return; }
    const input = document.getElementById("inputComentarioPostNivan");
    const texto = limpiarTextoNivan(input.value, 300).trim();
    if (!texto) return;

    const idPost = postInteraccionActualNivan.idPost;
    const lista = leerComentariosPostNivan(idPost);
    const nuevo = {
        id: "COM-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        idUsuario: usuarioActual.id,
        nombre: obtenerNombreMostradoUsuario(usuarioActual),
        texto: texto,
        fecha: Date.now(),
        likes: []
    };
    if (comentarioRespondiendoNivan) nuevo.idPadre = comentarioRespondiendoNivan.idPadre;
    lista.push(nuevo);

    if (!guardarComentariosPostNivan(idPost, lista)) return;
    input.value = "";
    comentarioRespondiendoNivan = null;
    dibujarInteraccionPostNivan();
}

// ---- Menú ⋮ del comentario ----
function alternarMenuComentarioPostNivan(idComentario) {
    menuComentarioAbiertoNivan = menuComentarioAbiertoNivan === idComentario ? null : idComentario;
    dibujarInteraccionPostNivan();
}

// Tocar fuera del menú ⋮ lo cierra
document.addEventListener("click", function (e) {
    if (!menuComentarioAbiertoNivan) return;
    if (e.target.closest && e.target.closest(".menuComentarioPostNivan")) return;
    menuComentarioAbiertoNivan = null;
    dibujarInteraccionPostNivan();
});

function borrarComentarioPostNivan(idComentario) {
    const idPost = postInteraccionActualNivan.idPost;
    menuComentarioAbiertoNivan = null;
    mostrarConfirmacionNivan("¿Querés borrar este comentario?", function () {
        // se borra el comentario y sus respuestas
        const lista = leerComentariosPostNivan(idPost).filter(function (c) {
            return c.id !== idComentario && c.idPadre !== idComentario;
        });
        guardarComentariosPostNivan(idPost, lista);
        dibujarInteraccionPostNivan();
    });
}

function reportarPostNivan() {
    abrirReporteNivan("post", postInteraccionActualNivan.idPost, postInteraccionActualNivan.titulo);
}

function reportarComentarioPostNivan(idComentario) {
    const c = leerComentariosPostNivan(postInteraccionActualNivan.idPost)
        .find(function (x) { return x.id === idComentario; });
    menuComentarioAbiertoNivan = null;
    dibujarInteraccionPostNivan();
    abrirReporteNivan("comentario", idComentario, c ? c.texto.slice(0, 40) : "");
}

// ---- Enganche con lo que ya existe (sin tocar los otros archivos) ----
const _abrirPostFeedOriginalNivan = abrirPostFeedNivan;
abrirPostFeedNivan = function (idUsuario, indice) {
    _abrirPostFeedOriginalNivan(idUsuario, indice);
    montarInteraccionPostNivan("overlayPosteoFeedNivan", idUsuario, indice);
};

const _verPosteoPerfilOriginalNivan = verPosteoPersonalPerfil;
verPosteoPersonalPerfil = function (indice) {
    _verPosteoPerfilOriginalNivan(indice);
    if (usuarioActual) montarInteraccionPostNivan("overlayPosteoPerfil", usuarioActual.id, indice);
};

const _cerrarPostFeedOriginalNivan = cerrarPostFeedNivan;
cerrarPostFeedNivan = function () { postInteraccionActualNivan = null; _cerrarPostFeedOriginalNivan(); };

const _cerrarPosteoPerfilOriginalNivan = cerrarPosteoPerfilLateral;
cerrarPosteoPerfilLateral = function () { postInteraccionActualNivan = null; _cerrarPosteoPerfilOriginalNivan(); };

// Después de enviar un reporte, el botón pasa a "Reportado" / se oculta el comentario.
const _enviarReporteOriginalNivan = enviarReporteNivan;
enviarReporteNivan = function () {
    _enviarReporteOriginalNivan();
    if (postInteraccionActualNivan) dibujarInteraccionPostNivan();
};

// Cuando elegís Publicación / Post la barra cambia de alto: el + se reacomoda
const _elegirFormatoOriginalNivan = elegirFormatoNuevaPublicacionPerfil;
elegirFormatoNuevaPublicacionPerfil = function (formato) {
    _elegirFormatoOriginalNivan(formato);
    ajustarBotonMasPerfilNivan();
};
