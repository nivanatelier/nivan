// ==============================
// NIVAN · Pedidos compartidos (los guarda y controla el servidor)
// ==============================
// El servidor es el único que CREA pedidos (al comprar: /api/pedidos/crear) y el que decide qué cambios
// le tocan a cada parte. El resto de la app sigue leyendo y escribiendo "nivanPedidos", que ahora es
// solo una copia de lo que dice el servidor:
//   1. Cada cambio que hace comprador o vendedor (aceptar, enviar, reclamar, calificar...) se manda al servidor.
//      Si el servidor lo rechaza, se vuelve a lo que él tiene.
//   2. Al abrir la app (y cada tanto) se bajan los pedidos de la cuenta. Un pedido inventado en este
//      celular no existe para el servidor: se borra solo.
(function () {
    "use strict";

    const CLAVE_LISTA = "nivanPedidos";
    const CLAVE_ENVIADOS = "nivanPedEnviados";     // { idPedido: huella } de lo que ya está en el servidor
    const guardarOriginal = window.guardarPedidosNivan;
    let cola = Promise.resolve();
    let bajando = false;
    let ultimoUsuario;                             // undefined = todavía no se miró
    const descartados = {};                        // pedidos cuyo cambio rechazó el servidor: se vuelve a su versión

    function huella(obj) {
        const s = JSON.stringify(obj);
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
        return s.length + ":" + h;
    }
    function leerEnviados() { return leerJSONNivan(CLAVE_ENVIADOS, {}); }
    function guardarEnviados(o) { try { localStorage.setItem(CLAVE_ENVIADOS, JSON.stringify(o)); } catch (e) {} }
    function hayCuenta() { return typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id; }
    function esMio(p, id) { return p && (p.compradorId === id || p.vendedorId === id); }

    // ---- Subir mis cambios ----
    function empujar(lista) {
        if (!hayCuenta()) return;
        const miId = usuarioActual.id;
        const enviados = leerEnviados();
        lista.forEach(function (p) {
            if (!esMio(p, miId)) return;
            const clave = String(p.id);
            if (!enviados[clave] || enviados[clave] === huella(p)) return;   // nunca llegó del servidor (no se puede crear desde acá) o no cambió
            cola = cola.then(function () { return subirUno(p); });
        });
    }

    async function subirUno(p) {
        const r = await apiNivan("/api/pedidos/actualizar", { pedido: p });
        const clave = String(p.id);
        if (r.ok) {
            const lista = leerJSONNivan(CLAVE_LISTA, []);
            const i = lista.findIndex(function (x) { return String(x.id) === clave; });
            if (i >= 0) { lista[i] = r.pedido; guardarOriginal(lista); }
            const enviados = leerEnviados();
            enviados[clave] = huella(r.pedido);
            guardarEnviados(enviados);
            return;
        }
        if (r.estado === 0 || r.estado === 401 || r.estado === 429) return;    // sin conexión o sin sesión: queda pendiente
        descartados[clave] = true;                                              // el servidor no lo permite: se vuelve a su versión
        if (typeof mostrarToastNivan === "function") mostrarToastNivan(r.error || "No se pudo guardar el cambio del pedido.", 4000);
        bajar();
    }

    window.guardarPedidosNivan = function (lista) {
        guardarOriginal(lista);
        try { empujar(lista); } catch (e) {}
    };

    // El servidor acaba de crear estos pedidos (al comprar): se guardan en la copia y se marcan como ya enviados.
    window.incorporarPedidosServidorNivan = function (nuevos) {
        const enviados = leerEnviados();
        const ids = {};
        nuevos.forEach(function (p) { ids[String(p.id)] = true; enviados[String(p.id)] = huella(p); });
        guardarEnviados(enviados);
        const resto = leerJSONNivan(CLAVE_LISTA, []).filter(function (p) { return !ids[String(p.id)]; });
        guardarOriginal(nuevos.concat(resto));
    };

    // ---- Bajar mis pedidos ----
    async function bajar() {
        if (bajando || !hayCuenta()) return;
        bajando = true;
        try {
            await cola;                                // primero termina de subir lo mío
            const miId = usuarioActual.id;
            const r = await apiNivan("/api/pedidos");
            if (!r.ok || !Array.isArray(r.pedidos) || !hayCuenta() || usuarioActual.id !== miId) return;

            const local = leerJSONNivan(CLAVE_LISTA, []);
            const enviados = leerEnviados();
            const localPorId = {};
            local.forEach(function (p) { localPorId[String(p.id)] = p; });

            const nuevosEnviados = {};
            const nueva = r.pedidos.map(function (p) {
                const clave = String(p.id), l = localPorId[clave];
                // Un cambio mío que todavía no pudo subirse (sin conexión) se conserva, salvo que el servidor lo haya rechazado.
                if (l && !descartados[clave] && enviados[clave] && enviados[clave] !== huella(l) && esMio(l, miId)) return l;
                nuevosEnviados[clave] = huella(p);
                return p;
            });
            Object.keys(descartados).forEach(function (k) { delete descartados[k]; });
            r.pedidos.forEach(function (p) { if (!nuevosEnviados[String(p.id)]) nuevosEnviados[String(p.id)] = enviados[String(p.id)] || huella(p); });
            guardarEnviados(nuevosEnviados);

            if (huella(nueva) !== huella(local)) {
                guardarOriginal(nueva);
                try { document.dispatchEvent(new Event("pedidosActualizadosNivan")); } catch (e) {}
                try { if (typeof refrescarTrasGestionNivan === "function") refrescarTrasGestionNivan(); } catch (e) {}
            }
        } finally {
            bajando = false;
        }
    }

    // Al cambiar de cuenta (iniciar o cerrar sesión) la copia local se limpia y se vuelve a bajar.
    function vigilarCuenta() {
        const actual = hayCuenta() ? usuarioActual.id : null;
        if (ultimoUsuario === undefined) { ultimoUsuario = actual; return; }
        if (actual === ultimoUsuario) return;
        ultimoUsuario = actual;
        guardarOriginal([]);
        guardarEnviados({});
        if (actual) bajar();
    }

    window.actualizarPedidosNivan = bajar;
    window.addEventListener("load", function () { setTimeout(function () { vigilarCuenta(); bajar(); }, 800); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) bajar(); });
    setInterval(function () { vigilarCuenta(); if (!document.hidden) bajar(); }, 20000);
    setInterval(vigilarCuenta, 2000);
})();
