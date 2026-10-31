// ==============================
// CHAT COMPRADOR - VENDEDOR
// ==============================
  
let chatParNivan = null;       // { vendedorId, compradorId } del chat abierto
let chatAmbitoNivan = null;    // "tienda" | "personal" | null (se deduce)
let chatTiendaDeNivan = null;  // id de quien es la tienda, si el chat se abrió desde una tienda
let chatContextoNivan = null;  // { clave, texto } del producto/pedido desde el que se abrió

function obtenerChatsNivan() {
    let lista = leerJSONNivan("nivanChats", []);
    if (!Array.isArray(lista)) return [];

    // Un solo chat por pareja de personas (sin importar quién era
    // "comprador" o "vendedor"): si había chats duplicados entre las
    // mismas dos personas, se unen en uno solo.
    const unificado = unificarChatsDuplicadosNivan(lista);
    if (unificado.cambio) {
        lista = unificado.lista;
        guardarChatsNivan(lista);
    }

    // Los mensajes viejos no tenían id: les damos uno fijo (fecha + posición)
    // para poder eliminarlos. Los mensajes borrados para todos no se sacan de
    // la lista (quedan vacíos), así las posiciones no cambian.
    lista.forEach(function(chat) {
        (chat.mensajes || []).forEach(function(m, i) {
            if (!m.id) m.id = "L" + m.fecha + "-" + i;
        });
    });

    return lista;
}

function guardarChatsNivan(lista) {
    try {
        localStorage.setItem("nivanChats", JSON.stringify(lista));
        return true;
    } catch (e) {
        console.warn("No se pudieron guardar los chats", e);
        return false;
    }
}

function obtenerUsuarioPorIdNivan(idUsuario, usuarios) {
    return (usuarios || obtenerUsuariosNivan()).find(function(u) { return u.id === idUsuario; }) || null;
}

// El id es el mismo para las dos personas, sin importar el orden ni el
// rol (comprador / vendedor): siempre hay UN solo chat por pareja.
// Un chat es de dos "perfiles", no solo de dos personas: la tienda de A con
// el perfil personal de B es OTRO chat distinto del personal de A con el personal de B.
// ambA / ambB: "tienda" | "personal" (el lado de cada uno). Sin lados = formato viejo.
function idChatNivan(idA, idB, ambA, ambB) {
    if (ambA && ambB) {
        return "CH-" + [String(idA) + ":" + ambA, String(idB) + ":" + ambB].sort().join("|");
    }
    return "CH-" + [String(idA), String(idB)].sort().join("|");
}

function idChatParNivan(par) {
    const l = par.lados || {};
    return idChatNivan(par.vendedorId, par.compradorId, l[par.vendedorId], l[par.compradorId]);
}

function unificarChatsDuplicadosNivan(lista) {
    let cambio = false;
    const porId = {};
    const salida = [];
    const renombres = {};

    function aplicarCorteBorradoNivan(chat) {
        if (!chat.borradoPara) return;
        (chat.mensajes || []).forEach(function(m) {
            Object.keys(chat.borradoPara).forEach(function(uid) {
                if (m.fecha <= chat.borradoPara[uid]) {
                    m.ocultoPara = Array.isArray(m.ocultoPara) ? m.ocultoPara : [];
                    if (m.ocultoPara.indexOf(uid) === -1) m.ocultoPara.push(uid);
                }
            });
        });
    }

    lista.forEach(function(chat) {
        if (!chat || !chat.vendedorId || !chat.compradorId) { salida.push(chat); return; }

        // Chats viejos (de antes de separar tienda y personal): se les asigna
        // el perfil con el que habló cada uno y pasan al id nuevo.
        if (!chat.lados) {
            const ladoV = identidadEnChatNivan(chat, chat.vendedorId);
            const ladoC = identidadEnChatNivan(chat, chat.compradorId);
            chat.lados = {};
            chat.lados[chat.vendedorId] = ladoV;
            chat.lados[chat.compradorId] = ladoC;
            cambio = true;
        }

        const idCanonico = idChatNivan(chat.vendedorId, chat.compradorId, chat.lados[chat.vendedorId], chat.lados[chat.compradorId]);
        if (chat.id !== idCanonico) renombres[chat.id] = idCanonico;

        const base = porId[idCanonico];
        if (!base) {
            if (chat.id !== idCanonico) { chat.id = idCanonico; cambio = true; }
            porId[idCanonico] = chat;
            salida.push(chat);
            return;
        }

        // Es el mismo chat con los roles al revés: se une al que ya había.
        cambio = true;
        aplicarCorteBorradoNivan(base);
        aplicarCorteBorradoNivan(chat);
        base.borradoPara = {};

        const idsUsados = {};
        (base.mensajes || []).forEach(function(m, i) {
            if (!m.id) m.id = "L" + m.fecha + "-" + i;
            idsUsados[m.id] = true;
        });
        (chat.mensajes || []).forEach(function(m, i) {
            if (!m.id) m.id = "L" + m.fecha + "-" + i;
            while (idsUsados[m.id]) m.id += "b";
            idsUsados[m.id] = true;
        });

        const eraMasNuevo = (chat.actualizado || 0) > (base.actualizado || 0);
        base.mensajes = (base.mensajes || []).concat(chat.mensajes || []).sort(function(a, b) { return a.fecha - b.fecha; });

        base.lecturas = base.lecturas || {};
        Object.keys(chat.lecturas || {}).forEach(function(uid) {
            base.lecturas[uid] = Math.max(base.lecturas[uid] || 0, chat.lecturas[uid] || 0);
        });

        base.silenciadoPara = base.silenciadoPara || {};
        Object.keys(chat.silenciadoPara || {}).forEach(function(uid) {
            const a = base.silenciadoPara[uid];
            const b = chat.silenciadoPara[uid];
            base.silenciadoPara[uid] = (a === -1 || b === -1) ? -1 : Math.max(a || 0, b || 0);
        });

        if (eraMasNuevo) {
            base.ultimoContexto = chat.ultimoContexto || base.ultimoContexto;
            if (chat.ambitoUltimo) { base.ambitoUltimo = chat.ambitoUltimo; base.tiendaDe = chat.tiendaDe || null; }
        }
        base.actualizado = Math.max(base.actualizado || 0, chat.actualizado || 0);
    });

    if (cambio && Object.keys(renombres).length) {
        // Los avisos de "nuevo mensaje" y el aviso de seguridad apuntan al id nuevo.
        try {
            const todas = obtenerTodasLasNotificaciones();
            let tocoAvisos = false;
            Object.keys(todas).forEach(function(uid) {
                (todas[uid] || []).forEach(function(n) {
                    if (n.chatId && renombres[n.chatId]) { n.chatId = renombres[n.chatId]; tocoAvisos = true; }
                });
            });
            if (tocoAvisos) guardarTodasLasNotificaciones(todas);

            const cerrados = leerJSONNivan("nivanAvisosSeguridadCerrados", {});
            let tocoCerrados = false;
            Object.keys(renombres).forEach(function(viejo) {
                if (cerrados[viejo]) { cerrados[renombres[viejo]] = true; tocoCerrados = true; }
            });
            if (tocoCerrados) localStorage.setItem("nivanAvisosSeguridadCerrados", JSON.stringify(cerrados));
        } catch (e) {}
    }

    return { cambio: cambio, lista: salida };
}

// ---- Modo de cuenta: tienda o perfil personal ----
// Quien tiene tienda elige desde su perfil con cuál "habla": todo lo que
// envíe (mensajes) y publique sale desde ese perfil, con su nombre y su foto.
function modoCuentaNivan() {
    if (!usuarioActual || !usuarioTieneTiendaNivan(usuarioActual.id)) return "personal";
    try {
        return localStorage.getItem("nivanModoCuenta_" + usuarioActual.id) === "tienda" ? "tienda" : "personal";
    } catch (e) {
        return "personal";
    }
}

function establecerModoCuentaNivan(modo, avisar) {
    if (!usuarioActual) return;
    if (modo === "tienda" && !usuarioTieneTiendaNivan(usuarioActual.id)) modo = "personal";

    try { localStorage.setItem("nivanModoCuenta_" + usuarioActual.id, modo); } catch (e) {}

    if (avisar && typeof mostrarToastNivan === "function") {
        mostrarToastNivan(modo === "tienda"
            ? "Ahora usás tu tienda: lo que envíes y publiques sale desde ahí"
            : "Ahora usás tu perfil personal: lo que envíes y publiques sale desde ahí");
    }

    if (typeof renderizarFeedPersonalNivan === "function") renderizarFeedPersonalNivan();
    if (chatParNivan) renderizarConversacionChatNivan();

    const listaChatsAbierta = document.getElementById("overlayListaChatsNivan");
    if (listaChatsAbierta && listaChatsAbierta.classList.contains("abierto")) renderizarListaChatsNivan();
    if (typeof actualizarBadgeNotificaciones === "function") actualizarBadgeNotificaciones();
    else if (typeof actualizarContadoresChatNivan === "function") actualizarContadoresChatNivan();

    if (typeof renderizarNotificaciones === "function") renderizarNotificaciones();
}

// Nombre y foto con los que se muestra una persona según el perfil
// que está usando: la tienda (nombre y foto de la tienda) o el personal.
function datosIdentidadNivan(usuario, ambito) {
    if (!usuario) return { nombre: "Usuario", foto: "", vacio: ambito === "tienda" ? "🛍️" : "👤" };
    if (ambito === "tienda") {
        return { nombre: obtenerNombreVendedorUsuario(usuario), foto: usuario.fotoTienda || "", vacio: "🛍️" };
    }
    return { nombre: obtenerNombreMostradoUsuario(usuario), foto: usuario.foto || "", vacio: "👤" };
}

// Con qué perfil habló (o se le habló) a una persona en este chat:
// el del último mensaje que mandó; si todavía no escribió, el perfil al
// que se le escribió (tienda si le consultaron por una prenda, etc.).
function identidadEnChatNivan(chat, idUsuario) {
    if (chat.lados && chat.lados[idUsuario]) return chat.lados[idUsuario];

    const mensajes = chat.mensajes || [];

    for (let i = mensajes.length - 1; i >= 0; i--) {
        const m = mensajes[i];
        if (esMensajeRealChatNivan(m) && m.de === idUsuario && m.ambito) return m.ambito;
    }

    if (mensajes.some(function(m) { return m.tipo === "compra" && m.compradorId !== idUsuario; })) return "tienda";
    if (chat.tiendaDe === idUsuario) return "tienda";

    // Chats viejos, de antes de elegir perfil: el vendedor figuraba como tienda.
    if (chat.vendedorId === idUsuario && usuarioTieneCuentaTiendaNivan(idUsuario) && !chat.tiendaDe && chat.ambitoUltimo !== "personal") return "tienda";

    return "personal";
}

function identidadOtro0Nivan(chat, otroId) {
    return identidadEnChatNivan(chat, otroId);
}

