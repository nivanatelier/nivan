// ==============================
// VACANTES: la tienda publica que necesita trabajadores y la gente se postula.
// Se administra desde Panel de Vendedor → Vacantes y se ve en el perfil de la tienda.
// Quien se postula manda su CV automáticamente si lo tiene cargado (Perfil → Currículum).
// ==============================
const VACANTE_TIPOS_NIVAN = [
    "Diseñador/a de ropa", "Costurero/a", "Patronista / moldería", "Corte y confección",
    "Bordado y accesorios", "Modelo", "Fotógrafo/a", "Editor/a de video",
    "Community manager / redes", "Atención al cliente", "Vendedor/a",
    "Armado de pedidos y envíos", "Otro"
];
const VACANTE_MODALIDADES_NIVAN = ["Presencial", "Remoto", "Mixto"];
const VACANTE_DEDICACIONES_NIVAN = ["Por proyecto", "Por pieza o encargo", "Medio tiempo", "Tiempo completo", "Colaboración puntual"];
const VACANTE_EXPERIENCIAS_NIVAN = ["No hace falta experiencia", "Con experiencia", "Se valora el portafolio"];
const ESTADOS_POSTULACION_NIVAN = { nuevo: "Nueva", visto: "Vista", preseleccionado: "Preseleccionada", descartado: "Descartada" };

// ---- Datos (se guardan en este dispositivo, como el resto de la app) ----
function obtenerVacantesNivan() { return leerJSONNivan("nivanVacantes", []); }
function guardarVacantesNivan(lista) { guardarJSONNivan("nivanVacantes", lista); }
function obtenerPostulacionesNivan() { return leerJSONNivan("nivanPostulaciones", []); }
function guardarPostulacionesNivan(lista) { guardarJSONNivan("nivanPostulaciones", lista); }

function hoyISOVacantesNivan() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function vacanteVencidaNivan(v) { return !!v.limite && hoyISOVacantesNivan() > v.limite; }
function vacanteAbiertaNivan(v) { return v.estado === "abierta" && !vacanteVencidaNivan(v); }

function vacantesDeTiendaNivan(idDuenio, soloAbiertas) {
    const pais = paisNivan() || "AR";
    return obtenerVacantesNivan().filter(function(v) {
        if (v.tiendaId !== idDuenio || (v.pais || "AR") !== pais) return false;
        return soloAbiertas ? vacanteAbiertaNivan(v) : true;
    }).sort(function(a, b) { return b.fecha - a.fecha; });
}

function contarPostulacionesNivan(idVacante) {
    const lista = obtenerPostulacionesNivan().filter(function(p) { return p.vacanteId === idVacante; });
    return { total: lista.length, nuevos: lista.filter(function(p) { return p.estado === "nuevo"; }).length };
}

function opcionesSelectVacantesNivan(lista, elegido) {
    return lista.map(function(t) {
        return `<option value="${escaparHTMLNivan(t)}"${t === elegido ? " selected" : ""}>${escaparHTMLNivan(t)}</option>`;
    }).join("");
}

function fechaCortaVacantesNivan(ts) { return new Date(ts).toLocaleDateString("es-AR"); }

// Pantalla completa creada la primera vez que se usa.
function asegurarPantallaVacantesNivan(id, titulo, subtitulo) {
    let pantalla = document.getElementById(id);
    if (!pantalla) {
        pantalla = document.createElement("div");
        pantalla.className = "pantallaCompleta";
        pantalla.id = id;
        pantalla.innerHTML = `<div class="tituloPantallaCompleta">
                <button type="button" class="volverAtras" onclick="cerrarPantallaCompleta('${id}')">← Volver</button>
                <h2 id="${id}Titulo"></h2>
                <p id="${id}Sub"></p>
            </div>
            <div class="contenidoVacantesNivan" id="${id}Contenido"></div>`;
        document.body.appendChild(pantalla);
    }
    document.getElementById(id + "Titulo").textContent = titulo;
    document.getElementById(id + "Sub").textContent = subtitulo || "";
    return document.getElementById(id + "Contenido");
}

