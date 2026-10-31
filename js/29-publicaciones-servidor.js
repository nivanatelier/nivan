// ==============================
// NIVAN · Publicaciones compartidas (se guardan en el servidor)
// ==============================
// El resto de la app sigue leyendo y escribiendo "nivanPublicaciones" como siempre.
// Acá se hacen dos cosas:
//   1. Cada vez que alguien guarda publicaciones, sus cambios se mandan al servidor.
//   2. Al abrir la app (y cada tanto) se bajan las publicaciones de venta del país elegido (Uruguay o Argentina).
//      Las de otro país no se muestran, para que nadie se enamore de una prenda que no puede comprar.
//      Los perfiles y sus posts son de todos y viajan aparte (30-perfiles-servidor.js).
(function () {
    "use strict";

    const CLAVE_LISTA = "nivanPublicaciones";
    const CLAVE_ENVIADAS = "nivanPubEnviadas";   // { idPublicacion: huella } de lo que ya está en el servidor
    const guardarOriginal = window.guardarPublicacionesNivan;
    let cola = Promise.resolve();
    let bajando = false;

    function huella(obj) {
        const s = JSON.stringify(obj);
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
        return s.length + ":" + h;
    }
    function leerEnviadas() { return leerJSONNivan(CLAVE_ENVIADAS, {}); }
    function guardarEnviadas(o) { try { localStorage.setItem(CLAVE_ENVIADAS, JSON.stringify(o)); } catch (e) {} }
    function paisActual() { return (typeof paisNivan === "function" && paisNivan()) || "AR"; }
    function hayCuenta() { return typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id; }

    // ---- Subir mis cambios ----
    function empujar(lista) {
        if (!hayCuenta()) return;
        const miId = usuarioActual.id;
        const mias = lista.filter(function (p) { return p && p.vendedorId === miId; });
        const enviadas = leerEnviadas();
        const idsMios = {};

        mias.forEach(function (p) {
            const clave = String(p.id);
            idsMios[clave] = true;
            if (enviadas[clave] === huella(p)) return;
            cola = cola.then(function () { return subirUna(p); });
        });
        Object.keys(enviadas).forEach(function (clave) {
            if (idsMios[clave]) return;
            cola = cola.then(function () { return borrarUna(clave); });
        });
    }

    async function subirUna(pub) {
        const r = await apiNivan("/api/publicaciones/guardar", { publicacion: pub });
        if (!r.ok) {
            if (r.estado && r.estado !== 401 && r.estado !== 0 && typeof mostrarToastNivan === "function") {
                mostrarToastNivan(r.error || "No se pudo publicar.", 4000);
            }
            return;                                   // se reintenta en el próximo guardado o al abrir la app
        }
        // El servidor devuelve la publicación con las fotos como direcciones cortas: la usamos en vez de las pesadas.
        const lista = leerJSONNivan(CLAVE_LISTA, []);
        const i = lista.findIndex(function (p) { return String(p.id) === String(pub.id); });
        if (i >= 0) {
            lista[i] = Object.assign({}, lista[i], r.publicacion);
            guardarOriginal(lista);
            const enviadas = leerEnviadas();
            enviadas[String(pub.id)] = huella(lista[i]);
            guardarEnviadas(enviadas);
        }
    }

    async function borrarUna(clave) {
        const r = await apiNivan("/api/publicaciones/eliminar", { id: clave });
        if (!r.ok) return;
        const enviadas = leerEnviadas();
        delete enviadas[clave];
        guardarEnviadas(enviadas);
    }

    window.guardarPublicacionesNivan = function (lista) {
        guardarOriginal(lista);
        try { empujar(lista); } catch (e) {}
    };

    // ---- Bajar las publicaciones de todos ----
    async function bajar() {
        if (bajando) return;
        bajando = true;
        try {
            await cola;                                   // primero termina de subir lo mío
            const r = await apiNivan("/api/publicaciones?pais=" + encodeURIComponent(paisActual()));
            if (!r.ok || !Array.isArray(r.publicaciones)) return;

            const local = leerJSONNivan(CLAVE_LISTA, []);
            const enviadas = leerEnviadas();
            const miId = hayCuenta() ? usuarioActual.id : null;
            const delServidor = {};
            r.publicaciones.forEach(function (p) { delServidor[String(p.id)] = true; });

            // Lo mío que todavía no llegó al servidor se conserva y se sube.
            const pendientes = local.filter(function (p) {
                return miId && p.vendedorId === miId && !delServidor[String(p.id)] && !enviadas[String(p.id)];
            });
            // Lo que ya está en el servidor queda marcado como enviado.
            const nuevasEnviadas = {};
            r.publicaciones.forEach(function (p) { if (miId && p.vendedorId === miId) nuevasEnviadas[String(p.id)] = huella(p); });
            guardarEnviadas(nuevasEnviadas);

            // Solo quedan las del país elegido. Las mías de otro país siguen en el servidor y vuelven al cambiar de país.
            const nueva = r.publicaciones.concat(pendientes).filter(function (p) { return (p.pais || "AR") === paisActual(); });

            if (huella(nueva) !== huella(local)) {
                guardarOriginal(nueva);
                try { sincronizarCatalogoConPublicaciones(); } catch (e) {}
            }
            if (pendientes.length) empujar(nueva);
        } finally {
            bajando = false;
        }
    }

    // Al cambiar de país se sacan de este celular las publicaciones del otro país SIN borrarlas del servidor.
    window.prepararCambioPaisNivan = function (pais) {
        try {
            const lista = leerJSONNivan(CLAVE_LISTA, []).filter(function (p) { return (p.pais || "AR") === pais; });
            localStorage.setItem(CLAVE_LISTA, JSON.stringify(lista));
            const enviadas = leerEnviadas(), ids = {};
            lista.forEach(function (p) { ids[String(p.id)] = true; });
            Object.keys(enviadas).forEach(function (k) { if (!ids[k]) delete enviadas[k]; });   // si no, se tomarían como borradas
            guardarEnviadas(enviadas);
        } catch (e) {}
    };

    window.actualizarPublicacionesNivan = bajar;
    window.addEventListener("load", function () { setTimeout(bajar, 600); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) bajar(); });
    setInterval(function () { if (!document.hidden) bajar(); }, 60000);
})();