function textoItemsCompraChatNivan(m) {
    const items = Array.isArray(m.items) ? m.items : [];
    if (!items.length) return "Pedido " + (m.pedidoId || "");
    const primero = items[0].nombre + ((Number(items[0].cantidad) || 1) > 1 ? " × " + items[0].cantidad : "");
    return items.length > 1 ? primero + " y " + (items.length - 1) + " más" : primero;
}

function tarjetaCompraChatNivan(m) {
    const soyComprador = !!usuarioActual && m.compradorId === usuarioActual.id;
    const items = (Array.isArray(m.items) ? m.items : []).map(function(it) {
        const detalle = [it.talle, it.color].filter(Boolean).join(" · ");
        return `<li>${escaparHTMLNivan(it.nombre)}${(Number(it.cantidad) || 1) > 1 ? " × " + escaparHTMLNivan(String(it.cantidad)) : ""}${detalle ? " (" + escaparHTMLNivan(detalle) + ")" : ""}</li>`;
    }).join("");
    const hora = new Date(m.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    return `<div class="compraChatNivan">
        <strong>🛒 ${soyComprador ? "Tu compra" : "Te hicieron una compra"}</strong>
        <ul>${items}</ul>
        <span>Pedido ${escaparHTMLNivan(String(m.pedidoId || ""))} · Total ${escaparHTMLNivan(m.moneda || "")}${formatearDineroNivan(Number(m.total) || 0)}</span>
        <small>${hora}</small>
    </div>`;
}

// Deja la compra escrita dentro del chat entre comprador y vendedor.
function registrarCompraEnChatNivan(pedido) {
    if (!pedido || !pedido.compradorId || !pedido.vendedorId) return;
    if (pedido.compradorId === pedido.vendedorId) return;
    if (hayBloqueoEntreNivan(pedido.compradorId, pedido.vendedorId)) return;

    const ladosCompra = {};
    ladosCompra[pedido.vendedorId] = "tienda";
    ladosCompra[pedido.compradorId] = "personal";

    const chats = obtenerChatsNivan();
    const idChat = idChatNivan(pedido.vendedorId, pedido.compradorId, "tienda", "personal");
    let chat = chats.find(function(c) { return c.id === idChat; });

    if (!chat) {
        chat = crearChatVacioNivan(pedido.vendedorId, pedido.compradorId, ladosCompra);
        chats.push(chat);
    }

    const ahora = Date.now();
    chat.mensajes.push({
        id: nuevoIdMensajeChatNivan(ahora),
        tipo: "compra",
        pedidoId: pedido.id,
        compradorId: pedido.compradorId,
        items: (pedido.items || []).map(function(it) {
            return { nombre: it.nombre, cantidad: it.cantidad, talle: it.talle || "", color: it.color || "" };
        }),
        total: pedido.total,
        moneda: simboloMonedaNivan(),
        fecha: ahora
    });
    chat.tiendaDe = pedido.vendedorId;
    chat.actualizado = ahora;

    guardarChatsNivan(chats);
}

function crearChatVacioNivan(idVendedor, idComprador, lados) {
    const usuarios = obtenerUsuariosNivan();
    const vendedor = obtenerUsuarioPorIdNivan(idVendedor, usuarios);
    const comprador = obtenerUsuarioPorIdNivan(idComprador, usuarios);

    return {
        id: idChatNivan(idVendedor, idComprador, lados && lados[idVendedor], lados && lados[idComprador]),
        lados: lados || undefined,
        vendedorId: idVendedor,
        compradorId: idComprador,
        vendedorNombre: vendedor ? obtenerNombreVendedorUsuario(vendedor) : "Vendedor",
        compradorNombre: comprador ? obtenerNombreMostradoUsuario(comprador) : "Comprador",
        mensajes: [],
        lecturas: {},
        ultimoContexto: "",
        actualizado: Date.now()
    };
}

function obtenerChatAbiertoNivan() {
    if (!chatParNivan) return null;
    const id = idChatParNivan(chatParNivan);
    return obtenerChatsNivan().find(function(c) { return c.id === id; }) ||
        crearChatVacioNivan(chatParNivan.vendedorId, chatParNivan.compradorId, chatParNivan.lados);
}

function obtenerNombreParticipanteChatNivan(chat, idUsuario, usuarios, ambito) {
    const usuario = obtenerUsuarioPorIdNivan(idUsuario, usuarios);
    const identidad = ambito || identidadEnChatNivan(chat, idUsuario);

    if (!usuario) return chat.compradorNombre || chat.vendedorNombre || "Usuario";

    // Si te escribe una tienda, se ve el nombre de la tienda; si te
    // escribe una persona, se ve el nombre de la persona.
    return datosIdentidadNivan(usuario, identidad).nombre;
}

function avatarChatNivanHTML(idUsuario, usuarios, ambito) {
    const usuario = obtenerUsuarioPorIdNivan(idUsuario, usuarios);
    const d = datosIdentidadNivan(usuario, ambito || "personal");

    return d.foto
        ? `<img class="avatarChatNivan" src="${escaparHTMLNivan(d.foto)}" alt="">`
        : `<div class="avatarChatNivan">${d.vacio}</div>`;
}

function esMensajeRealChatNivan(mensaje) {
    return mensaje.tipo !== "contexto" && mensaje.tipo !== "compra" && !mensaje.eliminado;
}

// Los mensajes reales y las compras hacen que el chat aparezca en la lista.
function esMensajeListableChatNivan(mensaje) {
    return esMensajeRealChatNivan(mensaje) || (mensaje.tipo === "compra" && !mensaje.eliminado);
}

// ---- Eliminar mensajes y chats ----
// "Para mí": solo se oculta para quien lo borra; la otra persona lo sigue viendo.
// "Para todos": el mensaje desaparece para los dos, pero solo durante el primer día
// y solo si es un mensaje propio.
const LIMITE_ELIMINAR_PARA_TODOS_NIVAN = 24 * 60 * 60 * 1000;

function mensajeVisibleChatNivan(chat, mensaje, idUsuario) {
    idUsuario = idUsuario || (usuarioActual && usuarioActual.id);
    if (mensaje.eliminado) return false;
    if (Array.isArray(mensaje.ocultoPara) && mensaje.ocultoPara.indexOf(idUsuario) !== -1) return false;

    const corte = chat.borradoPara && chat.borradoPara[idUsuario];
    if (corte && mensaje.fecha <= corte) return false;

    return true;
}

function mensajesVisiblesChatNivan(chat, idUsuario) {
    return (chat.mensajes || []).filter(function(m) {
        return mensajeVisibleChatNivan(chat, m, idUsuario);
    });
}

function contarNoLeidosChatNivan(chat) {
    if (!usuarioActual) return 0;
    const ultimaLectura = (chat.lecturas && chat.lecturas[usuarioActual.id]) || 0;

    return mensajesVisiblesChatNivan(chat).filter(function(m) {
        return esMensajeRealChatNivan(m) && m.de !== usuarioActual.id && m.fecha > ultimaLectura;
    }).length;
}

// Chats del usuario que ya tienen al menos un mensaje, del más reciente al más viejo.
// Si tenés tienda, devuelve solo los chats de la cuenta que estás usando (los de la
// tienda o los del perfil personal, nunca mezclados): son dos cuentas distintas.
function obtenerChatsDeUsuarioNivan() {
    if (!usuarioActual) return [];

    const filtrarPerfil = usuarioTieneCuentaTiendaNivan(usuarioActual.id);
    const modoActivo = modoCuentaNivan();

    return obtenerChatsNivan()
        .filter(function(c) {
            if (filtrarPerfil && identidadEnChatNivan(c, usuarioActual.id) !== modoActivo) return false;
            return (c.vendedorId === usuarioActual.id || c.compradorId === usuarioActual.id) &&
                mensajesVisiblesChatNivan(c).some(esMensajeListableChatNivan);
        })
        .sort(function(a, b) { return (b.actualizado || 0) - (a.actualizado || 0); });
}

function contarMensajesNoLeidosNivan() {
    return obtenerChatsDeUsuarioNivan().reduce(function(acum, chat) {
        return acum + contarNoLeidosChatNivan(chat);
    }, 0);
}

function textoContadorChatsNivan() {
    const n = contarMensajesNoLeidosNivan();
    return n > 0 ? " (" + n + ")" : "";
}

function actualizarContadoresChatNivan() {
    const texto = textoContadorChatsNivan();

    document.querySelectorAll(".contadorChatsNivan").forEach(function(el) {
        el.textContent = texto;
    });

    actualizarBadgePerfilNivan();
}

// Círculo rojo sobre la foto de perfil (pestaña Perfil): suma lo que
// tiene que ver con tu cuenta (seguidores, solicitudes de perfil,
// mensajes sin leer, ventas, pedidos, preguntas, reseñas, etc.).
// Quedan afuera las bajas de precio, cupones y publicaciones nuevas,
// que se ven solo en la campanita de Notificaciones.
function contarNotificacionesPerfilNivan() {
    if (!usuarioActual) return 0;

    // Los mensajes se cuentan por mensaje sin leer (no por aviso),
    // por eso el aviso tipo "mensaje" se excluye para no duplicar.
    const tiposFuera = ["precio", "cupon", "nuevaPublicacion", "mensaje"];
    const avisos = obtenerNotificacionesDeUsuario(usuarioActual.id).filter(function(n) {
        return !n.leida && tiposFuera.indexOf(n.tipo) === -1;
    }).length;

    const mensajes = obtenerChatsDeUsuarioNivan().reduce(function(acum, chat) {
        return chatSilenciadoNivan(chat, usuarioActual.id) ? acum : acum + contarNoLeidosChatNivan(chat);
    }, 0);

    return avisos + mensajes;
}

function actualizarBadgePerfilNivan() {
    const badge = document.getElementById("badgeMiPerfilNivan");
    if (!badge) return;

    const n = contarNotificacionesPerfilNivan();
    if (n > 0) {
        badge.textContent = n > 9 ? "9+" : n;
        badge.classList.add("visible");
    } else {
        badge.classList.remove("visible");
    }
}

function marcarChatLeidoNivan(idChat) {
    if (!usuarioActual) return;

    const chats = obtenerChatsNivan();
    const chat = chats.find(function(c) { return c.id === idChat; });

    if (chat) {
        chat.lecturas = chat.lecturas || {};
        chat.lecturas[usuarioActual.id] = Date.now();
        guardarChatsNivan(chats);
    }

    // Las notificaciones de "nuevo mensaje" de este chat también pasan a leídas.
    const todas = obtenerTodasLasNotificaciones();
    const lista = todas[usuarioActual.id] || [];
    let hubieronCambios = false;

    lista.forEach(function(n) {
        if (n.tipo === "mensaje" && n.chatId === idChat && !n.leida) {
            n.leida = true;
            hubieronCambios = true;
        }
    });

    if (hubieronCambios) {
        todas[usuarioActual.id] = lista;
        guardarTodasLasNotificaciones(todas);
        actualizarBadgeNotificaciones();
    }
}

function etiquetaDiaChatNivan(timestamp) {
    const fecha = new Date(timestamp);
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);

    if (fecha.toDateString() === hoy.toDateString()) return "Hoy";
    if (fecha.toDateString() === ayer.toDateString()) return "Ayer";
    return fecha.toLocaleDateString("es-AR");
}

