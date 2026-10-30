// ==============================
// POSTS Y PUBLICACIONES: EDITAR (24 h) + @ETIQUETAS EN AZUL AL ESCRIBIR
// ==============================
const HORAS_PARA_EDITAR_POST_NIVAN = 24;

// Solo se puede editar si pasaron menos de 24 horas desde que se publicó.
function puedeEditarPostNivan(item) {
    return !!item && !!item.fecha && (Date.now() - item.fecha) <= HORAS_PARA_EDITAR_POST_NIVAN * 3600 * 1000;
}

function htmlEditadoNivan(item) {
    return item && item.editado ? `<span class="etiquetaEditadoNivan">editado</span>` : "";
}

// ---- @etiquetas en azul mientras se escribe (solo si la cuenta existe) ----
// Se usa así: htmlCampoTextoEtiquetasNivan("miId", 'maxlength="500" placeholder="..."', "texto inicial")
// Dibuja el texto en una capa de atrás y deja el textarea transparente encima.
function htmlEtiquetasAzulesNivan(texto) {
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
            salida += `<span class="etiquetaAzulEscribiendoNivan">@${escaparHTMLNivan(id)}</span>`;
        } else {
            salida += escaparHTMLNivan("@" + id);
        }
        ultimo = posArroba + 1 + id.length;
        patron.lastIndex = ultimo;
    }
    salida += escaparHTMLNivan(crudo.slice(ultimo));
    return salida;
}

function htmlCampoTextoEtiquetasNivan(id, atributos, valorInicial) {
    const valor = valorInicial || "";
    return `<div class="cajaEtiquetasNivan">
        <div class="fondoEtiquetasNivan" id="${id}Fondo" aria-hidden="true">${htmlEtiquetasAzulesNivan(valor)}\u200b</div>
        <textarea id="${id}" class="campoEtiquetasNivan" ${atributos || ""} oninput="actualizarEtiquetasAzulesNivan(this)">${escaparHTMLNivan(valor)}</textarea>
    </div>`;
}

function actualizarEtiquetasAzulesNivan(textarea) {
    if (!textarea) return;
    const fondo = document.getElementById(textarea.id + "Fondo");
    if (fondo) fondo.innerHTML = htmlEtiquetasAzulesNivan(textarea.value) + "\u200b";
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
}

// ---- Editar un post o publicación propia ----
let indiceEdicionPostNivan = null;

function asegurarModalEdicionPostNivan() {
    let overlay = document.getElementById("overlayEdicionPostNivan");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "overlayEdicionPostNivan";
    overlay.className = "overlayEdicionPostNivan";
    overlay.innerHTML = `<div class="cajaEdicionPostNivan">
        <p class="tituloEdicionPostNivan">✏️ Editar</p>
        <p class="pistaCampoPerfil" id="avisoEdicionPostNivan"></p>
        <div id="campoEdicionPostNivan"></div>
        <div class="botonesEdicionPostNivan">
            <button type="button" class="botonConfirmacionCancelar" onclick="cerrarEdicionPostNivan()">Cancelar</button>
            <button type="button" class="botonConfirmacionAceptar" onclick="guardarEdicionPostNivan()">Guardar</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    return overlay;
}

function editarPostFeedNivan() {
    if (typeof postFeedAbiertoNivan !== "undefined" && postFeedAbiertoNivan) editarPostNivan(postFeedAbiertoNivan.indice);
}

function editarPostNivan(indice) {
    if (!usuarioActual || indice === null || indice === undefined) return;
    const portafolio = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio : [];
    const item = portafolio[indice];
    if (!item) return;

    if (!puedeEditarPostNivan(item)) {
        alert("Solo se puede editar dentro de las " + HORAS_PARA_EDITAR_POST_NIVAN + " horas de haberlo publicado.");
        return;
    }

    indiceEdicionPostNivan = indice;
    const overlay = asegurarModalEdicionPostNivan();
    const limite = new Date(item.fecha + HORAS_PARA_EDITAR_POST_NIVAN * 3600 * 1000);
    document.getElementById("avisoEdicionPostNivan").textContent =
        "Podés editarlo hasta el " + limite.toLocaleDateString("es-AR") + " a las " + limite.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + ". Va a aparecer como \"editado\".";
    document.getElementById("campoEdicionPostNivan").innerHTML =
        htmlCampoTextoEtiquetasNivan("textoEdicionPostNivan", 'maxlength="500" placeholder="Escribí algo."', item.texto || "");
    overlay.classList.add("abierto");
    actualizarEtiquetasAzulesNivan(document.getElementById("textoEdicionPostNivan"));
}

function cerrarEdicionPostNivan() {
    const overlay = document.getElementById("overlayEdicionPostNivan");
    if (overlay) overlay.classList.remove("abierto");
    indiceEdicionPostNivan = null;
}

function guardarEdicionPostNivan() {
    if (!usuarioActual || indiceEdicionPostNivan === null) return;
    const indice = indiceEdicionPostNivan;
    const actual = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio.slice() : [];
    const item = actual[indice];
    if (!item) { cerrarEdicionPostNivan(); return; }

    if (!puedeEditarPostNivan(item)) {
        cerrarEdicionPostNivan();
        alert("Ya pasaron las " + HORAS_PARA_EDITAR_POST_NIVAN + " horas: no se puede editar.");
        return;
    }

    const nuevoTexto = document.getElementById("textoEdicionPostNivan").value.trim();
    if (!nuevoTexto && !item.src) {
        alert("Escribí algo: un post sin foto no puede quedar vacío.");
        return;
    }

    if (nuevoTexto === (item.texto || "")) { cerrarEdicionPostNivan(); return; }

    actual[indice] = Object.assign({}, item, { texto: nuevoTexto, editado: true, fechaEdicion: Date.now() });
    if (persistirUsuarioActual({ portafolio: actual }) === false) return;
    cerrarEdicionPostNivan();

    // Refrescar lo que esté abierto.
    const overlayFeed = document.getElementById("overlayPosteoFeedNivan");
    if (overlayFeed && overlayFeed.classList.contains("abierto")) abrirPostFeedNivan(usuarioActual.id, indice);
    const overlayPerfil = document.getElementById("overlayPosteoPerfil");
    if (overlayPerfil && overlayPerfil.classList.contains("abierto")) verPosteoPersonalPerfil(indice);
    try { renderizarFeedPersonalNivan(); } catch (e) {}
    try {
        const panel = document.getElementById("panelMiPerfilNivan");
        if (panel && panel.classList.contains("abierto")) renderizarPerfilLateral();
    } catch (e) {}
}
