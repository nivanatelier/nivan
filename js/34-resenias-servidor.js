// ==============================
// NIVAN · Reseñas compartidas (las guarda y controla el servidor)
// ==============================
// Las reseñas de las publicaciones de venta las ve cualquier persona, de cualquier celular.
// El servidor revisa que quien reseña haya comprado y recibido la prenda, el plazo de 30 días y el cupo
// (1 puntuación con estrellas + hasta 2 comentarios). Acá se guarda solo una copia de lo que dice el servidor
// ("nivanReseniasServidor") y las funciones de siempre pasan a leerla.
// Los productos del catálogo base (sin vendedor) siguen como antes, solo en el celular.
(function () {
    "use strict";

    const CLAVE = "nivanReseniasServidor";   // { idPublicacion: [ reseña en el formato de la app ] }
    let bajando = false;

    function paisActual() { return (typeof paisNivan === "function" && paisNivan()) || "AR"; }
    function leer() { return leerJSONNivan(CLAVE, {}); }
    function guardar(o) { try { localStorage.setItem(CLAVE, JSON.stringify(o)); } catch (e) {} }
    function estrellasATexto(n) { return n > 0 ? "★".repeat(n) + "☆".repeat(5 - n) : ""; }
    function aFormatoApp(r) {
        return { id: r.id, usuarioId: r.usuarioId, usuario: r.usuario || "Cliente", texto: r.texto, estrellas: estrellasATexto(r.estrellas), fecha: r.fecha };
    }
    function productoDe(id) {
        return (typeof productos !== "undefined" && productos.find(function (p) { return String(p.id) === String(id); })) || null;
    }
    // Una publicación de venta (tiene vendedor) vive en el servidor; las del catálogo base no.
    function esDeServidor(id) { const p = productoDe(id); return !!(p && p.vendedorId); }

    // ---- Bajar las reseñas de todos ----
    async function bajar() {
        if (bajando) return;
        bajando = true;
        try {
            const r = await apiNivan("/api/resenias?pais=" + encodeURIComponent(paisActual()));
            if (!r.ok || !Array.isArray(r.resenias)) return;
            const mapa = {};
            r.resenias.forEach(function (x) {
                const k = String(x.publicacionId);
                (mapa[k] = mapa[k] || []).push(aFormatoApp(x));
            });
            if (JSON.stringify(mapa) !== JSON.stringify(leer())) guardar(mapa);
        } finally {
            bajando = false;
        }
    }
    window.sincronizarReseniasNivan = bajar;

    // ---- Leer ----
    const leerOriginal = window.obtenerReseniasGuardadas;
    window.obtenerReseniasGuardadas = function (idProducto) {
        if (esDeServidor(idProducto)) return leer()[String(idProducto)] || [];
        return leerOriginal(idProducto);
    };

    // ---- Enviar una reseña ----
    const enviarOriginal = window.enviarResenia;
    window.enviarResenia = async function (idProducto) {
        if (!esDeServidor(idProducto)) return enviarOriginal(idProducto);

        if (!usuarioActual) {
            alert("Iniciá sesión para dejar una reseña.");
            abrirCuenta();
            return;
        }
        if (!exigirPuedeReclamarNivan()) return;

        // Chequeo rápido acá (el servidor vuelve a revisar todo).
        const est = obtenerEstadoReseniaNivan(idProducto);
        if (!est.puedeComentar) {
            alert("No podés comentar esta publicación.");
            abrirProducto(idProducto);
            return;
        }
        if (!est.yaPuntuo && estrellaSeleccionada === 0) {
            alert("Elegí una cantidad de estrellas antes de enviar.");
            return;
        }
        const texto = limpiarTextoNivan(document.getElementById("textoResenia").value, MAX_CARACTERES_RESENIA_NIVAN).trim();
        if (!texto) {
            alert("Escribí tu opinión antes de enviarla.");
            return;
        }

        const r = await apiNivan("/api/resenias/crear", {
            publicacionId: String(idProducto),
            texto: texto,
            estrellas: est.yaPuntuo ? 0 : estrellaSeleccionada
        });
        if (!r.ok) {
            alert(r.error || "No se pudo enviar la reseña. Probá de nuevo.");
            return;
        }

        const cache = leer();
        const k = String(idProducto);
        cache[k] = (cache[k] || []).filter(function (x) { return x.id !== r.resenia.id; });
        cache[k].push(aFormatoApp(r.resenia));
        guardar(cache);
        registrarUsoReseniaNivan(idProducto, r.resenia.estrellas > 0);

        const producto = productoDe(idProducto);
        if (producto && producto.vendedorId && producto.vendedorId !== usuarioActual.id) {
            crearNotificacion(producto.vendedorId, {
                tipo: "resenia",
                icono: "⭐",
                titulo: "Nueva reseña",
                texto: `${escaparHTMLNivan(usuarioActual.nombre)} dejó ${estrellasATexto(r.resenia.estrellas) || "un comentario"} en "${escaparHTMLNivan(producto.nombre)}"`,
                productoId: idProducto
            });
        }

        abrirProducto(idProducto);
        const despues = obtenerEstadoReseniaNivan(idProducto);
        if (!despues.puedeComentar) alert("Llegaste al límite de comentarios.");
    };

    // ---- Mis comentarios (perfil) ----
    const misOriginal = window.obtenerMisComentariosPerfilLateral;
    window.obtenerMisComentariosPerfilLateral = function () {
        const locales = misOriginal().filter(function (c) { return !esDeServidor(c.idProducto); });
        if (!usuarioActual) return locales;
        const cache = leer(), propios = [];
        Object.keys(cache).forEach(function (idProducto) {
            cache[idProducto].forEach(function (r) {
                if (r.usuarioId !== usuarioActual.id) return;
                const p = productoDe(idProducto);
                propios.push({
                    idProducto: "srv:" + r.id,   // marca: este comentario está en el servidor
                    indice: -1,
                    texto: escaparHTMLNivan(r.texto),
                    estrellas: r.estrellas || "",
                    producto: p ? escaparHTMLNivan(p.nombre) : "una publicación"
                });
            });
        });
        return locales.concat(propios);
    };

    const eliminarOriginal = window.eliminarComentarioPerfilLateral;
    window.eliminarComentarioPerfilLateral = function (idProducto, indice) {
        if (String(idProducto).indexOf("srv:") !== 0) return eliminarOriginal(idProducto, indice);
        const id = String(idProducto).slice(4);
        mostrarConfirmacionNivan("¿Querés borrar este comentario?", async function () {
            const r = await apiNivan("/api/resenias/eliminar", { id: id });
            if (!r.ok) {
                alert(r.error || "No se pudo borrar el comentario. Probá de nuevo.");
                return;
            }
            const cache = leer();
            Object.keys(cache).forEach(function (k) {
                cache[k] = cache[k].filter(function (x) { return x.id !== id; });
                if (!cache[k].length) delete cache[k];
            });
            guardar(cache);
            renderizarPerfilLateral();
            renderizarActividad();
        });
    };

    // ---- Cuándo bajar ----
    window.addEventListener("load", function () { setTimeout(bajar, 1000); });
    window.addEventListener("online", bajar);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") bajar(); });
    setInterval(function () { if (document.visibilityState === "visible") bajar(); }, 60000);

    // Al iniciar sesión también (por si cambió de país o de cuenta).
    const inicioOriginal = window.completarInicioSesionNivan;
    if (typeof inicioOriginal === "function") {
        window.completarInicioSesionNivan = function () {
            const res = inicioOriginal.apply(this, arguments);
            setTimeout(bajar, 600);
            return res;
        };
    }
})();