function mostrarAvisoChatNivan(texto) {
    const aviso = document.getElementById("avisoErrorChatNivan");
    if (!aviso) return;
    aviso.textContent = texto || "";
    aviso.classList.toggle("visible", !!texto);
}
// Un chat es "solo personales" cuando NINGUNA de las dos cuentas tiene tienda
// (aunque una tenga tienda, aunque hable desde su perfil personal, ya no cuenta).
function chatSinTiendasNivan(idA, idB) {
    return !usuarioTieneCuentaTiendaNivan(idA) && !usuarioTieneCuentaTiendaNivan(idB);
}

function chatSoloPersonalesNivan(chat) {
    if (!chat) return false;
    return chatSinTiendasNivan(chat.vendedorId, chat.compradorId);
}

// Alguno de los dos habla como tienda en este chat (no alcanza con que la cuenta tenga una).
function chatConPerfilTiendaNivan(chat) {
    if (!chat) return false;
    const lados = (chatParNivan && chatParNivan.lados) || chat.lados || {};
    const a = lados[chat.vendedorId] || identidadEnChatNivan(chat, chat.vendedorId);
    const b = lados[chat.compradorId] || identidadEnChatNivan(chat, chat.compradorId);
    return a === "tienda" || b === "tienda";
}

const TEXTO_AVISO_TIENDA_NIVAN = "No se pueden pasar números de teléfono. Si detectamos que mandaste alguna red social teniendo tienda, tu cuenta se puede suspender de forma permanente o temporal.";
const TEXTO_AVISO_PERSONAL_NIVAN = "Si deciden compartir números de contacto, lo hacen bajo su propia responsabilidad. Nivan no se hace cargo de lo que pase fuera de la app.";

function actualizarTextoAvisoSeguridadNivan(soloPersonales) {
    const p = document.getElementById("textoAvisoSeguridadNuevoNivan");
    if (p) p.textContent = soloPersonales ? TEXTO_AVISO_PERSONAL_NIVAN : TEXTO_AVISO_TIENDA_NIVAN;
}

  function mostrarAvisoSeguridadNuevoNivan(idChat, soloPersonales) {
    const aviso = document.getElementById("avisoSeguridadNuevoNivan");
    if (!aviso) return;
    actualizarTextoAvisoSeguridadNivan(!!soloPersonales);

    let avisosCerrados = {};

    try {
        avisosCerrados = JSON.parse(
            localStorage.getItem("nivanAvisosSeguridadCerrados") || "{}"
        );
    } catch (e) {
        avisosCerrados = {};
    }

    if (avisosCerrados[idChat]) {
        aviso.classList.add("oculto");
    } else {
        aviso.classList.remove("oculto");
    }
}


function cerrarAvisoSeguridadNuevoNivan() {
    const aviso = document.getElementById("avisoSeguridadNuevoNivan");

    if (!aviso || !chatParNivan) return;

    const idChat = idChatParNivan(chatParNivan);

    let avisosCerrados = {};

    try {
        avisosCerrados = JSON.parse(
            localStorage.getItem("nivanAvisosSeguridadCerrados") || "{}"
        );
    } catch (e) {
        avisosCerrados = {};
    }

    avisosCerrados[idChat] = true;

    guardarJSONNivan("nivanAvisosSeguridadCerrados", avisosCerrados);

    aviso.classList.add("oculto");
  }

// ---- Lista de chats ----

function abrirMisChatsNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    renderizarListaChatsNivan();
    document.getElementById("overlayListaChatsNivan").classList.add("abierto");
}

function cerrarMisChatsNivan() {
    chatsSeleccionadosNivan = [];
    document.getElementById("overlayListaChatsNivan").classList.remove("abierto");
}

function renderizarListaChatsNivan() {
    const contenedor = document.getElementById("listaChatsNivan");
    if (!contenedor || !usuarioActual) return;

    const chats = obtenerChatsDeUsuarioNivan();

    // Si algún chat seleccionado ya no existe, lo sacamos de la selección.
    chatsSeleccionadosNivan = chatsSeleccionadosNivan.filter(function(id) {
        return chats.some(function(c) { return c.id === id; });
    });
    actualizarCabeceraListaChatsNivan();

    if (!chats.length) {
        contenedor.innerHTML = `
            <div class="vacioChatsNivan">
                <div class="iconoVacioChatsNivan">💬</div>
                <strong>Todavía no tenés mensajes${usuarioTieneTiendaNivan(usuarioActual.id) ? (modoCuentaNivan() === "tienda" ? " en tu tienda" : " en tu perfil personal") : ""}</strong>
                <span>Cuando le escribas a un vendedor, o un comprador te escriba a vos, la charla aparece acá.</span>
            </div>
        `;
        return;
    }

    const usuarios = obtenerUsuariosNivan();

    // Si tenés tienda, se aclara de qué cuenta son los mensajes.
    let encabezadoPerfilChats = "";
    if (usuarioTieneTiendaNivan(usuarioActual.id)) {
        const modoLista = modoCuentaNivan();
        encabezadoPerfilChats = `<p class="subTextoPerfilLateral" style="padding:8px 14px 4px;">${modoLista === "tienda" ? "🛍️ Mensajes de tu tienda" : "👤 Mensajes de tu perfil personal"}</p>`;
    }

    contenedor.innerHTML = encabezadoPerfilChats + chats.map(function(chat) {
        const soyVendedor = usuarioActual.id === chat.vendedorId;
        const otroId = soyVendedor ? chat.compradorId : chat.vendedorId;
        const nombreOtro = obtenerNombreParticipanteChatNivan(chat, otroId, usuarios, identidadOtro0Nivan(chat, otroId));
        const ultimo = mensajesVisiblesChatNivan(chat).filter(esMensajeListableChatNivan).slice(-1)[0];
        const textoUltimo = ultimo.tipo === "compra"
            ? "🛒 " + (ultimo.compradorId === usuarioActual.id ? "Tu compra: " : "Te compraron: ") + textoItemsCompraChatNivan(ultimo)
            : ultimo.texto;
        const resumen = textoUltimo.length > 60 ? textoUltimo.slice(0, 60) + "…" : textoUltimo;
        const identidadOtro = identidadEnChatNivan(chat, otroId);
        const esTiendaChat = identidadOtro === "tienda";
        const noLeidos = contarNoLeidosChatNivan(chat);

        const idSeguroChat = escaparHTMLNivan(chat.id);
        const seleccionado = chatsSeleccionadosNivan.indexOf(chat.id) !== -1;
        const silenciado = chatSilenciadoNivan(chat, usuarioActual.id);

        return `
            <div class="itemChatNivan ${seleccionado ? "seleccionadoNivan" : ""}"
                onclick="tocarChatNivan('${idSeguroChat}')"
                onpointerdown="inicioPulsoChatNivan('${idSeguroChat}')"
                onpointerup="finPulsoChatNivan()"
                onpointerleave="finPulsoChatNivan()"
                onpointercancel="finPulsoChatNivan()"
                oncontextmenu="return false;">
                ${seleccionado ? `<span class="checkSeleccionChatNivan">✓</span>` : ""}
                ${avatarChatNivanHTML(otroId, usuarios, identidadEnChatNivan(chat, otroId))}
                <div class="textoItemChatNivan">
                    <strong>${escaparHTMLNivan(nombreOtro)}${esTiendaChat ? `<em class="etiquetaTiendaChatNivan">🛍️ Tienda</em>` : ""}</strong>
                    <span>${ultimo.tipo !== "compra" && ultimo.de === usuarioActual.id ? "Vos: " : ""}${escaparHTMLNivan(resumen)}</span>
                </div>
                <div class="metaItemChatNivan">
                    <small>${formatearFechaNotificacion(ultimo.fecha)}</small>
                    ${noLeidos ? `<b>${noLeidos}</b>` : ""}
                    ${silenciado ? `<small aria-label="Silenciado">🔕</small>` : ""}
                </div>
            </div>
        `;
    }).join("");
}

function abrirChatDesdeListaNivan(idChat) {
    if (!usuarioActual) return;

    const chat = obtenerChatsNivan().find(function(c) { return c.id === idChat; });
    if (!chat) return;
    if (chat.vendedorId !== usuarioActual.id && chat.compradorId !== usuarioActual.id) return;

    abrirChatNivan(chat.vendedorId, chat.compradorId, null, null, chat.lados);
}

// ---- Puntos de entrada ----

// Desde la ficha de una publicación.
function abrirChatConVendedorNivan(idProducto) {
    if (!usuarioActual) {
        alert("Iniciá sesión para chatear con el vendedor.");
        abrirCuenta();
        return;
    }

    const producto = productos.find(function(p) { return p.id === idProducto; });

    if (!producto || !producto.vendedorId) {
        alert("Esta prenda es del catálogo de NIVAN y no tiene un vendedor con quien chatear.");
        return;
    }

    if (producto.vendedorId === usuarioActual.id) {
        alert("Esta publicación es tuya.");
        return;
    }

    abrirChatNivan(producto.vendedorId, usuarioActual.id, {
        clave: "prod-" + producto.id,
        texto: "Consulta por «" + producto.nombre + "»"
    }, "tienda");
}

// Desde el perfil de un vendedor.
function abrirChatConVendedorIdNivan(idVendedor) {
    if (!usuarioActual) {
        alert("Iniciá sesión para chatear con el vendedor.");
        abrirCuenta();
        return;
    }

    if (idVendedor === usuarioActual.id) return;

    abrirChatNivan(idVendedor, usuarioActual.id, null, "tienda");
}

// Desde una tarjeta de Mis compras / Mis ventas.
function abrirChatDePedidoNivan(idPedido) {
    if (!usuarioActual) return;

    const pedido = obtenerPedidosNivan().find(function(p) { return p.id === idPedido; });
    if (!pedido || !pedido.vendedorId || !pedido.compradorId) return;

    // En un pedido, el vendedor habla desde su tienda y el comprador desde su perfil personal.
    const ladosPedido = {};
    ladosPedido[pedido.vendedorId] = "tienda";
    ladosPedido[pedido.compradorId] = "personal";

    abrirChatNivan(pedido.vendedorId, pedido.compradorId, {
        clave: "ped-" + pedido.id,
        texto: "Pedido " + pedido.id
    }, "tienda", ladosPedido);
}

// ---- Conversación ----

