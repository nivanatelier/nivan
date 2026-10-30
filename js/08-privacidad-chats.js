// ==============================
// PRIVACIDAD DEL PERFIL Y QUIÉN PUEDE ESCRIBIRME
// ==============================
// usuario.privacidad = { verPerfil: "todos" | "pedido" | "nadie",
//                        escribirme (perfil personal): "todos" | "seguidores" | "sigo",
//                        escribirmeTienda: "todos" | "pedido" }
// "pedido" = personas con las que tengo (o tuve) una compra o venta.
// "seguidores" = solo quienes me siguen. "sigo" = solo personas a las que yo sigo.

const NIVELES_VER_PERFIL_NIVAN = ["todos", "pedido", "nadie"];
const NIVELES_ESCRIBIRME_NIVAN = ["todos", "pedido"];                       // tienda
const NIVELES_ESCRIBIRME_PERSONAL_NIVAN = ["todos", "seguidores", "sigo"];  // perfil personal

// verPerfil / escribirme = perfil PERSONAL. verTienda / escribirmeTienda = TIENDA.
// Si la tienda todavía no tiene su propia opción, hereda la que ya tenía el usuario.
function obtenerPrivacidadUsuarioNivan(idUsuario) {
    const u = idUsuario ? obtenerUsuarioPorIdNivan(idUsuario) : null;
    const p = (u && u.privacidad) || {};
    const verPerfil = NIVELES_VER_PERFIL_NIVAN.indexOf(p.verPerfil) !== -1 ? p.verPerfil : "todos";
    // Quien tenía "solo con una compra o venta" en su perfil personal queda en "solo seguidores" (la más parecida, restrictiva).
    const escribirme = NIVELES_ESCRIBIRME_PERSONAL_NIVAN.indexOf(p.escribirme) !== -1
        ? p.escribirme
        : (p.escribirme === "pedido" ? "seguidores" : "todos");
    return {
        verPerfil: verPerfil,
        escribirme: escribirme,
        verTienda: NIVELES_VER_PERFIL_NIVAN.indexOf(p.verTienda) !== -1 ? p.verTienda : verPerfil,
        escribirmeTienda: NIVELES_ESCRIBIRME_NIVAN.indexOf(p.escribirmeTienda) !== -1
            ? p.escribirmeTienda
            : (NIVELES_ESCRIBIRME_NIVAN.indexOf(p.escribirme) !== -1 ? p.escribirme : "todos")
    };
}

function hayPedidoEntreNivan(idA, idB) {
    if (!idA || !idB) return false;
    return obtenerPedidosNivan().some(function(p) {
        return (p.vendedorId === idA && p.compradorId === idB) || (p.vendedorId === idB && p.compradorId === idA);
    });
}

// ambito: "tienda" (por defecto) o "personal".
function puedeVerPerfilNivan(idVisitante, idDuenio, ambito) {
    if (!idDuenio || idVisitante === idDuenio) return true;
    if (cuentaInactivaNivan(idDuenio)) return false;
    // Perfil personal y tienda: quien te sigue los puede ver aunque sean privados (como en Instagram).
    // Para que deje de verlos, se lo quita de los seguidores.
    if (idVisitante && personaSigueCuentaNivan(idVisitante, claveCuentaNivan(idDuenio, ambito === "personal" ? "personal" : "tienda"))) return true;
    const priv = obtenerPrivacidadUsuarioNivan(idDuenio);
    const nivel = ambito === "personal" ? priv.verPerfil : priv.verTienda;
    if (nivel === "todos") return true;
    if (nivel === "nadie") return false;
    return !!idVisitante && hayPedidoEntreNivan(idVisitante, idDuenio);
}

// ambito: "tienda" o "personal". Sin indicar, se usa "tienda" si el destinatario
// tiene tienda y "personal" si no.
function puedeEscribirANivan(idRemitente, idDestinatario, ambito) {
    if (!idRemitente || !idDestinatario || idRemitente === idDestinatario) return true;
    if (cuentaInactivaNivan(idDestinatario)) return false;
    const ambitoReal = ambito || (usuarioTieneTiendaNivan(idDestinatario) ? "tienda" : "personal");
    const privDest = obtenerPrivacidadUsuarioNivan(idDestinatario);
    const nivelEscribir = ambitoReal === "personal" ? privDest.escribirme : privDest.escribirmeTienda;
    if (nivelEscribir === "todos") return true;
    if (hayPedidoEntreNivan(idRemitente, idDestinatario)) return true;

    // Perfil personal: solo seguidores / solo a quienes sigo.
    if (nivelEscribir === "seguidores" && personaSigueCuentaNivan(idRemitente, claveCuentaNivan(idDestinatario, "personal"))) return true;
    if (nivelEscribir === "sigo") {
        const miCuenta = claveCuentaNivan(idDestinatario, "personal");
        if (usuarioSigueANivan(miCuenta, claveCuentaNivan(idRemitente, "personal")) ||
            usuarioSigueANivan(miCuenta, claveCuentaNivan(idRemitente, "tienda"))) return true;
    }

    // Si el destinatario ya le escribió primero, puede recibir la respuesta.
    return obtenerChatsNivan().some(function(c) {
        const delPar = (c.vendedorId === idRemitente && c.compradorId === idDestinatario) ||
            (c.vendedorId === idDestinatario && c.compradorId === idRemitente);
        if (!delPar) return false;
        if (c.lados && c.lados[idDestinatario] && c.lados[idDestinatario] !== ambitoReal) return false;
        return (c.mensajes || []).some(function(m) { return m.de === idDestinatario; });
    });
}