function chipsVacanteNivan(v) {
    const chips = [v.tipo, v.modalidad, v.dedicacion].filter(Boolean);
    return `<div class="chipsVacanteNivan">${chips.map(function(c) { return `<span>${escaparHTMLNivan(c)}</span>`; }).join("")}</div>`;
}

// ==============================
// PANEL (la tienda administra sus vacantes)
// ==============================
function abrirPanelVacantesNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }
    if (!usuarioTieneTiendaNivan(usuarioActual.id)) {
        alert("Para publicar vacantes primero necesitás tu tienda: publicá algo en Panel de Vendedor → Crear publicación nueva.");
        return;
    }
    renderizarPanelVacantesNivan();
    abrirPantallaCompleta("pantallaVacantesNivan");
}

function renderizarPanelVacantesNivan() {
    const cont = asegurarPantallaVacantesNivan("pantallaVacantesNivan", "👥 Vacantes", "Publicá qué trabajadores necesita tu tienda.");
    const mias = vacantesDeTiendaNivan(usuarioActual.id, false);

    cont.innerHTML = `
        <button type="button" class="botonPerfilLateral" onclick="abrirFormVacanteNivan()">➕ Nueva vacante</button>
        <p class="notaVacantesNivan">Quienes se postulan mandan su CV automáticamente si lo tienen cargado. Cada postulación te llega como notificación.</p>
        ${mias.length ? mias.map(function(v) {
            const c = contarPostulacionesNivan(v.id);
            const vencida = vacanteVencidaNivan(v);
            const estadoTxt = vencida ? "Vencida" : (v.estado === "abierta" ? "Abierta" : (v.estado === "pausada" ? "Pausada" : "Cerrada"));
            const claseEstado = vencida ? "cerrada" : v.estado;
            const id = escaparHTMLNivan(v.id);
            return `<div class="tarjetaVacanteNivan">
                <div class="cabeceraTarjetaVacanteNivan">
                    <strong>${escaparHTMLNivan(v.titulo)}</strong>
                    <span class="estadoVacanteNivan ${claseEstado}">${estadoTxt}</span>
                </div>
                ${chipsVacanteNivan(v)}
                <p class="datoVacanteNivan">👤 ${c.total} postulante${c.total === 1 ? "" : "s"}${c.nuevos ? ` · <b>${c.nuevos} nuevo${c.nuevos === 1 ? "" : "s"}</b>` : ""} · publicada el ${fechaCortaVacantesNivan(v.fecha)}${v.limite ? ` · hasta el ${escaparHTMLNivan(v.limite.split("-").reverse().join("/"))}` : ""}</p>
                <div class="botonesVacanteNivan">
                    <button type="button" onclick="abrirPostulantesNivan('${id}')">👥 Postulantes</button>
                    <button type="button" onclick="abrirFormVacanteNivan('${id}')">✏️ Editar</button>
                    ${v.estado === "abierta" && !vencida ? `<button type="button" onclick="cambiarEstadoVacanteNivan('${id}', 'pausada')">⏸ Pausar</button>` : `<button type="button" onclick="cambiarEstadoVacanteNivan('${id}', 'abierta')">▶ Reabrir</button>`}
                    ${v.estado !== "cerrada" ? `<button type="button" onclick="cambiarEstadoVacanteNivan('${id}', 'cerrada')">✖ Cerrar</button>` : ""}
                    <button type="button" onclick="eliminarVacanteNivan('${id}')">🗑 Eliminar</button>
                </div>
            </div>`;
        }).join("") : `<p class="vacioPublicacionesPerfilLateral">Todavía no publicaste ninguna vacante.</p>`}
    `;
}

function cambiarEstadoVacanteNivan(id, estado) {
    const lista = obtenerVacantesNivan();
    const v = lista.find(function(x) { return x.id === id; });
    if (!v || !usuarioActual || v.tiendaId !== usuarioActual.id) return;
    if (estado === "abierta" && vacanteVencidaNivan(v)) {
        alert("La fecha límite ya pasó. Editá la vacante y poné una fecha nueva (o dejala sin fecha) para reabrirla.");
        return;
    }
    v.estado = estado;
    guardarVacantesNivan(lista);
    renderizarPanelVacantesNivan();
}

