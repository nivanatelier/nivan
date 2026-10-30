// ==============================
// NIVAN · Conexión con el servidor (cuentas y sesión)
// ==============================
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
        datos.estado = r.status;
        return datos;
    } catch (e) {
        return { ok: false, estado: 0, error: "No hay conexión con el servidor. Probá de nuevo en un momento." };
    }
}

// Al abrir la app: si el servidor ya no reconoce la sesión, se cierra acá también.
// Sin internet no se cierra nada: la app sigue abierta hasta que haya conexión.
window.addEventListener("load", async function () {
    if (!usuarioActual) return;
    const r = await apiNivan("/api/yo");
    if (r.estado !== 401) return;
    usuarioActual = null;
    localStorage.removeItem("nivanSesion");
    localStorage.removeItem("nivanSesionId");
    try { sincronizarFavoritosConCuentaNivan(true); } catch (e) {}
    try { cerrarCuenta(); } catch (e) {}
    try { actualizarBadgeNotificaciones(); } catch (e) {}
    alert("Tu sesión venció. Volvé a iniciar sesión.");
});