const MENSAJE_SOLO_CON_PEDIDO_NIVAN = "Este usuario solo recibe mensajes de personas con las que tiene una compra o venta.";

function mensajeNoPuedeEscribirNivan(idDestinatario, ambito) {
    if (cuentaInactivaNivan(idDestinatario)) return "Esta cuenta no está disponible.";

    const ambitoReal = ambito || (usuarioTieneTiendaNivan(idDestinatario) ? "tienda" : "personal");
    if (ambitoReal === "personal") {
        const nivel = obtenerPrivacidadUsuarioNivan(idDestinatario).escribirme;
        if (nivel === "seguidores") return "Este usuario solo recibe mensajes de sus seguidores. Seguilo para poder escribirle.";
        if (nivel === "sigo") return "Este usuario solo recibe mensajes de las personas a las que sigue.";
    }
    return MENSAJE_SOLO_CON_PEDIDO_NIVAN;
}

const CAMPOS_PRIVACIDAD_NIVAN = {
    verPerfil: NIVELES_VER_PERFIL_NIVAN,
    verTienda: NIVELES_VER_PERFIL_NIVAN,
    escribirme: NIVELES_ESCRIBIRME_PERSONAL_NIVAN,
    escribirmeTienda: NIVELES_ESCRIBIRME_NIVAN
};

// Qué estás configurando en las pantallas de privacidad: "personal" o "tienda".
let ambitoPrivacidadNivan = "personal";

function guardarPrivacidadNivan(campo, valor) {
    if (!usuarioActual) return;
    const permitidos = CAMPOS_PRIVACIDAD_NIVAN[campo];
    if (!permitidos || permitidos.indexOf(valor) === -1) return;

    const nueva = Object.assign({}, obtenerPrivacidadUsuarioNivan(usuarioActual.id));
    nueva[campo] = valor;
    actualizarUsuarioListaNivan(usuarioActual.id, { privacidad: nueva });

    ambitoPrivacidadNivan = /Tienda$/.test(campo) ? "tienda" : "personal";

    if (campo === "verPerfil" || campo === "verTienda") abrirPrivacidadPerfilNivan();
    else abrirQuienPuedeEscribirmeNivan();
}

function htmlOpcionesPrivacidadNivan(campo, actual, opciones) {
    return opciones.map(function(o) {
        return `<button type="button" class="opcionPrivacidadNivan ${o.valor === actual ? "seleccionadaNivan" : ""}" onclick="guardarPrivacidadNivan('${campo}', '${o.valor}')">
            ${o.valor === actual ? "✓ " : ""}${escaparHTMLNivan(o.titulo)}
            <small>${escaparHTMLNivan(o.detalle)}</small>
        </button>`;
    }).join("");
}

// Selector "Perfil personal / Tienda" (la tienda solo aparece si ya publicaste algo).
function htmlSelectorAmbitoPrivacidadNivan(pantalla) {
    const sel = function(a) { return ambitoPrivacidadNivan === a ? "seleccionadaNivan" : ""; };
    return `
        <div style="display:flex; gap:8px; margin:12px 0 4px;">
            <button type="button" class="opcionPrivacidadNivan ${sel("personal")}" style="flex:1; width:auto; margin-top:0; text-align:center;" onclick="cambiarAmbitoPrivacidadNivan('personal', '${pantalla}')">👤 Perfil personal</button>
            <button type="button" class="opcionPrivacidadNivan ${sel("tienda")}" style="flex:1; width:auto; margin-top:0; text-align:center;" onclick="cambiarAmbitoPrivacidadNivan('tienda', '${pantalla}')">🛍️ Tienda</button>
        </div>
    `;
}

function cambiarAmbitoPrivacidadNivan(ambito, pantalla) {
    ambitoPrivacidadNivan = ambito === "tienda" ? "tienda" : "personal";
    if (pantalla === "perfil") abrirPrivacidadPerfilNivan();
    else abrirQuienPuedeEscribirmeNivan();
}