function eliminarVacanteNivan(id) {
    mostrarConfirmacionNivan("¿Querés borrar esta vacante y sus postulaciones?", function() {
        guardarVacantesNivan(obtenerVacantesNivan().filter(function(v) { return !(v.id === id && usuarioActual && v.tiendaId === usuarioActual.id); }));
        guardarPostulacionesNivan(obtenerPostulacionesNivan().filter(function(p) { return p.vacanteId !== id; }));
        renderizarPanelVacantesNivan();
    });
}

// ==============================
// FORMULARIO (crear / editar)
// ==============================
let vacanteEnEdicionNivan = null;

function abrirFormVacanteNivan(idEditar) {
    if (!usuarioActual) return;
    const v = idEditar ? obtenerVacantesNivan().find(function(x) { return x.id === idEditar && x.tiendaId === usuarioActual.id; }) : null;
    vacanteEnEdicionNivan = v ? v.id : null;
    const d = v || { titulo: "", tipo: VACANTE_TIPOS_NIVAN[0], modalidad: "Presencial", dedicacion: "Por proyecto", cantidad: 1, ubicacion: "", pago: "", experiencia: VACANTE_EXPERIENCIAS_NIVAN[0], descripcion: "", requisitos: "", limite: "", cvObligatorio: false };

    const cont = asegurarPantallaVacantesNivan("pantallaFormVacanteNivan", v ? "✏️ Editar vacante" : "➕ Nueva vacante", "Contá qué necesitás y qué ofrecés.");
    cont.innerHTML = `
        <div class="campoVacanteNivan"><label for="vacTitulo">Puesto *</label>
            <input type="text" id="vacTitulo" maxlength="60" placeholder="Ej: Costurera para colección de otoño" value="${escaparHTMLNivan(d.titulo)}"></div>

        <div class="campoVacanteNivan"><label for="vacTipo">Tipo de trabajo *</label>
            <select id="vacTipo">${opcionesSelectVacantesNivan(VACANTE_TIPOS_NIVAN, d.tipo)}</select></div>

        <div class="filaDosVacanteNivan">
            <div class="campoVacanteNivan"><label for="vacModalidad">Modalidad</label>
                <select id="vacModalidad">${opcionesSelectVacantesNivan(VACANTE_MODALIDADES_NIVAN, d.modalidad)}</select></div>
            <div class="campoVacanteNivan"><label for="vacDedicacion">Dedicación</label>
                <select id="vacDedicacion">${opcionesSelectVacantesNivan(VACANTE_DEDICACIONES_NIVAN, d.dedicacion)}</select></div>
        </div>

        <div class="filaDosVacanteNivan">
            <div class="campoVacanteNivan"><label for="vacCantidad">Cantidad de personas</label>
                <input type="number" id="vacCantidad" min="1" max="99" value="${Number(d.cantidad) || 1}"></div>
            <div class="campoVacanteNivan"><label for="vacExperiencia">Experiencia</label>
                <select id="vacExperiencia">${opcionesSelectVacantesNivan(VACANTE_EXPERIENCIAS_NIVAN, d.experiencia)}</select></div>
        </div>

        <div class="campoVacanteNivan"><label for="vacUbicacion">Zona / ciudad (opcional)</label>
            <input type="text" id="vacUbicacion" maxlength="60" placeholder="Ej: San Juan capital" value="${escaparHTMLNivan(d.ubicacion)}"></div>

        <div class="campoVacanteNivan"><label for="vacPago">Pago (opcional)</label>
            <input type="text" id="vacPago" maxlength="60" placeholder="A convenir / Ej: por prenda terminada" value="${escaparHTMLNivan(d.pago)}"></div>

        <div class="campoVacanteNivan"><label for="vacDescripcion">Descripción *</label>
            <textarea id="vacDescripcion" maxlength="800" rows="4" placeholder="Qué vas a necesitar que haga la persona, horarios, herramientas...">${escaparHTMLNivan(d.descripcion)}</textarea></div>

        <div class="campoVacanteNivan"><label for="vacRequisitos">Requisitos (opcional)</label>
            <textarea id="vacRequisitos" maxlength="500" rows="3" placeholder="Ej: máquina propia, disponibilidad por la tarde...">${escaparHTMLNivan(d.requisitos)}</textarea></div>

        <div class="campoVacanteNivan"><label for="vacLimite">Fecha límite para postularse (opcional)</label>
            <input type="date" id="vacLimite" min="${hoyISOVacantesNivan()}" value="${escaparHTMLNivan(d.limite || "")}"></div>

        <label class="checkVacanteNivan"><input type="checkbox" id="vacCvObligatorio"${d.cvObligatorio ? " checked" : ""}> Pedir CV obligatorio (no se puede postular quien no lo tenga cargado)</label>

        <button type="button" class="botonPerfilLateral" onclick="guardarVacanteNivan()">💾 ${v ? "Guardar cambios" : "Publicar vacante"}</button>
    `;
    abrirPantallaCompleta("pantallaFormVacanteNivan");
}

