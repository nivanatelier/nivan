// ==============================
// NIVAN · Avisos (notificaciones) entre personas, a través del servidor
// ==============================
// Antes, un aviso para otra persona ("te dieron like", "nuevo pedido", "empezó a seguirte", "te respondieron"...)
// se guardaba solo en el celular de quien lo generaba, así que a la otra persona nunca le llegaba.
// Ahora:
//   1. Cuando tu cuenta le genera un aviso a OTRA persona, se manda al servidor (se guarda igual en este celular, como siempre).
//   2. Tu app baja los avisos que te mandaron, desde cualquier celular, y los suma a tu lista de notificaciones.
// Los avisos para vos mismo (recomendaciones, bajó el precio...) siguen locales. Los de chat y preguntas al vendedor
// ya se generan solos al bajar los chats y las preguntas (archivos 33 y 36), así que no pasan por acá.
(function () {
    "use strict";

    const TIPOS_ENVIO = ["reclamo", "pedidoEstado", "ventaEstado", "calificacion", "venta", "devolucion", "compra",
        "seguidor", "cupon", "cuponTienda", "nuevaPublicacion", "solicitudPerfil", "solicitudAceptada", "resenia", "postulacion",
        "likePost", "likeComentario", "comentarioPost", "respuestaComentario", "etiquetaPost"];
    const TIPOS_UNICOS = ["seguidor", "solicitudPerfil", "likePost", "likeComentario"];   // uno solo por persona y cosa
    const CLAVE_SALIDA = "nivanAvisosSalida";    // [ { para, id, datos } ] pendientes de mandar (por si no hay internet)
    const CLAVE_CURSOR = "nivanAvisosCursor";    // { idUsuario: marca del último aviso bajado }
    const MAX_COLA = 300;

    function yo() { return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || ""; }
    function leer(c, defecto) { const v = leerJSONNivan(c, defecto); return v && typeof v === "object" ? v : defecto; }
    function guardar(c, v) { try { localStorage.setItem(c, JSON.stringify(v)); } catch (e) {} }

    // Misma regla que usa el servidor para reemplazar avisos repetidos.
    function claveUnica(n) {
        if (TIPOS_UNICOS.indexOf(n.tipo) === -1) return "";
        const e = n.extra || {};
        return [n.tipo, n.usuarioId || "", n.cuenta || n.ambito || "", e.postId || "", e.comentarioId || "", e.quien || ""].join("|");
    }

    // ---- 1) Mandar ----
    let enviando = false, temporizador = null;

    function programarEnvio() {
        if (temporizador) return;
        temporizador = setTimeout(function () { temporizador = null; vaciarSalida(); }, 400);
    }

    async function vaciarSalida() {
        if (enviando || !yo()) return;
        enviando = true;
        try {
            let cola = leer(CLAVE_SALIDA, []);
            while (cola.length) {
                const tanda = cola.slice(0, 50);
                const r = await apiNivan("/api/notificaciones/enviar", { lista: tanda });
                // Sin internet, sesión vencida o demasiados pedidos seguidos: queda en la cola para más tarde.
                if (!r.ok && (r.estado === 0 || r.estado === 401 || r.estado === 429 || r.estado >= 500)) return;
                // Si el servidor dice que no por otra razón, esa tanda se descarta (no tiene arreglo reintentando).
                cola = leer(CLAVE_SALIDA, []).filter(function (x) { return !tanda.some(function (t) { return t.id === x.id; }); });
                guardar(CLAVE_SALIDA, cola);
            }
        } finally {
            enviando = false;
        }
    }

    const crearOriginal = window.crearNotificacion;
    window.crearNotificacion = function (idUsuario, datos) {
        crearOriginal.apply(this, arguments);
        try {
            const miId = yo();
            if (!miId || !idUsuario || idUsuario === miId || !datos || TIPOS_ENVIO.indexOf(datos.tipo) === -1) return;

            // La notificación recién creada para esa persona (con su id y sus campos extra).
            const lista = obtenerTodasLasNotificaciones()[idUsuario] || [];
            const n = lista[0];
            if (!n || n.tipo !== datos.tipo || !n.id) return;

            const cola = leer(CLAVE_SALIDA, []);
            cola.push({
                para: idUsuario,
                id: n.id,
                datos: {
                    tipo: n.tipo, icono: n.icono, titulo: n.titulo, texto: n.texto, productoId: n.productoId, pedidoId: n.pedidoId,
                    chatId: n.chatId, usuarioId: n.usuarioId, cuponCodigo: n.cuponCodigo, ambito: n.ambito, cuenta: n.cuenta,
                    pais: n.pais, fecha: n.fecha, extra: n.extra || null
                }
            });
            guardar(CLAVE_SALIDA, cola.slice(-MAX_COLA));
            programarEnvio();
        } catch (e) {}
    };

    // ---- 2) Bajar los que me mandaron ----
    let bajando = false;

    async function bajar() {
        const miId = yo();
        if (bajando || !miId) return;
        bajando = true;
        try {
            await vaciarSalida();
            const cursores = leer(CLAVE_CURSOR, {});
            const r = await apiNivan("/api/notificaciones?desde=" + encodeURIComponent(cursores[miId] || 0));
            if (!r.ok || !Array.isArray(r.notificaciones) || !r.notificaciones.length) return;
            if (yo() !== miId) return;   // cambió de cuenta mientras se bajaba

            const todas = obtenerTodasLasNotificaciones();
            let lista = todas[miId] || [];
            let marca = cursores[miId] || 0;
            let cambio = false;

            r.notificaciones.forEach(function (s) {
                if (s.recibida > marca) marca = s.recibida;
                if (lista.some(function (n) { return n.id === s.id; })) return;   // ya está (por ejemplo, se generó en este mismo celular)

                const nueva = {
                    id: s.id, tipo: s.tipo, icono: s.icono || "🔔", titulo: s.titulo, texto: s.texto || "",
                    productoId: s.productoId || null, pedidoId: s.pedidoId || null, chatId: s.chatId || null,
                    usuarioId: s.usuarioId || null, cuponCodigo: s.cuponCodigo || null, ambito: s.ambito || null,
                    cuenta: s.cuenta || null, pais: s.pais || (typeof paisNivan === "function" && paisNivan()) || "AR",
                    fecha: s.fecha || Date.now(), leida: false
                };
                if (s.extra) nueva.extra = s.extra;

                const clave = claveUnica(nueva);
                if (clave) lista = lista.filter(function (n) { return claveUnica(n) !== clave; });
                lista.push(nueva);
                cambio = true;
            });

            cursores[miId] = marca;
            guardar(CLAVE_CURSOR, cursores);
            if (!cambio) return;

            lista.sort(function (a, b) { return (b.fecha || 0) - (a.fecha || 0); });
            todas[miId] = lista.slice(0, 300);
            guardarTodasLasNotificaciones(todas);

            if (typeof actualizarBadgeNotificaciones === "function") actualizarBadgeNotificaciones();
            if (typeof renderizarNotificaciones === "function" && document.getElementById("listaNotificaciones")) renderizarNotificaciones();
        } finally {
            bajando = false;
        }
    }
    window.sincronizarAvisosNivan = bajar;

    // ---- Cuándo bajar ----
    window.addEventListener("load", function () { setTimeout(bajar, 1500); });
    window.addEventListener("online", bajar);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") bajar(); });
    setInterval(function () { if (document.visibilityState === "visible") bajar(); }, 30000);

    const inicioOriginal = window.completarInicioSesionNivan;
    if (typeof inicioOriginal === "function") {
        window.completarInicioSesionNivan = function () {
            const res = inicioOriginal.apply(this, arguments);
            setTimeout(bajar, 800);
            return res;
        };
    }
})();