function abrirPrivacidadPerfilNivan() {
    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para cambiar la privacidad de tu perfil.");
        return;
    }

    const tieneTienda = usuarioTieneTiendaNivan(usuarioActual.id);
    if (!tieneTienda) ambitoPrivacidadNivan = "personal";

    const esTienda = ambitoPrivacidadNivan === "tienda";
    const priv = obtenerPrivacidadUsuarioNivan(usuarioActual.id);

    const bloque = esTienda
        ? `
            <p class="subTextoPerfilLateral">Elegí quién puede entrar a la página de tu tienda (foto de la tienda, bio, calificaciones y lista de publicaciones).</p>
            ${htmlOpcionesPrivacidadNivan("verTienda", priv.verTienda, [
                { valor: "todos", titulo: "🌍 Todos", detalle: "Cualquiera puede ver tu tienda." },
                { valor: "pedido", titulo: "🤝 Seguidores y personas con una compra o venta conmigo", detalle: "El resto ve que tu tienda es privada." },
                { valor: "nadie", titulo: "🔒 Solo yo y mis seguidores", detalle: "El resto no puede entrar a la página de tu tienda." }
            ])}
            <p class="subTextoPerfilLateral" style="margin-top:14px;">Tus publicaciones siguen apareciendo en el catálogo con el nombre de tu tienda para que puedan comprarte.</p>
        `
        : `
            <p class="subTextoPerfilLateral">Elegí quién puede ver tu perfil personal (foto, nombre, bio y publicaciones personales). Tu perfil personal solo se ve desde tu tienda si activaste "Mostrar mi perfil personal en mi tienda".</p>
            ${htmlOpcionesPrivacidadNivan("verPerfil", priv.verPerfil, [
                { valor: "todos", titulo: "🌍 Todos", detalle: "Cualquiera puede ver tu perfil personal." },
                { valor: "pedido", titulo: "🤝 Seguidores y personas con una compra o venta conmigo", detalle: "El resto ve que tu perfil personal es privado." },
                { valor: "nadie", titulo: "🔒 Solo yo y mis seguidores", detalle: "El resto no puede ver tu perfil personal." }
            ])}
        `;

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">👁️ Privacidad del perfil</h2>
        </div>
        ${tieneTienda ? htmlSelectorAmbitoPrivacidadNivan("perfil") : ""}
        ${bloque}
        ${htmlAccesosPerfilNivan(ambitoPrivacidadNivan)}
    `);
}

function abrirQuienPuedeEscribirmeNivan() {
    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para elegir quién puede escribirte.");
        return;
    }

    const tieneTienda = usuarioTieneTiendaNivan(usuarioActual.id);
    if (!tieneTienda) ambitoPrivacidadNivan = "personal";

    const esTienda = ambitoPrivacidadNivan === "tienda";
    const priv = obtenerPrivacidadUsuarioNivan(usuarioActual.id);

    const bloque = esTienda
        ? `
            <p class="subTextoPerfilLateral">Controlá quién puede iniciarte una conversación desde tu tienda.</p>
            ${htmlOpcionesPrivacidadNivan("escribirmeTienda", priv.escribirmeTienda, [
                { valor: "todos", titulo: "🌍 Todos", detalle: "Cualquier persona con sesión iniciada puede escribirle a tu tienda." },
                { valor: "pedido", titulo: "🤝 Solo personas con una compra o venta conmigo", detalle: "Quien no tenga un pedido con vos no va a poder escribirle a tu tienda." }
            ])}
        `
        : `
            <p class="subTextoPerfilLateral">Controlá quién puede iniciarte una conversación desde tu perfil personal.</p>
            ${htmlOpcionesPrivacidadNivan("escribirme", priv.escribirme, [
                { valor: "todos", titulo: "🌍 Todos", detalle: "Cualquier persona con sesión iniciada puede escribirte." },
                { valor: "seguidores", titulo: "👥 Solo seguidores", detalle: "Solo las personas que te siguen pueden escribirte." },
                { valor: "sigo", titulo: "➡️ Solo a quienes sigo", detalle: "Solo las personas que vos seguís pueden escribirte." }
            ])}
        `;

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">✉️ Quién puede escribirme</h2>
        </div>
        ${tieneTienda ? htmlSelectorAmbitoPrivacidadNivan("escribir") : ""}
        ${bloque}
        <p class="subTextoPerfilLateral" style="margin-top:14px;">Los chats de un pedido siguen funcionando, y si vos le escribís primero a alguien, esa persona siempre puede responderte.</p>
    `);
}

// ==============================
// LÍMITE ANTI-SPAM (seguir / dejar de seguir / solicitudes de perfil)
// ==============================
// Con la misma persona: una acción cada 60 segundos.
// En total: máximo 10 acciones por hora por usuario.