function guardarVacanteNivan() {
    if (!usuarioActual) return;
    if (!vacanteEnEdicionNivan && !exigirVerificacionNivan()) return;

    const val = function(id) { return document.getElementById(id).value.trim(); };
    const titulo = val("vacTitulo");
    const descripcion = val("vacDescripcion");

    if (!titulo) { alert("Escribí el puesto que buscás."); return; }
    if (!descripcion) { alert("Contá en la descripción qué necesitás."); return; }

    const cantidad = Math.min(99, Math.max(1, parseInt(val("vacCantidad"), 10) || 1));
    const limite = val("vacLimite");
    if (limite && limite < hoyISOVacantesNivan()) { alert("La fecha límite no puede ser anterior a hoy."); return; }

    const datos = {
        titulo: titulo,
        tipo: val("vacTipo"),
        modalidad: val("vacModalidad"),
        dedicacion: val("vacDedicacion"),
        cantidad: cantidad,
        experiencia: val("vacExperiencia"),
        ubicacion: val("vacUbicacion"),
        pago: val("vacPago"),
        descripcion: descripcion,
        requisitos: val("vacRequisitos"),
        limite: limite,
        cvObligatorio: document.getElementById("vacCvObligatorio").checked
    };

    const lista = obtenerVacantesNivan();
    if (vacanteEnEdicionNivan) {
        const v = lista.find(function(x) { return x.id === vacanteEnEdicionNivan && x.tiendaId === usuarioActual.id; });
        if (!v) return;
        Object.assign(v, datos);
        if (v.estado === "cerrada" && !vacanteVencidaNivan(v)) { /* se mantiene cerrada hasta que la reabra */ }
    } else {
        lista.unshift(Object.assign({
            id: "VAC-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            tiendaId: usuarioActual.id,
            pais: paisNivan() || "AR",
            estado: "abierta",
            fecha: Date.now()
        }, datos));
    }
    guardarVacantesNivan(lista);
    vacanteEnEdicionNivan = null;
    cerrarPantallaCompleta("pantallaFormVacanteNivan");
    renderizarPanelVacantesNivan();
}

// ==============================
// POSTULANTES (lo ve el dueño de la tienda)
// ==============================
function abrirPostulantesNivan(idVacante) {
    const v = obtenerVacantesNivan().find(function(x) { return x.id === idVacante; });
    if (!v || !usuarioActual || v.tiendaId !== usuarioActual.id) return;
    renderizarPostulantesNivan(idVacante, true);
    abrirPantallaCompleta("pantallaPostulantesNivan");
}

