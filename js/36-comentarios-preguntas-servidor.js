// ==============================
// NIVAN · Comentarios de posts y preguntas al vendedor (los guarda y controla el servidor)
// ==============================
// Cómo funciona, sin tocar el resto de la app:
//   - Las claves de siempre ("nivanComentariosPosts" y "nivanPreguntas") pasan a ser una copia de lo que dice el servidor,
//     así todo lo que ya las lee (pantallas, contadores, el orden del feed) sigue andando igual.
//   - Cuando escribís un comentario, le das like, borrás algo, hacés una pregunta o respondés, se hace en pantalla al instante
//     y se manda al servidor. Si el servidor dice que no, se avisa y se vuelve a lo que dice él.
//   - Los comentarios de un post se bajan al abrirlo (y se refrescan mientras está abierto).
//     Las preguntas se bajan todas juntas cada tanto.
//   - Las publicaciones del catálogo base (sin vendedor) siguen como antes, solo en el celular.
(function () {
    "use strict";

    const CLAVE_COM = "nivanComentariosPosts";
    const CLAVE_COM_PEND = "nivanComentariosPend";      // { idComentario: { idPost, comentario } } escritos acá y todavía sin confirmar
    const CLAVE_PREG = "nivanPreguntas";
    const CLAVE_PREG_PEND = "nivanPreguntasPend";       // { idLocal: { idProducto, texto } }
    const CLAVE_PREG_INICIO = "nivanPreguntasInicio";   // { idUsuario: 1 } ya se bajaron una vez (para no avisar de lo viejo)

    function yo() { return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || ""; }
    function leerMapa(c) { const m = leerJSONNivan(c, {}); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; }
    function guardarMapa(c, m) { try { localStorage.setItem(c, JSON.stringify(m)); } catch (e) {} }
    function sinConexion(r) { return r.estado === 0 || r.estado === 401 || r.estado === 429 || r.estado >= 500; }
    function paisActual() { return (typeof paisNivan === "function" && paisNivan()) || "AR"; }
    let avisadoSinRed = false;
    function avisarSinRed() {
        if (avisadoSinRed) return;
        avisadoSinRed = true; setTimeout(function () { avisadoSinRed = false; }, 20000);
        if (typeof mostrarToastNivan === "function") mostrarToastNivan("Sin conexión: se va a enviar cuando vuelva internet.", 3500);
    }
    function falloDelServidor(r) {
        if (sinConexion(r)) avisarSinRed();
        else alert(r.error || "No se pudo completar la acción.");
    }
    function copiar(x) { return JSON.parse(JSON.stringify(x)); }

    // Una sola cola para que las acciones salgan en orden.
    let cola = Promise.resolve();
    function encolar(fn) { cola = cola.then(fn).catch(function () {}); return cola; }

    // =====================================================
    // COMENTARIOS DE POSTS
    // =====================================================
    const leerComOriginal = window.leerComentariosPostNivan;
    const guardarComOriginal = window.guardarComentariosPostNivan;
    const montarOriginal = window.montarInteraccionPostNivan;

    function fijarComentarios(idPost, lista) {
        const todos = leerMapa(CLAVE_COM);
        if (JSON.stringify(todos[idPost] || []) === JSON.stringify(lista)) return false;
        todos[idPost] = lista;
        guardarMapa(CLAVE_COM, todos);
        return true;
    }
    function redibujarSiEstaAbierto(idPost) {
        try {
            if (typeof postInteraccionActualNivan !== "undefined" && postInteraccionActualNivan && postInteraccionActualNivan.idPost === idPost && typeof dibujarInteraccionPostNivan === "function") dibujarInteraccionPostNivan();
        } catch (e) {}
    }
    // Lo que dice el servidor + mis comentarios que todavía no llegaron (así no desaparecen de la pantalla).
    function conPendientes(idPost, lista) {
        const pend = leerMapa(CLAVE_COM_PEND), ids = {};
        lista.forEach(function (c) { ids[c.id] = true; });
        const salida = lista.slice();
        Object.keys(pend).forEach(function (id) {
            if (pend[id].idPost === idPost && !ids[id]) salida.push(pend[id].comentario);
        });
        return salida;
    }
    function aplicarServidor(idPost, listaServidor) {
        if (fijarComentarios(idPost, conPendientes(idPost, listaServidor))) redibujarSiEstaAbierto(idPost);
    }

    async function cargarComentarios(idPost) {
        const r = await apiNivan("/api/comentarios?post=" + encodeURIComponent(idPost));
        if (r.ok && Array.isArray(r.comentarios)) aplicarServidor(idPost, r.comentarios);
        else if (r.estado === 404) aplicarServidor(idPost, []);
    }

    async function enviarComentario(idPost, c) {
        const r = await apiNivan("/api/comentarios/crear", { postId: idPost, texto: c.texto, idPadre: c.idPadre || null, id: c.id });
        if (r.ok) {
            const pend = leerMapa(CLAVE_COM_PEND); delete pend[c.id]; guardarMapa(CLAVE_COM_PEND, pend);
            aplicarServidor(idPost, r.comentarios);
        } else if (sinConexion(r)) {
            avisarSinRed();                                            // queda pendiente y se reintenta solo
        } else {
            const pend = leerMapa(CLAVE_COM_PEND); delete pend[c.id]; guardarMapa(CLAVE_COM_PEND, pend);
            alert(r.error || "No se pudo enviar el comentario.");
            await cargarComentarios(idPost);
        }
    }

    window.guardarComentariosPostNivan = function (idPost, lista) {
        const previa = leerComOriginal(idPost);
        const ok = guardarComOriginal(idPost, lista);                 // se ve al instante
        const miId = yo();
        if (ok === false || !miId) return ok;

        const antes = {}, ahora = {};
        previa.forEach(function (c) { antes[c.id] = c; });
        lista.forEach(function (c) { ahora[c.id] = c; });

        lista.forEach(function (c) {                                   // comentarios nuevos míos
            if (antes[c.id] || c.idUsuario !== miId) return;
            const pend = leerMapa(CLAVE_COM_PEND); pend[c.id] = { idPost: idPost, comentario: c }; guardarMapa(CLAVE_COM_PEND, pend);
            encolar(function () { return enviarComentario(idPost, c); });
        });
        previa.forEach(function (c) {                                  // comentarios borrados (si se borra el principal, se van sus respuestas solas)
            if (ahora[c.id]) return;
            const pendBorrar = leerMapa(CLAVE_COM_PEND);
            if (pendBorrar[c.id]) { delete pendBorrar[c.id]; guardarMapa(CLAVE_COM_PEND, pendBorrar); }     // si todavía no se había enviado, ya no se envía
            if (c.idPadre && !ahora[c.idPadre]) return;
            encolar(async function () {
                const r = await apiNivan("/api/comentarios/eliminar", { id: c.id });
                if (r.ok) aplicarServidor(idPost, r.comentarios); else { falloDelServidor(r); await cargarComentarios(idPost); }
            });
        });
        lista.forEach(function (c) {                                   // mis likes puestos o quitados
            const antesC = antes[c.id];
            if (!antesC) return;
            const estaba = (antesC.likes || []).indexOf(miId) !== -1, esta = (c.likes || []).indexOf(miId) !== -1;
            if (estaba === esta) return;
            encolar(async function () {
                const r = await apiNivan("/api/comentarios/like", { id: c.id, like: esta });
                if (r.ok) aplicarServidor(idPost, r.comentarios); else { falloDelServidor(r); await cargarComentarios(idPost); }
            });
        });
        return ok;
    };

    if (typeof montarOriginal === "function") {
        window.montarInteraccionPostNivan = function () {
            const res = montarOriginal.apply(this, arguments);
            try { if (postInteraccionActualNivan && postInteraccionActualNivan.idPost) cargarComentarios(postInteraccionActualNivan.idPost); } catch (e) {}
            return res;
        };
    }

    function reintentarComentarios() {
        const pend = leerMapa(CLAVE_COM_PEND);
        Object.keys(pend).forEach(function (id) {
            const p = pend[id];
            if (Date.now() - (p.comentario.fecha || 0) > 7 * 24 * 3600 * 1000) { delete pend[id]; guardarMapa(CLAVE_COM_PEND, pend); return; }
            encolar(function () { return enviarComentario(p.idPost, p.comentario); });
        });
    }

    // =====================================================
    // PREGUNTAS AL VENDEDOR
    // =====================================================
    const leerPregOriginal = window.obtenerPreguntasProducto;
    const guardarPregOriginal = window.guardarPreguntasProducto;
    const abrirComprador = window.abrirPreguntaVendedor;
    const abrirVendedor = window.abrirPreguntasComoVendedor;
    let modoVendedorAbierto = false;
    let bajandoPreguntas = false;

    function productoDe(id) {
        return (typeof productos !== "undefined" && productos.find(function (p) { return String(p.id) === String(id); })) || null;
    }
    // Una publicación de venta (tiene vendedor) vive en el servidor; las del catálogo base no.
    function esDeServidor(id) {
        const p = productoDe(id);
        if (p && p.vendedorId) return true;
        try {
            const miId = yo();
            return !!miId && obtenerPublicacionesNivan().some(function (x) { return String(x.id) === String(id) && x.vendedorId === miId; });
        } catch (e) { return false; }
    }
    function preguntaAFormatoApp(q) {
        return { id: q.id, usuarioId: q.usuarioId, usuarioNombre: q.usuarioNombre || "Comprador", texto: q.texto, respuesta: q.respuesta || null, fecha: q.fecha };
    }

    window.guardarPreguntasProducto = function (idProducto, lista) {
        const miId = yo();
        if (!miId || !esDeServidor(idProducto)) return guardarPregOriginal(idProducto, lista);

        const previa = leerPregOriginal(idProducto);
        const antes = {};
        previa.forEach(function (q) { if (q.id) antes[q.id] = q; });
        lista.forEach(function (q) {                                   // las preguntas nuevas todavía no tienen número del servidor
            if (!q.id) { q.id = "PGL-" + Date.now() + "-" + Math.floor(Math.random() * 100000); q.fecha = Date.now(); }
        });
        const res = guardarPregOriginal(idProducto, lista);

        lista.forEach(function (q) {
            if (String(q.id).indexOf("PGL-") === 0 && !antes[q.id]) {
                const pend = leerMapa(CLAVE_PREG_PEND); pend[q.id] = { idProducto: idProducto, texto: q.texto }; guardarMapa(CLAVE_PREG_PEND, pend);
                encolar(function () { return enviarPregunta(q.id, idProducto, q.texto); });
            } else if (antes[q.id] && q.respuesta && !antes[q.id].respuesta) {
                encolar(async function () {
                    const r = await apiNivan("/api/preguntas/responder", { id: q.id, respuesta: q.respuesta });
                    if (!r.ok) falloDelServidor(r);
                    await bajarPreguntas();
                });
            }
        });
        return res;
    };

    async function enviarPregunta(idLocal, idProducto, texto) {
        const r = await apiNivan("/api/preguntas/crear", { publicacionId: String(idProducto), texto: texto });
        const pend = leerMapa(CLAVE_PREG_PEND);
        if (r.ok) { delete pend[idLocal]; guardarMapa(CLAVE_PREG_PEND, pend); }
        else if (sinConexion(r)) { avisarSinRed(); return; }       // queda pendiente y se reintenta solo
        else { delete pend[idLocal]; guardarMapa(CLAVE_PREG_PEND, pend); alert(r.error || "No se pudo enviar la pregunta."); }
        await bajarPreguntas();
    }

    function reintentarPreguntas() {
        const pend = leerMapa(CLAVE_PREG_PEND);
        Object.keys(pend).forEach(function (idLocal) {
            const p = pend[idLocal];
            encolar(function () { return enviarPregunta(idLocal, p.idProducto, p.texto); });
        });
    }

    function notificarPregunta(idDestino, datos) { try { crearNotificacion(idDestino, datos); } catch (e) {} }

    async function bajarPreguntas() {
        if (bajandoPreguntas) return;
        bajandoPreguntas = true;
        try {
            const r = await apiNivan("/api/preguntas?pais=" + encodeURIComponent(paisActual()));
            if (!r.ok || !Array.isArray(r.preguntas)) return;
            const miId = yo();
            const local = leerMapa(CLAVE_PREG);
            const servidor = {};
            r.preguntas.forEach(function (q) {
                const k = String(q.publicacionId);
                (servidor[k] = servidor[k] || []).push(preguntaAFormatoApp(q));
            });
            const nuevo = {};
            Object.keys(local).forEach(function (k) { if (!esDeServidor(k) && !(k in servidor)) nuevo[k] = local[k]; });     // lo del catálogo base se queda como está
            Object.keys(servidor).forEach(function (k) { nuevo[k] = servidor[k]; });
            // Mis preguntas que todavía no llegaron al servidor se siguen viendo.
            const pend = leerMapa(CLAVE_PREG_PEND);
            Object.keys(pend).forEach(function (idLocal) {
                const p = pend[idLocal], k = String(p.idProducto);
                if (!miId) return;
                (nuevo[k] = nuevo[k] || []).push({ id: idLocal, usuarioId: miId, usuarioNombre: usuarioActual.nombre, texto: p.texto, respuesta: null, fecha: Date.now() });
            });

            // Avisos (la primera vez que se baja todo no se avisa de lo viejo).
            const inicio = leerMapa(CLAVE_PREG_INICIO);
            if (miId && inicio[miId]) {
                Object.keys(nuevo).forEach(function (k) {
                    const antes = {};
                    (local[k] || []).forEach(function (q) { if (q.id) antes[q.id] = q; });
                    const prod = productoDe(k);
                    nuevo[k].forEach(function (q) {
                        if (String(q.id).indexOf("PGL-") === 0) return;
                        if (!antes[q.id] && q.usuarioId !== miId && prod && prod.vendedorId === miId) {
                            notificarPregunta(miId, { tipo: "pregunta", icono: "❓", titulo: "Nueva pregunta", texto: escaparHTMLNivan(q.usuarioNombre) + ' preguntó algo sobre "' + escaparHTMLNivan(prod.nombre) + '"', productoId: prod.id });
                        }
                        if (antes[q.id] && !antes[q.id].respuesta && q.respuesta && q.usuarioId === miId) {
                            notificarPregunta(miId, { tipo: "respuesta", icono: "💬", titulo: "Te respondieron", texto: 'El vendedor respondió tu pregunta sobre "' + escaparHTMLNivan(prod ? prod.nombre : "tu producto") + '"', productoId: prod ? prod.id : k });
                        }
                    });
                });
            }
            if (miId) { inicio[miId] = 1; guardarMapa(CLAVE_PREG_INICIO, inicio); }

            if (JSON.stringify(nuevo) !== JSON.stringify(local)) {
                guardarMapa(CLAVE_PREG, nuevo);
                refrescarPreguntasEnPantalla();
            }
        } finally { bajandoPreguntas = false; }
    }
    window.sincronizarPreguntasNivan = bajarPreguntas;

    function refrescarPreguntasEnPantalla() {
        try {
            if (typeof idProductoPreguntaActual !== "undefined" && idProductoPreguntaActual !== null) {
                const lista = document.getElementById("listaPreguntasVendedor");
                if (lista) lista.innerHTML = renderizarPreguntasVendedor(idProductoPreguntaActual, modoVendedorAbierto);
            }
        } catch (e) {}
        try { if (typeof renderizarMisPublicaciones === "function" && document.getElementById("listaMisPublicaciones")) renderizarMisPublicaciones(); } catch (e) {}
    }

    if (typeof abrirComprador === "function") {
        window.abrirPreguntaVendedor = function () { modoVendedorAbierto = false; const r = abrirComprador.apply(this, arguments); bajarPreguntas(); return r; };
    }
    if (typeof abrirVendedor === "function") {
        window.abrirPreguntasComoVendedor = function () { modoVendedorAbierto = true; const r = abrirVendedor.apply(this, arguments); bajarPreguntas(); return r; };
    }

    // =====================================================
    // Cuándo se sincroniza
    // =====================================================
    function todo() {
        reintentarComentarios();
        reintentarPreguntas();
        bajarPreguntas();
    }
    window.addEventListener("load", function () { setTimeout(todo, 1200); });
    window.addEventListener("online", todo);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") todo(); });

    // Mientras hay un post o un panel de preguntas abierto se mira más seguido; si no, cada minuto.
    function ciclo() {
        let abierto = false;
        if (document.visibilityState === "visible") {
            try {
                if (typeof postInteraccionActualNivan !== "undefined" && postInteraccionActualNivan && postInteraccionActualNivan.idPost) { abierto = true; cargarComentarios(postInteraccionActualNivan.idPost); }
                if (typeof idProductoPreguntaActual !== "undefined" && idProductoPreguntaActual !== null) { abierto = true; }
            } catch (e) {}
            bajarPreguntasSiToca(abierto);
        }
        setTimeout(ciclo, abierto ? 6000 : 20000);
    }
    let ultimaBajada = 0;
    function bajarPreguntasSiToca(abierto) {
        const ahora = Date.now();
        if (ahora - ultimaBajada < (abierto ? 6000 : 60000)) return;
        ultimaBajada = ahora;
        bajarPreguntas();
    }
    window.addEventListener("load", function () { setTimeout(ciclo, 3000); });

    const inicioOriginal = window.completarInicioSesionNivan;
    if (typeof inicioOriginal === "function") {
        window.completarInicioSesionNivan = function () {
            const res = inicioOriginal.apply(this, arguments);
            setTimeout(todo, 500);
            return res;
        };
    }
})();