const CLAVE_LIMITE_SEGUIR_NIVAN = "nivanLimiteSeguir";
const ESPERA_MISMA_PERSONA_NIVAN = 60 * 1000;
const VENTANA_LIMITE_SEGUIR_NIVAN = 60 * 60 * 1000;
const MAX_ACCIONES_SEGUIR_NIVAN = 10;

function permitirAccionSeguirNivan(idObjetivo) {
    if (!usuarioActual) return true;

    const ahora = Date.now();
    const todo = leerJSONNivan(CLAVE_LIMITE_SEGUIR_NIVAN, {});
    const mio = (todo && todo[usuarioActual.id]) || {};
    mio.global = (mio.global || []).filter(function(t) { return ahora - t < VENTANA_LIMITE_SEGUIR_NIVAN; });
    mio.pares = mio.pares || {};

    const ultimo = mio.pares[idObjetivo] || 0;
    if (ahora - ultimo < ESPERA_MISMA_PERSONA_NIVAN) {
        const seg = Math.ceil((ESPERA_MISMA_PERSONA_NIVAN - (ahora - ultimo)) / 1000);
        mostrarToastNivan("Esperá " + seg + " segundos antes de volver a hacerlo con esta persona.", 3500);
        return false;
    }

    if (mio.global.length >= MAX_ACCIONES_SEGUIR_NIVAN) {
        const min = Math.max(1, Math.ceil((VENTANA_LIMITE_SEGUIR_NIVAN - (ahora - mio.global[0])) / 60000));
        mostrarToastNivan("Hiciste muchas acciones seguidas. Probá de nuevo en " + min + " min.", 3500);
        return false;
    }

    mio.global.push(ahora);
    mio.pares[idObjetivo] = ahora;
    Object.keys(mio.pares).forEach(function(k) {
        if (ahora - mio.pares[k] > VENTANA_LIMITE_SEGUIR_NIVAN) delete mio.pares[k];
    });

    todo[usuarioActual.id] = mio;
    try { localStorage.setItem(CLAVE_LIMITE_SEGUIR_NIVAN, JSON.stringify(todo)); } catch (e) {}
    return true;
}

// ==============================
// SOLICITUDES PARA VER UN PERFIL PRIVADO
// ==============================
// { pendientes: { "idDuenio|ambito": [claveSolicitante] }, aceptadas: { ... } }
// ambito: "tienda" | "personal"

const CLAVE_SOLICITUDES_PERFIL_NIVAN = "nivanSolicitudesPerfil";

function ambitoSolicitudNivan(ambito) {
    return ambito === "personal" ? "personal" : "tienda";
}

function obtenerSolicitudesPerfilNivan() {
    const o = leerJSONNivan(CLAVE_SOLICITUDES_PERFIL_NIVAN, {});
    return {
        pendientes: (o && o.pendientes) || {},
        aceptadas: (o && o.aceptadas) || {}
    };
}

function guardarSolicitudesPerfilNivan(o) {
    try { localStorage.setItem(CLAVE_SOLICITUDES_PERFIL_NIVAN, JSON.stringify(o)); } catch (e) {}
}

function claveSolicitudPerfilNivan(idDuenio, ambito) {
    return idDuenio + "|" + ambitoSolicitudNivan(ambito);
}

function solicitudPerfilPendienteNivan(idSolicitante, idDuenio, ambito) {
    const o = obtenerSolicitudesPerfilNivan();
    return (o.pendientes[claveSolicitudPerfilNivan(idDuenio, ambito)] || []).indexOf(idSolicitante) !== -1;
}

function botonSolicitudPerfilHTMLNivan(idDuenio, ambito) {
    const id = escaparHTMLNivan(idDuenio);
    const amb = ambitoSolicitudNivan(ambito);

    if (usuarioActual && solicitudPerfilPendienteNivan(claveCuentaActivaNivan(), idDuenio, amb)) {
        return `<button type="button" onclick="cancelarSolicitudPerfilNivan('${id}', '${amb}')">⏳ Solicitud enviada · Cancelar</button>`;
    }

    return `<button type="button" onclick="enviarSolicitudPerfilNivan('${id}', '${amb}')" style="background:#fff; color:#111;">🔐 Enviar solicitud para ver el perfil</button>`;
}

// Borra del buzón del dueño los avisos de solicitud de esa persona (sin crear ninguno nuevo).
function quitarNotificacionesSolicitudNivan(idDuenio, idSolicitante, ambito) {
    const amb = ambitoSolicitudNivan(ambito);
    const todas = obtenerTodasLasNotificaciones();

    todas[idDuenio] = (todas[idDuenio] || []).filter(function(n) {
        return !(n.tipo === "solicitudPerfil" && n.usuarioId === idSolicitante && ambitoSolicitudNivan(n.ambito) === amb);
    });
    guardarTodasLasNotificaciones(todas);

    if (usuarioActual && usuarioActual.id === idDuenio) {
        actualizarBadgeNotificaciones();
        if (typeof renderizarNotificaciones === "function") renderizarNotificaciones();
    }
}