// ambito: perfil de la OTRA persona al que le escribís ("tienda" | "personal").
// lados: { idPersona: "tienda" | "personal" } si el chat ya tiene sus perfiles definidos
// (chat existente o pedido). Si no, tu lado es el perfil que estés usando ahora.
function abrirChatNivan(idVendedor, idComprador, contexto, ambito, lados) {
    if (!usuarioActual) return;
    if (idVendedor === idComprador) return;
    if (usuarioActual.id !== idVendedor && usuarioActual.id !== idComprador) return;

    const idOtraPersonaChatNivan = usuarioActual.id === idVendedor ? idComprador : idVendedor;

    let ladosChatNivan = lados;
    if (!ladosChatNivan) {
        const otroTieneTienda = usuarioTieneTiendaNivan(idOtraPersonaChatNivan);
        const ladoOtro = ambito === "personal" ? "personal"
            : (ambito === "tienda" ? (otroTieneTienda ? "tienda" : "personal")
                : (otroTieneTienda ? "tienda" : "personal"));
        ladosChatNivan = {};
        ladosChatNivan[usuarioActual.id] = modoCuentaNivan();
        ladosChatNivan[idOtraPersonaChatNivan] = ladoOtro;
    }
    const idChatAbrirNivan = idChatNivan(idVendedor, idComprador, ladosChatNivan[idVendedor], ladosChatNivan[idComprador]);
    ambito = ladosChatNivan[idOtraPersonaChatNivan];
    if (hayBloqueoEntreNivan(usuarioActual.id, idOtraPersonaChatNivan)) {
        const yoLoBloqueeNivan = obtenerIdsBloqueadosPorMi().indexOf(idOtraPersonaChatNivan) !== -1;

        if (!yoLoBloqueeNivan) {
            alert("No podés chatear con este usuario.");
            return;
        }

        const usuariosChatBloqueadoNivan = obtenerUsuariosNivan();
        const chatTempBloqueadoNivan = obtenerChatsNivan().find(function(c) { return c.id === idChatAbrirNivan; }) ||
            crearChatVacioNivan(idVendedor, idComprador, ladosChatNivan);
        const nombreOtroBloqueadoNivan = obtenerNombreParticipanteChatNivan(chatTempBloqueadoNivan, idOtraPersonaChatNivan, usuariosChatBloqueadoNivan);

        const confirmadoDesbloqueoNivan = confirm(
            `¿Desbloquear a ${nombreOtroBloqueadoNivan}? Vas a poder volver a chatear y ver su perfil.`
        );
        if (!confirmadoDesbloqueoNivan) return;

        quitarBloqueoNivan(idOtraPersonaChatNivan);
    }

    // Una conversación nueva solo se abre si la otra persona acepta mensajes de este usuario.
    // Las que ya existen se pueden abrir para leerlas; el envío se controla al mandar.
    const existeChatNivan = obtenerChatsNivan().some(function(c) { return c.id === idChatAbrirNivan; });
    if (!existeChatNivan && !puedeEscribirANivan(usuarioActual.id, idOtraPersonaChatNivan, ambito)) {
        alert(mensajeNoPuedeEscribirNivan(idOtraPersonaChatNivan, ambito));
        return;
    }

    // Este chat es de un perfil tuyo en particular: si estás usando el otro, se cambia solo.
    const miLadoChatNivan = ladosChatNivan[usuarioActual.id];
    if (usuarioTieneTiendaNivan(usuarioActual.id) && modoCuentaNivan() !== miLadoChatNivan) {
        establecerModoCuentaNivan(miLadoChatNivan, true);
    }

    chatParNivan = { vendedorId: idVendedor, compradorId: idComprador, lados: ladosChatNivan };
    chatContextoNivan = contexto || null;
    chatAmbitoNivan = ambito || null;
    chatTiendaDeNivan = ambito === "tienda" ? idOtraPersonaChatNivan : null;

    mostrarAvisoSeguridadNuevoNivan(idChatAbrirNivan, chatSinTiendasNivan(idVendedor, idComprador));
    mostrarAvisoChatNivan("");

    const input = document.getElementById("inputChatNivan");
    if (input) {
        input.value = "";
        input.style.height = "auto";
    }

    marcarChatLeidoNivan(idChatAbrirNivan);
    document.getElementById("overlayChatNivan").classList.add("abierto");
    renderizarConversacionChatNivan();
    actualizarContadoresChatNivan();
}

function cerrarChatNivan() {
    document.getElementById("overlayChatNivan").classList.remove("abierto");
    chatParNivan = null;
    chatContextoNivan = null;
    chatAmbitoNivan = null;
    chatTiendaDeNivan = null;

    if (document.getElementById("overlayListaChatsNivan").classList.contains("abierto")) {
        renderizarListaChatsNivan();
    }

    actualizarContadoresChatNivan();
}

// Qué es el chat que está abierto (tienda o persona), contando lo que
// se eligió al abrirlo aunque todavía no se haya mandado ningún mensaje.
function identidadOtroChatAbiertoNivan(chat, idOtro) {
    if (chat.lados && chat.lados[idOtro]) return chat.lados[idOtro];
    const yaEscribio = (chat.mensajes || []).some(function(m) {
        return esMensajeRealChatNivan(m) && m.de === idOtro && m.ambito;
    });
    if (yaEscribio) return identidadEnChatNivan(chat, idOtro);

    // Todavía no escribió: vale a qué perfil suyo se le está escribiendo.
    if (chatAmbitoNivan === "tienda" && chatTiendaDeNivan === idOtro) return "tienda";
    if (chatAmbitoNivan === "personal") return "personal";

    return identidadEnChatNivan(chat, idOtro);
}

function verPerfilDesdeChatNivan(idOtro) {
    const chat = obtenerChatAbiertoNivan();
    const identidad = chat ? identidadOtroChatAbiertoNivan(chat, idOtro) : "personal";
    cerrarChatNivan();
    cerrarMisChatsNivan();

    // Si el otro te escribe desde su tienda, se abre la tienda; si es una persona, su perfil personal.
    if (identidad === "tienda" && usuarioTieneTiendaNivan(idOtro)) abrirPerfilVendedor(idOtro);
    else abrirPerfilPersonalNivan(idOtro, true);
}

