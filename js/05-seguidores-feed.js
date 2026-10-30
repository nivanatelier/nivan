// ==============================
// SEGUIDORES / SEGUIDOS
// ==============================
// "nivanSeguidores" guarda { claveSeguido: [claveSeguidor, ...] }. Los "seguidos"
// de alguien se calculan mirando en qué listas aparece. La clave es la de la
// cuenta (perfil personal o tienda): cada una tiene sus propios seguidores.

function obtenerSeguidoresTodosNivan() {
    return leerJSONNivan("nivanSeguidores", {});
}

function guardarSeguidoresTodosNivan(obj) {
    try { localStorage.setItem("nivanSeguidores", JSON.stringify(obj)); } catch (e) {}
}

function idsSeguidoresNivan(clave) {
    const todos = obtenerSeguidoresTodosNivan();
    return (todos[clave] || []).filter(function(c) { return !cuentaInactivaNivan(datosClaveCuentaNivan(c).id); });
}

function idsSeguidosNivan(clave) {
    const todos = obtenerSeguidoresTodosNivan();
    return Object.keys(todos).filter(function(claveSeguido) {
        return todos[claveSeguido].indexOf(clave) !== -1 && !cuentaInactivaNivan(datosClaveCuentaNivan(claveSeguido).id);
    });
}

function usuarioSigueANivan(claveSeguidor, claveSeguido) {
    if (!claveSeguidor || !claveSeguido) return false;
    return (obtenerSeguidoresTodosNivan()[claveSeguido] || []).indexOf(claveSeguidor) !== -1;
}

// Corta el seguimiento entre dos personas, con todas sus cuentas (personal y tienda).
function quitarSeguimientosEntreNivan(idA, idB) {
    const todos = obtenerSeguidoresTodosNivan();
    const cuentasA = [claveCuentaNivan(idA, "personal"), claveCuentaNivan(idA, "tienda")];
    const cuentasB = [claveCuentaNivan(idB, "personal"), claveCuentaNivan(idB, "tienda")];

    cuentasA.forEach(function(a) {
        cuentasB.forEach(function(b) {
            todos[a] = (todos[a] || []).filter(function(c) { return c !== b; });
            todos[b] = (todos[b] || []).filter(function(c) { return c !== a; });
        });
    });

    guardarSeguidoresTodosNivan(todos);
}

// Nombre con el que se muestra una cuenta (perfil personal o tienda).
function nombreUsuarioSeguidoresNivan(clave) {
    const d = datosClaveCuentaNivan(clave);
    return datosIdentidadNivan(obtenerUsuarioPorIdNivan(d.id), d.ambito).nombre;
}

function seguirUsuarioNivan(claveObjetivo) {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta para seguir.");
        abrirCuenta();
        return;
    }

    const objetivo = datosClaveCuentaNivan(claveObjetivo);
    const claveYo = claveCuentaActivaNivan();

    if (!objetivo.id || objetivo.id === usuarioActual.id) return;

    if (hayBloqueoEntreNivan(usuarioActual.id, objetivo.id) || !puedeVerPerfilNivan(usuarioActual.id, objetivo.id, objetivo.ambito)) {
        alert("No podés seguir a este usuario.");
        return;
    }

    if (usuarioSigueANivan(claveYo, claveObjetivo)) return;

    if (!permitirAccionSeguirNivan(claveObjetivo)) return;

    const todos = obtenerSeguidoresTodosNivan();
    todos[claveObjetivo] = (todos[claveObjetivo] || []).concat([claveYo]);
    guardarSeguidoresTodosNivan(todos);

    // Un solo aviso de "nuevo seguidor" por cuenta, aunque siga y deje de seguir.
    const notifs = obtenerTodasLasNotificaciones();
    notifs[objetivo.id] = (notifs[objetivo.id] || []).filter(function(n) {
        return !(n.tipo === "seguidor" && n.usuarioId === claveYo && cuentaDeNotificacionNivan(n, objetivo.id, {}) === objetivo.ambito);
    });
    guardarTodasLasNotificaciones(notifs);

    crearNotificacion(objetivo.id, {
        tipo: "seguidor",
        icono: "👥",
        titulo: "Nuevo seguidor",
        texto: escaparHTMLNivan(nombreUsuarioSeguidoresNivan(claveYo)) + " empezó a seguirte.",
        usuarioId: claveYo,
        cuenta: objetivo.ambito
    });

    mostrarToastNivan("Ahora seguís a " + nombreUsuarioSeguidoresNivan(claveObjetivo));
    refrescarVistasSeguidoresNivan();
}

function dejarDeSeguirNivan(claveObjetivo) {
    if (!usuarioActual || !claveObjetivo) return;

    if (!confirm("¿Dejar de seguir a " + nombreUsuarioSeguidoresNivan(claveObjetivo) + "?")) return;

    if (!permitirAccionSeguirNivan(claveObjetivo)) return;

    const claveYo = claveCuentaActivaNivan();
    const todos = obtenerSeguidoresTodosNivan();
    todos[claveObjetivo] = (todos[claveObjetivo] || []).filter(function(c) { return c !== claveYo; });
    guardarSeguidoresTodosNivan(todos);

    refrescarVistasSeguidoresNivan();
}

// Quita a alguien de los seguidores de la cuenta cuya lista está abierta.
function quitarSeguidorNivan(claveSeguidor) {
    if (!usuarioActual || !claveSeguidor) return;

    if (!confirm("¿Quitar a " + nombreUsuarioSeguidoresNivan(claveSeguidor) + " de tus seguidores? No le avisamos.")) return;

    const claveDuenio = (idListaSeguidoresNivan && datosClaveCuentaNivan(idListaSeguidoresNivan).id === usuarioActual.id)
        ? idListaSeguidoresNivan
        : claveCuentaActivaNivan();

    const todos = obtenerSeguidoresTodosNivan();
    todos[claveDuenio] = (todos[claveDuenio] || []).filter(function(c) { return c !== claveSeguidor; });
    guardarSeguidoresTodosNivan(todos);

    refrescarVistasSeguidoresNivan();
}

// Vuelve a dibujar todo lo que muestre seguidores en pantalla.
function refrescarVistasSeguidoresNivan() {
    renderizarExtrasPerfilVendedorNivan();

    const pantallaPersonal = document.getElementById("pantallaPerfilPersonalNivan");
    if (pantallaPersonal && pantallaPersonal.classList.contains("abierta")) renderizarPerfilPersonalNivan();

    const lista = document.getElementById("pantallaSeguidoresNivan");
    if (lista && lista.classList.contains("abierta")) renderizarListaSeguidoresNivan();

    const panel = document.getElementById("contenidoPerfilLateral");
    if (usuarioActual && panel && typeof renderizarPerfilLateral === "function") renderizarPerfilLateral();
}

// ---- Perfil de vendedor: contadores, botón Seguir y cupones ----

let perfilMostradoSeguidoresNivan = null; // { id, esMiPerfil, restringido }

function renderizarExtrasPerfilVendedorNivan() {
    const info = perfilMostradoSeguidoresNivan;
    const contadores = document.getElementById("contadoresSeguidoresPerfilVendedorNivan");
    const acciones = document.getElementById("accionesPerfilVendedor");
    const cupones = document.getElementById("cuponesPerfilVendedorNivan");

    if (!info) {
        if (contadores) contadores.innerHTML = "";
        if (cupones) cupones.style.display = "none";
        if (acciones) acciones.innerHTML = "";
        return;
    }

    const idSeguro = escaparHTMLNivan(info.id);
    const claveTiendaInfo = claveCuentaNivan(info.id, "tienda");
    const claveSeguro = escaparHTMLNivan(claveTiendaInfo);

    if (contadores) {
        contadores.innerHTML = info.restringido ? "" : `
            <span onclick="abrirListaSeguidoresNivan('${claveSeguro}', 'seguidores')"><strong>${idsSeguidoresNivan(claveTiendaInfo).length}</strong> seguidores</span>
            <span onclick="abrirListaSeguidoresNivan('${claveSeguro}', 'seguidos')"><strong>${idsSeguidosNivan(claveTiendaInfo).length}</strong> seguidos</span>
        `;
    }

    if (acciones) {
        const botones = [];

        if (!info.esMiPerfil && !info.restringido) {
            const sigue = !!usuarioActual && usuarioSigueANivan(claveCuentaActivaNivan(), claveTiendaInfo);
            botones.push(sigue
                ? `<button type="button" onclick="dejarDeSeguirNivan('${claveSeguro}')">✓ Siguiendo</button>`
                : `<button type="button" onclick="seguirUsuarioNivan('${claveSeguro}')" style="background:#fff; color:#111;">➕ Seguir</button>`);
        }

        if (!info.esMiPerfil && (!usuarioActual || puedeEscribirANivan(usuarioActual.id, info.id, "tienda"))) {
            botones.push(`<button type="button" onclick="abrirChatConVendedorIdNivan('${idSeguro}')">💬 Chatear con el vendedor</button>`);
        }

        if (!info.restringido) {
            const duenioNivan = obtenerUsuarioPorIdNivan(info.id);
            if (duenioNivan && duenioNivan.mostrarPersonalEnTienda) {
                botones.push(`<button type="button" onclick="abrirPerfilPersonalNivan('${idSeguro}')">👤 Ver perfil personal</button>`);
            }
        }

        if (info.restringido && !info.esMiPerfil && !cuentaInactivaNivan(info.id)) {
            botones.push(botonSolicitudPerfilHTMLNivan(info.id, "tienda"));
        }

        acciones.innerHTML = botones.join("");
    }

    renderizarCuponesPerfilVendedorNivan();
}