function enviarSolicitudPerfilNivan(idDuenio, ambito) {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta para enviar la solicitud.");
        abrirCuenta();
        return;
    }

    const amb = ambitoSolicitudNivan(ambito);
    if (!idDuenio || idDuenio === usuarioActual.id) return;

    if (hayBloqueoEntreNivan(usuarioActual.id, idDuenio) || cuentaInactivaNivan(idDuenio)) {
        alert("No podés enviar la solicitud a este usuario.");
        return;
    }

    if (puedeVerPerfilNivan(usuarioActual.id, idDuenio, amb)) {
        refrescarVistasSeguidoresNivan();
        return;
    }

    const claveSolicitante = claveCuentaActivaNivan();
    if (solicitudPerfilPendienteNivan(claveSolicitante, idDuenio, amb)) return;

    if (!permitirAccionSeguirNivan(idDuenio)) return;

    const o = obtenerSolicitudesPerfilNivan();
    const clave = claveSolicitudPerfilNivan(idDuenio, amb);
    o.pendientes[clave] = (o.pendientes[clave] || []).concat([claveSolicitante]);
    guardarSolicitudesPerfilNivan(o);

    // Un solo aviso por cuenta: si había uno viejo, se reemplaza.
    quitarNotificacionesSolicitudNivan(idDuenio, claveSolicitante, amb);

    crearNotificacion(idDuenio, {
        tipo: "solicitudPerfil",
        icono: "🔐",
        titulo: "Solicitud para ver tu perfil",
        texto: escaparHTMLNivan(nombreUsuarioSeguidoresNivan(claveSolicitante)) + (amb === "personal" ? " quiere ver tu perfil personal." : " quiere ver tu tienda."),
        usuarioId: claveSolicitante,
        ambito: amb,
        cuenta: amb
    });

    mostrarToastNivan("Solicitud enviada");
    refrescarVistasSeguidoresNivan();
}

// Si cancelás, el aviso que le llegó a la otra persona se borra y no se crea ninguno nuevo.
function cancelarSolicitudPerfilNivan(idDuenio, ambito) {
    if (!usuarioActual) return;

    const amb = ambitoSolicitudNivan(ambito);
    const claveSolicitante = claveCuentaActivaNivan();
    if (!solicitudPerfilPendienteNivan(claveSolicitante, idDuenio, amb)) return;

    if (!permitirAccionSeguirNivan(idDuenio)) return;

    const o = obtenerSolicitudesPerfilNivan();
    const clave = claveSolicitudPerfilNivan(idDuenio, amb);
    o.pendientes[clave] = (o.pendientes[clave] || []).filter(function(id) { return id !== claveSolicitante; });
    guardarSolicitudesPerfilNivan(o);

    quitarNotificacionesSolicitudNivan(idDuenio, claveSolicitante, amb);

    mostrarToastNivan("Solicitud cancelada");
    refrescarVistasSeguidoresNivan();
}

function responderSolicitudPerfilNivan(idSolicitante, ambito, aceptar) {
    if (!usuarioActual) return;

    const amb = ambitoSolicitudNivan(ambito);
    const o = obtenerSolicitudesPerfilNivan();
    const clave = claveSolicitudPerfilNivan(usuarioActual.id, amb);

    o.pendientes[clave] = (o.pendientes[clave] || []).filter(function(id) { return id !== idSolicitante; });

    const claveDuenioSolicitud = claveCuentaNivan(usuarioActual.id, amb);

    if (aceptar) {
        // Aceptar la solicitud = que esa cuenta te siga (perfil personal o tienda).
        if (!usuarioSigueANivan(idSolicitante, claveDuenioSolicitud)) {
            const todosSeg = obtenerSeguidoresTodosNivan();
            todosSeg[claveDuenioSolicitud] = (todosSeg[claveDuenioSolicitud] || []).concat([idSolicitante]);
            guardarSeguidoresTodosNivan(todosSeg);
        }
    }

    guardarSolicitudesPerfilNivan(o);
    quitarNotificacionesSolicitudNivan(usuarioActual.id, idSolicitante, amb);

    // Si la rechazás no se le avisa (así no hay forma de molestar con pedidos repetidos).
    if (aceptar) {
        const solicitante = datosClaveCuentaNivan(idSolicitante);
        crearNotificacion(solicitante.id, {
            tipo: "solicitudAceptada",
            icono: "✅",
            titulo: "Aceptaron tu solicitud",
            texto: escaparHTMLNivan(nombreUsuarioSeguidoresNivan(claveDuenioSolicitud)) + " aceptó tu solicitud. Ya podés ver su perfil.",
            usuarioId: claveDuenioSolicitud,
            ambito: amb,
            cuenta: solicitante.ambito
        });
    }

    cerrarAccionChatNivan();
    mostrarToastNivan(aceptar ? "Solicitud aceptada" : "Solicitud rechazada");
}

