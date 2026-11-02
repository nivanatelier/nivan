// ==============================
// NIVAN · Solicitudes para ver un perfil privado (las guarda y controla el servidor)
// ==============================
// Antes una solicitud solo existía en el celular de quien la mandaba, así que a la otra persona nunca le llegaba.
// Ahora:
//   - Pedir ver un perfil, cancelar el pedido, aceptar o rechazar se hace en pantalla al instante (como siempre)
//     y además se manda al servidor. Si no hay internet, queda pendiente y se manda cuando vuelva.
//   - Aceptar una solicitud hace que esa cuenta te siga; el servidor recién ahí le entrega tus posts.
//   - "nivanSolicitudesPerfil" pasa a ser una copia de lo que dice el servidor (solo lo tuyo: lo que pediste y lo que te pidieron).
// El aviso para la otra persona ("quiere ver tu perfil", "aceptaron tu solicitud") lo manda el archivo de avisos (37).
(function () {
    "use strict";

    const CLAVE = "nivanSolicitudesPerfil";            // { pendientes: { "idDuenio|ambito": [cuenta] }, aceptadas: {} }
    const CLAVE_COLA = "nivanSolicitudesCola";         // operaciones hechas acá que todavía no llegaron al servidor
    const enviarOriginal = window.enviarSolicitudPerfilNivan;
    const cancelarOriginal = window.cancelarSolicitudPerfilNivan;
    const responderOriginal = window.responderSolicitudPerfilNivan;
    if (typeof enviarOriginal !== "function" || typeof cancelarOriginal !== "function" || typeof responderOriginal !== "function") return;

    function yo() { return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || ""; }
    function leerCola() { const c = leerJSONNivan(CLAVE_COLA, []); return Array.isArray(c) ? c : []; }
    function guardarCola(c) { try { localStorage.setItem(CLAVE_COLA, JSON.stringify(c)); } catch (e) {} }
    function sinConexion(r) { return r.estado === 0 || r.estado === 401 || r.estado === 429 || r.estado >= 500; }
    function pendiente(cuenta, idDuenio, ambito) {
        try { return !!solicitudPerfilPendienteNivan(cuenta, idDuenio, ambito); } catch (e) { return false; }
    }

    // ---- Cola de operaciones (salen en orden) ----
    let procesando = false, repetir = false;
    function encolar(op) {
        const cola = leerCola(); cola.push(op); guardarCola(cola);
        procesar();
    }
    async function procesar() {
        if (procesando) { repetir = true; return; }
        procesando = true;
        try {
            do {
                repetir = false;
                if (!yo()) break;
                let cola = leerCola();
                while (cola.length) {
                    const op = cola[0];
                    const r = await apiNivan("/api/solicitudes/" + op.tipo, op.datos);
                    if (sinConexion(r)) return;                                         // se reintenta cuando haya internet
                    cola = leerCola(); cola.shift(); guardarCola(cola);
                    if (!r.ok && r.estado !== 404) alert(r.error || "No se pudo completar la solicitud.");
                    if (r.ok && op.tipo === "responder" && op.datos.aceptar && typeof window.actualizarSeguidoresYLikesNivan === "function") {
                        try { await window.actualizarSeguidoresYLikesNivan(); } catch (e) {}    // ya la sigue: se baja ese cambio
                    }
                    if (r.ok && op.tipo === "responder" && typeof window.actualizarPerfilesNivan === "function") { try { window.actualizarPerfilesNivan(); } catch (e) {} }
                    cola = leerCola();
                }
            } while (repetir);
        } finally { procesando = false; }
        bajar();
    }

    // ---- Las tres acciones de siempre, ahora también hacia el servidor ----
    window.enviarSolicitudPerfilNivan = function (idDuenio, ambito) {
        const res = enviarOriginal.apply(this, arguments);
        if (!yo()) return res;
        const amb = typeof ambitoSolicitudNivan === "function" ? ambitoSolicitudNivan(ambito) : ambito;
        const cuenta = claveCuentaActivaNivan();
        if (pendiente(cuenta, idDuenio, amb)) encolar({ tipo: "enviar", datos: { duenioId: idDuenio, ambito: amb, cuenta: cuenta } });
        return res;
    };

    window.cancelarSolicitudPerfilNivan = function (idDuenio, ambito) {
        const amb = typeof ambitoSolicitudNivan === "function" ? ambitoSolicitudNivan(ambito) : ambito;
        const cuenta = yo() ? claveCuentaActivaNivan() : "";
        const estaba = !!cuenta && pendiente(cuenta, idDuenio, amb);
        const res = cancelarOriginal.apply(this, arguments);
        if (yo() && estaba && !pendiente(cuenta, idDuenio, amb)) encolar({ tipo: "cancelar", datos: { duenioId: idDuenio, ambito: amb, cuenta: cuenta } });
        return res;
    };

    window.responderSolicitudPerfilNivan = function (idSolicitante, ambito, aceptar) {
        const amb = typeof ambitoSolicitudNivan === "function" ? ambitoSolicitudNivan(ambito) : ambito;
        const estaba = !!yo() && pendiente(idSolicitante, yo(), amb);
        const res = responderOriginal.apply(this, arguments);
        if (yo() && estaba) encolar({ tipo: "responder", datos: { cuenta: idSolicitante, ambito: amb, aceptar: !!aceptar } });
        return res;
    };

    // ---- Bajar lo que dice el servidor ----
    let bajando = false;
    async function bajar() {
        const miId = yo();
        if (!miId || bajando) return;
        bajando = true;
        try {
            const r = await apiNivan("/api/solicitudes");
            if (!r.ok || !Array.isArray(r.recibidas) || !Array.isArray(r.enviadas)) return;
            const pendientes = {};
            function sumar(clave, cuenta) { (pendientes[clave] = pendientes[clave] || []); if (pendientes[clave].indexOf(cuenta) === -1) pendientes[clave].push(cuenta); }
            r.recibidas.forEach(function (x) { sumar(miId + "|" + x.ambito, x.cuenta); });
            r.enviadas.forEach(function (x) { sumar(x.duenioId + "|" + x.ambito, x.cuenta); });

            // Lo que hice y todavía no llegó se sigue viendo así (pedidos que aparecen, cancelados y respondidos que desaparecen).
            leerCola().forEach(function (op) {
                const d = op.datos;
                if (op.tipo === "enviar") sumar(d.duenioId + "|" + d.ambito, d.cuenta);
                else {
                    const clave = (op.tipo === "responder" ? miId : d.duenioId) + "|" + d.ambito;
                    if (pendientes[clave]) pendientes[clave] = pendientes[clave].filter(function (c) { return c !== d.cuenta; });
                }
            });

            const actual = leerJSONNivan(CLAVE, {});
            const nuevo = { pendientes: pendientes, aceptadas: (actual && actual.aceptadas) || {} };
            const igual = JSON.stringify(Object.keys(pendientes).sort().map(function (k) { return [k, pendientes[k].slice().sort()]; })) ===
                          JSON.stringify(Object.keys((actual && actual.pendientes) || {}).sort().filter(function (k) { return (actual.pendientes[k] || []).length; }).map(function (k) { return [k, actual.pendientes[k].slice().sort()]; }));
            if (!igual) {
                try { localStorage.setItem(CLAVE, JSON.stringify(nuevo)); } catch (e) {}
                try { if (typeof refrescarVistasSeguidoresNivan === "function") refrescarVistasSeguidoresNivan(); } catch (e) {}
            }
        } finally { bajando = false; }
    }

    // ---- Cuándo se sincroniza ----
    function todo() { procesar(); bajar(); }
    window.sincronizarSolicitudesNivan = todo;
    window.addEventListener("load", function () { setTimeout(todo, 1500); });
    window.addEventListener("online", todo);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") todo(); });
    setInterval(function () { if (document.visibilityState === "visible") bajar(); }, 45000);

    const inicioOriginal = window.completarInicioSesionNivan;
    if (typeof inicioOriginal === "function") {
        window.completarInicioSesionNivan = function () {
            const res = inicioOriginal.apply(this, arguments);
            setTimeout(todo, 600);
            return res;
        };
    }
})();