function renderizarPostulantesNivan(idVacante, marcarVistas) {
    const v = obtenerVacantesNivan().find(function(x) { return x.id === idVacante; });
    if (!v) return;
    const cont = asegurarPantallaVacantesNivan("pantallaPostulantesNivan", "👥 Postulantes", v.titulo);
    const todas = obtenerPostulacionesNivan();
    const lista = todas.filter(function(p) { return p.vacanteId === idVacante; }).sort(function(a, b) { return b.fecha - a.fecha; });

    cont.innerHTML = lista.length ? lista.map(function(p) {
        const u = obtenerUsuarioPorIdNivan(p.usuarioId);
        const nombre = u ? obtenerNombreMostradoUsuario(u) : "Cuenta eliminada";
        const idTxt = u && u.idPublico ? `@${escaparHTMLNivan(u.idPublico)}` : "";
        const cvVivo = !!(u && u.curriculum && u.curriculum.src);
        const idP = escaparHTMLNivan(p.id);
        const idU = escaparHTMLNivan(p.usuarioId);
        return `<div class="tarjetaVacanteNivan">
            <div class="cabeceraTarjetaVacanteNivan">
                <strong>${escaparHTMLNivan(nombre)} <span class="idPostulanteNivan">${idTxt}</span></strong>
                <span class="estadoVacanteNivan ${p.estado === "nuevo" ? "abierta" : (p.estado === "descartado" ? "cerrada" : "pausada")}">${ESTADOS_POSTULACION_NIVAN[p.estado] || "Nueva"}</span>
            </div>
            <p class="datoVacanteNivan">Se postuló el ${fechaCortaVacantesNivan(p.fecha)} · ${p.conCV ? `📄 CV adjunto${p.cvNombre ? ": " + escaparHTMLNivan(p.cvNombre) : ""}` : "Sin CV"}</p>
            ${p.mensaje ? `<p class="mensajePostulanteNivan">${escaparHTMLNivan(p.mensaje)}</p>` : ""}
            <div class="botonesVacanteNivan">
                ${p.conCV ? (cvVivo ? `<button type="button" onclick="verCVPostulanteNivan('${idU}')">📄 Ver CV</button>` : `<button type="button" disabled>CV no disponible</button>`) : ""}
                ${u ? `<button type="button" onclick="abrirPerfilPersonalNivan('${idU}', true)">👤 Ver perfil</button>
                <button type="button" onclick="abrirChatPersonalNivan('${idU}')">💬 Chatear</button>` : ""}
                <button type="button" onclick="cambiarEstadoPostulacionNivan('${idP}', 'preseleccionado')">⭐ Preseleccionar</button>
                <button type="button" onclick="cambiarEstadoPostulacionNivan('${idP}', 'descartado')">✖ Descartar</button>
            </div>
        </div>`;
    }).join("") : `<p class="vacioPublicacionesPerfilLateral">Todavía nadie se postuló.</p>`;

    // Lo que ya se vio deja de ser "nuevo" (se muestra la próxima vez).
    if (marcarVistas && todas.some(function(p) { return p.vacanteId === idVacante && p.estado === "nuevo"; })) {
        todas.forEach(function(p) { if (p.vacanteId === idVacante && p.estado === "nuevo") p.estado = "visto"; });
        guardarPostulacionesNivan(todas);
        try { renderizarPanelVacantesNivan(); } catch (e) {}
    }
    vacanteVistaPostulantesNivan = idVacante;
}
let vacanteVistaPostulantesNivan = null;

function cambiarEstadoPostulacionNivan(idPostulacion, estado) {
    const todas = obtenerPostulacionesNivan();
    const p = todas.find(function(x) { return x.id === idPostulacion; });
    if (!p) return;
    const v = obtenerVacantesNivan().find(function(x) { return x.id === p.vacanteId; });
    if (!v || !usuarioActual || v.tiendaId !== usuarioActual.id) return;
    p.estado = estado;
    guardarPostulacionesNivan(todas);
    renderizarPostulantesNivan(p.vacanteId, false);
}

function verCVPostulanteNivan(idUsuario) {
    const u = obtenerUsuarioPorIdNivan(idUsuario);
    if (!u || !u.curriculum || !u.curriculum.src) { alert("El CV ya no está disponible."); return; }
    const ventana = window.open();
    if (ventana) ventana.location.href = u.curriculum.src;
    else alert("Tu navegador bloqueó la ventana. Permití las ventanas emergentes para ver el CV.");
}