function renderizarCuponesPerfilVendedorNivan() {
    const info = perfilMostradoSeguidoresNivan;
    const cont = document.getElementById("cuponesPerfilVendedorNivan");
    if (!cont) return;

    if (!info || info.esMiPerfil || info.restringido) {
        cont.style.display = "none";
        cont.innerHTML = "";
        return;
    }

    const cupones = obtenerCuponesNivan().filter(function(c) {
        if (c.vendedorId !== info.id || !cuponUsableNivan(c)) return false;

        const aud = audienciaCuponNivan(c);
        if (!aud.length) return false; // "solo con el código": no se lista

        // Solo para clientes: lo ven únicamente quienes pueden usarlo.
        if (aud.indexOf("publico") === -1 && aud.indexOf("seguidores") === -1) {
            return usuarioPuedeUsarCuponNivan(c);
        }
        return true;
    });

    if (!cupones.length) {
        cont.style.display = "none";
        cont.innerHTML = "";
        return;
    }

    const guardados = usuarioActual ? obtenerCuponesGuardadosNivan().map(normalizarCodigoCuponNivan) : [];
    cont.style.display = "";
    cont.innerHTML = `<h3>🎟️ Cupones de la tienda</h3>` + cupones.map(function(c) {
        const codigoSeguro = escaparHTMLNivan(c.codigo);
        const reclamado = guardados.indexOf(normalizarCodigoCuponNivan(c.codigo)) !== -1;
        const habilitado = usuarioPuedeUsarCuponNivan(c);
        const etiquetaAud = etiquetaAudienciaPerfilNivan(c);

        let boton;
        if (reclamado && habilitado) {
            boton = `<button type="button" onclick="usarCuponDesdeListaNivan('${codigoSeguro}')">Usar en el carrito</button>`;
        } else if (!habilitado) {
            boton = `<button type="button" onclick="seguirUsuarioNivan('${escaparHTMLNivan(claveCuentaNivan(info.id, "tienda"))}')">Seguir para reclamar</button>`;
        } else {
            boton = `<button type="button" onclick="reclamarCuponNivan('${codigoSeguro}')">Reclamar</button>`;
        }

        return `
            <div class="tarjetaCuponNivan">
                <div class="datosCuponNivan">
                    <strong>${codigoSeguro}</strong>
                    <span>${textoValorCuponNivan(c)}</span>
                    <span>${escaparHTMLNivan(textoAlcanceCuponNivan(c))}</span>
                    <small>${c.vigenciaHasta ? "Vence el " + new Date(c.vigenciaHasta).toLocaleDateString("es-AR") : "Sin vencimiento"}</small>
                    ${etiquetaAud ? `<span class="etiquetaVisibilidadCuponNivan">${etiquetaAud}</span>` : ""}
                    ${reclamado && habilitado ? `<span class="estadoCuponNivan">Reclamado ✓</span>` : ""}
                </div>
                <div class="accionesCuponNivan">${boton}</div>
            </div>
        `;
    }).join("");
}

// ---- Lista de seguidores / seguidos ----

// Identificación que se ve de una cuenta: la personal o la de la tienda (T-...).
function idVisibleCuentaNivan(clave) {
    const d = datosClaveCuentaNivan(clave);
    const u = obtenerUsuarioPorIdNivan(d.id);
    if (!u) return "";
    return d.ambito === "tienda" ? obtenerIdTiendaNivan(d.id) : (u.idPublico || "");
}

let idListaSeguidoresNivan = null;
let tabListaSeguidoresNivan = "seguidores";

function abrirListaSeguidoresNivan(idUsuario, tab) {
    if (!idUsuario) return;

    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    const duenioLista = datosClaveCuentaNivan(idUsuario);
    if (duenioLista.id !== usuarioActual.id && (hayBloqueoEntreNivan(usuarioActual.id, duenioLista.id) || !puedeVerPerfilNivan(usuarioActual.id, duenioLista.id, duenioLista.ambito))) {
        alert("No podés ver esta lista.");
        return;
    }

    idListaSeguidoresNivan = idUsuario;
    tabListaSeguidoresNivan = tab === "seguidos" ? "seguidos" : "seguidores";

    const buscador = document.getElementById("buscadorSeguidoresNivan");
    if (buscador) buscador.value = "";

    renderizarListaSeguidoresNivan();
    abrirPantallaCompleta("pantallaSeguidoresNivan");
}

function cambiarTabSeguidoresNivan(tab) {
    tabListaSeguidoresNivan = tab === "seguidos" ? "seguidos" : "seguidores";
    renderizarListaSeguidoresNivan();
}

function renderizarListaSeguidoresNivan() {
    const lista = document.getElementById("listaSeguidoresNivan");
    if (!lista || !idListaSeguidoresNivan || !usuarioActual) return;

    const esMiLista = datosClaveCuentaNivan(idListaSeguidoresNivan).id === usuarioActual.id;
    const nombreDuenio = esMiLista ? "Tus" : nombreUsuarioSeguidoresNivan(idListaSeguidoresNivan);

    document.getElementById("tituloListaSeguidoresNivan").textContent = esMiLista
        ? "👥 Tus seguidores y seguidos"
        : "👥 " + nombreDuenio;

    const seguidoresTotal = idsSeguidoresNivan(idListaSeguidoresNivan).length;
    const seguidosTotal = idsSeguidosNivan(idListaSeguidoresNivan).length;

    const tabA = document.getElementById("tabSeguidoresNivan");
    const tabB = document.getElementById("tabSeguidosNivan");
    tabA.textContent = seguidoresTotal + " Seguidores";
    tabB.textContent = seguidosTotal + " Seguidos";
    tabA.classList.toggle("activo", tabListaSeguidoresNivan === "seguidores");
    tabB.classList.toggle("activo", tabListaSeguidoresNivan === "seguidos");

    const consulta = (document.getElementById("buscadorSeguidoresNivan").value || "").trim().toLowerCase();

    let ids = tabListaSeguidoresNivan === "seguidores"
        ? idsSeguidoresNivan(idListaSeguidoresNivan)
        : idsSeguidosNivan(idListaSeguidoresNivan);

    ids = ids.filter(function(clave) {
        const d = datosClaveCuentaNivan(clave);
        if (d.id === usuarioActual.id) return true;
        if (hayBloqueoEntreNivan(usuarioActual.id, d.id)) return false;
        if (!consulta) return true;
        const texto = (nombreUsuarioSeguidoresNivan(clave) + " " + idVisibleCuentaNivan(clave)).toLowerCase();
        return texto.indexOf(consulta) !== -1;
    });

    if (!ids.length) {
        lista.innerHTML = `<p class="pedidosVaciosNivan">${consulta
            ? "No encontramos a nadie con ese nombre."
            : tabListaSeguidoresNivan === "seguidores"
                ? (esMiLista ? "Todavía nadie te sigue." : "Todavía no tiene seguidores.")
                : (esMiLista ? "Todavía no seguís a nadie." : "Todavía no sigue a nadie.")}</p>`;
        return;
    }

    const claveYoLista = claveCuentaActivaNivan();

    lista.innerHTML = ids.map(function(id) {
        const d = datosClaveCuentaNivan(id);
        const identidad = datosIdentidadNivan(obtenerUsuarioPorIdNivan(d.id), d.ambito);
        const idSeguro = escaparHTMLNivan(id);
        const avatar = identidad.foto
            ? `<img class="avatarSeguidorNivan" src="${escaparHTMLNivan(identidad.foto)}" alt="">`
            : `<div class="avatarSeguidorNivan">${identidad.vacio}</div>`;
        const idMostrado = idVisibleCuentaNivan(id);

        let botones = "";
        if (d.id !== usuarioActual.id) {
            const losSigo = usuarioSigueANivan(claveYoLista, id);

            if (esMiLista && tabListaSeguidoresNivan === "seguidores") {
                botones = `
                    ${losSigo ? "" : `<button type="button" class="principal" onclick="seguirUsuarioNivan('${idSeguro}')">Seguir también</button>`}
                    <button type="button" onclick="quitarSeguidorNivan('${idSeguro}')">Quitar</button>
                `;
            } else {
                botones = losSigo
                    ? `<button type="button" onclick="dejarDeSeguirNivan('${idSeguro}')">Siguiendo</button>`
                    : `<button type="button" class="principal" onclick="seguirUsuarioNivan('${idSeguro}')">Seguir</button>`;
            }
        } else {
            botones = `<small style="color:#bbb;">Vos</small>`;
        }

        return `
            <div class="filaSeguidorNivan">
                <div class="datosSeguidorNivan" onclick="abrirPerfilDeClaveNivan('${idSeguro}')">
                    ${avatar}
                    <div>
                        <strong>${escaparHTMLNivan(nombreUsuarioSeguidoresNivan(id))}</strong>
                        <small>${idMostrado ? "ID: " + escaparHTMLNivan(idMostrado) : ""}</small>
                    </div>
                </div>
                <div class="botonesSeguidorNivan">${botones}</div>
            </div>
        `;
    }).join("");
}

