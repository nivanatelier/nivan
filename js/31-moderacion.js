// ==============================
// MODERACIÓN DESDE LOS BOTONES DE REPORTAR (solo cuentas de administración)
// ==============================
// En las cuentas de administración (ADMIN_EMAILS), "Reportar" se convierte en "Moderar" y abre esta ventana:
//   1. Si el panel está bloqueado, pide la clave del panel (ADMIN_CLAVE).
//   2. Muestra la cuenta responsable y los reportes de esa publicación o perfil.
//   3. Permite suspender para comprar / vender / ambos por unos días, banear para siempre, descartar los reportes o cancelar.
// Todo el permiso se revisa en el servidor: si alguien abriera esta ventana sin ser admin, el servidor le responde 403.

(function () {
    const estilo = document.createElement("style");
    estilo.textContent = `
.overlayModeracionNivan { display:none; position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:10002; align-items:center; justify-content:center; padding:16px; }
.overlayModeracionNivan.abierto { display:flex; }
.panelModeracionNivan { background:#1c1c1c; color:#fff; border-radius:14px; padding:18px; width:100%; max-width:420px; max-height:88vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,.5); font-size:14px; }
.panelModeracionNivan h3 { margin:0 0 4px; }
.panelModeracionNivan .modSub { color:#bbb; font-size:13px; margin-bottom:12px; word-break:break-word; }
.panelModeracionNivan .modCaja { background:#262626; border-radius:10px; padding:10px; margin-bottom:12px; }
.panelModeracionNivan .modCaja strong { display:block; margin-bottom:4px; }
.panelModeracionNivan .modEstado { margin-top:6px; padding:6px 8px; border-radius:8px; font-size:13px; }
.panelModeracionNivan .modEstado.libre { background:#1f3a24; color:#9fd18f; }
.panelModeracionNivan .modEstado.medida { background:#4a2a14; color:#ffb74d; }
.panelModeracionNivan .modReporte { border-top:1px solid #383838; padding:8px 0; }
.panelModeracionNivan .modReporte:first-of-type { border-top:0; }
.panelModeracionNivan .modMotivo { font-weight:600; }
.panelModeracionNivan .modDetalle { color:#ddd; margin-top:2px; word-break:break-word; }
.panelModeracionNivan .modMeta { color:#999; font-size:12px; margin-top:2px; }
.panelModeracionNivan .modOpcion { display:flex; gap:8px; align-items:center; padding:9px 10px; background:#262626; border-radius:8px; margin-bottom:6px; cursor:pointer; }
.panelModeracionNivan .modOpcion.activa { outline:2px solid #fff; }
.panelModeracionNivan .modOpcion.peligro { background:#3a1717; }
.panelModeracionNivan .modOpcion input { margin:0; }
.panelModeracionNivan input[type=number], .panelModeracionNivan input[type=password], .panelModeracionNivan textarea { width:100%; box-sizing:border-box; padding:10px; border-radius:8px; border:1px solid #444; background:#111; color:#fff; font-size:15px; margin-top:6px; }
.panelModeracionNivan textarea { min-height:70px; resize:vertical; }
.panelModeracionNivan .modError { color:#ff8a80; font-size:13px; min-height:18px; margin:8px 0 0; }
.panelModeracionNivan .modBotones { display:flex; gap:8px; margin-top:12px; }
.panelModeracionNivan .modBotones button, .panelModeracionNivan .modSecundario { flex:1; padding:11px; border-radius:8px; border:0; font-size:15px; cursor:pointer; }
.panelModeracionNivan .modCancelar { background:#333; color:#fff; }
.panelModeracionNivan .modAplicar { background:#fff; color:#000; font-weight:600; }
.panelModeracionNivan .modSecundario { width:100%; margin-top:8px; background:transparent; border:1px solid #555; color:#ddd; }
`;
    document.head.appendChild(estilo);

    let overlay = null, panel = null, objetivo = null;

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }

    function asegurarVentana() {
        if (overlay) return;
        overlay = el("div", "overlayModeracionNivan");
        overlay.onclick = function (ev) { if (ev.target === overlay) cerrar(); };
        panel = el("div", "panelModeracionNivan");
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    }

    function cerrar() {
        if (overlay) overlay.classList.remove("abierto");
        objetivo = null;
    }

    function limpiar() { panel.innerHTML = ""; }

    function titulo() {
        const t = el("h3", "", "🛡️ Moderar");
        const sub = el("div", "modSub", ({ usuario: "Perfil: ", post: "Post de perfil: ", comentario: "Comentario: " }[objetivo.tipo] || "Publicación: ") + (objetivo.nombre || objetivo.id));
        panel.append(t, sub);
    }

    function pintarMensaje(texto, conCerrar) {
        limpiar(); titulo();
        panel.appendChild(el("div", "modCaja", texto));
        if (conCerrar) {
            const b = el("button", "modSecundario", "Cerrar");
            b.onclick = cerrar;
            panel.appendChild(b);
        }
    }

    function textoMedida(b) {
        const a = b.alcance || "todo";
        if (b.permanente) return "🚫 Baneada para siempre";
        const hasta = " hasta el " + new Date(b.hasta).toLocaleDateString("es-UY");
        if (a === "todo") return "⏳ Baneada" + hasta;
        return "⏳ Suspendida para " + (a === "comprar" ? "comprar" : a === "vender" ? "vender" : "comprar y vender") + hasta;
    }

    function fecha(ms) { return new Date(ms).toLocaleDateString("es-UY") + " " + new Date(ms).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }); }

    // ---- Paso 1: clave del panel ----
    function pintarClave(error) {
        limpiar(); titulo();
        const caja = el("div", "modCaja");
        caja.appendChild(el("strong", "", "Clave del panel"));
        caja.appendChild(el("div", "modMeta", "Para ver los reportes y tomar medidas hace falta la clave de administración."));
        const campo = el("input");
        campo.type = "password"; campo.autocomplete = "off"; campo.placeholder = "Clave del panel";
        caja.appendChild(campo);
        const err = el("p", "modError", error || "");
        caja.appendChild(err);
        panel.appendChild(caja);

        const botones = el("div", "modBotones");
        const cancelar = el("button", "modCancelar", "Cancelar"); cancelar.onclick = cerrar;
        const entrar = el("button", "modAplicar", "Entrar");
        const enviar = async function () {
            if (!campo.value) { err.textContent = "Escribí la clave."; return; }
            entrar.disabled = true;
            const r = await apiNivan("/api/admin/entrar", { clave: campo.value });
            campo.value = "";
            entrar.disabled = false;
            if (!r.ok) { err.textContent = r.error || "No se pudo entrar."; return; }
            cargar();
        };
        entrar.onclick = enviar;
        campo.onkeydown = function (ev) { if (ev.key === "Enter") enviar(); };
        botones.append(cancelar, entrar);
        panel.appendChild(botones);
        setTimeout(function () { campo.focus(); }, 50);
    }

    // ---- Paso 2: reportes + acciones ----
    async function cargar() {
        if (!objetivo) return;
        pintarMensaje("Cargando…");
        const r = await apiNivan("/api/admin/reportes/objetivo", { tipo: objetivo.tipo, objetivoId: objetivo.id });
        if (!objetivo) return;
        if (r.estado === 423) return pintarClave();
        if (r.estado === 401) return pintarMensaje("Tu sesión venció. Volvé a iniciar sesión.", true);
        if (!r.ok) return pintarMensaje(r.error || "No se pudo cargar.", true);
        pintarDetalle(r);
    }

    function pintarDetalle(r) {
        limpiar();
        if (r.objetivo && r.objetivo.nombre) objetivo.nombre = r.objetivo.nombre;
        titulo();

        // Cuenta responsable
        const c = r.cuenta;
        const cuenta = el("div", "modCaja");
        cuenta.appendChild(el("strong", "", c.nombre + (c.idPublico ? " (" + c.idPublico + ")" : "")));
        cuenta.appendChild(el("div", "modMeta", c.email));
        const est = el("div", "modEstado " + (c.baneo ? "medida" : "libre"), c.baneo ? textoMedida(c.baneo) + " · Motivo: " + c.baneo.motivo : "✅ Sin medidas activas");
        cuenta.appendChild(est);
        if (r.totalesCuenta) cuenta.appendChild(el("div", "modMeta", "Reportes de esta cuenta en total: " + r.totalesCuenta.total + " (" + r.totalesCuenta.pendientes + " pendientes)"));
        panel.appendChild(cuenta);

        // Reportes
        const pendientes = r.reportes.filter(function (x) { return x.estado === "pendiente"; }).length;
        const caja = el("div", "modCaja");
        caja.appendChild(el("strong", "", ({ usuario: "Reportes de este perfil", post: "Reportes de este post", comentario: "Reportes de este comentario" }[objetivo.tipo] || "Reportes de esta publicación") + " (" + r.reportes.length + ")"));
        if (!r.reportes.length) caja.appendChild(el("div", "modMeta", "Nadie la reportó todavía."));
        r.reportes.forEach(function (x) {
            const fila = el("div", "modReporte");
            fila.appendChild(el("div", "modMotivo", x.motivo));
            if (x.detalle) fila.appendChild(el("div", "modDetalle", x.detalle));
            const estadoTxt = x.estado === "pendiente" ? "pendiente" : (x.estado === "resuelto" ? "resuelto · " + x.resolucion : "descartado");
            fila.appendChild(el("div", "modMeta", "Por " + (x.por || "—") + " · " + fecha(x.fecha) + " · " + estadoTxt));
            caja.appendChild(fila);
        });
        panel.appendChild(caja);

        if (c.admin) {
            panel.appendChild(el("div", "modCaja", "Es una cuenta de administración: no se puede suspender ni banear."));
            const cerrarBtn = el("button", "modSecundario", "Cerrar"); cerrarBtn.onclick = cerrar;
            panel.appendChild(cerrarBtn);
            return;
        }

        // Quitar una medida que ya está puesta
        if (c.baneo) {
            const quitar = el("button", "modSecundario", "Quitar la medida actual");
            quitar.onclick = async function () {
                if (!confirm("¿Quitar la medida a " + c.nombre + "?")) return;
                const q = await apiNivan("/api/admin/cuenta/desbanear", { usuarioId: c.id });
                if (q.estado === 423) return pintarClave();
                if (!q.ok) { alert(q.error || "No se pudo."); return; }
                cargar();
            };
            panel.appendChild(quitar);
        }

        // Formulario de medida
        panel.appendChild(el("strong", "", "Tomar una medida"));
        panel.lastChild.style.display = "block";
        panel.lastChild.style.margin = "12px 0 6px";
        const opciones = [
            { v: "comprar", t: "⏳ Suspender para comprar" },
            { v: "vender", t: "⏳ Suspender para vender" },
            { v: "comprar_vender", t: "⏳ Suspender para comprar y vender" },
            { v: "permanente", t: "🚫 Banear para siempre", peligro: true }
        ];
        let elegida = "";
        const filas = [];
        const diasCaja = el("div");
        const dias = el("input"); dias.type = "number"; dias.min = "1"; dias.max = "3650"; dias.value = "7"; dias.inputMode = "numeric";
        diasCaja.append(el("div", "modMeta", "¿Cuántos días dura la suspensión?"), dias);
        diasCaja.style.display = "none";
        diasCaja.style.marginBottom = "8px";

        opciones.forEach(function (o) {
            const fila = el("label", "modOpcion" + (o.peligro ? " peligro" : ""));
            const radio = el("input"); radio.type = "radio"; radio.name = "medidaModeracionNivan"; radio.value = o.v;
            radio.onchange = function () {
                elegida = o.v;
                filas.forEach(function (f) { f.classList.remove("activa"); });
                fila.classList.add("activa");
                diasCaja.style.display = o.v === "permanente" ? "none" : "block";
                error.textContent = "";
            };
            fila.append(radio, el("span", "", o.t));
            filas.push(fila);
            panel.appendChild(fila);
        });
        panel.appendChild(diasCaja);

        const motivo = el("textarea"); motivo.maxLength = 300; motivo.placeholder = "Motivo (la persona lo va a ver)";
        panel.appendChild(motivo);
        const error = el("p", "modError", "");
        panel.appendChild(error);

        const botones = el("div", "modBotones");
        const cancelar = el("button", "modCancelar", "Cancelar"); cancelar.onclick = cerrar;
        const aplicar = el("button", "modAplicar", "Aplicar");
        aplicar.onclick = async function () {
            if (!elegida) { error.textContent = "Elegí qué medida tomar."; return; }
            const txtMotivo = motivo.value.trim();
            if (txtMotivo.length < 3) { error.textContent = "Escribí el motivo (la persona lo va a ver)."; return; }
            const cuerpo = { usuarioId: c.id, motivo: txtMotivo, reporte: { tipo: objetivo.tipo, objetivoId: objetivo.id } };
            let pregunta;
            if (elegida === "permanente") {
                cuerpo.tipo = "permanente"; cuerpo.alcance = "todo";
                pregunta = "¿Banear PARA SIEMPRE a " + c.nombre + "? No va a poder volver a entrar.";
            } else {
                const n = Number(dias.value);
                if (!Number.isInteger(n) || n < 1 || n > 3650) { error.textContent = "Los días tienen que ser un número entero entre 1 y 3650."; return; }
                cuerpo.tipo = "temporal"; cuerpo.alcance = elegida; cuerpo.dias = n;
                pregunta = "¿Suspender a " + c.nombre + " para " + (elegida === "comprar" ? "comprar" : elegida === "vender" ? "vender" : "comprar y vender") + " por " + n + " día(s)?";
            }
            if (!confirm(pregunta)) return;
            aplicar.disabled = true;
            const q = await apiNivan("/api/admin/cuenta/banear", cuerpo);
            aplicar.disabled = false;
            if (q.estado === 423) return pintarClave();
            if (!q.ok) { error.textContent = q.error || "No se pudo aplicar."; return; }
            pintarMensaje("✅ Listo: " + c.nombre + " — " + textoMedida(q.cuenta.baneo).replace(/^[^ ]+ /, ""), true);
            try { if (typeof actualizarListaPublicacionesDelServidorNivan === "function") actualizarListaPublicacionesDelServidorNivan(); } catch (e) {}
        };
        botones.append(cancelar, aplicar);
        panel.appendChild(botones);

        if (pendientes) {
            const descartar = el("button", "modSecundario", "Descartar los reportes (no hace falta tomar medidas)");
            descartar.onclick = async function () {
                if (!confirm("¿Descartar los reportes pendientes sin tomar ninguna medida?")) return;
                const q = await apiNivan("/api/admin/reportes/descartar", { tipo: objetivo.tipo, objetivoId: objetivo.id });
                if (q.estado === 423) return pintarClave();
                if (!q.ok) { error.textContent = q.error || "No se pudo."; return; }
                cargar();
            };
            panel.appendChild(descartar);
        }
    }

    window.abrirModeracionNivan = function (tipo, id, nombre) {
        asegurarVentana();
        objetivo = { tipo: ["usuario", "post", "comentario"].indexOf(tipo) >= 0 ? tipo : "publicacion", id: String(id), nombre: nombre || "" };
        overlay.classList.add("abierto");
        cargar();
    };
})();
