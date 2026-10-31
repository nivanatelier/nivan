// ==============================
// NIVAN · Chats compartidos (los guarda el servidor)
// ==============================
// El resto de la app sigue leyendo y escribiendo "nivanChats" en el celular, que ahora es una copia:
//   1. Cada mensaje nuevo que mandás se sube al servidor (si no hay internet, queda pendiente y se sube solo después).
//   2. Cada tanto se bajan los mensajes que te mandaron otras personas y se mezclan en esa copia.
//   3. Borrar un mensaje "para todos" y marcar un chat como leído también pasan por el servidor.
// Lo personal (silenciar un chat, borrarlo solo para vos, ocultar un mensaje solo para vos) se queda en el celular.
(function () {
    "use strict";

    const CLAVE_CHATS = "nivanChats";
    const CLAVE_ENVIADOS = "nivanChatsEnviados";        // { idMensaje: 1 } ya está en el servidor (lo mandé yo o lo recibí de él)
    const CLAVE_ELIMINADOS = "nivanChatsEliminadosEnv"; // { idMensaje: 1 } el borrado "para todos" ya llegó al servidor
    const CLAVE_LEIDOS = "nivanChatsLeidoEnv";          // { idChat: hora } hasta cuándo avisé que leí
    const CLAVE_CURSOR = "nivanChatsCursor";            // { idUsuario: hora del servidor } hasta dónde bajé
    const MAX_ENVIADOS = 15000;

    const guardarOriginal = window.guardarChatsNivan;
    if (typeof guardarOriginal !== "function") return;

    let subiendo = false, hayPendiente = false, bajando = false, avisado = false, temporizadorSubida = null;

    function miId() { return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || ""; }
    function leerMapa(clave) { const m = leerJSONNivan(clave, {}); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; }
    function guardarMapa(clave, mapa) {
        if (clave === CLAVE_ENVIADOS) {
            const ids = Object.keys(mapa);
            if (ids.length > MAX_ENVIADOS) {            // se quedan los más nuevos (el id empieza con la hora)
                ids.sort(); ids.slice(0, ids.length - MAX_ENVIADOS + 1000).forEach(function (id) { delete mapa[id]; });
            }
        }
        try { localStorage.setItem(clave, JSON.stringify(mapa)); } catch (e) {}
    }
    function avisarUnaVez(texto) {
        if (avisado) return;
        avisado = true;
        setTimeout(function () { avisado = false; }, 15000);
        if (typeof mostrarToastNivan === "function") mostrarToastNivan(texto, 4000);
    }
    function sinConexionOSesion(r) { return r.estado === 0 || r.estado === 401 || r.estado === 429 || r.estado >= 500; }

    // ---- Cada vez que la app guarda los chats, se programa una subida ----
    window.guardarChatsNivan = function (lista) {
        const ok = guardarOriginal(lista);
        if (ok !== false) programarSubida();
        return ok;
    };
    function programarSubida() {
        clearTimeout(temporizadorSubida);
        temporizadorSubida = setTimeout(subir, 400);
    }

    // ---- Subir lo mío ----
    async function subir() {
        const yo = miId();
        if (!yo) return;
        if (subiendo) { hayPendiente = true; return; }
        subiendo = true;
        try {
            do {
                hayPendiente = false;
                const chats = leerJSONNivan(CLAVE_CHATS, []);
                if (!Array.isArray(chats)) break;
                const enviados = leerMapa(CLAVE_ENVIADOS), eliminados = leerMapa(CLAVE_ELIMINADOS), leidos = leerMapa(CLAVE_LEIDOS);

                for (let i = 0; i < chats.length; i++) {
                    const chat = chats[i];
                    if (!chat || !chat.id || !chat.lados || (chat.vendedorId !== yo && chat.compradorId !== yo)) continue;
                    const mensajes = Array.isArray(chat.mensajes) ? chat.mensajes : [];

                    // 1) Mensajes nuevos míos
                    const nuevos = [];
                    mensajes.forEach(function (m) {
                        if (!m || !m.id || enviados[m.id]) return;
                        const viejo = String(m.id).charAt(0) !== "M";                    // mensajes de antes del servidor: se quedan en el celular
                        const ajeno = m.de && m.de !== yo;                               // escrito por la otra persona (chat de antes): no lo subo yo
                        if (viejo || ajeno) { enviados[m.id] = 1; return; }
                        nuevos.push(m);
                    });
                    nuevos.sort(function (a, b) { return (a.fecha || 0) - (b.fecha || 0); });

                    for (let j = 0; j < nuevos.length; j += 20) {
                        const lote = nuevos.slice(j, j + 20);
                        const r = await apiNivan("/api/chats/enviar", {
                            chat: {
                                id: chat.id, vendedorId: chat.vendedorId, compradorId: chat.compradorId, lados: chat.lados,
                                tiendaDe: chat.tiendaDe || null, vendedorNombre: chat.vendedorNombre || "", compradorNombre: chat.compradorNombre || ""
                            },
                            mensajes: lote
                        });
                        if (r.ok) {
                            (r.aceptados || []).forEach(function (id) { enviados[id] = 1; });
                            (r.rechazados || []).forEach(function (x) {
                                const orig = lote.find(function (m) { return m.id === x.id; });
                                // Un aviso de compra puede llegar antes de que el pedido figure en el servidor: se reintenta un rato.
                                if (orig && orig.tipo === "compra" && Date.now() - (orig.fecha || 0) < 3 * 60 * 1000) return;
                                enviados[x.id] = 1;
                                avisarUnaVez("No se pudo enviar un mensaje: " + (x.error || "error"));
                            });
                            guardarMapa(CLAVE_ENVIADOS, enviados);
                        } else if (sinConexionOSesion(r)) {
                            guardarMapa(CLAVE_ENVIADOS, enviados);
                            return;                                                       // se reintenta más tarde
                        } else {
                            lote.forEach(function (m) { enviados[m.id] = 1; });           // el servidor dijo que no: no se insiste
                            guardarMapa(CLAVE_ENVIADOS, enviados);
                            avisarUnaVez("No se pudo enviar el mensaje: " + (r.error || "error"));
                        }
                    }

                    // 2) Mensajes míos borrados para todos
                    for (let k = 0; k < mensajes.length; k++) {
                        const m = mensajes[k];
                        if (!m || !m.eliminado || m.de !== yo || !enviados[m.id] || eliminados[m.id]) continue;
                        const r = await apiNivan("/api/chats/eliminar", { chatId: chat.id, mensajeId: m.id });
                        if (r.ok || !sinConexionOSesion(r)) { eliminados[m.id] = 1; guardarMapa(CLAVE_ELIMINADOS, eliminados); }
                        else return;
                    }

                    // 3) Hasta cuándo leí este chat
                    const lectura = (chat.lecturas && chat.lecturas[yo]) || 0;
                    const estaEnServidor = mensajes.some(function (m) { return m && enviados[m.id]; });
                    if (estaEnServidor && lectura > (leidos[chat.id] || 0)) {
                        const r = await apiNivan("/api/chats/leido", { chatId: chat.id, hasta: Math.min(lectura, Date.now()) });
                        if (r.ok || !sinConexionOSesion(r)) { leidos[chat.id] = lectura; guardarMapa(CLAVE_LEIDOS, leidos); }
                        else return;
                    }
                }
                guardarMapa(CLAVE_ENVIADOS, enviados);
            } while (hayPendiente);
        } finally { subiendo = false; }
    }

    // ---- Bajar lo de los demás ----
    async function bajar() {
        const yo = miId();
        if (!yo || bajando) return;
        bajando = true;
        try {
            const cursores = leerMapa(CLAVE_CURSOR);
            let cursor = Number(cursores[yo]) || 0;
            let reintentoCompleto = false;
            for (let vuelta = 0; vuelta < 12; vuelta++) {
                const r = await apiNivan("/api/chats?desde=" + cursor);
                if (!r.ok) return;
                const res = fusionar(r.chats || [], r.mensajes || [], yo);
                if (res.faltaChat && !reintentoCompleto && cursor > 0) { reintentoCompleto = true; cursor = 0; continue; }   // me faltaba un chat: se baja todo de nuevo
                cursor = Number(r.cursor) || cursor;
                cursores[yo] = cursor; guardarMapa(CLAVE_CURSOR, cursores);
                if (!r.hayMas) break;
            }
        } finally { bajando = false; }
        subir();                                  // por si quedó algo pendiente de mandar
    }

    function fusionar(chatsServidor, mensajesServidor, yo) {
        let lista = leerJSONNivan(CLAVE_CHATS, []);
        if (!Array.isArray(lista)) lista = [];
        const porId = {};
        lista.forEach(function (c) { if (c && c.id) porId[c.id] = c; });
        const enviados = leerMapa(CLAVE_ENVIADOS);
        let cambio = false, faltaChat = false;
        const entrantes = {};            // idChat -> último mensaje nuevo que me mandó la otra persona
        const conMensajesAjenos = {};
        const tocados = {};

        mensajesServidor.forEach(function (m) {
            if (m.de && m.de !== yo && !enviados[m.id]) conMensajesAjenos[m.chatId] = true;
        });

        chatsServidor.forEach(function (cs) {
            let chat = porId[cs.id];
            const esNuevo = !chat;
            if (esNuevo) {
                chat = typeof crearChatVacioNivan === "function"
                    ? crearChatVacioNivan(cs.vendedorId, cs.compradorId, cs.lados)
                    : { lados: cs.lados, vendedorId: cs.vendedorId, compradorId: cs.compradorId, mensajes: [], lecturas: {}, ultimoContexto: "", actualizado: 0 };
                chat.id = cs.id;
                chat.actualizado = 0;
                if (cs.vendedorNombre) chat.vendedorNombre = cs.vendedorNombre;
                if (cs.compradorNombre) chat.compradorNombre = cs.compradorNombre;
                lista.push(chat); porId[cs.id] = chat; cambio = true;
            }
            chat.lados = cs.lados;
            if (esNuevo || conMensajesAjenos[cs.id]) {            // lo que decide la otra persona (a qué perfil le escribí)
                if (cs.tiendaDe !== undefined) chat.tiendaDe = cs.tiendaDe;
                if (cs.ambitoUltimo) chat.ambitoUltimo = cs.ambitoUltimo;
            }
            chat.lecturas = chat.lecturas || {};
            Object.keys(cs.lecturas || {}).forEach(function (uid) {
                if ((cs.lecturas[uid] || 0) > (chat.lecturas[uid] || 0)) { chat.lecturas[uid] = cs.lecturas[uid]; cambio = true; tocados[cs.id] = true; }
            });
        });

        mensajesServidor.forEach(function (m) {
            const chat = porId[m.chatId];
            if (!chat) { faltaChat = true; return; }
            chat.mensajes = Array.isArray(chat.mensajes) ? chat.mensajes : [];
            const local = chat.mensajes.find(function (x) { return x.id === m.id; });
            if (!local) {
                const copia = Object.assign({}, m); delete copia.chatId;
                chat.mensajes.push(copia);
                enviados[m.id] = 1; cambio = true; tocados[chat.id] = true;
                if (m.de && m.de !== yo && !m.eliminado) entrantes[chat.id] = m;
            } else {
                enviados[m.id] = 1;
                if (m.eliminado && !local.eliminado) { local.eliminado = true; local.texto = ""; delete local.ocultoPara; cambio = true; tocados[chat.id] = true; }
            }
        });

        Object.keys(tocados).forEach(function (id) {
            const chat = porId[id];
            chat.mensajes.sort(function (a, b) { return (a.fecha || 0) - (b.fecha || 0); });
            const ultimo = chat.mensajes.length ? (chat.mensajes[chat.mensajes.length - 1].fecha || 0) : 0;
            if (ultimo > (chat.actualizado || 0)) chat.actualizado = ultimo;
        });

        guardarMapa(CLAVE_ENVIADOS, enviados);
        if (cambio) {
            guardarOriginal(lista);                                   // directo: no hace falta volver a subir lo que acaba de llegar
            Object.keys(entrantes).forEach(function (id) { notificarEntrante(porId[id], entrantes[id], yo); });
            refrescarPantalla(Object.keys(tocados), porId);
        }
        return { faltaChat: faltaChat };
    }

    // Aviso de "mensaje nuevo" para quien lo recibe (el aviso normal de la app se crea en el celular de quien lo manda).
    function notificarEntrante(chat, m, yo) {
        try {
            const lectura = (chat.lecturas && chat.lecturas[yo]) || 0;
            if ((m.fecha || 0) <= lectura || (m.fecha || 0) < Date.now() - 2 * 24 * 3600 * 1000) return;      // ya leído o muy viejo
            if (typeof chatSilenciadoNivan === "function" && chatSilenciadoNivan(chat, yo)) return;
            if (typeof chatParNivan !== "undefined" && chatParNivan && idChatParNivan(chatParNivan) === chat.id) return;   // lo está viendo
            const todas = obtenerTodasLasNotificaciones();
            todas[yo] = (todas[yo] || []).filter(function (n) { return !(n.tipo === "mensaje" && n.chatId === chat.id && !n.leida); });
            guardarTodasLasNotificaciones(todas);
            const nombre = obtenerNombreParticipanteChatNivan(chat, m.de, null, identidadEnChatNivan(chat, m.de));
            const texto = m.tipo === "propuesta" ? "Te enviaron una propuesta" : String(m.texto || "");
            const resumen = texto.length > 70 ? texto.slice(0, 70) + "…" : texto;
            crearNotificacion(yo, {
                tipo: "mensaje", icono: "💬", titulo: "Mensaje de " + escaparHTMLNivan(nombre), texto: escaparHTMLNivan(resumen),
                chatId: chat.id, cuenta: identidadEnChatNivan(chat, yo)
            });
        } catch (e) {}
    }

    function refrescarPantalla(idsTocados, porId) {
        try { if (typeof actualizarContadoresChatNivan === "function") actualizarContadoresChatNivan(); } catch (e) {}
        try {
            if (typeof chatParNivan !== "undefined" && chatParNivan && typeof renderizarConversacionChatNivan === "function") {
                if (idsTocados.indexOf(idChatParNivan(chatParNivan)) !== -1) renderizarConversacionChatNivan();
            }
        } catch (e) {}
        try { if (typeof renderizarListaChatsNivan === "function" && document.getElementById("listaChatsNivan")) renderizarListaChatsNivan(); } catch (e) {}
    }

    // ---- Cuándo se sincroniza ----
    // Más seguido si hay un chat abierto; más tranquilo si no (así se gasta menos batería y datos).
    function ciclo() {
        if (document.visibilityState === "visible" && miId()) bajar();
        const abierto = typeof chatParNivan !== "undefined" && chatParNivan;
        setTimeout(ciclo, abierto ? 4000 : 15000);
    }
    window.addEventListener("load", function () { setTimeout(function () { bajar(); subir(); ciclo(); }, 900); });
    window.addEventListener("online", function () { bajar(); subir(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { bajar(); subir(); } });

    // Al iniciar sesión se trae todo lo de la cuenta.
    const inicioOriginal = window.completarInicioSesionNivan;
    if (typeof inicioOriginal === "function") {
        window.completarInicioSesionNivan = function () {
            const res = inicioOriginal.apply(this, arguments);
            setTimeout(function () { bajar(); subir(); }, 400);
            return res;
        };
    }
    window.sincronizarChatsNivan = function () { return bajar().then(subir); };
})();