function abrirSolicitudPerfilDesdeNotificacionNivan(notif) {
    if (!usuarioActual || !notif || !notif.usuarioId) return;

    const amb = ambitoSolicitudNivan(notif.ambito);

    if (!solicitudPerfilPendienteNivan(notif.usuarioId, usuarioActual.id, amb)) {
        quitarNotificacionesSolicitudNivan(usuarioActual.id, notif.usuarioId, amb);
        mostrarToastNivan("Esa solicitud ya no está disponible.");
        return;
    }

    const nombre = escaparHTMLNivan(nombreUsuarioSeguidoresNivan(notif.usuarioId));
    const id = escaparHTMLNivan(notif.usuarioId);

    document.getElementById("hojaAccionChatNivan").innerHTML = `
        <h4>🔐 Solicitud para ver tu ${amb === "personal" ? "perfil personal" : "tienda"}</h4>
        <p class="resumenAccionChatNivan">${nombre} quiere poder ver tu ${amb === "personal" ? "perfil personal" : "tienda"}.</p>
        <button type="button" onclick="responderSolicitudPerfilNivan('${id}', '${amb}', true)">✅ Aceptar</button>
        <button type="button" class="peligroNivan" onclick="responderSolicitudPerfilNivan('${id}', '${amb}', false)">❌ Rechazar</button>
        <button type="button" onclick="cerrarAccionChatNivan(); abrirPerfilDeClaveNivan('${id}')">👤 Ver su perfil</button>
        <button type="button" onclick="cerrarAccionChatNivan()">Cancelar</button>
    `;
    document.getElementById("overlayAccionChatNivan").classList.add("abierto");
}

// ---- Accesos a mi perfil privado: solicitudes pendientes y personas con acceso ----

function htmlAccesosPerfilNivan(ambito) {
    if (!usuarioActual) return "";

    const amb = ambitoSolicitudNivan(ambito);
    const o = obtenerSolicitudesPerfilNivan();
    const clave = claveSolicitudPerfilNivan(usuarioActual.id, amb);

    const filtrar = function(ids) {
        return (ids || []).filter(function(id) {
            const d = datosClaveCuentaNivan(id);
            return !!obtenerUsuarioPorIdNivan(d.id) && !cuentaInactivaNivan(d.id);
        });
    };

    const pendientes = filtrar(o.pendientes[clave]);

    const fila = function(id, botones) {
        return `
            <div class="filaSeguidorNivan">
                <div class="datosSeguidorNivan" style="cursor:default;">
                    <div>
                        <strong>${escaparHTMLNivan(nombreUsuarioSeguidoresNivan(id))}</strong>
                    </div>
                </div>
                <div class="botonesSeguidorNivan">${botones}</div>
            </div>
        `;
    };

    let html = "";

    if (pendientes.length) {
        html += `<p class="etiquetaSeccionPerfilLateral" style="margin-top:18px;">Solicitudes pendientes</p>`;
        html += pendientes.map(function(id) {
            const idSeguro = escaparHTMLNivan(id);
            return fila(id, `
                <button type="button" class="principal" onclick="responderSolicitudDesdePrivacidadNivan('${idSeguro}', '${amb}', true)">Aceptar</button>
                <button type="button" onclick="responderSolicitudDesdePrivacidadNivan('${idSeguro}', '${amb}', false)">Rechazar</button>
            `);
        }).join("");
    }

    html += `<p class="subTextoPerfilLateral" style="margin-top:14px;">${amb === "personal"
        ? "Quienes te siguen pueden ver tu perfil personal aunque sea privado. Si no querés que lo vea más, quitalo de tus seguidores."
        : "Quienes te siguen pueden ver tu tienda aunque sea privada. Si no querés que la vea más, quitalo de tus seguidores."}</p>`;
    return html;
}

// Los accesos dados antes por solicitud (perfil personal o tienda) pasan a ser seguidores, así no se pierden.
(function migrarAccesosPersonalesASeguidoresNivan() {
    try {
        const o = obtenerSolicitudesPerfilNivan();
        const claves = Object.keys(o.aceptadas || {}).filter(function(k) { return /\|(personal|tienda)$/.test(k); });
        if (!claves.length) return;

        const todos = obtenerSeguidoresTodosNivan();
        claves.forEach(function(k) {
            const idDuenio = k.slice(0, k.lastIndexOf("|"));
            const claveDuenio = claveCuentaNivan(idDuenio, k.slice(k.lastIndexOf("|") + 1));
            (o.aceptadas[k] || []).forEach(function(idSeg) {
                const lista = todos[claveDuenio] || [];
                if (lista.indexOf(idSeg) === -1) lista.push(idSeg);
                todos[claveDuenio] = lista;
            });
            delete o.aceptadas[k];
        });
        guardarSeguidoresTodosNivan(todos);
        guardarSolicitudesPerfilNivan(o);
    } catch (e) {}
})();