// ==============================
// PERFIL DE LA TIENDA (lo ve cualquiera) + DETALLE Y POSTULACIÓN
// ==============================
function renderizarVacantesPerfilVendedorNivan(idDuenio, esMiPerfil, restringido) {
    const cont = document.getElementById("vacantesPerfilVendedorNivan");
    if (!cont) return;
    if (!idDuenio || restringido) { cont.innerHTML = ""; return; }

    const abiertas = vacantesDeTiendaNivan(idDuenio, true);
    if (!abiertas.length && !esMiPerfil) { cont.innerHTML = ""; return; }

    cont.innerHTML = `<div class="seccionVacantesNivan">
        <p class="tituloVacantesNivan">👥 Vacantes en esta tienda</p>
        ${abiertas.length ? abiertas.map(function(v) {
            return `<div class="tarjetaVacanteNivan" onclick="abrirDetalleVacanteNivan('${escaparHTMLNivan(v.id)}')">
                <div class="cabeceraTarjetaVacanteNivan"><strong>${escaparHTMLNivan(v.titulo)}</strong></div>
                ${chipsVacanteNivan(v)}
                <p class="datoVacanteNivan">${v.cantidad > 1 ? v.cantidad + " personas · " : ""}${v.pago ? "💰 " + escaparHTMLNivan(v.pago) : "Tocá para ver el detalle"}</p>
            </div>`;
        }).join("") : `<p class="notaVacantesNivan">Todavía no tenés vacantes abiertas.</p>`}
        ${esMiPerfil ? `<button type="button" class="botonPerfilLateral" onclick="abrirPanelVacantesNivan()">👥 Administrar vacantes</button>` : ""}
    </div>`;
}

// Botón dentro de mi perfil de tienda (panel lateral).
function htmlBotonVacantesPerfilLateralNivan() {
    if (!usuarioActual) return "";
    const abiertas = vacantesDeTiendaNivan(usuarioActual.id, true).length;
    return `<button type="button" class="botonPerfilLateral" onclick="cerrarPerfilLateral(); abrirPanelVacantesNivan();">👥 Vacantes de la tienda (${abiertas} abierta${abiertas === 1 ? "" : "s"})</button>`;
}

function abrirDetalleVacanteNivan(id) {
    const v = obtenerVacantesNivan().find(function(x) { return x.id === id; });
    if (!v) return;
    const dueno = obtenerUsuarioPorIdNivan(v.tiendaId);
    const esMia = !!(usuarioActual && usuarioActual.id === v.tiendaId);
    const cont = asegurarPantallaVacantesNivan("pantallaDetalleVacanteNivan", v.titulo, dueno ? "Tienda: " + obtenerNombreVendedorUsuario(dueno) : "");

    const miPostulacion = usuarioActual
        ? obtenerPostulacionesNivan().find(function(p) { return p.vacanteId === v.id && p.usuarioId === usuarioActual.id; })
        : null;
    const miCV = usuarioActual && usuarioActual.curriculum && usuarioActual.curriculum.src ? usuarioActual.curriculum : null;
    const abierta = vacanteAbiertaNivan(v);

    let accion = "";
    if (esMia) {
        accion = `<button type="button" class="botonPerfilLateral" onclick="abrirPostulantesNivan('${escaparHTMLNivan(v.id)}')">👥 Ver postulantes</button>`;
    } else if (miPostulacion) {
        accion = `<p class="notaVacantesNivan">✅ Ya te postulaste el ${fechaCortaVacantesNivan(miPostulacion.fecha)}${miPostulacion.conCV ? " con tu CV" : ""}.</p>
            <button type="button" class="botonPerfilLateral" onclick="retirarPostulacionNivan('${escaparHTMLNivan(miPostulacion.id)}')">Retirar postulación</button>`;
    } else if (!abierta) {
        accion = `<p class="notaVacantesNivan">Esta vacante ya no recibe postulaciones.</p>`;
    } else {
        accion = `
            <p class="notaVacantesNivan">${miCV
                ? `📄 Se va a enviar automáticamente tu CV (${escaparHTMLNivan(miCV.nombreArchivo || "currículum")}).`
                : (v.cvObligatorio
                    ? "⚠️ Esta vacante pide CV y todavía no cargaste el tuyo. Cargalo en tu perfil → Currículum y volvé."
                    : "No tenés CV cargado: te podés postular igual, pero conviene cargarlo en tu perfil → Currículum.")}</p>
            <div class="campoVacanteNivan"><label for="mensajePostulacionNivan">Mensaje para la tienda (opcional)</label>
                <textarea id="mensajePostulacionNivan" maxlength="300" rows="3" placeholder="Contale por qué te interesa, tu experiencia, disponibilidad..."></textarea></div>
            <button type="button" class="botonPerfilLateral" onclick="postularseVacanteNivan('${escaparHTMLNivan(v.id)}')">📨 Postularme</button>`;
    }

    cont.innerHTML = `
        ${chipsVacanteNivan(v)}
        <div class="bloqueDetalleVacanteNivan">
            <p><b>Personas que busca:</b> ${Number(v.cantidad) || 1}</p>
            <p><b>Experiencia:</b> ${escaparHTMLNivan(v.experiencia || "—")}</p>
            ${v.ubicacion ? `<p><b>Zona:</b> ${escaparHTMLNivan(v.ubicacion)}</p>` : ""}
            <p><b>Pago:</b> ${escaparHTMLNivan(v.pago || "A convenir")}</p>
            ${v.limite ? `<p><b>Se puede postular hasta el:</b> ${escaparHTMLNivan(v.limite.split("-").reverse().join("/"))}</p>` : ""}
            ${v.cvObligatorio ? `<p><b>CV:</b> obligatorio</p>` : ""}
            <p class="tituloDetalleVacanteNivan">Descripción</p>
            <p class="textoDetalleVacanteNivan">${escaparHTMLNivan(v.descripcion)}</p>
            ${v.requisitos ? `<p class="tituloDetalleVacanteNivan">Requisitos</p><p class="textoDetalleVacanteNivan">${escaparHTMLNivan(v.requisitos)}</p>` : ""}
        </div>
        ${accion}
    `;
    abrirPantallaCompleta("pantallaDetalleVacanteNivan");
}