// ---- Cupones: visibilidad, reclamar y enviar ----

const OPCIONES_AUDIENCIA_CUPON_NIVAN = [
    { valor: "clientes", titulo: "🛍️ Mis clientes", detalle: "Quienes ya te compraron" },
    { valor: "seguidores", titulo: "👥 Mis seguidores", detalle: "Quienes siguen tu tienda" },
    { valor: "publico", titulo: "🌐 Cualquier persona", detalle: "Aparece en tu perfil para todos" }
];

// Lista de quiénes lo pueden reclamar. Los cupones viejos (campo "visibilidad")
// se traducen solos. Lista vacía = solo con el código.
function audienciaCuponNivan(c) {
    if (Array.isArray(c.audiencia)) return c.audiencia;
    if (c.visibilidad === "perfil") return ["publico"];
    if (c.visibilidad === "seguidores") return ["seguidores"];
    return [];
}

function textoVisibilidadCuponNivan(c) {
    const aud = audienciaCuponNivan(c);
    if (!aud.length) return "🔒 Solo con el código";
    if (aud.indexOf("publico") !== -1) return "🌐 Lo puede reclamar cualquier persona";

    const nombres = { clientes: "clientes", seguidores: "seguidores" };
    return "👥 Lo pueden reclamar: " + aud.map(function(a) { return nombres[a]; }).join(" y ");
}

function etiquetaAudienciaPerfilNivan(c) {
    const aud = audienciaCuponNivan(c);
    if (aud.indexOf("publico") !== -1) return "";
    if (aud.indexOf("seguidores") !== -1 && aud.indexOf("clientes") !== -1) return "Para seguidores y clientes";
    if (aud.indexOf("seguidores") !== -1) return "Solo para seguidores";
    if (aud.indexOf("clientes") !== -1) return "Solo para clientes";
    return "";
}

function textoRestriccionCuponNivan(c) {
    return etiquetaAudienciaPerfilNivan(c) || "Solo para algunos clientes";
}

function esClienteDeVendedorNivan(idComprador, idVendedor) {
    if (!idComprador || !idVendedor) return false;
    return obtenerPedidosNivan().some(function(p) {
        return p.vendedorId === idVendedor && p.compradorId === idComprador;
    });
}

// Puede usar el cupón quien esté dentro de las audiencias elegidas, o
// a quien el vendedor se lo envió directamente.
function usuarioPuedeUsarCuponNivan(cupon) {
    if (!cupon) return true;

    const aud = audienciaCuponNivan(cupon);
    if (!aud.length || aud.indexOf("publico") !== -1) return true;

    if (!usuarioActual) return false;
    if (usuarioActual.id === cupon.vendedorId) return true;
    if ((cupon.habilitados || []).indexOf(usuarioActual.id) !== -1) return true;

    if (aud.indexOf("seguidores") !== -1 && personaSigueCuentaNivan(usuarioActual.id, claveCuentaNivan(cupon.vendedorId, "tienda"))) return true;
    if (aud.indexOf("clientes") !== -1 && esClienteDeVendedorNivan(usuarioActual.id, cupon.vendedorId)) return true;

    return false;
}

// ---- Casilleros "¿Quién puede reclamarlo?" (se usan al crear y al editar) ----

function audienciaCheckboxesHTMLNivan(idContenedor, seleccion) {
    const todos = OPCIONES_AUDIENCIA_CUPON_NIVAN.every(function(o) { return seleccion.indexOf(o.valor) !== -1; });

    return `
        <label class="opcionAudienciaNivan todos">
            <input type="checkbox" ${todos ? "checked" : ""} onchange="alternarTodosAudienciaNivan('${idContenedor}', this.checked)">
            <span>✅ Todos</span>
        </label>
        ${OPCIONES_AUDIENCIA_CUPON_NIVAN.map(function(o) {
            return `
                <label class="opcionAudienciaNivan">
                    <input type="checkbox" name="audienciaCuponNivan" value="${o.valor}" ${seleccion.indexOf(o.valor) !== -1 ? "checked" : ""} onchange="sincronizarTodosAudienciaNivan('${idContenedor}')">
                    <span>${o.titulo}<small>${o.detalle}</small></span>
                </label>
            `;
        }).join("")}
        <p class="notaAudienciaNivan">Podés marcar varias. Si no marcás ninguna, solo lo usa quien tenga el código.</p>
    `;
}

function alternarTodosAudienciaNivan(idContenedor, marcado) {
    document.querySelectorAll("#" + idContenedor + ' input[name="audienciaCuponNivan"]').forEach(function(c) { c.checked = marcado; });
}

function sincronizarTodosAudienciaNivan(idContenedor) {
    const cont = document.getElementById(idContenedor);
    if (!cont) return;
    const casilleros = cont.querySelectorAll('input[name="audienciaCuponNivan"]');
    const maestro = cont.querySelector(".opcionAudienciaNivan.todos input");
    if (maestro) maestro.checked = Array.prototype.every.call(casilleros, function(c) { return c.checked; });
}

function leerAudienciaNivan(idContenedor) {
    return Array.prototype.map.call(
        document.querySelectorAll("#" + idContenedor + ' input[name="audienciaCuponNivan"]:checked'),
        function(c) { return c.value; }
    );
}

// ---- Editar quién puede reclamar un cupón que ya creaste ----

let cuponEditandoAudienciaNivan = null;

function abrirAudienciaCuponNivan(idCupon) {
    if (!usuarioActual) return;
    const c = obtenerCuponesNivan().find(function(x) { return x.id === idCupon && x.vendedorId === usuarioActual.id; });
    if (!c) return;

    cuponEditandoAudienciaNivan = idCupon;
    document.getElementById("tituloAudienciaCuponNivan").textContent = "¿Quién puede reclamar " + c.codigo + "?";
    document.getElementById("audienciaCuponEditarNivan").innerHTML = audienciaCheckboxesHTMLNivan("audienciaCuponEditarNivan", audienciaCuponNivan(c));
    document.getElementById("overlayAudienciaCuponNivan").classList.add("abierto");
}

function cerrarAudienciaCuponNivan() {
    document.getElementById("overlayAudienciaCuponNivan").classList.remove("abierto");
    cuponEditandoAudienciaNivan = null;
}

function guardarAudienciaCuponNivan() {
    if (!usuarioActual || !cuponEditandoAudienciaNivan) return;

    const cupones = obtenerCuponesNivan();
    const c = cupones.find(function(x) { return x.id === cuponEditandoAudienciaNivan && x.vendedorId === usuarioActual.id; });
    if (!c) return;

    c.audiencia = leerAudienciaNivan("audienciaCuponEditarNivan");
    delete c.visibilidad;

    guardarCuponesNivan(cupones);
    cerrarAudienciaCuponNivan();
    renderizarMisCuponesNivan();
    mostrarToastNivan("Cambios guardados");
}

function guardarCuponParaUsuarioNivan(idUsuario, codigo) {
    const clave = "nivanCuponesGuardados_" + idUsuario;
    const guardados = leerJSONNivan(clave, []);
    if (guardados.some(function(g) { return normalizarCodigoCuponNivan(g) === normalizarCodigoCuponNivan(codigo); })) return false;
    guardados.unshift(codigo);
    try { localStorage.setItem(clave, JSON.stringify(guardados)); } catch (e) {}
    return true;
}

function reclamarCuponNivan(codigo) {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta para agregar el cupón.");
        abrirCuenta();
        return;
    }

    const cupon = buscarCuponPorCodigoNivan(codigo);
    if (!cupon || !cuponUsableNivan(cupon)) {
        mostrarToastNivan("El cupón no está disponible.");
        refrescarVistasCuponNivan();
        return;
    }

    if (!usuarioPuedeUsarCuponNivan(cupon)) {
        mostrarToastNivan("No estás habilitado para este cupón: " + textoRestriccionCuponNivan(cupon).toLowerCase() + ".");
        return;
    }

    if (!guardarCuponParaUsuarioNivan(usuarioActual.id, cupon.codigo)) {
        mostrarToastNivan("Ya tenés este cupón en Tus cupones.");
    } else {
        mostrarToastNivan("Cupón agregado con éxito");
    }

    refrescarVistasCuponNivan();
}

// Botón "Usar" de un cupón que te enviaron (chat y notificaciones).
function usarCuponEnviadoNivan(codigo, evento) {
    if (evento) evento.stopPropagation();
    reclamarCuponNivan(codigo);
}

