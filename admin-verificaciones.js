// Página para que las personas de Nivan aprueben o rechacen identidades.
// Hay que haber iniciado sesión en la app con un email que esté en ADMIN_EMAILS.
async function api(ruta, cuerpo) {
    try {
        const r = await fetch(ruta, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}) });
        const d = await r.json().catch(function () { return {}; });
        d.estado = r.status;
        return d;
    } catch (e) { return { ok: false, error: "No hay conexión con el servidor." }; }
}
const NOMBRES = { dniFrente: "Documento (frente)", dniDorso: "Documento (dorso)", rostro: "Selfie" };
const estado = document.getElementById("estado"), lista = document.getElementById("lista");

function texto(el, t) { el.textContent = t; return el; }

async function cargar() {
    lista.innerHTML = "";
    const r = await api("/api/admin/verificaciones");
    if (r.estado === 401) { estado.textContent = "Primero iniciá sesión en la app de Nivan con tu cuenta de administradora y volvé a esta página."; return; }
    if (r.estado === 403) { estado.textContent = "Esta cuenta no tiene permiso para revisar identidades."; return; }
    if (!r.ok) { estado.textContent = r.error || "Error."; return; }
    estado.textContent = r.pendientes.length ? r.pendientes.length + " pendiente(s)" : "No hay verificaciones pendientes.";
    r.pendientes.forEach(function (p) { lista.appendChild(tarjeta(p)); });
}

function tarjeta(p) {
    const div = document.createElement("div"); div.className = "tarjeta";
    const info = document.createElement("div");
    info.textContent = p.email + " · enviada el " + new Date(p.enviada).toLocaleString("es-UY");
    const fotos = document.createElement("div"); fotos.className = "fotos";
    const acciones = document.createElement("div"); acciones.className = "acciones";
    const ver = document.createElement("button"); ver.className = "ver"; ver.textContent = "Ver fotos";
    ver.onclick = async function () {
        ver.disabled = true;
        const f = await api("/api/admin/verificacion/ver", { usuarioId: p.id });
        ver.disabled = false;
        if (!f.ok) { alert(f.error || "No se pudieron cargar las fotos."); return; }
        fotos.innerHTML = "";
        Object.keys(NOMBRES).forEach(function (k) {
            const fig = document.createElement("figure"), img = document.createElement("img");
            img.src = f.fotos[k]; img.alt = NOMBRES[k];
            fig.appendChild(img); fig.appendChild(texto(document.createElement("figcaption"), NOMBRES[k]));
            fotos.appendChild(fig);
        });
        ver.remove();
    };
    const si = document.createElement("button"); si.className = "si"; si.textContent = "Aprobar";
    si.onclick = function () { resolver(p, "aprobada", ""); };
    const no = document.createElement("button"); no.className = "no"; no.textContent = "Rechazar";
    no.onclick = function () {
        const motivo = prompt("Motivo del rechazo (se lo mostramos a la persona):", "No pudimos validar tus fotos.");
        if (motivo === null) return;
        resolver(p, "rechazada", motivo);
    };
    acciones.append(ver, si, no);
    const titulo = document.createElement("strong"); titulo.textContent = p.nombre + " (" + p.idPublico + ")";
    div.append(titulo, info, fotos, acciones);
    return div;
}

async function resolver(p, decision, motivo) {
    if (!confirm((decision === "aprobada" ? "¿Aprobar a " : "¿Rechazar a ") + p.nombre + "?")) return;
    const r = await api("/api/admin/verificacion/resolver", { usuarioId: p.id, decision: decision, motivo: motivo });
    if (!r.ok) { alert(r.error || "No se pudo guardar."); return; }
    cargar();
}
cargar();