function renderizarConversacionChatNivan() {
    if (!usuarioActual || !chatParNivan) return;

    const chat = obtenerChatAbiertoNivan();
    const usuarios = obtenerUsuariosNivan();
    const soyVendedor = usuarioActual.id === chat.vendedorId;
    const otroId = soyVendedor ? chat.compradorId : chat.vendedorId;
    const identidadOtro = identidadOtroChatAbiertoNivan(chat, otroId);
    const nombreOtro = obtenerNombreParticipanteChatNivan(chat, otroId, usuarios, identidadOtro);

    document.getElementById("cabeceraChatNivan").innerHTML = `
        <button type="button" class="volverChatNivan" onclick="cerrarChatNivan()" aria-label="Volver">←</button>
        <span style="display:flex; cursor:pointer;" onclick="verPerfilDesdeChatNivan('${escaparHTMLNivan(otroId)}')">${avatarChatNivanHTML(otroId, usuarios, identidadOtro)}</span>
        <div class="datosCabeceraChatNivan" style="cursor:pointer;" onclick="verPerfilDesdeChatNivan('${escaparHTMLNivan(otroId)}')">
            <strong>${escaparHTMLNivan(nombreOtro)}${chatSilenciadoNivan(chat, usuarioActual.id) ? " 🔕" : ""}</strong>
            ${identidadOtro === "tienda" ? "<small>🛍️ Tienda</small>" : ""}
        </div>
        <button type="button" class="verPerfilChatNivan" onclick="verPerfilDesdeChatNivan('${escaparHTMLNivan(otroId)}')">Ver perfil</button>
        <button type="button" class="botonBorrarChatNivan" aria-label="Más opciones" style="font-size:22px; font-weight:bold;" onclick="abrirMenuChatNivan()">⋮</button>
    `;

    const soloPersonalesNivan = chatSoloPersonalesNivan(chat);
    actualizarTextoAvisoSeguridadNivan(soloPersonalesNivan);
    const botonPropuestaNivan = document.getElementById("botonPropuestaChatNivan");
    if (botonPropuestaNivan) botonPropuestaNivan.style.display = chatConPerfilTiendaNivan(chat) ? "" : "none";

    let html = "";
    let ultimoDia = "";

    mensajesVisiblesChatNivan(chat).forEach(function(m) {
        const dia = new Date(m.fecha).toDateString();

        if (dia !== ultimoDia) {
            html += `<div class="separadorChatNivan">${etiquetaDiaChatNivan(m.fecha)}</div>`;
            ultimoDia = dia;
        }

        if (m.tipo === "compra") {
            html += tarjetaCompraChatNivan(m);
            return;
        }

        if (!esMensajeRealChatNivan(m)) {
            html += `<div class="contextoChatNivan">${escaparHTMLNivan(m.texto)}</div>`;
            return;
        }

        const hora = new Date(m.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
        if (m.tipo === "propuesta") {
            html += tarjetaPropuestaChatNivan(m, hora);
            return;
        }

        html += `<div class="burbujaChatNivan ${m.de === usuarioActual.id ? "mia" : "suya"}" onclick="abrirAccionesMensajeNivan('${escaparHTMLNivan(m.id)}')">${escaparHTMLNivan(m.texto)}${m.cupon ? cuponTarjetaHTMLNivan(m.cupon, m.de !== usuarioActual.id) : ""}<small>${hora}</small></div>`;
    });

    // Producto o pedido desde el que se abrió el chat, todavía sin mensaje enviado.
    if (chatContextoNivan && chatContextoNivan.clave !== chat.ultimoContexto) {
        html += `<div class="contextoChatNivan">${escaparHTMLNivan(chatContextoNivan.texto)}</div>`;
    }

    if (!html) {
        html = soloPersonalesNivan
            ? `<p class="vacioChatNivan">Todavía no hay mensajes. Escribí el primero.</p>`
            : `<p class="vacioChatNivan">Todavía no hay mensajes. Escribí el primero: podés consultar por talles, colores, tiempos de entrega o el envío.</p>`;
    }

    const contenedor = document.getElementById("mensajesChatNivan");
    contenedor.innerHTML = html;
    contenedor.scrollTop = contenedor.scrollHeight;

    renderizarIdentidadEnvioChatNivan();
}

// Aviso fijo arriba del cuadro de texto: desde qué perfil salen tus
// mensajes (solo si tenés tienda), con botón para cambiar.
function renderizarIdentidadEnvioChatNivan() {
    const barra = document.getElementById("identidadEnvioChatNivan");
    if (!barra) return;

    if (!usuarioActual || !usuarioTieneTiendaNivan(usuarioActual.id)) {
        barra.style.display = "none";
        barra.innerHTML = "";
        return;
    }

    // Cada chat es de un solo perfil tuyo: no se cambia desde acá, se cambia en Perfil.
    const chatBarra = obtenerChatAbiertoNivan();
    const modo = (chatBarra && identidadEnChatNivan(chatBarra, usuarioActual.id)) || modoCuentaNivan();
    const d = datosIdentidadNivan(usuarioActual, modo);

    barra.style.display = "flex";
    barra.innerHTML = `
        <span>Escribís como <strong>${modo === "tienda" ? "🛍️" : "👤"} ${escaparHTMLNivan(d.nombre)}</strong></span>
    `;
}

function notificarMensajeChatNivan(chat, idDestinatario, texto) {
    // Chat silenciado por quien lo recibe: no se le crea ninguna notificación.
    if (chatSilenciadoNivan(chat, idDestinatario)) return;

    // Si el otro todavía no leyó un aviso anterior de este mismo chat, lo
    // reemplazamos en vez de llenarle las notificaciones de avisos repetidos.
    const todas = obtenerTodasLasNotificaciones();

    todas[idDestinatario] = (todas[idDestinatario] || []).filter(function(n) {
        return !(n.tipo === "mensaje" && n.chatId === chat.id && !n.leida);
    });

    guardarTodasLasNotificaciones(todas);

    const nombreRemitente = obtenerNombreParticipanteChatNivan(chat, usuarioActual.id, null, identidadEnChatNivan(chat, usuarioActual.id));
    const resumen = texto.length > 70 ? texto.slice(0, 70) + "…" : texto;

    crearNotificacion(idDestinatario, {
        tipo: "mensaje",
        icono: "💬",
        titulo: "Mensaje de " + escaparHTMLNivan(nombreRemitente),
        texto: escaparHTMLNivan(resumen),
        chatId: chat.id,
        cuenta: identidadEnChatNivan(chat, idDestinatario)
    });
}

function nuevoIdMensajeChatNivan(ahora) {
    return "M" + ahora + "-" + Math.random().toString(36).slice(2, 8);
}

function cerrarAccionChatNivan() {
    const overlay = document.getElementById("overlayAccionChatNivan");
    if (overlay) overlay.classList.remove("abierto");
}

// Hoja con las opciones al tocar un mensaje.
function abrirAccionesMensajeNivan(idMensaje) {
    if (!usuarioActual || !chatParNivan) return;

    const chat = obtenerChatAbiertoNivan();
    const m = (chat.mensajes || []).find(function(x) { return x.id === idMensaje; });
    if (!m || !mensajeVisibleChatNivan(chat, m)) return;

    const esMio = m.de === usuarioActual.id;
    const dentroDelPlazo = (Date.now() - m.fecha) <= LIMITE_ELIMINAR_PARA_TODOS_NIVAN;
    const resumen = m.texto.length > 90 ? m.texto.slice(0, 90) + "…" : m.texto;
    const id = escaparHTMLNivan(m.id);

    let html = `<h4>Eliminar mensaje</h4><p class="resumenAccionChatNivan">${escaparHTMLNivan(resumen)}</p>`;
    html += `<button type="button" onclick="eliminarMensajeParaMiNivan('${id}')">Eliminar para mí</button>`;

    if (esMio && dentroDelPlazo) {
        html += `<button type="button" class="peligroNivan" onclick="eliminarMensajeParaTodosNivan('${id}')">Eliminar para todos</button>`;
    } else if (esMio) {
        html += `<button type="button" disabled>Eliminar para todos</button>`;
        html += `<p class="notaAccionChatNivan">Solo se puede eliminar para todos durante el primer día después de enviarlo.</p>`;
    }

    html += `<button type="button" onclick="cerrarAccionChatNivan()">Cancelar</button>`;

    document.getElementById("hojaAccionChatNivan").innerHTML = html;
    document.getElementById("overlayAccionChatNivan").classList.add("abierto");
}

function eliminarMensajeParaMiNivan(idMensaje) {
    if (!usuarioActual || !chatParNivan) return;

    const chats = obtenerChatsNivan();
    const idChat = idChatParNivan(chatParNivan);
    const chat = chats.find(function(c) { return c.id === idChat; });
    const m = chat && (chat.mensajes || []).find(function(x) { return x.id === idMensaje; });
    if (!m) { cerrarAccionChatNivan(); return; }

    m.ocultoPara = Array.isArray(m.ocultoPara) ? m.ocultoPara : [];
    if (m.ocultoPara.indexOf(usuarioActual.id) === -1) m.ocultoPara.push(usuarioActual.id);

    guardarChatsNivan(chats);
    cerrarAccionChatNivan();
    renderizarConversacionChatNivan();
    actualizarContadoresChatNivan();
}

function eliminarMensajeParaTodosNivan(idMensaje) {
    if (!usuarioActual || !chatParNivan) return;

    const chats = obtenerChatsNivan();
    const idChat = idChatParNivan(chatParNivan);
    const chat = chats.find(function(c) { return c.id === idChat; });
    const m = chat && (chat.mensajes || []).find(function(x) { return x.id === idMensaje; });
    if (!m) { cerrarAccionChatNivan(); return; }

    // Se vuelve a chequear acá: solo mensajes propios y dentro del primer día.
    if (m.de !== usuarioActual.id) { cerrarAccionChatNivan(); return; }
    if ((Date.now() - m.fecha) > LIMITE_ELIMINAR_PARA_TODOS_NIVAN) {
        cerrarAccionChatNivan();
        mostrarAvisoChatNivan("Ya pasó más de un día: solo podés eliminarlo para vos.");
        return;
    }

    m.eliminado = true;
    m.texto = "";
    delete m.ocultoPara;

    guardarChatsNivan(chats);

    // Si el otro todavía no lo leyó, su aviso de "nuevo mensaje" no tiene que mostrar el texto borrado.
    const idDestinatario = usuarioActual.id === chat.vendedorId ? chat.compradorId : chat.vendedorId;
    const todas = obtenerTodasLasNotificaciones();
    const antes = todas[idDestinatario] || [];
    const despues = antes.filter(function(n) {
        return !(n.tipo === "mensaje" && n.chatId === chat.id && !n.leida);
    });

    if (despues.length !== antes.length) {
        todas[idDestinatario] = despues;
        guardarTodasLasNotificaciones(todas);

        const lecturaOtro = (chat.lecturas && chat.lecturas[idDestinatario]) || 0;
        const pendientes = chat.mensajes.filter(function(x) {
            return esMensajeRealChatNivan(x) && x.de === usuarioActual.id && x.fecha > lecturaOtro &&
                mensajeVisibleChatNivan(chat, x, idDestinatario);
        });
        if (pendientes.length) notificarMensajeChatNivan(chat, idDestinatario, pendientes[pendientes.length - 1].texto);
    }

    cerrarAccionChatNivan();
    mostrarAvisoChatNivan("");
    renderizarConversacionChatNivan();
    actualizarContadoresChatNivan();
}

// Eliminar uno o varios chats solo para mí: la otra persona los sigue viendo.
// Si después llegan mensajes nuevos, el chat vuelve a aparecer solo con esos.
function eliminarChatsNivan(ids, mensajeConfirmacion) {
    if (!usuarioActual || !ids || !ids.length) return;

    const chats = obtenerChatsNivan();
    const validos = ids.filter(function(id) {
        return chats.some(function(c) {
            return c.id === id && (c.vendedorId === usuarioActual.id || c.compradorId === usuarioActual.id);
        });
    });
    if (!validos.length) return;

    if (!confirm(mensajeConfirmacion)) return;

    const ahora = Date.now();
    let lista = chats;

    validos.forEach(function(idChat) {
        const chat = lista.find(function(c) { return c.id === idChat; });
        if (!chat) return;

        chat.borradoPara = chat.borradoPara || {};
        chat.borradoPara[usuarioActual.id] = ahora;
        chat.lecturas = chat.lecturas || {};
        chat.lecturas[usuarioActual.id] = ahora;

        // Si ya no queda nada visible para ninguno de los dos, se borra del todo.
        const sinMensajesVisibles = [chat.vendedorId, chat.compradorId].every(function(id) {
            return mensajesVisiblesChatNivan(chat, id).length === 0;
        });
        if (sinMensajesVisibles) lista = lista.filter(function(c) { return c.id !== idChat; });
    });

    guardarChatsNivan(lista);

    // Sus avisos de estos chats ya no tienen sentido.
    const todas = obtenerTodasLasNotificaciones();
    todas[usuarioActual.id] = (todas[usuarioActual.id] || []).filter(function(n) {
        return !(n.tipo === "mensaje" && validos.indexOf(n.chatId) !== -1);
    });
    guardarTodasLasNotificaciones(todas);
    actualizarBadgeNotificaciones();

    if (chatParNivan && validos.indexOf(idChatParNivan(chatParNivan)) !== -1) {
        cerrarChatNivan();
    }

    chatsSeleccionadosNivan = [];
    renderizarListaChatsNivan();
    actualizarContadoresChatNivan();
}

function eliminarChatNivan(idChatParam) {
    if (!usuarioActual) return;

    const idChat = idChatParam || (chatParNivan ? idChatParNivan(chatParNivan) : null);
    if (!idChat) return;

    eliminarChatsNivan([idChat], "¿Eliminar este chat? Se borra solo para vos: la otra persona lo va a seguir viendo con todos sus mensajes.");
}

// propuesta (opcional): { items, presupuesto, moneda, nota, texto, textoFiltro }
// Devuelve true si el mensaje se envió.
function enviarMensajeChatNivan(propuesta) {
    if (!usuarioActual || !chatParNivan) return false;

    const input = document.getElementById("inputChatNivan");
    const esPropuesta = !!(propuesta && Array.isArray(propuesta.items));
    const texto = esPropuesta ? propuesta.texto : input.value.trim();

    if (!texto) return false;

    const idDestinoPrivacidadNivan = usuarioActual.id === chatParNivan.vendedorId ? chatParNivan.compradorId : chatParNivan.vendedorId;
    if (!puedeEscribirANivan(usuarioActual.id, idDestinoPrivacidadNivan, chatParNivan.lados && chatParNivan.lados[idDestinoPrivacidadNivan])) {
        mostrarAvisoChatNivan(mensajeNoPuedeEscribirNivan(idDestinoPrivacidadNivan, chatParNivan.lados && chatParNivan.lados[idDestinoPrivacidadNivan]));
        return;
    }

    const chats = obtenerChatsNivan();
    const idChat = idChatParNivan(chatParNivan);
    let chat = chats.find(function(c) { return c.id === idChat; });

    // Teléfonos y redes sociales (ver 24-filtro-contacto-chat.js).
    if (typeof revisarMensajeChatNivan === "function") {
        const chatParaLados = chat || obtenerChatAbiertoNivan();
        const ladoEmisor = (chatParNivan.lados && chatParNivan.lados[usuarioActual.id]) || modoCuentaNivan();
        const ladoReceptor = (chatParNivan.lados && chatParNivan.lados[idDestinoPrivacidadNivan]) ||
            identidadEnChatNivan(chatParaLados, idDestinoPrivacidadNivan);
        const bloqueo = revisarMensajeChatNivan(chat, usuarioActual.id, esPropuesta ? propuesta.textoFiltro : texto, ladoEmisor, ladoReceptor, chatSinTiendasNivan(chatParNivan.vendedorId, chatParNivan.compradorId), idDestinoPrivacidadNivan);
        if (bloqueo) {
            mostrarAvisoChatNivan(bloqueo);
            return;
        }
    }

    const ahora = Date.now();

    if (!chat) {
        chat = crearChatVacioNivan(chatParNivan.vendedorId, chatParNivan.compradorId, chatParNivan.lados);
        chats.push(chat);
    }

    if (chatContextoNivan && chatContextoNivan.clave !== chat.ultimoContexto) {
        chat.mensajes.push({ id: nuevoIdMensajeChatNivan(ahora), tipo: "contexto", texto: chatContextoNivan.texto, fecha: ahora });
        chat.ultimoContexto = chatContextoNivan.clave;
    }

    // El mensaje sale desde el perfil que estés usando (tienda o personal):
    // la otra persona ve el nombre y la foto de ese perfil.
    // El chat ya es de un perfil tuyo (tienda o personal): sale siempre desde ese.
    const ambitoEnvio = (chat.lados && chat.lados[usuarioActual.id]) || modoCuentaNivan();

    // A qué perfil de la otra persona le estás escribiendo (por si todavía no te respondió).
    if (chatAmbitoNivan === "tienda" && chatTiendaDeNivan && chatTiendaDeNivan !== usuarioActual.id) {
        chat.tiendaDe = chatTiendaDeNivan;
    } else if (chatAmbitoNivan === "personal" && chat.tiendaDe && chat.tiendaDe !== usuarioActual.id) {
        chat.tiendaDe = null;
    }
    chat.ambitoUltimo = ambitoEnvio;

    const mensajeNuevo = { id: nuevoIdMensajeChatNivan(ahora), de: usuarioActual.id, texto: texto, ambito: ambitoEnvio, fecha: ahora };
    if (esPropuesta) {
        mensajeNuevo.tipo = "propuesta";
        mensajeNuevo.items = propuesta.items;
        mensajeNuevo.presupuesto = propuesta.presupuesto;
        mensajeNuevo.moneda = propuesta.moneda;
        mensajeNuevo.nota = propuesta.nota || "";
    }
    chat.mensajes.push(mensajeNuevo);
    chat.actualizado = ahora;
    chat.lecturas = chat.lecturas || {};
    chat.lecturas[usuarioActual.id] = ahora;

    if (!guardarChatsNivan(chats)) {
        mostrarAvisoChatNivan("No se pudo enviar el mensaje: el almacenamiento de este dispositivo está lleno.");
        return;
    }

    const idDestinatario = usuarioActual.id === chat.vendedorId ? chat.compradorId : chat.vendedorId;
    notificarMensajeChatNivan(chat, idDestinatario, texto);

    if (!esPropuesta) {
        input.value = "";
        input.style.height = "auto";
    }
    renderizarConversacionChatNivan();
    return true;
}

// ---- Propuesta de cantidades y presupuesto (solo si alguno de los dos es tienda) ----

function tarjetaPropuestaChatNivan(m, hora) {
    const items = (Array.isArray(m.items) ? m.items : []).map(function(it) {
        return `<li>${escaparHTMLNivan(String(it.cantidad))} × ${escaparHTMLNivan(it.prenda)}</li>`;
    }).join("");
    const mia = m.de === usuarioActual.id;

    return `<div class="burbujaChatNivan propuestaChatNivan ${mia ? "mia" : "suya"}" onclick="abrirAccionesMensajeNivan('${escaparHTMLNivan(m.id)}')">
        <strong>📋 ${mia ? "Tu propuesta" : "Te enviaron una propuesta"}</strong>
        <ul>${items}</ul>
        <div class="presupuestoPropuestaNivan">Presupuesto: ${escaparHTMLNivan(m.moneda || "")}${formatearDineroNivan(Number(m.presupuesto) || 0)}</div>
        ${m.nota ? `<p>${escaparHTMLNivan(m.nota)}</p>` : ""}
        <small>${hora}</small>
    </div>`;
}

const MAX_FILAS_PROPUESTA_NIVAN = 6;

function htmlFilaPropuestaNivan() {
    return `<div class="filaPrendaPropuestaNivan">
        <input type="text" class="prendaPropuestaNivan" maxlength="60" placeholder="Prenda (ej: remera lisa)">
        <input type="number" class="cantidadPropuestaNivan" min="1" max="100000" inputmode="numeric" placeholder="Cant.">
    </div>`;
}

function abrirPropuestaChatNivan() {
    if (!usuarioActual || !chatParNivan) return;
    if (!chatConPerfilTiendaNivan(obtenerChatAbiertoNivan())) return;

    document.getElementById("hojaPropuestaChatNivan").innerHTML = `
        <h4>Sugerir cantidades y presupuesto</h4>
        <p class="notaPropuestaNivan">Indicá qué prendas y cuántas, y el presupuesto total. La otra persona lo ve en el chat y puede responderte.</p>
        <div id="filasPropuestaNivan">${htmlFilaPropuestaNivan()}</div>
        <button type="button" class="agregarFilaPropuestaNivan" id="agregarFilaPropuestaNivan" onclick="agregarFilaPropuestaNivan()">+ Agregar otra prenda</button>
        <label class="etiquetaPropuestaNivan">Presupuesto total (${escaparHTMLNivan(simboloMonedaNivan().trim())})</label>
        <input type="number" id="presupuestoPropuestaNivan" min="1" inputmode="decimal" placeholder="Ej: 150000">
        <label class="etiquetaPropuestaNivan">Nota (opcional)</label>
        <textarea id="notaPropuestaNivan" rows="2" maxlength="300" placeholder="Fechas, detalles, colores..."></textarea>
        <div class="avisoErrorNivan" id="errorPropuestaNivan"></div>
        <div class="botonesPropuestaNivan">
            <button type="button" onclick="cerrarPropuestaChatNivan()">Cancelar</button>
            <button type="button" class="principalPropuestaNivan" onclick="enviarPropuestaChatNivan()">Enviar propuesta</button>
        </div>
    `;
    document.getElementById("overlayPropuestaChatNivan").classList.add("abierto");
}

function cerrarPropuestaChatNivan() {
    const overlay = document.getElementById("overlayPropuestaChatNivan");
    if (overlay) overlay.classList.remove("abierto");
}

function agregarFilaPropuestaNivan() {
    const cont = document.getElementById("filasPropuestaNivan");
    if (!cont) return;
    if (cont.children.length >= MAX_FILAS_PROPUESTA_NIVAN) return;
    cont.insertAdjacentHTML("beforeend", htmlFilaPropuestaNivan());
    if (cont.children.length >= MAX_FILAS_PROPUESTA_NIVAN) {
        const b = document.getElementById("agregarFilaPropuestaNivan");
        if (b) b.style.display = "none";
    }
}

function enviarPropuestaChatNivan() {
    const error = document.getElementById("errorPropuestaNivan");
    function fallar(t) { error.textContent = t; error.classList.add("visible"); }

    const items = [];
    const filas = document.querySelectorAll("#filasPropuestaNivan .filaPrendaPropuestaNivan");
    for (let i = 0; i < filas.length; i++) {
        const prenda = filas[i].querySelector(".prendaPropuestaNivan").value.trim();
        const cantTxt = filas[i].querySelector(".cantidadPropuestaNivan").value.trim();
        if (!prenda && !cantTxt) continue;
        const cantidad = Number(cantTxt);
        if (!prenda || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100000) {
            fallar("Completá cada prenda con su cantidad (número entero de 1 en adelante).");
            return;
        }
        items.push({ prenda: prenda, cantidad: cantidad });
    }
    if (!items.length) { fallar("Agregá al menos una prenda con su cantidad."); return; }

    const presupuesto = Number(document.getElementById("presupuestoPropuestaNivan").value);
    if (!isFinite(presupuesto) || presupuesto <= 0 || presupuesto > 1e12) {
        fallar("Ingresá un presupuesto válido.");
        return;
    }

    const nota = document.getElementById("notaPropuestaNivan").value.trim();
    const moneda = simboloMonedaNivan();
    const resumen = items.map(function(it) { return it.cantidad + " × " + it.prenda; }).join(", ");

    const enviado = enviarMensajeChatNivan({
        items: items,
        presupuesto: presupuesto,
        moneda: moneda,
        nota: nota,
        texto: "📋 Propuesta: " + resumen + " · Presupuesto " + moneda + formatearDineroNivan(presupuesto),
        textoFiltro: items.map(function(it) { return it.prenda; }).join(" \n ") + " \n " + nota
    });

    if (enviado) {
        cerrarPropuestaChatNivan();
    } else {
        const avisoChat = document.getElementById("avisoErrorChatNivan");
        fallar((avisoChat && avisoChat.textContent) || "No se pudo enviar la propuesta.");
    }
}

// PERFIL DE VENDEDOR

function abrirPerfilVendedorDesdeProducto(idProducto) {
    const producto = productos.find(function(p) {
        return p.id === idProducto;
    });

    if (!producto) return;

    // Preferimos identificar al vendedor por su id interno (estable
    // aunque cambie de nombre); si es una publicación vieja de muestra
    // sin vendedorId, usamos el nombre que tenía guardado.
    abrirPerfilVendedor(producto.vendedorId || producto.vendedor);
}

// Promedio de estrellas de todas las reseñas (de muestra + reales)
// dejadas sobre las publicaciones de un vendedor.
function calcularReputacionVendedor(productosVendedor, idVendedor) {
    let total = 0;
    let cantidad = 0;

    productosVendedor.forEach(function(producto) {
        const comentariosSemilla = Array.isArray(producto.comentarios) ? producto.comentarios : [];
        const reseniasGuardadas = obtenerReseniasGuardadas(producto.id);

        comentariosSemilla.concat(reseniasGuardadas).forEach(function(r) {
            const llenas = r.estrellas ? (r.estrellas.match(/★/g) || []).length : 0;
            if (llenas) {
                total += llenas;
                cantidad++;
            }
        });
    });

    // Calificaciones que los compradores le dejaron al vendedor después de una compra.
    if (idVendedor) {
        obtenerPedidosNivan().forEach(function(p) {
            if (p.vendedorId === idVendedor && p.calificacionVendedor && p.calificacionVendedor.estrellas) {
                total += p.calificacionVendedor.estrellas;
                cantidad++;
            }
        });
    }

    if (!cantidad) return "Todavía no tiene calificaciones.";

    const promedio = (total / cantidad).toFixed(1);
    return `⭐ ${promedio} (${cantidad} ${cantidad === 1 ? "calificación" : "calificaciones"})`;
}

function renderizarFotoPerfilVendedor(usuarioVendedor, esMiPerfil) {
    const cabecera = document.getElementById("cabeceraFotoPerfilVendedor");
    if (!cabecera) return;

    const foto = usuarioVendedor && usuarioVendedor.fotoTienda
        ? `<img class="fotoPerfilVendedorGrande" id="imgFotoPerfilVendedor" src="${escaparHTMLNivan(usuarioVendedor.fotoTienda)}" alt="Foto de la tienda">`
        : `<div class="fotoPerfilVendedorGrandeVacia" id="imgFotoPerfilVendedor">🛍️</div>`;

    const botonEditar = esMiPerfil
        ? `
            <div>
                <input type="file" id="cambiarFotoPerfilVendedor" accept="image/*" style="display:none;" onchange="guardarFotoPerfilVendedor(this)">
                <button type="button" class="editarFotoPerfilVendedorBtn" onclick="document.getElementById('cambiarFotoPerfilVendedor').click()">📷 Cambiar foto de la tienda</button>
            </div>
        `
        : "";

    cabecera.innerHTML = `${foto}${botonEditar}`;
}

// ---- Perfil personal visto desde la tienda ----

let perfilPersonalActualNivan = null; // { id }

// directo = true cuando se abre desde un chat, una lista o una notificación
// (no hace falta que el dueño lo muestre en su tienda).
function abrirPerfilPersonalNivan(idUsuario, directo) {
    const u = obtenerUsuarioPorIdNivan(idUsuario);
    const esMio = !!(usuarioActual && u && usuarioActual.id === u.id);

    if (!u || (!esMio && !directo && !u.mostrarPersonalEnTienda)) {
        alert("Este perfil personal no está disponible.");
        return;
    }

    if (!esMio && cuentaInactivaNivan(u.id)) {
        alert("Esta cuenta no está disponible.");
        return;
    }

    if (!esMio && usuarioActual && hayBloqueoEntreNivan(usuarioActual.id, u.id)) {
        alert("No podés ver este perfil.");
        return;
    }

    perfilPersonalActualNivan = { id: u.id };
    renderizarPerfilPersonalNivan();
    abrirPantallaCompleta("pantallaPerfilPersonalNivan");
}

function renderizarPerfilPersonalNivan() {
    if (!perfilPersonalActualNivan) return;

    const u = obtenerUsuarioPorIdNivan(perfilPersonalActualNivan.id);
    if (!u) return;

    const esMio = !!(usuarioActual && usuarioActual.id === u.id);
    const restringido = !esMio && !puedeVerPerfilNivan(usuarioActual ? usuarioActual.id : null, u.id, "personal");
    const idSeguro = escaparHTMLNivan(u.id);

    document.getElementById("cabeceraPerfilPersonalNivan").innerHTML = restringido
        ? `<div class="fotoPerfilVendedorGrandeVacia">🔒</div>`
        : (u.foto
            ? `<img class="fotoPerfilVendedorGrande" src="${escaparHTMLNivan(u.foto)}" alt="Foto de perfil">`
            : `<div class="fotoPerfilVendedorGrandeVacia">👤</div>`);

    document.getElementById("nombrePerfilPersonalNivan").textContent = obtenerNombreMostradoUsuario(u);
    document.getElementById("idPerfilPersonalNivan").textContent = restringido ? "" : "ID: " + (u.idPublico || "—");

    const bioCont = document.getElementById("bioPerfilPersonalContenedorNivan");
    if (!restringido && u.bio) {
        document.getElementById("bioPerfilPersonalTextoNivan").textContent = u.bio;
        bioCont.style.display = "";
    } else {
        bioCont.style.display = "none";
    }

    const botones = [];

    if (!esMio && !restringido) {
        const sigue = !!usuarioActual && usuarioSigueANivan(claveCuentaActivaNivan(), u.id);
        botones.push(sigue
            ? `<button type="button" onclick="dejarDeSeguirNivan('${idSeguro}')">✓ Siguiendo</button>`
            : `<button type="button" onclick="seguirUsuarioNivan('${idSeguro}')" style="background:#fff; color:#111;">➕ Seguir</button>`);
    }

    if (restringido) {
        botones.push(botonSolicitudPerfilHTMLNivan(u.id, "personal"));
    }

    if (!esMio && (!usuarioActual || puedeEscribirANivan(usuarioActual.id, u.id, "personal"))) {
        botones.push(`<button type="button" onclick="abrirChatPersonalNivan('${idSeguro}')">💬 Chatear</button>`);
    }

    document.getElementById("accionesPerfilPersonalNivan").innerHTML = botones.join("");

    const titulo = document.getElementById("tituloPortafolioPerfilPersonalNivan");
    const cont = document.getElementById("portafolioPerfilPersonalNivan");

    if (restringido) {
        if (titulo) titulo.style.display = "none";
        cont.innerHTML = `<p class="vacioPublicacionesPerfilLateral">🔒 Este perfil es privado. Podés enviar una solicitud: si la aceptan, vas a poder ver su perfil.</p>`;
        return;
    }

    if (titulo) titulo.style.display = "";
    const portafolio = Array.isArray(u.portafolio) ? u.portafolio : [];
    cont.innerHTML = portafolio.length
        ? htmlPublicacionesPersonalesNivan(
            portafolio.map(function(item, indice) { return { usuario: u, indice: indice, item: item }; }),
            {
                controlesVideo: true,
                alClick: function(e) { return formatoPortafolioItemNivan(e.item) === "post" ? `abrirPostFeedNivan('${escaparHTMLNivan(u.id)}', ${e.indice})` : ""; }
            }
        )
        : `<p class="vacioPublicacionesPerfilLateral">Todavía no tiene publicaciones personales.</p>`;
}

function abrirChatPersonalNivan(idUsuario) {
    if (!usuarioActual) {
        alert("Iniciá sesión para chatear.");
        abrirCuenta();
        return;
    }
    if (idUsuario === usuarioActual.id) return;

    cerrarPantallaCompleta("pantallaPerfilPersonalNivan");
    abrirChatNivan(idUsuario, usuarioActual.id, null, "personal");
}

function guardarFotoPerfilVendedor(input) {
    if (!usuarioActual || !input.files || !input.files[0]) return;

    const lector = new FileReader();
    lector.onload = function() {
        persistirUsuarioActual({ fotoTienda: lector.result });
        abrirPerfilVendedor(usuarioActual.id);
    };
    lector.readAsDataURL(input.files[0]);
}

function abrirPerfilVendedor(identificadorVendedor) {
    const usuarios = obtenerUsuariosNivan();
    const usuarioVendedor = usuarios.find(function(u) {
        return u.id === identificadorVendedor;
    });

    const productosDelVendedor = productos.filter(function(p) {
        if (usuarioVendedor) return p.vendedorId === usuarioVendedor.id;
        return p.vendedorId === identificadorVendedor || p.vendedor === identificadorVendedor;
    });

    const nombreAMostrar = usuarioVendedor
        ? obtenerNombreVendedorUsuario(usuarioVendedor)
        : (productosDelVendedor[0] ? productosDelVendedor[0].vendedor : identificadorVendedor);

    const esMiPerfil = !!(usuarioActual && usuarioVendedor && usuarioActual.id === usuarioVendedor.id);

    if (usuarioVendedor && !esMiPerfil && usuarioActual && hayBloqueoEntreNivan(usuarioActual.id, usuarioVendedor.id)) {
        alert("No podés ver este perfil.");
        return;
    }

    // Quien no tiene tienda (todavía no publicó nada) se ve con su perfil personal.
    if (usuarioVendedor && !esMiPerfil && !usuarioTieneTiendaNivan(usuarioVendedor.id)) {
        abrirPerfilPersonalNivan(usuarioVendedor.id, true);
        return;
    }

    const perfilRestringidoNivan = !!(usuarioVendedor && !esMiPerfil &&
        !puedeVerPerfilNivan(usuarioActual ? usuarioActual.id : null, usuarioVendedor.id));

    perfilVendedorActualNivan = (usuarioVendedor && !esMiPerfil)
        ? { id: usuarioVendedor.id, nombre: nombreAMostrar }
        : null;

    const botonMasOpciones = document.getElementById("botonMasOpcionesPerfilVendedorNivan");
    if (botonMasOpciones) {
        botonMasOpciones.style.display = perfilVendedorActualNivan ? "" : "none";
    }

    document.getElementById("nombrePerfilVendedor").textContent = nombreAMostrar;

    document.getElementById("idPerfilVendedor").textContent = (usuarioVendedor && !perfilRestringidoNivan)
        ? `ID: ${obtenerIdTiendaNivan(usuarioVendedor.id) || "—"}`
        : "";

    document.getElementById("reputacionPerfilVendedor").textContent = perfilRestringidoNivan
        ? (cuentaInactivaNivan(usuarioVendedor.id) ? "Esta cuenta no está disponible." : "🔒 Este perfil es privado. Podés enviar una solicitud para verlo.")
        : calcularReputacionVendedor(productosDelVendedor, usuarioVendedor ? usuarioVendedor.id : null);

    document.getElementById("cantidadProductosVendedor").textContent = perfilRestringidoNivan
        ? (cuentaInactivaNivan(usuarioVendedor.id) ? "" : "Sus publicaciones siguen disponibles en el catálogo.")
        : productosDelVendedor.length === 1
            ? "1 publicación"
            : productosDelVendedor.length + " publicaciones";

    const bioContenedor = document.getElementById("bioPerfilVendedorContenedor");
    const bioTexto = document.getElementById("bioPerfilVendedorTexto");
    if (bioContenedor && bioTexto) {
        if (usuarioVendedor && usuarioVendedor.bioTienda && !perfilRestringidoNivan) {
            bioTexto.textContent = usuarioVendedor.bioTienda;
            bioContenedor.style.display = "";
        } else {
            bioContenedor.style.display = "none";
        }
    }

    renderizarFotoPerfilVendedor(perfilRestringidoNivan ? null : usuarioVendedor, esMiPerfil);

    perfilMostradoSeguidoresNivan = usuarioVendedor
        ? { id: usuarioVendedor.id, esMiPerfil: esMiPerfil, restringido: perfilRestringidoNivan }
        : null;
    renderizarExtrasPerfilVendedorNivan();

    if (typeof renderizarVacantesPerfilVendedorNivan === "function") {
        renderizarVacantesPerfilVendedorNivan(usuarioVendedor ? usuarioVendedor.id : null, esMiPerfil, perfilRestringidoNivan);
    }

    renderizarCalificacionesPerfilVendedorNivan((usuarioVendedor && !perfilRestringidoNivan) ? usuarioVendedor.id : null);

    mostrarProductos(perfilRestringidoNivan ? [] : productosDelVendedor, "productosVendedor");

    cerrarProducto();
    abrirPantallaCompleta("pantallaPerfilVendedor");
}


    // FUNCION AGREGAR AL CARRITO

    // Determina el talle "por defecto" de una publicación: el primero
    // de la lista (mismo criterio que el detalle, que marca el primer
    // talle como activo). Se usa cuando se agrega al carrito directo
    // desde la tarjeta, sin pasar por el detalle.
    function obtenerTalleDefectoProducto(producto) {
        let talles = Array.isArray(producto.talles) ? producto.talles.slice() : [];

        if (actuaComoRevendedorEnPublicacion(producto)) {
            talles = talles.filter(function(talle) {
                return talle.toLowerCase() !== "a medida";
            });
        }

        return talles.length ? talles[0] : null;
    }

    // Determina el color "por defecto" (en formato hex, igual que se
    // guarda cuando se elige desde el detalle) de una publicación: el
    // primero de la lista.
    function obtenerColorDefectoProducto(producto) {
        const colores = Array.isArray(producto.colores) ? producto.colores : [];

        if (!colores.length) return null;

        const color = colores[0];

        if (typeof color === "string") {
            return NIVAN_COLOR_HEX_POR_NOMBRE[color.toLowerCase()] || "#888888";
        }

        return color.hex || null;
    }

    function agregarAlCarrito(id) {

        const producto = productos.find(
            producto => producto.id === id
        );

        if (producto) {

            // Solo tomamos el talle/color tildados si el modal de detalle
            // está abierto y es justo el de este producto (evita arrastrar
            // una selección vieja cuando se agrega directo desde la
            // tarjeta, sin abrir el detalle).
            const modal = document.getElementById("modalProducto");
            const contenidoModal = document.getElementById("contenidoProducto");
            const esMismoProducto = contenidoModal && Number(contenidoModal.dataset.productoId) === id;
            const modalAbierto = modal && modal.classList.contains("abierto") && esMismoProducto;

            const talleBtn = modalAbierto ? document.querySelector(".talleBtn.activo") : null;
            const colorBtn = modalAbierto ? document.querySelector(".colorChipDetalle.activo") : null;

            // Si no viene del detalle (se agregó directo desde la
            // tarjeta), usamos el talle y color por defecto de la
            // publicación en vez de dejarlos vacíos.
            const talleElegido = talleBtn
                ? talleBtn.textContent.trim()
                : obtenerTalleDefectoProducto(producto);

            const colorElegido = colorBtn
                ? colorBtn.getAttribute("data-hex")
                : obtenerColorDefectoProducto(producto);

            // Si el detalle de este producto está abierto, tomamos la
            // cantidad que haya cargado el comprador (para calcular el
            // precio mayorista si corresponde). Si no, es 1 unidad.
            const inputCantidad = modalAbierto ? document.getElementById("cantidadCompraDetalle") : null;
            let cantidad = inputCantidad ? (Number(inputCantidad.value) || 1) : 1;

            const cantidadMinimaMayor = producto.cantidadMinimaMayor || 1;

            if (producto.tipoVenta === "mayor" && cantidad < cantidadMinimaMayor) {
                alert(`Esta publicación se vende solo por mayor: el mínimo son ${cantidadMinimaMayor} unidades.`);
                return;
            }

            const precioUnitario = calcularPrecioUnitarioSegunCantidad(producto, cantidad);

            const itemCarrito = Object.assign({}, producto, {
                talleElegido: talleElegido,
                colorElegido: colorElegido,
                cantidad: cantidad,
                precioUnitario: precioUnitario
            });

            carrito.push(itemCarrito);
            registrarPrecioSeguido(id);
            registrarActividadProducto(id, "carrito");

            // Si había un cupón esperando una compra de esta tienda, se aplica solo.
            if (typeof cuponPendienteNivan !== "undefined" && cuponPendienteNivan &&
                cuponPendienteNivan.vendedorId === producto.vendedorId &&
                (!cuponPendienteNivan.productoId || cuponPendienteNivan.productoId === producto.id)) {
                const cuponPend = buscarCuponPorCodigoNivan(cuponPendienteNivan.codigo);
                if (cuponUsableNivan(cuponPend)) {
                    cuponAplicadoNivan = { codigo: cuponPend.codigo, vendedorId: cuponPend.vendedorId, productoId: cuponPend.productoId || null };
                }
                cuponPendienteNivan = null;
            }

            actualizarCarrito();

            mostrarToastNivan("Producto añadido al carrito");
        }
    }

    // COMPRAR AHORA: agrega el producto al carrito y abre directo el
    // carrito, para que el comprador pueda completar la compra sin
    // tener que buscar el botón del carrito por separado.
    function comprarAhoraNivan(id) {
        agregarAlCarrito(id);

        const carritoEl = document.getElementById("carrito");
        if (carritoEl) carritoEl.classList.add("abierto");
        document.body.style.overflow = "hidden";

        revisarBajasDePrecio();
        actualizarCarrito();
    }


    // Chequea, en el momento de renderizar el carrito, si la publicación
    // de un item sigue existiendo y activa. Los productos del catálogo
    // base (sin vendedorId) no se pausan ni se eliminan, así que siempre
    // están "disponibles". Las publicaciones de usuarios sí pueden haber
    // sido pausadas o eliminadas después de agregarlas al carrito.
    function obtenerEstadoPublicacionCarrito(itemCarrito) {

        // Cada país tiene sus propias publicaciones: un item agregado desde
        // otro país no se puede comprar hasta volver a ese país.
        // Los items viejos sin país cargado cuentan como de Argentina.
        if ((itemCarrito.pais || "AR") !== (paisNivan() || "AR")) {
            return "otroPais";
        }

        if (!itemCarrito.vendedorId) {
            return "disponible";
        }

        const publicacion = obtenerPublicacionesNivan().find(function(p) {
            return p.id === itemCarrito.id;
        });

        if (!publicacion) {
            return "eliminada";
        }

        return publicacion.activo === false ? "inactiva" : "disponible";
    }

    // Mensaje cuando el carrito tiene items que no se pueden comprar ahora.
    function mensajeCarritoNoDisponibleNivan() {
        const hayOtroPais = carrito.some(function(item) {
            return obtenerEstadoPublicacionCarrito(item) === "otroPais";
        });

        return hayOtroPais
            ? "Hay productos de otro país en tu carrito. Eliminalos o volvé a ese país para poder comprarlos."
            : "Hay publicaciones inactivas o no disponibles en tu carrito. Eliminalas para poder continuar.";
    }

    // ACTUALIZAR CARRITO

    function actualizarCarrito() {

    guardarCarritoNivan();

    const items =
        document.getElementById("itemsCarrito");

    const carritoVacio =
        document.getElementById("carritoVacio");

    items.innerHTML = "";

    const totalContenedor =
        document.getElementById("totalContenedor");

    if (carrito.length === 0) {
        carritoVacio.style.display = "flex";
        totalContenedor.style.marginTop = "";
    } else {
        carritoVacio.style.display = "none";
        totalContenedor.style.marginTop = "20px";
    }

    let total = 0;


    carrito.forEach(function(producto, indice) {

        const estado = obtenerEstadoPublicacionCarrito(producto);
        const disponible = estado === "disponible";

        // Compatibilidad con items viejos del carrito que no tenían
        // cantidad ni precioUnitario guardado (siempre eran 1 unidad
        // al precio de venta por menor).
        const cantidadItem = producto.cantidad || 1;
        const precioUnitarioItem = producto.precioUnitario != null ? producto.precioUnitario : producto.precio;
        const subtotalItem = precioUnitarioItem * cantidadItem;

        // Los items no disponibles no suman al total: no se pueden comprar.
        if (disponible) {
            total += subtotalItem;
        }

        const item =
            document.createElement("div");

        item.classList.add("itemCarrito");
        if (!disponible) {
            item.classList.add("itemCarritoNoDisponible");
        }

        const avisoNoDisponible = estado === "inactiva"
            ? `<p class="avisoItemCarritoNoDisponible">Publicación inactiva</p>`
            : estado === "eliminada"
                ? `<p class="avisoItemCarritoNoDisponible">Publicación no disponible</p>`
                : estado === "otroPais"
                    ? `<p class="avisoItemCarritoNoDisponible">Es de ${datosPaisNivan(producto.pais || "AR").nombre}: cambiá de país para comprarlo</p>`
                    : "";

        const opcionesElegidas = (producto.talleElegido || producto.colorElegido)
            ? `
                ${producto.talleElegido ? `<p class="detalleItemCarrito">Talle: ${producto.talleElegido}</p>` : ""}
                ${producto.colorElegido ? `<p class="detalleItemCarrito"><span class="colorMuestraCarrito" style="background:${producto.colorElegido};"></span>Color: ${producto.colorElegido.toUpperCase()}</p>` : ""}
                ${disponible ? `<span class="cambiarOpcionesCarrito">Cambiar talle / color ›</span>` : ""}
            `
            : "";

        item.innerHTML = `

            <strong>
                ${escaparHTMLNivan(producto.nombre)}
            </strong>

            <p>
                ${cantidadItem > 1
                    ? `${simboloMonedaNivan()}${precioUnitarioItem.toLocaleString("es-AR")} c/u × ${cantidadItem} = ${simboloMonedaNivan()}${subtotalItem.toLocaleString("es-AR")}`
                    : `${simboloMonedaNivan()}${precioUnitarioItem.toLocaleString("es-AR")}`}
            </p>

            ${opcionesElegidas ? `
                <div class="opcionesItemCarrito ${disponible ? "opcionesItemCarritoClickeable" : ""}" ${disponible ? `onclick="abrirEditorItemCarrito(${indice})"` : ""}>
                    ${opcionesElegidas}
                </div>
            ` : ""}

            ${avisoNoDisponible}

            <button type="button"
                class="eliminarCarritoBtn"
                onclick="eliminarDelCarrito(${indice})">

                Eliminar

            </button>

        `;


        items.appendChild(item);

    });


    // Cupón: se recalcula acá adentro porque un cambio en el carrito
    // (sacar una prenda, por ejemplo) puede dejarlo sin efecto.
    const descuentoCupon = calcularDescuentoCuponNivan();
    const totalConDescuento = Math.max(0, total - descuentoCupon);

    const filaCupon = document.getElementById("filaCuponCarritoNivan");
    const chipCupon = document.getElementById("cuponAplicadoCarritoNivan");
    const lineaDescuento = document.getElementById("lineaDescuentoCuponNivan");

    if (filaCupon && chipCupon) {
        if (cuponAplicadoNivan) {
            filaCupon.style.display = "none";
            chipCupon.style.display = "flex";
            chipCupon.innerHTML = `<span>🎟️ Cupón <strong>${escaparHTMLNivan(cuponAplicadoNivan.codigo)}</strong> aplicado</span><button type="button" onclick="quitarCuponCarritoNivan()">Quitar</button>`;
        } else {
            filaCupon.style.display = carrito.length ? "flex" : "none";
            chipCupon.style.display = "none";
        }
    }

    if (lineaDescuento) {
        if (descuentoCupon > 0) {
            lineaDescuento.style.display = "block";
            lineaDescuento.textContent = "Descuento: -" + simboloMonedaNivan() + descuentoCupon.toLocaleString("es-AR");
        } else {
            lineaDescuento.style.display = "none";
        }
    }

    const lineaSinDescuento = document.getElementById("lineaSinDescuentoNivan");
    if (lineaSinDescuento) {
        if (total > 0 && descuentoCupon > 0) {
            lineaSinDescuento.style.display = "block";
            lineaSinDescuento.textContent = "Precio sin descuentos: " + simboloMonedaNivan() + total.toLocaleString("es-AR");
        } else {
            lineaSinDescuento.style.display = "none";
        }
    }

    const lineaSinImpuestos = document.getElementById("precioSinImpuestosCarritoNivan");
    if (lineaSinImpuestos) {
        if (carrito.length > 0) {
            lineaSinImpuestos.style.display = "block";
            lineaSinImpuestos.textContent = textoSinImpuestosNivan(totalConDescuento);
        } else {
            lineaSinImpuestos.style.display = "none";
        }
    }

    document
        .getElementById("total")
        .textContent =
        totalConDescuento.toLocaleString("es-AR");


    document
        .getElementById("cantidadCarrito")
        .textContent =
        carrito.length;

    }
function eliminarDelCarrito(indice) {

    carrito.splice(indice, 1);

    actualizarCarrito();

    document
        .getElementById("checkoutForm")
        .style.display = "none";

}