function responderSolicitudDesdePrivacidadNivan(idSolicitante, ambito, aceptar) {
    responderSolicitudPerfilNivan(idSolicitante, ambito, aceptar);
    abrirPrivacidadPerfilNivan();
}

// Quita el acceso que habías aceptado. No se avisa a la otra persona.
// ==============================
// CHAT: SILENCIAR NOTIFICACIONES
// ==============================
// chat.silenciadoPara[idUsuario] = -1 (permanente) o un timestamp de hasta cuándo.

function silencioChatNivan(chat, idUsuario) {
    const v = chat && chat.silenciadoPara && chat.silenciadoPara[idUsuario];
    if (!v) return 0;
    if (v === -1) return -1;
    return v > Date.now() ? v : 0;
}

function chatSilenciadoNivan(chat, idUsuario) {
    return silencioChatNivan(chat, idUsuario) !== 0;
}

function textoSilencioChatNivan(valor) {
    if (valor === -1) return "Silenciado permanentemente";
    return "Silenciado hasta el " + new Date(valor).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

// El menú de opciones sirve para el chat abierto (botón ⋮) y para un
// chat de la lista (manteniéndolo presionado).
let idChatMenuNivan = null;
let menuChatDesdeListaNivan = false;

function abrirMenuChatNivan(idChatLista) {
    if (!usuarioActual) return;

    if (idChatLista) {
        idChatMenuNivan = idChatLista;
        menuChatDesdeListaNivan = true;
    } else if (chatParNivan) {
        idChatMenuNivan = idChatParNivan(chatParNivan);
        menuChatDesdeListaNivan = false;
    } else {
        return;
    }

    const chat = obtenerChatsNivan().find(function(c) { return c.id === idChatMenuNivan; });
    const silencio = chat ? silencioChatNivan(chat, usuarioActual.id) : 0;

    document.getElementById("hojaAccionChatNivan").innerHTML = `
        <h4>Opciones del chat</h4>
        ${silencio ? `<p class="resumenAccionChatNivan">🔕 ${textoSilencioChatNivan(silencio)}</p>` : ""}
        ${silencio
            ? `<button type="button" onclick="silenciarChatNivan(0)">🔔 Activar notificaciones</button>`
            : `<button type="button" onclick="abrirMenuSilenciarChatNivan()">🔕 Silenciar notificaciones</button>`}
        ${menuChatDesdeListaNivan ? `<button type="button" onclick="seleccionarChatDesdeMenuNivan()">☑️ Seleccionar varios</button>` : ""}
        <button type="button" class="peligroNivan" onclick="cerrarAccionChatNivan(); eliminarChatNivan('${escaparHTMLNivan(idChatMenuNivan)}');">🗑️ ${menuChatDesdeListaNivan ? "Eliminar chat" : "Borrar chat"}</button>
        <button type="button" onclick="cerrarAccionChatNivan()">Cancelar</button>
    `;
    document.getElementById("overlayAccionChatNivan").classList.add("abierto");
}

function volverMenuChatNivan() {
    abrirMenuChatNivan(menuChatDesdeListaNivan ? idChatMenuNivan : null);
}

function seleccionarChatDesdeMenuNivan() {
    const id = idChatMenuNivan;
    cerrarAccionChatNivan();
    if (!id) return;
    if (chatsSeleccionadosNivan.indexOf(id) === -1) chatsSeleccionadosNivan.push(id);
    renderizarListaChatsNivan();
}

function abrirMenuSilenciarChatNivan() {
    document.getElementById("hojaAccionChatNivan").innerHTML = `
        <h4>🔕 Silenciar notificaciones</h4>
        <p class="resumenAccionChatNivan">Los mensajes siguen llegando al chat, pero no te avisamos con notificaciones.</p>
        <button type="button" onclick="silenciarChatNivan(-1)">Permanente</button>
        <button type="button" onclick="silenciarChatNivan(24 * 60 * 60 * 1000)">24 horas</button>
        <button type="button" onclick="silenciarChatNivan(7 * 24 * 60 * 60 * 1000)">7 días</button>
        <button type="button" onclick="silenciarChatNivan(30 * 24 * 60 * 60 * 1000)">30 días</button>
        <button type="button" onclick="volverMenuChatNivan()">← Volver</button>
    `;
}

// duracion: -1 = permanente, 0 = activar notificaciones, o milisegundos.
function silenciarChatNivan(duracion) {
    const idChat = idChatMenuNivan;
    if (!usuarioActual || !idChat) return;

    const chats = obtenerChatsNivan();
    let chat = chats.find(function(c) { return c.id === idChat; });

    if (!chat) {
        if (!chatParNivan) return;
        chat = crearChatVacioNivan(chatParNivan.vendedorId, chatParNivan.compradorId, chatParNivan.lados);
        chats.push(chat);
    }

    chat.silenciadoPara = chat.silenciadoPara || {};

    if (duracion === 0) delete chat.silenciadoPara[usuarioActual.id];
    else chat.silenciadoPara[usuarioActual.id] = duracion === -1 ? -1 : Date.now() + duracion;

    guardarChatsNivan(chats);
    cerrarAccionChatNivan();

    mostrarToastNivan(duracion === 0 ? "Notificaciones activadas" : "Chat silenciado");
    renderizarConversacionChatNivan();
    if (document.getElementById("overlayListaChatsNivan").classList.contains("abierto")) renderizarListaChatsNivan();
    if (typeof actualizarBadgePerfilNivan === "function") actualizarBadgePerfilNivan();
}

// ==============================
// LISTA DE CHATS: MANTENER PRESIONADO PARA SELECCIONAR
// ==============================

let chatsSeleccionadosNivan = [];
let temporizadorPulsoChatNivan = null;
let pulsoLargoChatNivan = false;

function inicioPulsoChatNivan(idChat) {
    pulsoLargoChatNivan = false;
    clearTimeout(temporizadorPulsoChatNivan);

    temporizadorPulsoChatNivan = setTimeout(function() {
        pulsoLargoChatNivan = true;
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}

        if (chatsSeleccionadosNivan.length) {
            // Ya se están seleccionando chats: este también se suma.
            if (chatsSeleccionadosNivan.indexOf(idChat) === -1) chatsSeleccionadosNivan.push(idChat);
            renderizarListaChatsNivan();
        } else {
            // Si no, se abre el menú: silenciar notificaciones, seleccionar o eliminar.
            abrirMenuChatNivan(idChat);
        }

        // Por si al soltar el dedo no llega el toque a la lista.
        setTimeout(function() { pulsoLargoChatNivan = false; }, 700);
    }, 500);
}