// Vuelve a dibujar lo que muestre cupones para que el botón cambie a "Agregado".
function refrescarVistasCuponNivan() {
    try { renderizarCuponesPerfilVendedorNivan(); } catch (e) {}
    try { renderizarNotificaciones(); } catch (e) {}

    const overlayChat = document.getElementById("overlayChatNivan");
    if (overlayChat && overlayChat.classList.contains("abierto") && chatParNivan) {
        try { renderizarConversacionChatNivan(); } catch (e) {}
    }

    const tus = document.getElementById("pantallaTusCupones");
    if (tus && tus.classList.contains("abierta")) {
        try { renderizarTusCuponesNivan(); } catch (e) {}
    }
}

// HTML del cuadradito de cupón (chat). Si lo recibís, tiene botón "Usar".
function cuponTarjetaHTMLNivan(codigo, puedeUsar) {
    const cupon = buscarCuponPorCodigoNivan(codigo);
    const codigoSeguro = escaparHTMLNivan(codigo);

    const guardado = !!usuarioActual && obtenerCuponesGuardadosNivan().map(normalizarCodigoCuponNivan).indexOf(normalizarCodigoCuponNivan(codigo)) !== -1;

    const detalle = cupon
        ? `<span>${escaparHTMLNivan(textoValorCuponNivan(cupon))}</span>
           <span>${escaparHTMLNivan(textoAlcanceCuponNivan(cupon))}</span>
           <span>${cupon.vigenciaHasta ? "Vence el " + new Date(cupon.vigenciaHasta).toLocaleDateString("es-AR") : "Sin vencimiento"}</span>`
        : `<span>Este cupón ya no existe.</span>`;

    let boton = "";
    if (puedeUsar) {
        boton = guardado
            ? `<button type="button" disabled>Agregado ✓</button>`
            : `<button type="button" onclick="usarCuponEnviadoNivan('${codigoSeguro}', event)">Usar</button>`;
    }

    return `<div class="cuponChatNivan"><strong>🎟️ ${codigoSeguro}</strong>${detalle}${boton}</div>`;
}

// Destinatarios posibles de un cupón del vendedor actual.
function idsClientesDelVendedorNivan() {
    if (!usuarioActual) return [];
    const ids = [];
    obtenerPedidosNivan().forEach(function(p) {
        if (p.vendedorId === usuarioActual.id && p.compradorId && p.compradorId !== usuarioActual.id && ids.indexOf(p.compradorId) === -1) {
            ids.push(p.compradorId);
        }
    });
    return ids.filter(function(id) {
        return !cuentaInactivaNivan(id) && !hayBloqueoEntreNivan(usuarioActual.id, id);
    });
}

let cuponEnviandoNivan = null;

function abrirEnviarCuponNivan(idCupon) {
    if (!usuarioActual) return;

    const cupon = obtenerCuponesNivan().find(function(c) { return c.id === idCupon && c.vendedorId === usuarioActual.id; });
    if (!cupon) return;

    if (!cuponUsableNivan(cupon)) {
        alert("Ese cupón está pausado, vencido o agotado: activalo antes de enviarlo.");
        return;
    }

    const clientes = idsClientesDelVendedorNivan();
    // Seguidores de la tienda (una sola vez por persona, aunque la sigan con más de una cuenta).
    const seguidores = idsSeguidoresNivan(claveCuentaNivan(usuarioActual.id, "tienda"))
        .map(function(clave) { return datosClaveCuentaNivan(clave).id; })
        .filter(function(id, i, arr) { return arr.indexOf(id) === i && id !== usuarioActual.id && !hayBloqueoEntreNivan(usuarioActual.id, id); });
    const ambos = clientes.concat(seguidores.filter(function(id) { return clientes.indexOf(id) === -1; }));

    cuponEnviandoNivan = { id: cupon.id, clientes: clientes, seguidores: seguidores, ambos: ambos };

    document.getElementById("tituloEnviarCuponNivan").textContent = "Enviar " + cupon.codigo;
    document.getElementById("botonEnviarCuponClientesNivan").textContent = "🛍️ A mis clientes (" + clientes.length + ")";
    document.getElementById("botonEnviarCuponSeguidoresNivan").textContent = "👥 A mis seguidores (" + seguidores.length + ")";
    document.getElementById("botonEnviarCuponAmbosNivan").textContent = "📣 A todos (" + ambos.length + ")";
    document.getElementById("overlayEnviarCuponNivan").classList.add("abierto");
}

function cerrarEnviarCuponNivan() {
    document.getElementById("overlayEnviarCuponNivan").classList.remove("abierto");
    cuponEnviandoNivan = null;
}

// Manda el cupón como mensaje en el chat con ese cliente/seguidor.
// Devuelve false si no se pudo (privacidad o almacenamiento).
function enviarMensajeCuponChatNivan(idDestino, codigo) {
    if (!usuarioActual || !puedeEscribirANivan(usuarioActual.id, idDestino, "personal")) return false;

    // El cupón sale desde mi tienda hacia el perfil personal del cliente.
    const ladosCupon = {};
    ladosCupon[usuarioActual.id] = "tienda";
    ladosCupon[idDestino] = "personal";

    const chats = obtenerChatsNivan();
    const idChat = idChatNivan(usuarioActual.id, idDestino, "tienda", "personal"); // yo soy el vendedor
    let chat = chats.find(function(c) { return c.id === idChat; });

    if (!chat) {
        chat = crearChatVacioNivan(usuarioActual.id, idDestino, ladosCupon);
        chats.push(chat);
    }

    const ahora = Date.now();
    chat.mensajes.push({
        id: nuevoIdMensajeChatNivan(ahora),
        de: usuarioActual.id,
        texto: "Te envío un cupón de descuento",
        cupon: codigo,
        ambito: "tienda",
        fecha: ahora
    });
    chat.ambitoUltimo = "tienda";
    chat.actualizado = ahora;
    chat.lecturas = chat.lecturas || {};
    chat.lecturas[usuarioActual.id] = ahora;

    return guardarChatsNivan(chats);
}

function enviarCuponNivan(grupo) {
    if (!usuarioActual || !cuponEnviandoNivan) return;

    const destinatarios = cuponEnviandoNivan[grupo] || [];

    if (!destinatarios.length) {
        alert(grupo === "clientes"
            ? "Todavía no tenés clientes: aparecen cuando alguien te compra."
            : grupo === "seguidores"
                ? "Todavía no tenés seguidores."
                : "Todavía no tenés clientes ni seguidores.");
        return;
    }

    const cupones = obtenerCuponesNivan();
    const cupon = cupones.find(function(c) { return c.id === cuponEnviandoNivan.id && c.vendedorId === usuarioActual.id; });
    if (!cupon) return;

    if (!cuponUsableNivan(cupon)) {
        cerrarEnviarCuponNivan();
        mostrarToastNivan("El cupón no está disponible.");
        return;
    }

    cupon.habilitados = Array.isArray(cupon.habilitados) ? cupon.habilitados : [];

    const nombreTienda = escaparHTMLNivan(obtenerNombreVendedorUsuario(usuarioActual));
    let enviados = 0;

    destinatarios.forEach(function(idDestino) {
        // Quien ya lo agregó a Tus cupones no necesita que se lo mandemos de nuevo.
        const yaLoTiene = leerJSONNivan("nivanCuponesGuardados_" + idDestino, []).some(function(g) {
            return normalizarCodigoCuponNivan(g) === normalizarCodigoCuponNivan(cupon.codigo);
        });
        if (yaLoTiene) return;

        // Puede reclamarlo aunque el cupón tenga audiencia limitada.
        if (cupon.habilitados.indexOf(idDestino) === -1) cupon.habilitados.push(idDestino);

        // No se lo agregamos solo: le llega al chat y a notificaciones con botón "Usar".
        enviarMensajeCuponChatNivan(idDestino, cupon.codigo);

        crearNotificacion(idDestino, {
            tipo: "cupon",
            icono: "🎟️",
            titulo: nombreTienda,
            texto: "Te envío un cupón de descuento",
            cuponCodigo: cupon.codigo
        });
        enviados++;
    });

    guardarCuponesNivan(cupones);
    cerrarEnviarCuponNivan();

    mostrarToastNivan(enviados
        ? "Cupón enviado a " + enviados + (enviados === 1 ? " persona" : " personas")
        : "Todos ya tenían este cupón.", 3000);
}

// ==============================
// FEED DE HOME: MÁS VENDIDOS / TENDENCIA
// ==============================

let feedNivanActual = "vendidos";

function cambiarFeedNivan(tipo) {
    feedNivanActual = tipo;
    renderizarFeedNivan();
}