function postularseVacanteNivan(idVacante) {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta para postularte.");
        abrirCuenta();
        return;
    }
    const v = obtenerVacantesNivan().find(function(x) { return x.id === idVacante; });
    if (!v || !vacanteAbiertaNivan(v)) { alert("Esta vacante ya no está abierta."); return; }
    if (v.tiendaId === usuarioActual.id) { alert("No podés postularte a tu propia vacante."); return; }
    try {
        if (hayBloqueoEntreNivan(usuarioActual.id, v.tiendaId) || cuentaInactivaNivan(v.tiendaId)) {
            alert("No podés postularte a esta vacante.");
            return;
        }
    } catch (e) {}

    const todas = obtenerPostulacionesNivan();
    if (todas.some(function(p) { return p.vacanteId === v.id && p.usuarioId === usuarioActual.id; })) {
        alert("Ya te postulaste a esta vacante.");
        return;
    }

    const cv = usuarioActual.curriculum && usuarioActual.curriculum.src ? usuarioActual.curriculum : null;
    if (v.cvObligatorio && !cv) {
        alert("Esta vacante pide CV. Cargalo en tu perfil → Currículum y volvé a postularte.");
        return;
    }

    const campo = document.getElementById("mensajePostulacionNivan");
    todas.push({
        id: "POS-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        vacanteId: v.id,
        usuarioId: usuarioActual.id,
        fecha: Date.now(),
        mensaje: campo ? campo.value.trim() : "",
        conCV: !!cv,
        cvNombre: cv ? (cv.nombreArchivo || "") : "",
        estado: "nuevo"
    });
    guardarPostulacionesNivan(todas);

    crearNotificacion(v.tiendaId, {
        tipo: "postulacion",
        icono: "👥",
        titulo: "Nueva postulación",
        texto: obtenerNombreMostradoUsuario(usuarioActual) + " se postuló a \"" + v.titulo + "\"" + (cv ? " y mandó su CV." : " (sin CV)."),
        usuarioId: usuarioActual.id,
        cuenta: "tienda",
        pais: v.pais || paisNivan() || "AR"
    });

    abrirDetalleVacanteNivan(v.id);
}

function retirarPostulacionNivan(idPostulacion) {
    mostrarConfirmacionNivan("¿Querés retirar tu postulación?", function() {
        const todas = obtenerPostulacionesNivan();
        const p = todas.find(function(x) { return x.id === idPostulacion && usuarioActual && x.usuarioId === usuarioActual.id; });
        if (!p) return;
        guardarPostulacionesNivan(todas.filter(function(x) { return x.id !== idPostulacion; }));
        abrirDetalleVacanteNivan(p.vacanteId);
    });
}