function finPulsoChatNivan() {
    clearTimeout(temporizadorPulsoChatNivan);
}

function tocarChatNivan(idChat) {
    // El toque que sigue a un pulso largo no abre ni cambia nada.
    if (pulsoLargoChatNivan) {
        pulsoLargoChatNivan = false;
        return;
    }

    if (!chatsSeleccionadosNivan.length) {
        abrirChatDesdeListaNivan(idChat);
        return;
    }

    const i = chatsSeleccionadosNivan.indexOf(idChat);
    if (i === -1) chatsSeleccionadosNivan.push(idChat);
    else chatsSeleccionadosNivan.splice(i, 1);

    renderizarListaChatsNivan();
}

function cancelarSeleccionChatsNivan() {
    chatsSeleccionadosNivan = [];
    renderizarListaChatsNivan();
}

function eliminarSeleccionChatsNivan() {
    const ids = chatsSeleccionadosNivan.slice();
    if (!ids.length) return;

    eliminarChatsNivan(ids, ids.length === 1
        ? "¿Eliminar este chat? Se borra solo para vos: la otra persona lo va a seguir viendo con todos sus mensajes."
        : "¿Eliminar " + ids.length + " chats? Se borran solo para vos: la otra persona los va a seguir viendo con todos sus mensajes.");
}

function actualizarCabeceraListaChatsNivan() {
    const cab = document.getElementById("cabeceraListaChatsNivan");
    if (!cab) return;

    if (chatsSeleccionadosNivan.length) {
        cab.innerHTML = `
            <button type="button" class="volverChatNivan" onclick="cancelarSeleccionChatsNivan()" aria-label="Cancelar selección">✕</button>
            <div class="datosCabeceraChatNivan cabeceraSeleccionChatsNivan">
                <strong>${chatsSeleccionadosNivan.length} ${chatsSeleccionadosNivan.length === 1 ? "seleccionado" : "seleccionados"}</strong>
            </div>
            <button type="button" class="botonBorrarChatNivan" aria-label="Eliminar chats seleccionados" onclick="eliminarSeleccionChatsNivan()">🗑️</button>
        `;
    } else {
        cab.innerHTML = `
            <button type="button" class="volverChatNivan" onclick="cerrarMisChatsNivan()" aria-label="Volver">←</button>
            <div class="datosCabeceraChatNivan">
                <strong>💬 Mensajes</strong>
                <small>Tus chats</small>
            </div>
        `;
    }
}

