// ==============================
// MI TIENDA (Panel de Vendedor)
// ==============================
// La tienda se puede crear y editar ANTES de publicar algo (foto, nombre, identificación y bio).
// Al crearla (usuario.tiendaCreada) ya aparece "Herramientas premium"; "Mis cupones" recién aparece
// cuando se publica la primera prenda.

function asegurarPantallaMiTiendaNivan() {
    let pantalla = document.getElementById("pantallaMiTiendaNivan");
    if (!pantalla) {
        pantalla = document.createElement("div");
        pantalla.className = "pantallaCompleta";
        pantalla.id = "pantallaMiTiendaNivan";
        pantalla.innerHTML = `<div class="tituloPantallaCompleta">
                <button type="button" class="volverAtras" onclick="cerrarPantallaCompleta('pantallaMiTiendaNivan')">← Volver</button>
                <h2>🏪 Mi tienda</h2>
                <p id="subtituloMiTiendaNivan"></p>
            </div>
            <div class="formMiTiendaNivan" id="contenidoMiTiendaNivan"></div>`;
        document.body.appendChild(pantalla);
    }
    return document.getElementById("contenidoMiTiendaNivan");
}

function abrirMiTiendaNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }
    renderizarMiTiendaNivan();
    abrirPantallaCompleta("pantallaMiTiendaNivan");
}

function renderizarMiTiendaNivan() {
    const cont = asegurarPantallaMiTiendaNivan();
    const creada = usuarioTieneTiendaNivan(usuarioActual.id);

    document.getElementById("subtituloMiTiendaNivan").textContent = creada
        ? "Editá cómo se ve tu tienda."
        : "Creá tu tienda. Después podés publicar y usar las herramientas premium.";

    const idActual = obtenerIdTiendaNivan(usuarioActual.id) || generarIdTiendaUnico(usuarioActual.idPublico || usuarioActual.nombre, null);
const baseId = limpiarBaseIdTienda(idActual);
const prefijoId = prefijoIdTiendaNivan(paisDeIdTiendaNivan(idActual));
    const foto = usuarioActual.fotoTienda
        ? `<img id="previewFotoMiTiendaNivan" src="${escaparHTMLNivan(usuarioActual.fotoTienda)}" class="fotoPerfilLateral" alt="Foto de la tienda">`
        : `<div id="previewFotoMiTiendaNivan" class="fotoPerfilLateralVacia">🛍️</div>`;

    cont.innerHTML = `
        <div class="campoEditarPerfilLateral">
            <label>Foto de la tienda</label>
            <div style="margin-bottom:10px;">${foto}</div>
            <input type="file" id="fotoMiTiendaNivan" accept="image/*" onchange="previsualizarFotoPerfilLateralNivan(this, 'previewFotoMiTiendaNivan')">
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="nombreMiTiendaNivan">Nombre de la tienda</label>
            <input type="text" id="nombreMiTiendaNivan" maxlength="60" placeholder="Ej: Nivan Store" value="${escaparHTMLNivan(usuarioActual.nombreTienda || "")}">
            <span class="pistaCampoPerfil">Es el nombre que va a aparecer en tus publicaciones.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="idMiTiendaNivan">Identificación de la tienda</label>
            <div class="campoIdTiendaNivan">
                <span>${prefijoId}</span>
                <input type="text" id="idMiTiendaNivan" maxlength="16" autocapitalize="none" autocomplete="off" value="${escaparHTMLNivan(baseId)}">
            </div>
            <span class="pistaCampoPerfil">No puede repetirse con la de otra tienda.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="bioMiTiendaNivan">Biografía de la tienda</label>
            <textarea id="bioMiTiendaNivan" class="bioPerfilLateralTextarea" maxlength="500" placeholder="Contanos sobre tu tienda: qué vendés, tu estilo, tiempos de entrega...">${escaparHTMLNivan(usuarioActual.bioTienda || "")}</textarea>
        </div>

        <button type="button" class="botonPerfilLateral" onclick="guardarMiTiendaNivan()">${creada ? "💾 Guardar cambios" : "🏪 Crear tienda"}</button>
    `;
}

function guardarMiTiendaNivan() {
    if (!usuarioActual) return;
    const creada = usuarioTieneTiendaNivan(usuarioActual.id);

    const nombre = document.getElementById("nombreMiTiendaNivan").value.trim();
    const baseId = limpiarBaseIdTienda(document.getElementById("idMiTiendaNivan").value);
    const bio = document.getElementById("bioMiTiendaNivan").value.trim();

    if (!creada && !nombre) {
        alert("Poné un nombre para tu tienda.");
        return;
    }
    if (!baseId) {
        alert("La identificación de la tienda no puede quedar vacía.");
        return;
    }

  const nuevoId = prefijoIdTiendaNivan(paisDeIdTiendaNivan(obtenerIdTiendaNivan(usuarioActual.id))) + baseId;
       if (!idTiendaEstaDisponible(nuevoId, usuarioActual.id)) {
        alert("Esa identificación ya la usa otra tienda. Elegí otra.");
        return;
    }

    const vista = document.getElementById("previewFotoMiTiendaNivan");
    const foto = (vista && vista.tagName === "IMG") ? vista.src : (usuarioActual.fotoTienda || "");

    const ok = persistirUsuarioActual({
        nombreTienda: nombre,
        idTienda: nuevoId,
        fotoTienda: foto,
        bioTienda: bio,
        tiendaCreada: true
    });
    if (ok === false) return;

    mostrarToastNivan(creada ? "Tienda actualizada." : "¡Tienda creada!");
    actualizarBotonMisCuponesNivan();
    renderizarMiTiendaNivan();
}
