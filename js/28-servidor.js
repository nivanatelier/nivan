// ==============================
// NIVAN · Conexión con el servidor (cuentas y sesión)
// ==============================
// Lo que el servidor dice de la cuenta con sesión: si es de administración y si tiene suspensiones (comprar/vender).
let estadoCuentaNivan = null;
function esAdminNivan() {
    return !!(usuarioActual && estadoCuentaNivan && estadoCuentaNivan.id === usuarioActual.id && estadoCuentaNivan.admin);
}
// accion: "comprar" o "vender". Avisa el motivo y devuelve false si la cuenta está suspendida para eso.
// (Es solo comodidad: el servidor exige lo mismo al publicar y al crear un pedido, y ahí no se puede saltar.)
function exigirSinSuspensionNivan(accion) {
    if (!usuarioActual || !estadoCuentaNivan || estadoCuentaNivan.id !== usuarioActual.id) return true;
    const r = estadoCuentaNivan.restriccion;
    if (!r || !r[accion]) return true;
    if (r.hasta && r.hasta < Date.now()) return true;
    alert("No podés " + (accion === "vender" ? "vender" : "comprar") + " hasta el " + new Date(r.hasta).toLocaleDateString("es-UY") + "." + (r.motivo ? " Motivo: " + r.motivo : ""));
    return false;
}

async function apiNivan(ruta, cuerpo) {
    try {
        const r = await fetch(ruta, cuerpo === undefined ? { credentials: "same-origin" } : {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
        });
        let datos = {};
        try { datos = await r.json(); } catch (e) {}
        if (datos.ok === undefined) datos.ok = r.ok;
        if (!datos.ok && !datos.error) datos.error = "Error del servidor (" + r.status + ").";
        if (datos.usuario && datos.usuario.id && (ruta === "/api/yo" || ruta === "/api/login" || ruta === "/api/registro" || ruta === "/api/recuperar/restablecer")) {
            estadoCuentaNivan = { id: datos.usuario.id, admin: !!datos.usuario.admin, restriccion: datos.usuario.restriccion || null };
        }
        datos.estado = r.status;
        return datos;
    } catch (e) {
        return { ok: false, estado: 0, error: "No hay conexión con el servidor. Probá de nuevo en un momento." };
    }
}

// Copia al celular el estado de verificación que decidió el servidor y avisa si cambió.
function sincronizarVerificacionNivan(usuarioServidor) {
    if (!usuarioServidor) return;
    const local = obtenerUsuarioPorIdNivan(usuarioServidor.id);
    if (!local) return;
    const nueva = usuarioServidor.verificacion || null;
    const antes = local.verificacion ? local.verificacion.estado : "ninguna";
    const ahora = nueva ? nueva.estado : "ninguna";
    if (antes === ahora && (!nueva || (local.verificacion && local.verificacion.motivo === nueva.motivo))) return;

    actualizarUsuarioListaNivan(usuarioServidor.id, { verificacion: nueva });
    if (antes === "pendiente" && (ahora === "aprobada" || ahora === "rechazada")) {
        crearNotificacion(usuarioServidor.id, {
            tipo: "verificacion",
            icono: ahora === "aprobada" ? "✅" : "❌",
            titulo: ahora === "aprobada" ? "Identidad verificada" : "Verificación rechazada",
            texto: ahora === "aprobada"
                ? "Tu identidad quedó verificada."
                : "Volvé a enviar tus fotos desde Privacidad y seguridad. " + (nueva.motivo || "")
        });
    }
}

async function refrescarSesionNivan() {
    if (!usuarioActual) return;
    const r = await apiNivan("/api/yo");
    if (r.estado === 403 && r.baneada) return cerrarSesionBaneadaNivan(r.error);
    if (r.estado === 401) return cerrarSesionVencidaNivan();
    if (r.ok && r.usuario) sincronizarVerificacionNivan(r.usuario);
}

// La cuenta fue suspendida por Nivan: se cierra la sesión acá y se muestra el motivo.
function cerrarSesionBaneadaNivan(mensaje) {
    usuarioActual = null;
    localStorage.removeItem("nivanSesion");
    localStorage.removeItem("nivanSesionId");
    try { sincronizarFavoritosConCuentaNivan(true); } catch (e) {}
    try { cerrarCuenta(); } catch (e) {}
    try { actualizarBadgeNotificaciones(); } catch (e) {}
    alert(mensaje || "Tu cuenta está suspendida.");
}

function cerrarSesionVencidaNivan() {
    usuarioActual = null;
    localStorage.removeItem("nivanSesion");
    localStorage.removeItem("nivanSesionId");
    try { sincronizarFavoritosConCuentaNivan(true); } catch (e) {}
    try { cerrarCuenta(); } catch (e) {}
    try { actualizarBadgeNotificaciones(); } catch (e) {}
    alert("Tu sesión venció. Volvé a iniciar sesión.");
}

document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refrescarSesionNivan();
});

// Al abrir la app: si el servidor ya no reconoce la sesión, se cierra acá también.
// Sin internet no se cierra nada: la app sigue abierta hasta que haya conexión.
window.addEventListener("load", function () { refrescarSesionNivan(); });

// Muestra "Revisar identidades" en Mi cuenta solo si el servidor dice que esta cuenta es de administración.
// Es solo comodidad: el permiso real lo revisa el servidor en cada pedido.
async function mostrarBotonAdminNivan() {
    const b = document.getElementById("botonAdminNivan");
    if (!b) return;
    b.style.display = "none";
    if (!usuarioActual) return;
    const r = await apiNivan("/api/yo");
    if (r.ok && r.usuario && r.usuario.admin && usuarioActual) b.style.display = "block";
}