function renderizarFeedNivan() {
    const lista = document.getElementById("feedLista");
    if (!lista) return;

    document.getElementById("feedTabVendidos").classList.toggle("activo", feedNivanActual === "vendidos");
    document.getElementById("feedTabTendencia").classList.toggle("activo", feedNivanActual === "tendencia");

    const conDato = productos.map(function(p) {
        return {
            producto: p,
            valor: feedNivanActual === "vendidos" ? obtenerCantidadVentasProducto(p) : obtenerPuntajeTendencia(p.id)
        };
    }).filter(function(x) {
        return x.valor > 0;
    }).sort(function(a, b) {
        return b.valor - a.valor;
    }).slice(0, 8);

    if (!conDato.length) {
        lista.innerHTML = feedNivanActual === "vendidos"
            ? `<p class="feedVacio">Todavía no hay ventas para mostrar.</p>`
            : `<p class="feedVacio">Todavía no hay tendencia. Se arma con lo que la gente mira, guarda y agrega al carrito.</p>`;
        return;
    }

    lista.innerHTML = conDato.map(function(x, indice) {
        const p = x.producto;
        const dato = feedNivanActual === "vendidos"
            ? x.valor.toLocaleString("es-AR") + (x.valor === 1 ? " venta" : " ventas")
            : "En alza esta semana";

        return `
            <div class="feedItem" onclick="abrirProducto(${JSON.stringify(p.id)})">
                <span class="feedPuesto">#${indice + 1}</span>
                <img src="${escaparHTMLNivan(urlImagenNivan(p.imagen))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(p.nombre)}">
                <h4>${escaparHTMLNivan(p.nombre)}</h4>
                <div class="feedPrecio">${simboloMonedaNivan()}${Number(p.precio).toLocaleString("es-AR")}</div>
                <div class="feedDato">${dato}</div>
            </div>
        `;
    }).join("");
}

// ==============================
// AVISO DE BAJA DE PRECIO (favoritos y carrito)
// ==============================
// Guarda el precio que tenía cada publicación cuando el usuario la
// guardó en favoritos o la sumó al carrito. Cuando el vendedor la
// baja, se avisa en Notificaciones. Los precios de referencia se
// guardan por usuario ("invitado" si todavía no inició sesión).

function claveUsuarioPrecios() {
    return usuarioActual ? usuarioActual.id : "invitado";
}

function registrarPrecioSeguido(idProducto) {
    const producto = productos.find(function(p) { return p.id === idProducto; });
    if (!producto) return;

    const todos = leerJSONNivan("nivanPreciosSeguidos", {});
    const clave = claveUsuarioPrecios();

    todos[clave] = todos[clave] || {};
    todos[clave][idProducto] = producto.precio;

    guardarJSONNivan("nivanPreciosSeguidos", todos);
}

function revisarBajasDePrecio() {
    const todos = leerJSONNivan("nivanPreciosSeguidos", {});
    const clave = claveUsuarioPrecios();
    const mios = todos[clave] = todos[clave] || {};
    const invitado = todos["invitado"] || {};

    const ids = [];
    favoritos.concat(carrito.map(function(i) { return i.id; })).forEach(function(id) {
        if (!ids.includes(id)) ids.push(id);
    });

    let carritoCambio = false;
    let hayCambiosGuardables = false;

    ids.forEach(function(id) {
        const producto = productos.find(function(p) { return p.id === id; });
        if (!producto) return;

        const itemsCarrito = carrito.filter(function(i) { return i.id === id; });
        const enCarrito = itemsCarrito.length > 0;
        const enFavoritos = favoritos.includes(id);

        // Con el producto en el carrito, se compara con el precio al que se agregó.
        const precioAnterior = enCarrito
            ? itemsCarrito[0].precio
            : (mios[id] !== undefined ? mios[id] : invitado[id]);

        // El carrito siempre tiene que reflejar el precio vigente.
        if (enCarrito && producto.precio < precioAnterior) {
            itemsCarrito.forEach(function(item) {
                item.precio = producto.precio;
                item.precioUnitario = calcularPrecioUnitarioSegunCantidad(producto, item.cantidad || 1);
            });
            carritoCambio = true;
        }

        // Sin sesión no hay dónde notificar: se conserva el precio de
        // referencia de los favoritos para avisar cuando inicie sesión.
        if (!usuarioActual) {
            if (enCarrito && producto.precio < precioAnterior) {
                mostrarToastNivan('Bajó el precio de "' + producto.nombre + '" en tu carrito');
            }
            return;
        }

        if (precioAnterior === undefined) {
            mios[id] = producto.precio;
            hayCambiosGuardables = true;
            return;
        }

        if (producto.vendedorId && producto.vendedorId === usuarioActual.id) {
            // Es una publicación propia: no se avisa de sus propios cambios.
            mios[id] = producto.precio;
            hayCambiosGuardables = true;
            return;
        }

        if (producto.precio < precioAnterior) {
            const donde = enCarrito && enFavoritos ? "en tu carrito y en favoritos"
                : enCarrito ? "en tu carrito" : "en favoritos";

            crearNotificacion(usuarioActual.id, {
                tipo: "precio",
                icono: "🏷️",
                titulo: "Bajó el precio",
                texto: `"${escaparHTMLNivan(producto.nombre)}" pasó de ${simboloMonedaNivan()}${formatearDineroNivan(precioAnterior)} a ${simboloMonedaNivan()}${formatearDineroNivan(producto.precio)} ${donde}`,
                productoId: producto.id
            });
        }

        if (mios[id] !== producto.precio) {
            mios[id] = producto.precio;
            hayCambiosGuardables = true;
        }
    });

    if (hayCambiosGuardables) {
        guardarJSONNivan("nivanPreciosSeguidos", todos);
    }

    if (carritoCambio) {
        actualizarCarrito();
    }
}

// ==============================
// MIS COMENTARIOS (antes "Actividad"): se abre desde Configuración
// ==============================

// Si se abrió desde Configuración, al volver se reabre ese panel.
let __comentariosVuelveAConfigNivan = false;

function abrirMisComentariosDesdeConfigNivan() {
    cerrarConfigAppNivan();
    abrirActividad();
    const pantalla = document.getElementById("pantallaActividad");
    __comentariosVuelveAConfigNivan = !!(pantalla && pantalla.classList.contains("abierta"));
}

function abrirActividad() {
    __comentariosVuelveAConfigNivan = false;
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    renderizarActividad();
    abrirPantallaCompleta("pantallaActividad");
}

