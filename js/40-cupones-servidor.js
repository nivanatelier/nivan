// ==============================
// NIVAN · Cupones de descuento (los guarda y controla el servidor)
// ==============================
// Antes, los cupones de una tienda vivían solo en su celular: ninguna otra persona podía verlos ni usarlos, y
// el descuento lo decidía la app. Ahora:
//   - Lo que hace la tienda (crear, pausar, cambiar la audiencia, eliminar, enviarle un cupón a alguien) y lo que hace
//     quien compra (guardar o quitar un cupón de "Tus cupones") se manda al servidor. Sin internet queda en cola.
//   - "nivanCupones" y "nivanCuponesGuardados_<id>" pasan a ser una copia de lo que el servidor le muestra a esta persona,
//     así todo lo que ya las lee (perfil de la tienda, carrito, chat, notificaciones) sigue andando igual.
//   - Al comprar, el servidor calcula el descuento con las reglas reales del cupón y cuenta el uso.
// Un cupón "solo con el código" no se le muestra a nadie: la app lo busca en el servidor cuando alguien escribe el código.
(function () {
    "use strict";

    const CLAVE_CUPONES = "nivanCupones";
    const CLAVE_COLA = "nivanCuponesCola";
    const CLAVE_MIGRADOS = "nivanCuponesMigrados";     // { idUsuario: 1 } ya se subieron los cupones viejos de esta cuenta

    function yo() { return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || ""; }
    function leer(c, defecto) { const v = leerJSONNivan(c, defecto); return v && typeof v === "object" ? v : defecto; }
    function guardar(c, v) { try { localStorage.setItem(c, JSON.stringify(v)); } catch (e) {} }
    function sinConexion(r) { return r.estado === 0 || r.estado === 401 || r.estado === 429 || r.estado >= 500; }
    function avisar(texto) { if (typeof mostrarToastNivan === "function") mostrarToastNivan(texto, 4000); }
    function norm(codigo) { return normalizarCodigoCuponNivan(codigo); }
    function claveGuardados(id) { return "nivanCuponesGuardados_" + id; }
    function refrescarPantallas() {
        try { if (typeof refrescarVistasCuponNivan === "function") refrescarVistasCuponNivan(); } catch (e) {}
        try { if (typeof renderizarMisCuponesNivan === "function" && document.getElementById("listaMisCuponesNivan")) renderizarMisCuponesNivan(); } catch (e) {}
    }

    // El servidor guarda el id de la publicación como texto; la app los usa como vienen (casi siempre números).
    function idProductoLocal(idTexto) {
        if (idTexto == null || idTexto === "") return null;
        const p = (typeof productos !== "undefined" ? productos : []).find(function (x) { return String(x.id) === String(idTexto); });
        if (p) return p.id;
        return /^\d+$/.test(String(idTexto)) ? Number(idTexto) : String(idTexto);
    }
    function aFormatoApp(c) {
        return {
            id: c.id, codigo: c.codigo, vendedorId: c.vendedorId, tipo: c.tipo, valor: c.valor, vigenciaHasta: c.vigenciaHasta || null,
            usosMaximos: c.usosMaximos || null, usos: c.usos || 0, activo: !!c.activo, audiencia: c.audiencia || [], habilitados: c.habilitados || [],
            productoId: idProductoLocal(c.productoId), productoNombre: c.productoNombre || "", creado: c.creado, _srv: true
        };
    }

    // ---- Cola de acciones: salen en orden; si no hay internet esperan ----
    let enviando = false, temporizador = null;
    function pendientesMios() { const mia = yo(); return leer(CLAVE_COLA, []).filter(function (o) { return o.de === mia; }).length; }
    function programar() { clearTimeout(temporizador); temporizador = setTimeout(vaciar, 300); }
    function encolar(ops) {
        if (!ops.length || !yo()) return;
        const cola = leer(CLAVE_COLA, []);
        ops.forEach(function (o) { o.de = yo(); o.k = Date.now() + "-" + Math.floor(Math.random() * 1e6); cola.push(o); });
        guardar(CLAVE_COLA, cola.slice(-300));
        programar();
    }
    function enviarOp(op) {
        switch (op.op) {
            case "crear": return apiNivan("/api/cupones/crear", { cupon: op.cupon });
            case "actualizar": return apiNivan("/api/cupones/actualizar", { id: op.id, activo: op.activo, audiencia: op.audiencia });
            case "eliminar": return apiNivan("/api/cupones/eliminar", { id: op.id });
            case "habilitar": return apiNivan("/api/cupones/habilitar", { id: op.id, usuarios: op.usuarios });
            case "reclamar": return apiNivan("/api/cupones/reclamar", { codigo: op.codigo });
            default: return apiNivan("/api/cupones/quitar", { codigo: op.codigo });
        }
    }
    async function vaciar() {
        const mia = yo();
        if (enviando || !mia) return;
        enviando = true;
        let hubo = false;
        try {
            for (;;) {
                const op = leer(CLAVE_COLA, []).find(function (o) { return o.de === mia; });
                if (!op) break;
                const r = await enviarOp(op);
                if (!r.ok && sinConexion(r)) break;                     // sin internet o sesión vencida: queda para después
                guardar(CLAVE_COLA, leer(CLAVE_COLA, []).filter(function (o) { return o.k !== op.k; }));
                if (!r.ok) {
                    if (op.op === "crear" || op.op === "actualizar" || op.op === "reclamar") avisar(r.error || "No se pudo guardar el cambio del cupón.");
                    hubo = true;                                         // el servidor dijo que no: se vuelve a lo que él tiene
                }
            }
        } finally {
            enviando = false;
        }
        if (hubo) bajar();
    }

    // ---- Lo que cambia la tienda: se mira qué cambió en "nivanCupones" ----
    const guardarCuponesOriginal = window.guardarCuponesNivan;
    let aplicandoDelServidor = false;
    window.guardarCuponesNivan = function (lista) {
        const viejo = aplicandoDelServidor ? [] : leer(CLAVE_CUPONES, []);
        guardarCuponesOriginal(lista);
        if (aplicandoDelServidor) return;
        try { derivarCambiosTienda(viejo, Array.isArray(lista) ? lista : []); } catch (e) {}
    };

    function derivarCambiosTienda(viejo, nuevo) {
        const miId = yo();
        if (!miId) return;
        const antes = {}, ops = [];
        let soloUsos = false;
        viejo.forEach(function (c) { if (c && c.vendedorId === miId) antes[c.id] = c; });
        nuevo.forEach(function (c) {
            if (!c || c.vendedorId !== miId) return;
            const v = antes[c.id];
            if (!v) {
                ops.push({ op: "crear", cupon: { id: c.id, codigo: c.codigo, tipo: c.tipo, valor: c.valor, vigenciaHasta: c.vigenciaHasta || null, usosMaximos: c.usosMaximos || null, audiencia: c.audiencia || [], productoId: c.productoId != null ? String(c.productoId) : null } });
                if ((c.habilitados || []).length) ops.push({ op: "habilitar", id: c.id, usuarios: c.habilitados.slice() });
                if (c.activo === false) ops.push({ op: "actualizar", id: c.id, activo: false });
                return;
            }
            const cambio = { op: "actualizar", id: c.id };
            if (!!v.activo !== !!c.activo) cambio.activo = !!c.activo;
            if (JSON.stringify(v.audiencia || []) !== JSON.stringify(c.audiencia || [])) cambio.audiencia = c.audiencia || [];
            if (cambio.activo !== undefined || cambio.audiencia !== undefined) ops.push(cambio);
            const nuevos = (c.habilitados || []).filter(function (id) { return (v.habilitados || []).indexOf(id) === -1; });
            if (nuevos.length) ops.push({ op: "habilitar", id: c.id, usuarios: nuevos });
            if ((v.usos || 0) !== (c.usos || 0)) soloUsos = true;
        });
        Object.keys(antes).forEach(function (id) {
            if (!nuevo.some(function (c) { return c && c.id === id; })) ops.push({ op: "eliminar", id: id });
        });
        encolar(ops);
        if (!ops.length && soloUsos) setTimeout(bajar, 800);              // se usó un cupón: se actualiza el contador
    }

    // ---- Lo que cambia quien compra: sus códigos guardados ("Tus cupones") ----
    const guardarGuardadosOriginal = window.guardarCuponesGuardadosNivan;
    window.guardarCuponesGuardadosNivan = function (lista) {
        const antes = obtenerCuponesGuardadosNivan().map(norm);
        guardarGuardadosOriginal(lista);
        try {
            const despues = (Array.isArray(lista) ? lista : []).map(norm), ops = [];
            despues.forEach(function (c) { if (antes.indexOf(c) === -1) ops.push({ op: "reclamar", codigo: c }); });
            antes.forEach(function (c) { if (despues.indexOf(c) === -1) ops.push({ op: "quitar", codigo: c }); });
            encolar(ops);
        } catch (e) {}
    };
    const guardarParaUsuarioOriginal = window.guardarCuponParaUsuarioNivan;
    window.guardarCuponParaUsuarioNivan = function (idUsuario, codigo) {
        const nuevo = guardarParaUsuarioOriginal(idUsuario, codigo);
        try { if (nuevo && idUsuario === yo()) encolar([{ op: "reclamar", codigo: norm(codigo) }]); } catch (e) {}
        return nuevo;
    };

    // ---- Códigos que todavía no están en este celular: se buscan en el servidor antes de seguir ----
    async function asegurarCupon(codigoCrudo) {
        const codigo = norm(codigoCrudo);
        if (!codigo || !yo()) return;
        if (obtenerCuponesNivan().some(function (c) { return norm(c.codigo) === codigo; })) return;
        const r = await apiNivan("/api/cupones/buscar", { codigo: codigo });
        if (!r.ok || !r.cupon) return;
        const lista = leer(CLAVE_CUPONES, []).filter(function (c) { return c.id !== r.cupon.id; });
        lista.unshift(aFormatoApp(r.cupon));
        aplicandoDelServidor = true;
        try { window.guardarCuponesNivan(lista); } finally { aplicandoDelServidor = false; }
    }
    function conBusqueda(nombre, idCampo) {
        const original = window[nombre];
        if (typeof original !== "function") return;
        window[nombre] = async function () {
            const campo = idCampo ? document.getElementById(idCampo) : null;
            try { await asegurarCupon(campo ? campo.value : arguments[0]); } catch (e) {}
            return original.apply(this, arguments);
        };
    }
    conBusqueda("agregarCuponGuardadoNivan", "codigoCuponGuardarNivan");     // "Tus cupones" → agregar por código
    conBusqueda("aplicarCuponCarritoNivan", "codigoCuponCarritoNivan");      // carrito → aplicar
    conBusqueda("reclamarCuponNivan", null);                                 // botón "Usar" de un cupón enviado por chat o aviso

    // ---- Bajar lo que el servidor me muestra ----
    let bajando = false;
    async function bajar() {
        const miId = yo();
        if (bajando || !miId) return;
        bajando = true;
        try {
            await vaciar();
            if (pendientesMios()) return;                              // algo todavía no salió: no se pisa lo que hiciste
            const r = await apiNivan("/api/cupones");
            if (!r.ok || !Array.isArray(r.cupones) || !Array.isArray(r.guardados) || yo() !== miId) return;

            // Cupones de otras cuentas de este celular que todavía no se subieron (los de antes de esta versión) se dejan como están.
            const delServidor = {};
            r.cupones.forEach(function (c) { delServidor[c.id] = true; });
            const local = leer(CLAVE_CUPONES, []);
            const legadosMios = local.filter(function (c) { return !c._srv && c.vendedorId === miId && !delServidor[c.id]; });
            const legadosAjenos = local.filter(function (c) { return !c._srv && c.vendedorId !== miId && !delServidor[c.id]; });

            // Los cupones y códigos guardados que ya tenía esta cuenta antes de esta versión se suben una sola vez.
            const migrados = leer(CLAVE_MIGRADOS, {});
            if (!migrados[miId]) {
                migrados[miId] = 1; guardar(CLAVE_MIGRADOS, migrados);
                const ops = [];
                legadosMios.forEach(function (c) {
                    ops.push({ op: "crear", cupon: { id: c.id, codigo: c.codigo, tipo: c.tipo, valor: c.valor, vigenciaHasta: c.vigenciaHasta || null, usosMaximos: c.usosMaximos || null, audiencia: audienciaCuponNivan(c), productoId: c.productoId != null ? String(c.productoId) : null } });
                    if ((c.habilitados || []).length) ops.push({ op: "habilitar", id: c.id, usuarios: c.habilitados.slice() });
                    if (c.activo === false) ops.push({ op: "actualizar", id: c.id, activo: false });
                });
                leer(claveGuardados(miId), []).forEach(function (cod) {
                    if (r.guardados.map(norm).indexOf(norm(cod)) === -1) ops.push({ op: "reclamar", codigo: norm(cod) });
                });
                if (ops.length) { encolar(ops); return; }
            }

            const nuevo = r.cupones.map(aFormatoApp).concat(legadosAjenos);
            aplicandoDelServidor = true;
            try {
                if (JSON.stringify(nuevo) !== JSON.stringify(local)) window.guardarCuponesNivan(nuevo);
            } finally { aplicandoDelServidor = false; }

            const guardadosLocal = leer(claveGuardados(miId), []);
            if (JSON.stringify(guardadosLocal) !== JSON.stringify(r.guardados)) guardar(claveGuardados(miId), r.guardados);
            refrescarPantallas();
        } finally {
            bajando = false;
        }
    }
    window.sincronizarCuponesNivan = bajar;

    // ---- Cuándo bajar ----
    window.addEventListener("load", function () { setTimeout(bajar, 2200); });
    window.addEventListener("online", bajar);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") bajar(); });
    setInterval(function () { if (document.visibilityState === "visible") bajar(); }, 60000);

    const inicioOriginal = window.completarInicioSesionNivan;
    if (typeof inicioOriginal === "function") {
        window.completarInicioSesionNivan = function () {
            const res = inicioOriginal.apply(this, arguments);
            setTimeout(bajar, 1100);
            return res;
        };
    }
})();
