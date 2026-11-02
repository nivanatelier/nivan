// ==============================
// NIVAN · Seguidores, likes de posts y bloqueos de usuarios (los guarda el servidor)
// ==============================
// El resto de la app sigue leyendo y escribiendo "nivanSeguidores" y "nivanLikesPosts" como siempre.
// Acá se hace lo de red:
//   1. Cada seguimiento o like que hacés (o sacás) se manda al servidor.
//   2. Se bajan los de todas las demás personas. Lo que el servidor no tiene, deja de verse acá.
// El servidor solo deja que cada persona cambie lo suyo (y que quien es seguido saque a un seguidor).
(function () {
    "use strict";

    const SEP = "\u0001";
    function hayCuenta() { return typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id; }
    function aBorde(clave, valor) { return clave + SEP + valor; }
    function deDicc(dicc) {
        const bordes = {};
        Object.keys(dicc || {}).forEach(function (clave) {
            (Array.isArray(dicc[clave]) ? dicc[clave] : []).forEach(function (valor) {
                if (typeof valor === "string") bordes[aBorde(clave, valor)] = [clave, valor];
            });
        });
        return bordes;
    }
    function aDicc(bordes) {
        const dicc = {};
        Object.keys(bordes).forEach(function (b) {
            const par = bordes[b];
            (dicc[par[0]] = dicc[par[0]] || []).push(par[1]);
        });
        return dicc;
    }
    function igual(a, b) {
        const ka = Object.keys(a), kb = Object.keys(b);
        return ka.length === kb.length && ka.every(function (k) { return k in b; });
    }

    function crearConjunto(cfg) {
        const CLAVE_SYNC = "nivanConjSync:" + cfg.coleccion;     // { idUsuario: { borde: [clave, valor] } } = lo que ya tiene el servidor
        let cola = Promise.resolve();
        let temporizador = null;
        let bajando = false;
        const esMioBorde = cfg.esMioBorde || function (clave, valor) { return cfg.esMio(valor); };

        function leerSync() { return leerJSONNivan(CLAVE_SYNC, {}); }
        function guardarSync(o) { try { localStorage.setItem(CLAVE_SYNC, JSON.stringify(o)); } catch (e) {} }
        function sincronizadoDe(id) { return (leerSync()[id] || {}); }
        function fijarSincronizado(id, bordes) { const s = leerSync(); s[id] = bordes; guardarSync(s); }

        function programar() {
            clearTimeout(temporizador);
            temporizador = setTimeout(function () { cola = cola.then(enviar); }, 800);
        }

        async function enviar() {
            if (!hayCuenta()) return;
            const yo = usuarioActual.id;
            const local = deDicc(cfg.leerLocal());
            const sync = sincronizadoDe(yo);
            const cambios = [];
            Object.keys(local).forEach(function (b) {
                if (!(b in sync) && esMioBorde(local[b][0], local[b][1])) cambios.push({ accion: "agregar", clave: local[b][0], valor: local[b][1] });
            });
            Object.keys(sync).forEach(function (b) {
                if (!(b in local)) cambios.push({ accion: "quitar", clave: sync[b][0], valor: sync[b][1] });
            });
            if (!cambios.length) return;

            const nuevoSync = Object.assign({}, sync);
            for (let i = 0; i < cambios.length; i += 100) {
                const tanda = cambios.slice(i, i + 100);
                const r = await apiNivan("/api/conjuntos/cambiar", { coleccion: cfg.coleccion, cambios: tanda });
                if (!r.ok) { fijarSincronizado(yo, nuevoSync); return; }        // sin conexión o sin sesión: queda pendiente
                tanda.forEach(function (c) {
                    const b = aBorde(c.clave, c.valor);
                    if (c.accion === "agregar") nuevoSync[b] = [c.clave, c.valor]; else delete nuevoSync[b];
                });
            }
            fijarSincronizado(yo, nuevoSync);
        }

        async function bajar() {
            if (bajando) return;
            bajando = true;
            try {
                await cola;
                const r = await apiNivan("/api/conjuntos?coleccion=" + cfg.coleccion);
                if (!r.ok || !r.datos || typeof r.datos !== "object") return;

                const remoto = deDicc(r.datos);
                const local = deDicc(cfg.leerLocal());               // se lee ahora, por si cambió mientras se esperaba
                const yo = hayCuenta() ? usuarioActual.id : null;
                const sync = yo ? sincronizadoDe(yo) : {};
                const resultado = Object.assign({}, remoto);
                let quedanPendientes = false;

                if (yo) {
                    // Lo que hice y todavía no llegó al servidor se conserva, y lo que saqué y todavía no llegó sigue sacado.
                    Object.keys(local).forEach(function (b) {
                        if (!(b in sync) && !(b in remoto) && esMioBorde(local[b][0], local[b][1])) { resultado[b] = local[b]; quedanPendientes = true; }
                    });
                    Object.keys(sync).forEach(function (b) {
                        if (!(b in local)) { delete resultado[b]; quedanPendientes = true; }
                    });
                    const nuevoSync = {};
                    Object.keys(remoto).forEach(function (b) { nuevoSync[b] = remoto[b]; });
                    fijarSincronizado(yo, nuevoSync);
                }
                if (!igual(resultado, local)) cfg.escribirLocal(aDicc(resultado));
                if (quedanPendientes) programar();                   // algo se hizo sin conexión: se manda ahora que hay
            } finally {
                bajando = false;
            }
        }

        return { programar: programar, bajar: bajar };
    }

    // ---- Seguidores: { claveSeguido: [claveSeguidor, ...] } ----
    const seguidores = crearConjunto({
        coleccion: "seguidores",
        leerLocal: function () { return leerJSONNivan("nivanSeguidores", {}); },
        escribirLocal: function (d) { try { localStorage.setItem("nivanSeguidores", JSON.stringify(d)); } catch (e) {} },
        esMio: function (valor) { return hayCuenta() && datosClaveCuentaNivan(valor).id === usuarioActual.id; }
    });
    const guardarSeguidoresOriginal = window.guardarSeguidoresTodosNivan;
    window.guardarSeguidoresTodosNivan = function (obj) {
        guardarSeguidoresOriginal(obj);
        try { seguidores.programar(); } catch (e) {}
    };

    // ---- Likes de posts: { idPost: [idUsuario, ...] } ----
    const CLAVE_LIKES = "nivanLikesPosts";
    const guardarJSONOriginal = window.guardarJSONNivan;
    const likes = crearConjunto({
        coleccion: "likes",
        leerLocal: function () { return leerJSONNivan(CLAVE_LIKES, {}); },
        escribirLocal: function (d) { guardarJSONOriginal(CLAVE_LIKES, d); },
        esMio: function (valor) { return hayCuenta() && valor === usuarioActual.id; }
    });
    window.guardarJSONNivan = function (clave, valor) {
        const ok = guardarJSONOriginal(clave, valor);
        if (clave === CLAVE_LIKES) { try { likes.programar(); } catch (e) {} }
        if (clave === CLAVE_BLOQUEOS) { try { bloqueos.programar(); } catch (e) {} }
        return ok;
    };

    // ---- Bloqueos de usuarios: { idDeQuienBloquea: [idBloqueado, ...] } ----
    // Del servidor se bajan los míos y los de quienes me bloquearon a mí (para que la app los esconda a los dos lados).
    const CLAVE_BLOQUEOS = "nivanUsuariosBloqueados";
    const bloqueos = crearConjunto({
        coleccion: "bloqueos",
        leerLocal: function () { return leerJSONNivan(CLAVE_BLOQUEOS, {}); },
        escribirLocal: function (d) { try { localStorage.setItem(CLAVE_BLOQUEOS, JSON.stringify(d)); } catch (e) {} },
        esMio: function () { return false; },
        esMioBorde: function (clave) { return hayCuenta() && clave === usuarioActual.id; }       // solo cada persona cambia sus propios bloqueos
    });

    function bajarTodo() { return Promise.all([seguidores.bajar(), likes.bajar(), bloqueos.bajar()]); }
    window.actualizarSeguidoresYLikesNivan = bajarTodo;
    window.addEventListener("load", function () {
        setTimeout(function () { bajarTodo().then(function () { if (hayCuenta()) { seguidores.programar(); likes.programar(); bloqueos.programar(); } }); }, 1500);
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) bajarTodo(); });
    setInterval(function () { if (!document.hidden) bajarTodo(); }, 60000);
})();