function renderizarActividad() {
    const contenedor = document.getElementById("listaActividadNivan");
    if (!contenedor) return;

    if (!usuarioActual) {
        contenedor.innerHTML = `<p class="subTextoPerfilLateral">Iniciá sesión para ver tus comentarios.</p>`;
        return;
    }

    const comentarios = obtenerMisComentariosPerfilLateral();

    contenedor.innerHTML = comentarios.length
        ? comentarios.map(function(c) {
            return `
                <div class="comentarioPerfilLateral">
                    <button type="button" class="borrarComentarioPerfilLateral" onclick='eliminarComentarioPerfilLateral(${JSON.stringify(c.idProducto)}, ${c.indice})' aria-label="Borrar comentario">🗑</button>
                    <div>${c.estrellas}</div>
                    <p>${c.texto}</p>
                    <span class="subTextoPerfilLateral">Sobre: ${c.producto}</span>
                </div>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral">Todavía no dejaste comentarios.</p>`;
}


// ==============================
// BÚSQUEDAS GUARDADAS (para "Recomendados para vos")
// ==============================

let temporizadorBusquedaNivan = null;

// Mientras se escribe se dispara un evento por letra, así que se guarda
// recién cuando la persona deja de escribir un momento.
function registrarBusquedaNivan(texto) {
    const limpio = String(texto || "").trim().toLowerCase();

    clearTimeout(temporizadorBusquedaNivan);
    if (limpio.length < 3) return;

    temporizadorBusquedaNivan = setTimeout(function() {
        const busquedas = leerJSONNivan("nivanBusquedas", []);

        // Si la última búsqueda es una versión más corta de esta (se
        // estaba escribiendo), se reemplaza en vez de sumar otra.
        const ultima = busquedas[busquedas.length - 1];
        if (ultima && limpio.startsWith(ultima.q) && Date.now() - ultima.t < 15000) {
            busquedas.pop();
        }

        busquedas.push({ q: limpio, t: Date.now() });

        const limite = Date.now() - DIAS_HISTORIAL_ACTIVIDAD * 24 * 60 * 60 * 1000;
        const recientes = busquedas.filter(function(b) { return b.t >= limite; }).slice(-80);

        try {
            localStorage.setItem("nivanBusquedas", JSON.stringify(recientes));
        } catch (e) {}
    }, 1200);
}

function productoCoincideConBusqueda(producto, consulta) {
    const etiquetas = Array.isArray(producto.etiquetas) ? producto.etiquetas : [];

    return producto.nombre.toLowerCase().includes(consulta) ||
           producto.categoria.toLowerCase().includes(consulta) ||
           obtenerNombreVendedorProducto(producto).toLowerCase().includes(consulta) ||
           (producto.marca && producto.marca.toLowerCase().includes(consulta)) ||
           etiquetas.some(function(etiqueta) {
               return etiqueta.toLowerCase().includes(consulta.replace(/^#+/, ""));
           });
}

// ==============================
// RECOMENDACIONES PARA VOS
// ==============================
// Arma un perfil de gustos con lo que la persona mira, busca, guarda en
// favoritos, agrega al carrito y compra. Cada acción pesa distinto y lo
// reciente pesa más que lo viejo. Después puntúa cada publicación según
// qué tan parecida es a ese perfil (categoría, etiquetas, vendedor y marca).

const PESO_RECOMENDACION = { vista: 1, busqueda: 2, favorito: 4, carrito: 5, compra: 8 };
const VIDA_MEDIA_RECOMENDACION_DIAS = 14;

function obtenerRecomendadosParaVos(maximo) {
    const ahora = Date.now();

    function peso(tipo, fecha) {
        const edadDias = (ahora - fecha) / (24 * 60 * 60 * 1000);
        return (PESO_RECOMENDACION[tipo] || 0) * Math.pow(0.5, edadDias / VIDA_MEDIA_RECOMENDACION_DIAS);
    }

    const interes = {};
    const comprados = [];

    function sumar(id, valor) {
        interes[id] = (interes[id] || 0) + valor;
    }

    leerJSONNivan("nivanActividadProductos", []).forEach(function(e) {
        sumar(e.i, peso(e.k, e.t));
        if (e.k === "compra" && !comprados.includes(e.i)) comprados.push(e.i);
    });

    favoritos.forEach(function(id) {
        sumar(id, 2);
    });

    leerJSONNivan("nivanBusquedas", []).forEach(function(b) {
        productos.forEach(function(p) {
            if (productoCoincideConBusqueda(p, b.q)) sumar(p.id, peso("busqueda", b.t));
        });
    });

    // Perfil de gustos: lo que le interesó se reparte entre los
    // atributos de cada publicación.
    const afinidad = { categoria: {}, etiqueta: {}, vendedor: {}, marca: {} };

    function sumarAfinidad(grupo, clave, valor) {
        if (!clave) return;
        afinidad[grupo][clave] = (afinidad[grupo][clave] || 0) + valor;
    }

    let hayDatos = false;

    productos.forEach(function(p) {
        const valor = interes[p.id];
        if (!valor) return;

        hayDatos = true;
        sumarAfinidad("categoria", p.categoria, valor);
        sumarAfinidad("vendedor", String(p.vendedorId || p.vendedor || ""), valor);
        sumarAfinidad("marca", p.marca ? p.marca.toLowerCase() : "", valor);
        (Array.isArray(p.etiquetas) ? p.etiquetas : []).forEach(function(etiqueta) {
            sumarAfinidad("etiqueta", etiqueta.toLowerCase(), valor);
        });
    });

    if (!hayDatos) return { sinDatos: true, lista: [] };

    const lista = productos.filter(function(p) {
        if (comprados.includes(p.id)) return false;
        if (usuarioActual && p.vendedorId === usuarioActual.id) return false;
        return true;
    }).map(function(p) {
        let puntaje = (interes[p.id] || 0) * 0.6;

        puntaje += afinidad.categoria[p.categoria] || 0;
        puntaje += (afinidad.vendedor[String(p.vendedorId || p.vendedor || "")] || 0) * 0.5;
        puntaje += p.marca ? (afinidad.marca[p.marca.toLowerCase()] || 0) * 0.5 : 0;

        (Array.isArray(p.etiquetas) ? p.etiquetas : []).forEach(function(etiqueta) {
            puntaje += (afinidad.etiqueta[etiqueta.toLowerCase()] || 0) * 0.7;
        });

        // Desempate suave a favor de lo más vendido.
        puntaje += Math.log(1 + obtenerCantidadVentasProducto(p)) * 0.05;

        return { producto: p, puntaje: puntaje };
    }).filter(function(x) {
        return x.puntaje > 0.1;
    }).sort(function(a, b) {
        return b.puntaje - a.puntaje;
    }).slice(0, maximo).map(function(x) {
        return x.producto;
    });

    return { sinDatos: false, lista: lista };
}

function renderizarRecomendadosNivan() {
    const grilla = document.getElementById("recomendadosGrid");
    if (!grilla) return;

    const seccion = document.getElementById("recomendadosNivan");
    const resultado = obtenerRecomendadosParaVos(6);

    // Sin recomendaciones: la sección se esconde, sin ningún texto explicativo.
    if (!resultado.lista.length) {
        grilla.innerHTML = "";
        if (seccion) seccion.style.display = "none";
        return;
    }

    if (seccion) seccion.style.display = "";

    // Una sola fila que se arrastra hacia el costado, igual que
    // "Más vendidos / Tendencia".
    grilla.innerHTML = resultado.lista.map(function(p) {
        const img = p.imagen || ((Array.isArray(p.medios) && p.medios.find(function(m) { return m.tipo === "imagen" && m.src; })) || {}).src || "";

        return `
            <div class="feedItem" onclick="abrirProducto(${JSON.stringify(p.id)})">
                <img src="${escaparHTMLNivan(urlImagenNivan(img))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(p.nombre)}">
                <h4>${escaparHTMLNivan(p.nombre)}</h4>
                <div class="feedPrecio">${simboloMonedaNivan()}${Number(p.precio).toLocaleString("es-AR")}</div>
            </div>
        `;
    }).join("");
}

function formatearDineroNivan(valor) {
    return Number(valor).toLocaleString("es-AR");
}

function descargarComprobanteNivan() {
    const contenido = document.getElementById("pedidoExitoso").innerHTML;
    const ventana = window.open("", "_blank");
    ventana.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprobante NIVAN</title><style>body{font-family:Arial;padding:30px;color:#222;max-width:700px;margin:auto}.comprobanteNivan{border:1px solid #ddd;border-radius:15px;padding:25px}button{display:none}@media print{body{padding:0}}</style></head><body><div class="comprobanteNivan">${contenido}</div><script>window.onload=function(){window.print()}<\/script></body></html>`);
    ventana.document.close();
}


// ==============================
// TELÉFONO: PREFIJOS VÁLIDOS POR PAÍS
// ==============================
// Argentina: código de área + número = 10 dígitos (sin 0 ni 15 adelante).
// Uruguay: números de 8 dígitos (celular 9X XXX XXX, fijo 2/4 XXX XXXX).

const CODIGOS_AREA_AR_NIVAN = {
    "11": "Buenos Aires (AMBA)",
    "220": "Buenos Aires", "221": "Buenos Aires", "223": "Buenos Aires", "230": "Buenos Aires",
    "236": "Buenos Aires", "237": "Buenos Aires", "249": "Buenos Aires", "291": "Buenos Aires", "336": "Buenos Aires",
    "260": "Mendoza", "261": "Mendoza", "263": "Mendoza",
    "264": "San Juan", "266": "San Luis",
    "280": "Chubut", "297": "Chubut",
    "294": "Río Negro", "298": "Río Negro", "299": "Neuquén",
    "341": "Santa Fe", "342": "Santa Fe",
    "343": "Entre Ríos", "345": "Entre Ríos",
    "351": "Córdoba", "353": "Córdoba", "358": "Córdoba",
    "362": "Chaco", "364": "Chaco", "370": "Formosa", "376": "Misiones", "379": "Corrientes",
    "380": "La Rioja", "381": "Tucumán", "383": "Catamarca", "385": "Santiago del Estero",
    "387": "Salta", "388": "Jujuy"
};

// Los códigos de área de 4 dígitos (localidades chicas) empiezan con estos 3 dígitos.
const RAICES_AREA_AR_NIVAN = [
    "220","222","224","225","226","227","228","229","230","231","232","233","234","235","239","247",
    "262","264","265","290","292","293","294","295","296","297","298",
    "332","338","340","343","344","345","346","347","348","349",
    "352","353","354","356","357","358",
    "371","372","373","374","375","377","378",
    "382","383","384","385","386","387","388","389"
];

function areaValidaARNivan(digitos) {
    if (digitos.length < 2) return false;
    if (digitos.slice(0, 2) === "11") return true;
    if (CODIGOS_AREA_AR_NIVAN[digitos.slice(0, 3)]) return true;
    return digitos.length >= 4 && RAICES_AREA_AR_NIVAN.indexOf(digitos.slice(0, 3)) !== -1;
}

// Devuelve { ok, mensaje, digitos } para el teléfono escrito en la compra.
// Detecta números inventados: últimos 6 dígitos todos iguales o en secuencia (111111, 123456, 654321).
function telefonoPareceInventadoNivan(digitos) {
    const fin = String(digitos).slice(-6);
    if (fin.length < 6) return false;
    if (/^(\d)\1+$/.test(fin)) return true;
    let sube = true, baja = true;
    for (let i = 1; i < fin.length; i++) {
        const dif = Number(fin[i]) - Number(fin[i - 1]);
        if (dif !== 1) sube = false;
        if (dif !== -1) baja = false;
    }
    return sube || baja;
}

const MENSAJE_TELEFONO_INVENTADO_NIVAN = "Ese número no parece real. Escribí tu teléfono verdadero.";

function validarTelefonoNivan(texto, pais) {
    pais = pais || paisNivan() || "AR";
    let d = String(texto || "").replace(/\D/g, "");

    if (pais === "UY") {
        if (d.indexOf("00598") === 0) d = d.slice(5);
        else if (d.indexOf("598") === 0 && d.length > 8) d = d.slice(3);
        if (d.charAt(0) === "0") d = d.slice(1);

        const mensajeUY = "Teléfono de Uruguay inválido. Celular: 09X XXX XXX (prefijos 091 a 099), ej: 094 551 872. Fijo: 8 dígitos que empiecen con 2 (Montevideo) o 4 (interior).";
        const esCelular = /^9[1-9]\d{6}$/.test(d);
        const esFijo = /^[24]\d{7}$/.test(d);
        if ((esCelular || esFijo) && telefonoPareceInventadoNivan(d)) {
            return { ok: false, mensaje: MENSAJE_TELEFONO_INVENTADO_NIVAN, digitos: d };
        }
        return { ok: esCelular || esFijo, mensaje: mensajeUY, digitos: d };
    }

    if (d.indexOf("0054") === 0) d = d.slice(2);
    if (d.indexOf("54") === 0) {
        d = d.slice(2);
        if (d.charAt(0) === "9") d = d.slice(1);
    }
    if (d.charAt(0) === "0") d = d.slice(1);
    if (d.length === 11 && d.charAt(0) === "9") d = d.slice(1);

    // Si pusieron el 15 del celular después del código de área, lo sacamos.
    if (d.length === 12) {
        for (let largo = 2; largo <= 4; largo++) {
            if (d.slice(largo, largo + 2) === "15" && areaValidaARNivan(d.slice(0, largo))) {
                d = d.slice(0, largo) + d.slice(largo + 2);
                break;
            }
        }
    }

    if (d.length !== 10) {
        return { ok: false, digitos: d, mensaje: "El teléfono tiene que tener el código de área y el número, 10 dígitos en total, sin 0 ni 15. Ej: 264 555 1234 (San Juan)." };
    }

    if (!areaValidaARNivan(d)) {
        return { ok: false, digitos: d, mensaje: "El código de área " + d.slice(0, 3) + " no existe en Argentina. Revisá el prefijo (ej: 11 Buenos Aires, 351 Córdoba, 261 Mendoza, 264 San Juan)." };
    }

    if (telefonoPareceInventadoNivan(d)) {
        return { ok: false, digitos: d, mensaje: MENSAJE_TELEFONO_INVENTADO_NIVAN };
    }

    return { ok: true, digitos: d, mensaje: "" };
}

function ejemploTelefonoNivan(pais) {
    return (pais || paisNivan() || "AR") === "UY" ? "94 551 872" : "264 555 1234";
}

// Prefijo del país: va fijo al lado del campo y no se puede cambiar.
const PREFIJO_TELEFONO_NIVAN = { AR: "+54 9", UY: "+598" };

function prefijoTelefonoNivan(pais) {
    return PREFIJO_TELEFONO_NIVAN[pais || paisNivan() || "AR"] || PREFIJO_TELEFONO_NIVAN.AR;
}

function pistaTelefonoNivan(pais) {
    return (pais || paisNivan() || "AR") === "UY"
        ? "Celular sin el 0 del principio. Ej: 94 551 872"
        : "Código de área y número, sin 0 ni 15. Ej: 264 555 1234";
}

// ----- Control mientras se escribe -----
// Si lo que va escribiendo no puede llegar a ser un teléfono válido del país
// (prefijo inexistente, letras, demasiados dígitos), la tecla no entra.

function normalizarParcialARNivan(d) {
    if (d.length <= 4 && "0054".indexOf(d) === 0) return "";
    if (d.indexOf("0054") === 0) d = d.slice(2);
    if (d.length <= 2 && "54".indexOf(d) === 0) return "";
    if (d.indexOf("54") === 0) {
        d = d.slice(2);
        if (d.charAt(0) === "9") d = d.slice(1);
    } else if (d.charAt(0) === "0") {
        d = d.slice(1);
    }
    return d;
}

function normalizarParcialUYNivan(d) {
    if (d.length <= 5 && "00598".indexOf(d) === 0) return "";
    if (d.indexOf("00598") === 0) d = d.slice(5);
    else if (d.length <= 3 && "598".indexOf(d) === 0) return "";
    else if (d.indexOf("598") === 0) d = d.slice(3);
    if (d.charAt(0) === "0") d = d.slice(1);
    return d;
}

// Devuelve "" si lo escrito hasta ahora todavía puede ser válido, o el mensaje del problema.
function problemaTelefonoParcialNivan(digitos, pais) {
    pais = pais || paisNivan() || "AR";

    if (pais === "UY") {
        const q = normalizarParcialUYNivan(digitos);
        if (!q) return "";
        const mensaje = "Ese prefijo no existe en Uruguay. Celulares: 091 a 099 (ej: 094 551 872). Fijos: empiezan con 2 o 4.";
        if (q.length > 8) return "El teléfono tiene demasiados dígitos.";
        if ("249".indexOf(q.charAt(0)) === -1) return mensaje;
        if (q.charAt(0) === "9" && q.length >= 2 && !/[1-9]/.test(q.charAt(1))) return mensaje;
        return "";
    }

    const p = normalizarParcialARNivan(digitos);
    if (!p) return "";
    const mensaje = "Ese código de área no existe en Argentina. Ej: 11 (Buenos Aires), 351 (Córdoba), 261 (Mendoza), 264 (San Juan).";
    if (p.length > 12) return "El teléfono tiene demasiados dígitos.";

    const c = p.charAt(0);
    if (c === "1") return (p.length === 1 || p.charAt(1) === "1") ? "" : mensaje;
    if (c !== "2" && c !== "3") return mensaje;

    if (p.length < 3) {
        const posibles = Object.keys(CODIGOS_AREA_AR_NIVAN).concat(RAICES_AREA_AR_NIVAN);
        return posibles.some(function(k) { return k.indexOf(p) === 0; }) ? "" : mensaje;
    }

    const tres = p.slice(0, 3);
    return (CODIGOS_AREA_AR_NIVAN[tres] || RAICES_AREA_AR_NIVAN.indexOf(tres) !== -1) ? "" : mensaje;
}

// Deja solo los dígitos que van en el campo (sin +54, 9, 598, 0 ni 15 de más).
function digitosLocalesTelefonoNivan(digitos, pais) {
    pais = pais || paisNivan() || "AR";
    if (pais === "UY") return normalizarParcialUYNivan(digitos);

    let p = normalizarParcialARNivan(digitos);

    if (p.length > 10 && p.length <= 12) {
        for (let largo = 2; largo <= 4; largo++) {
            if (p.slice(largo, largo + 2) === "15" && areaValidaARNivan(p.slice(0, largo))) {
                p = p.slice(0, largo) + p.slice(largo + 2);
                break;
            }
        }
    }

    return p;
}

// Agrega los espacios a medida que se escribe: "264 555 1234", "11 5555 1234", "94 551 872".
function agruparTelefonoNivan(d, pais) {
    pais = pais || paisNivan() || "AR";
    let grupos;

    if (pais === "UY") {
        grupos = d.charAt(0) === "9" ? [2, 3, 3] : [4, 4];
    } else if (d.slice(0, 2) === "11") {
        grupos = [2, 4, 4];
    } else if (CODIGOS_AREA_AR_NIVAN[d.slice(0, 3)]) {
        grupos = [3, 3, 4];
    } else {
        grupos = [4, 2, 4];
    }

    const partes = [];
    let desde = 0;

    for (let i = 0; i < grupos.length && desde < d.length; i++) {
        partes.push(d.slice(desde, desde + grupos[i]));
        desde += grupos[i];
    }

    return partes.join(" ");
}

function maximoDigitosTelefonoNivan(pais) {
    return (pais || paisNivan() || "AR") === "UY" ? 8 : 10;
}

// Teléfono completo (prefijo del país + lo escrito) o "" si no escribió nada.
function telefonoCompletoCompraNivan() {
    const campo = document.getElementById("telefonoCompra");
    const escrito = campo ? campo.value.trim() : "";
    return escrito ? prefijoTelefonoNivan() + " " + escrito : "";
}

// Vuelve a dar formato a lo que haya en el campo (por ejemplo, datos guardados).
// Si no sirve para el país actual, lo vacía.
function reformatearTelefonoCompraNivan() {
    const campo = document.getElementById("telefonoCompra");
    if (!campo) return;

    const pais = paisNivan() || "AR";
    const p = digitosLocalesTelefonoNivan(campo.value.replace(/\D/g, ""), pais);

    if (!p || p.length > maximoDigitosTelefonoNivan(pais) || problemaTelefonoParcialNivan(p, pais)) {
        campo.value = "";
        return;
    }

    campo.value = agruparTelefonoNivan(p, pais);
}

(function() {
    const campo = document.getElementById("telefonoCompra");
    if (!campo) return;

    campo.setAttribute("inputmode", "tel");

    const aviso = document.getElementById("avisoTelefonoCompra");

    function mostrarAviso(texto) {
        if (!aviso) return;
        aviso.textContent = texto || "";
        aviso.style.display = texto ? "block" : "none";
    }

    let ultimoValido = "";

    campo.addEventListener("focus", function() {
        reformatearTelefonoCompraNivan();
        ultimoValido = campo.value;
    });

    campo.addEventListener("input", function() {
        const pais = paisNivan() || "AR";
        const p = digitosLocalesTelefonoNivan(campo.value.replace(/\D/g, ""), pais);
        const problema = problemaTelefonoParcialNivan(p, pais);

        if (problema || p.length > maximoDigitosTelefonoNivan(pais)) {
            campo.value = ultimoValido;
            mostrarAviso(problema || "El teléfono tiene demasiados dígitos.");
            return;
        }

        const formateado = agruparTelefonoNivan(p, pais);
        if (campo.value !== formateado) campo.value = formateado;
        ultimoValido = formateado;
        mostrarAviso("");
    });

    // Al salir del campo, si quedó incompleto o inventado, avisa qué falta.
    campo.addEventListener("blur", function() {
        if (!campo.value.trim()) { mostrarAviso(""); return; }
        const resultado = validarTelefonoNivan(telefonoCompletoCompraNivan());
        mostrarAviso(resultado.ok ? "" : resultado.mensaje);
    });
})();

document.getElementById("confirmarCompraBtn").addEventListener("click", function() {
    if (!exigirSesionParaComprarNivan()) return;
    const nombre = document.getElementById("nombreCompra").value.trim();
    const telefono = telefonoCompletoCompraNivan();
    const email = document.getElementById("emailCompra").value.trim();
    const direccion = document.getElementById("direccionCompra").value.trim();
    const ciudad = document.getElementById("ciudadCompra").value.trim();
    const codigoPostal = document.getElementById("codigoPostal").value.trim();
    const envio = document.getElementById("envioCompra").value;
    const pago = document.getElementById("pagoCompra").value;

    if (!nombre || !telefono || !email || !direccion || !ciudad || !codigoPostal || !envio || !pago) {
        alert("Completá todos los campos.");
        return;
    }

    const resultadoTelefono = validarTelefonoNivan(telefono);
    if (!resultadoTelefono.ok) {
        alert(resultadoTelefono.mensaje);
        document.getElementById("telefonoCompra").focus();
        return;
    }

    if (!esEmailValidoNivan(email)) {
        alert(MENSAJE_EMAIL_INVALIDO_NIVAN);
        document.getElementById("emailCompra").focus();
        return;
    }

    const hayNoDisponiblesAlConfirmar = carrito.some(function(producto) {
        return obtenerEstadoPublicacionCarrito(producto) !== "disponible";
    });

    if (hayNoDisponiblesAlConfirmar) {
        alert(mensajeCarritoNoDisponibleNivan());
        document.getElementById("checkoutForm").style.display = "none";
        actualizarCarrito();
        return;
    }

    const numeroPedido = "NV-" + new Date().getFullYear() + "-" + Math.floor(100000 + Math.random() * 900000);
    const subtotalNumerico = carrito.reduce((acum, producto) => {
        const unitario = producto.precioUnitario != null ? Number(producto.precioUnitario) : Number(producto.precio);
        return acum + unitario * (Number(producto.cantidad) || 1);
    }, 0);

    // El cupón se vuelve a validar acá (no sólo confiar en lo que ya se
    // mostraba en el carrito), por si cambió algo justo antes de confirmar.
    const descuentoCupon = calcularDescuentoCuponNivan();
    const cuponUsado = cuponAplicadoNivan ? { codigo: cuponAplicadoNivan.codigo, vendedorId: cuponAplicadoNivan.vendedorId, descuento: descuentoCupon } : null;
    const totalNumerico = Math.max(0, subtotalNumerico - descuentoCupon);

    const fecha = new Date().toLocaleString("es-AR");
    const productosComprados = carrito.map(producto => {
        const cantidad = Number(producto.cantidad) || 1;
        const unitario = producto.precioUnitario != null ? Number(producto.precioUnitario) : Number(producto.precio);
        return `<li>${escaparHTMLNivan(producto.nombre)}${cantidad > 1 ? " × " + cantidad : ""} — ${simboloMonedaNivan()}${formatearDineroNivan(unitario * cantidad)}</li>`;
    }).join("");

    const estadoPago = pago === "Mercado Pago" ? "⏳ Pendiente de pago" : "⏳ Pendiente de confirmación";

    document.getElementById("pedidoExitoso").innerHTML = `
        <div class="comprobanteNivan">
            <h2>🧾 COMPROBANTE NIVAN</h2>
            <p><strong>N.º de pedido:</strong> ${numeroPedido}</p>
            <p><strong>Fecha:</strong> ${fecha}</p>
            <p><strong>Estado:</strong> ${estadoPago}</p>
            <hr>
            <p><strong>Cliente:</strong> ${nombre}</p>
            <p><strong>Correo:</strong> ${email}</p>
            <p><strong>Teléfono:</strong> ${telefono}</p>
            <p><strong>Entrega:</strong> ${direccion}, ${ciudad}, CP ${codigoPostal}</p>
            <p><strong>Método de envío:</strong> ${envio}</p>
            <p><strong>Método de pago:</strong> ${pago}</p>
            <hr>
            <h3>Productos</h3>
            <ul>${productosComprados}</ul>
            ${cuponUsado ? `<p>Cupón <strong>${escaparHTMLNivan(cuponUsado.codigo)}</strong>: -${simboloMonedaNivan()}${formatearDineroNivan(cuponUsado.descuento)}</p>` : ""}
            <h2>Total: ${simboloMonedaNivan()}${formatearDineroNivan(totalNumerico)}</h2>
            <p class="notaComprobante">Este es un comprobante de compra de NIVAN y no reemplaza una factura fiscal.</p>
            ${pago === "Mercado Pago" ? `<button type="button" class="botonComprobante" onclick="iniciarPagoMercadoPago('${numeroPedido}', ${totalNumerico})">💳 Pagar ahora</button>` : ""}
            <button type="button" class="botonComprobante" onclick="descargarComprobanteNivan()">🖨️ Imprimir / guardar comprobante</button>
            
        </div>`;

    document.getElementById("pedidoExitoso").style.display = "block";
    document.getElementById("confirmarCompraBtn").style.display = "none";

    // Historial de pedidos (Mis compras / Mis ventas): un pedido por vendedor.
    const pedidosCreados = registrarPedidosNivan(numeroPedido, { nombre, email, telefono, direccion, ciudad, codigoPostal, envio, pago, cupon: cuponUsado });

    // La compra queda escrita en el chat entre comprador y vendedor.
    pedidosCreados.forEach(function(pedidoCreado) {
        try { registrarCompraEnChatNivan(pedidoCreado); } catch (e) {}
    });

    // Se gastó un uso del cupón: queda registrado para que no se pueda
    // reutilizar más veces de las que el vendedor permitió.
    if (cuponUsado) {
        const cupones = obtenerCuponesNivan();
        const c = cupones.find(function(x) { return normalizarCodigoCuponNivan(x.codigo) === normalizarCodigoCuponNivan(cuponUsado.codigo); });
        if (c) {
            c.usos = (c.usos || 0) + 1;
            guardarCuponesNivan(cupones);
        }
    }

    // Se guarda el pedido localmente para conservar el comprobante en esta versión.
    const pedido = { numeroPedido, nombre, email, telefono, direccion, ciudad, codigoPostal, envio, pago, total: totalNumerico, fecha, estado: estadoPago, productos: carrito };
    guardarJSONNivan("ultimoPedidoNivan", pedido);

    // Avisamos al comprador (si está logueado) que su pedido quedó
    // confirmado, y a cada vendedor distinto que aparezca en el
    // carrito, que le hicieron una venta nueva.
    if (usuarioActual) {
        crearNotificacion(usuarioActual.id, {
            tipo: "pedido",
            icono: "🧾",
            titulo: "Pedido confirmado",
            texto: `Tu pedido ${numeroPedido} quedó registrado (pendiente) — total ${simboloMonedaNivan()}${formatearDineroNivan(totalNumerico)}`,
            pedidoId: numeroPedido
        });
    }

    const vendedoresAvisados = [];
    carrito.forEach(function(item) {
        if (!item.vendedorId || vendedoresAvisados.includes(item.vendedorId)) return;
        if (usuarioActual && item.vendedorId === usuarioActual.id) return;

        vendedoresAvisados.push(item.vendedorId);

        const productosDeEseVendedor = carrito.filter(function(p) {
            return p.vendedorId === item.vendedorId;
        });

        crearNotificacion(item.vendedorId, {
            tipo: "venta",
            icono: "🛒",
            titulo: "¡Nueva venta!",
            texto: productosDeEseVendedor.length === 1
                ? `Te compraron "${productosDeEseVendedor[0].nombre}"`
                : `Te compraron ${productosDeEseVendedor.length} publicaciones`,
            productoId: productosDeEseVendedor[0].id,
            pedidoId: (pedidosCreados.find(function(p) { return p.vendedorId === item.vendedorId; }) || {}).id || null
        });
    });

    registrarVentasDelCarrito();

    carrito = [];
    actualizarCarrito();
});

function iniciarPagoMercadoPago(numeroPedido, total) {
    alert("El pedido " + numeroPedido + " está creado. Para que el pago y el QR sean reales hay que conectar un backend seguro con Mercado Pago. No voy a inventarte un QR falso.");
}

