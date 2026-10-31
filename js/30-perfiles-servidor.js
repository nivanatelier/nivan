// ==============================
// NIVAN · Perfiles compartidos (se guardan en el servidor)
// ==============================
// Cada persona sube su perfil público (foto, bio, posts del portafolio y datos de tienda) y baja los de
// todas las demás, de cualquier país. Los perfiles de otras personas se guardan en la lista local
// "nivanUsuarios" marcados con remoto:true, así el resto de la app los muestra como siempre.
(function () {
    "use strict";

    const CLAVE_USUARIOS = "nivanUsuarios";
    const guardarUsuariosOriginal = window.guardarUsuariosNivan;
    let temporizador = null;
    let enviando = false;
    let bajando = false;

    function huella(obj) {
        const s = JSON.stringify(obj);
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
        return s.length + ":" + h;
    }
    function hayCuenta() { return typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id; }
    function listaCruda() {
        const l = leerJSONNivan(CLAVE_USUARIOS, []);
        return Array.isArray(l) ? l : [];
    }
    function claveEnviado() { return "nivanPerfilEnviado:" + usuarioActual.id; }

    // ---- Subir mi perfil ----
    function construirPerfilPropio() {
        if (!hayCuenta()) return null;
        const u = listaCruda().find(function (x) { return x && x.id === usuarioActual.id; });
        if (!u) return null;
        const priv = u.privacidad || {};
        return {
            apodo: u.apodo || "",
            bio: u.bio || "",
            bioTrabajo: u.bioTrabajo || "",
            foto: u.foto || "",
            portafolio: Array.isArray(u.portafolio) ? u.portafolio : [],
            tiendas: (u.tiendas && typeof u.tiendas === "object") ? u.tiendas : {},
            privacidad: { verPerfil: priv.verPerfil || "todos", verTienda: priv.verTienda || "" }
        };
    }

    function programarEnvio() {
        clearTimeout(temporizador);
        temporizador = setTimeout(enviarPerfil, 1500);
    }

    async function enviarPerfil() {
        if (enviando) { programarEnvio(); return; }
        const perfil = construirPerfilPropio();
        if (!perfil) return;
        const h = huella(perfil);
        if (localStorage.getItem(claveEnviado()) === h) return;
        enviando = true;
        try {
            const r = await apiNivan("/api/perfil/guardar", { perfil: perfil });
            if (!r.ok) {
                if (r.estado && r.estado !== 401 && r.estado !== 0 && typeof mostrarToastNivan === "function") {
                    mostrarToastNivan(r.error || "No se pudo guardar tu perfil.", 4000);
                }
                return;
            }
            // Si no hubo cambios mientras se enviaba, se reemplazan las fotos pesadas por las direcciones cortas del servidor.
            const ahora = construirPerfilPropio();
            if (ahora && huella(ahora) === h) {
                const lista = listaCruda();
                const i = lista.findIndex(function (x) { return x && x.id === usuarioActual.id; });
                if (i >= 0) {
                    lista[i] = Object.assign({}, lista[i], {
                        foto: r.perfil.foto, portafolio: r.perfil.portafolio, tiendas: r.perfil.tiendas
                    });
                    guardarJSONNivan(CLAVE_USUARIOS, lista);
                    localStorage.setItem(claveEnviado(), huella(construirPerfilPropio()));
                    return;
                }
            }
            localStorage.setItem(claveEnviado(), h);
        } finally {
            enviando = false;
        }
    }

    window.guardarUsuariosNivan = function (usuarios) {
        guardarUsuariosOriginal(usuarios);
        try { programarEnvio(); } catch (e) {}
    };

    // ---- Bajar los perfiles de todos ----
    function camposPublicos(rp) {
        return {
            nombre: rp.nombre, apodo: rp.apodo || "", idPublico: rp.idPublico, foto: rp.foto || "",
            bio: rp.bio || "", bioTrabajo: rp.bioTrabajo || "", pais: rp.pais || "AR",
            portafolio: rp.portafolio || [], tiendas: rp.tiendas || {},
            verificacion: rp.verificado ? { estado: "aprobada", enviada: 0, revisada: 0, motivo: "" } : null
        };
    }

    async function bajar() {
        if (bajando) return;
        bajando = true;
        try {
            const r = await apiNivan("/api/perfiles");
            if (!r.ok || !Array.isArray(r.perfiles)) return;

            const miId = hayCuenta() ? usuarioActual.id : null;
            const ocultos = {};
            (r.ocultos || []).forEach(function (id) { ocultos[id] = true; });
            const remotos = {};
            r.perfiles.forEach(function (p) { remotos[p.id] = p; });

            const antes = listaCruda();
            const nueva = [];
            const yaEstan = {};

            antes.forEach(function (u) {
                if (!u || !u.id) { nueva.push(u); return; }
                yaEstan[u.id] = true;
                const rp = remotos[u.id];

                if (u.id === miId) {
                    // Mi propio perfil: solo se recupera lo que falte (por ejemplo, al entrar desde otro celular).
                    if (rp) {
                        const vacioLocal = !(Array.isArray(u.portafolio) && u.portafolio.length);
                        const completo = Object.assign({}, u);
                        if (vacioLocal && rp.portafolio && rp.portafolio.length) completo.portafolio = rp.portafolio;
                        if (!u.foto && rp.foto) completo.foto = rp.foto;
                        if (!u.bio && rp.bio) completo.bio = rp.bio;
                        if (!u.bioTrabajo && rp.bioTrabajo) completo.bioTrabajo = rp.bioTrabajo;
                        if (!u.apodo && rp.apodo) completo.apodo = rp.apodo;
                        if ((!u.tiendas || !Object.keys(u.tiendas).length) && rp.tiendas && Object.keys(rp.tiendas).length) completo.tiendas = rp.tiendas;
                        nueva.push(completo);
                    } else nueva.push(u);
                    return;
                }
                if (ocultos[u.id]) return;                      // cuenta suspendida
                if (u.remoto && !rp) return;                    // la cuenta ya no existe
                if (rp) {
                    nueva.push(Object.assign({}, u, camposPublicos(rp), {
                        privacidad: Object.assign({}, u.privacidad || {}, rp.privacidad || {})
                    }));
                } else nueva.push(u);
            });

            // Perfiles que todavía no estaban en este dispositivo.
            r.perfiles.forEach(function (rp) {
                if (yaEstan[rp.id] || rp.id === miId) return;
                nueva.push(Object.assign({
                    id: rp.id, email: "", passwordHash: "", curriculum: null, remoto: true
                }, camposPublicos(rp), { privacidad: rp.privacidad || {} }));
            });

            if (huella(nueva) === huella(antes)) return;
            guardarJSONNivan(CLAVE_USUARIOS, nueva);

            // Se vuelve a dibujar la pestaña Perfiles solo si se está mirando y no se está escribiendo.
            try {
                const feed = document.getElementById("feedPersonalNivan");
                const buscador = document.getElementById("buscadorPersonasNivan");
                if (feed && feed.offsetParent !== null && document.activeElement !== buscador) renderizarFeedPersonalNivan();
            } catch (e) {}
        } finally {
            bajando = false;
        }
    }

    window.actualizarPerfilesNivan = bajar;
    window.addEventListener("load", function () {
        setTimeout(function () { bajar().then(function () { if (hayCuenta()) programarEnvio(); }); }, 900);
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) bajar(); });
    setInterval(function () { if (!document.hidden) bajar(); }, 90000);
})();
