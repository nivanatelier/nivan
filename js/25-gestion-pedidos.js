// ==============================
// GESTIÓN DE PEDIDOS (VENDEDOR)
// ==============================
// Pantalla "📦 Gestión" del Panel de Vendedor. Trabaja sobre los mismos
// pedidos de "nivanPedidos" que Mis ventas / Mis compras.
//
// Flujo del vendedor:
//   Nuevos (pendiente) -> Aceptar -> Preparar -> Preparando
//   -> Marcar como listo -> Listos -> Despachar -> Enviados
//   -> (el comprador confirma) -> Entregados
// También puede rechazar/cancelar mientras no esté enviado (Cancelados).
//
// Campos que se agregan al pedido: aceptado (fecha), seguimiento
// { empresa, codigo }, cancelacion { motivo, comentario, fecha }.

const TABS_GESTION_NIVAN = [
    { clave: "pendiente", texto: "Nuevos", vacio: "No tenés pedidos nuevos." },
    { clave: "preparando", texto: "Preparando", vacio: "No tenés pedidos en preparación." },
    { clave: "listo", texto: "Listos", vacio: "No tenés pedidos listos para despachar." },
    { clave: "enviado", texto: "Enviados", vacio: "No tenés pedidos enviados." },
    { clave: "entregado", texto: "Entregados", vacio: "Todavía no entregaste pedidos." },
    { clave: "cancelado", texto: "Cancelados", vacio: "No tenés pedidos cancelados.", soloSiHay: true }
];

const PASOS_GESTION_NIVAN = ["pendiente", "preparando", "listo", "enviado", "entregado"];
const MOTIVOS_CANCELACION_NIVAN = ["Sin stock", "No puedo enviar a esa zona", "Datos de envío incompletos", "Error en el precio", "Otro motivo"];
const HORAS_URGENTE_GESTION_NIVAN = 24;

let tabGestionNivan = "pendiente";
let busquedaGestionNivan = "";
let ordenGestionNivan = "recientes";

function obtenerPedidosGestionNivan() {
    if (!usuarioActual) return [];
    return obtenerPedidosDelPaisNivan().filter(function(p) {
        return p.vendedorId === usuarioActual.id;
    });
}

function abrirGestionPedidosNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    renderizarGestionNivan();
    abrirPantallaCompleta("pantallaGestionPedidos");
}

function cambiarTabGestionNivan(clave) {
    tabGestionNivan = clave;
    renderizarGestionNivan();
}

function filtrarGestionNivan(texto) {
    busquedaGestionNivan = String(texto || "").trim().toLowerCase();
    renderizarListaGestionNivan();
}

function ordenarGestionNivan(valor) {
    ordenGestionNivan = valor;
    renderizarListaGestionNivan();
}

function renderizarGestionNivan() {
    if (!usuarioActual) return;

    const pedidos = obtenerPedidosGestionNivan();
    const cuentas = {};
    pedidos.forEach(function(p) { cuentas[p.estado] = (cuentas[p.estado] || 0) + 1; });

    // Si la solapa elegida ya no existe (p. ej. Cancelados vacía), volvemos a Nuevos.
    const tabActual = TABS_GESTION_NIVAN.find(function(t) { return t.clave === tabGestionNivan; });
    if (!tabActual || (tabActual.soloSiHay && !cuentas[tabActual.clave])) tabGestionNivan = "pendiente";

    const tabs = document.getElementById("tabsGestionNivan");
    if (tabs) {
        tabs.innerHTML = TABS_GESTION_NIVAN.filter(function(t) {
            return !t.soloSiHay || cuentas[t.clave];
        }).map(function(t) {
            const n = cuentas[t.clave] || 0;
            return `<button type="button" role="tab" aria-selected="${t.clave === tabGestionNivan}" class="tabGestionNivan ${t.clave === tabGestionNivan ? "activa" : ""}" onclick="cambiarTabGestionNivan('${t.clave}')">
                ${t.texto}${n ? `<span class="contadorTabGestionNivan">${n}</span>` : ""}
            </button>`;
        }).join("");
    }

    const resumen = document.getElementById("resumenGestionNivan");
    if (resumen) {
        const enCurso = pedidos.filter(function(p) { return ["pendiente", "preparando", "listo", "enviado"].indexOf(p.estado) !== -1; });
        const monto = enCurso.reduce(function(a, p) { return a + (Number(p.total) || 0); }, 0);
        resumen.textContent = enCurso.length
            ? `${enCurso.length} en curso · ${simboloMonedaNivan()}${formatearDineroNivan(monto)}`
            : "";
    }

    renderizarListaGestionNivan();
    actualizarBadgeGestionNivan();
}

function renderizarListaGestionNivan() {
    const contenedor = document.getElementById("listaGestionNivan");
    if (!contenedor || !usuarioActual) return;

    let pedidos = obtenerPedidosGestionNivan().filter(function(p) { return p.estado === tabGestionNivan; });

    if (busquedaGestionNivan) {
        pedidos = pedidos.filter(function(p) {
            const texto = [p.id, p.compradorNombre, p.ciudad].concat((p.items || []).map(function(it) { return it.nombre; }))
                .join(" ").toLowerCase();
            return texto.indexOf(busquedaGestionNivan) !== -1;
        });
    }

    pedidos.sort(function(a, b) {
        if (ordenGestionNivan === "antiguos") return a.fecha - b.fecha;
        if (ordenGestionNivan === "monto") return (Number(b.total) || 0) - (Number(a.total) || 0);
        return b.fecha - a.fecha;
    });

    const tab = TABS_GESTION_NIVAN.find(function(t) { return t.clave === tabGestionNivan; });

    contenedor.innerHTML = pedidos.length
        ? pedidos.map(tarjetaGestionNivan).join("")
        : `<p class="pedidosVaciosNivan">${busquedaGestionNivan ? "No hay pedidos que coincidan." : tab.vacio}</p>`;
}

function tiempoTranscurridoGestionNivan(fecha) {
    const min = Math.max(1, Math.round((Date.now() - fecha) / 60000));
    if (min < 60) return "hace " + min + " min";
    const h = Math.round(min / 60);
    if (h < 24) return "hace " + h + " h";
    const d = Math.round(h / 24);
    return "hace " + d + (d === 1 ? " día" : " días");
}

function fechaDeEstadoGestionNivan(p, estado) {
    const h = (p.historial || []).filter(function(x) { return x.estado === estado; });
    return h.length ? h[h.length - 1].fecha : p.fecha;
}

function botonGestionNivan(idPedido, accion, texto, clase) {
    return `<button type="button" class="botonGestionNivan ${clase || ""}" onclick="accionGestionNivan('${idPedido}', '${accion}')">${texto}</button>`;
}

function accionesGestionNivan(p) {
    const id = escaparHTMLNivan(p.id);
    let principal = "";
    let atras = "";
    let nota = "";

    if (p.estado === "pendiente" && !p.aceptado) {
        principal = botonGestionNivan(id, "aceptar", "✅ Aceptar pedido", "principalGestionNivan");
    } else if (p.estado === "pendiente") {
        principal = botonGestionNivan(id, "preparar", "🧵 Preparar", "principalGestionNivan");
    } else if (p.estado === "preparando") {
        principal = botonGestionNivan(id, "listo", "📦 Marcar como listo", "principalGestionNivan");
        atras = botonGestionNivan(id, "atras", "↩ Volver atrás");
    } else if (p.estado === "listo") {
        principal = botonGestionNivan(id, "despachar", "🚚 Despachar", "principalGestionNivan");
        atras = botonGestionNivan(id, "atras", "↩ Volver atrás");
    } else if (p.estado === "enviado") {
        nota = `<p class="notaGestionNivan">Esperando que el comprador confirme la entrega.</p>`;
    }

    const puedeCancelar = ["pendiente", "preparando", "listo"].indexOf(p.estado) !== -1;
    const cancelar = puedeCancelar
        ? botonGestionNivan(id, "cancelar", p.estado === "pendiente" && !p.aceptado ? "🚫 Rechazar" : "🚫 Cancelar", "peligroGestionNivan")
        : "";

    const chat = (p.vendedorId && p.compradorId)
        ? botonGestionNivan(id, "chat", "💬 Chat")
        : "";

    return `
        ${principal}
        ${nota}
        <div class="filaBotonesGestionNivan">
            ${botonGestionNivan(id, "comprador", "👤 Ver comprador")}
            ${chat}
            ${atras}
            ${cancelar}
        </div>
    `;
}

function tarjetaGestionNivan(p) {
    const id = escaparHTMLNivan(p.id);
    const est = ESTADOS_PEDIDO_NIVAN[p.estado] || ESTADOS_PEDIDO_NIVAN.pendiente;
    const indice = PASOS_GESTION_NIVAN.indexOf(p.estado);
    const esperaHoras = (Date.now() - p.fecha) / 3600000;
    const urgente = p.estado === "pendiente" && !p.aceptado && esperaHoras >= HORAS_URGENTE_GESTION_NIVAN;

    const etiqueta = p.estado === "pendiente"
        ? (p.aceptado ? "✅ Aceptado" : "🆕 Nuevo")
        : `${est.icono} ${est.texto}`;

    const puntos = p.estado === "cancelado" ? "" : `<div class="puntosGestionNivan">${PASOS_GESTION_NIVAN.map(function(paso, i) {
        return `<span class="puntoGestionNivan ${i <= indice ? "activo" : ""}" title="${ESTADOS_PEDIDO_NIVAN[paso].texto}"></span>`;
    }).join("")}</div>`;

    const items = (p.items || []).map(function(it) {
        const img = obtenerImagenItemPedidoNivan(it);
        const foto = img
            ? `<img src="${escaparHTMLNivan(urlImagenNivan(img))}"${atributosImagenNivan()} alt="">`
            : `<div class="itemPedidoNivanSinFoto">👕</div>`;
        const opciones = [];
        if (it.talle) opciones.push("Talle " + escaparHTMLNivan(it.talle));
        if (it.color) opciones.push("Color " + escaparHTMLNivan(String(it.color).toUpperCase()));

        return `
            <div class="itemPedidoNivan">
                ${foto}
                <div class="textoItemPedidoNivan">
                    <strong>${escaparHTMLNivan(it.nombre)}</strong>
                    ${opciones.length ? `<p>${opciones.join(" · ")}</p>` : ""}
                    <p>${it.cantidad > 1 ? it.cantidad + " × " : ""}${simboloMonedaNivan(p.pais)}${formatearDineroNivan(it.precioUnitario)}</p>
                </div>
            </div>
        `;
    }).join("");

    const seguimiento = textoSeguimientoPedidoNivan(p);
    const cancelacion = p.estado === "cancelado" && p.cancelacion && p.cancelacion.motivo
        ? `<span>🚫 ${escaparHTMLNivan(p.cancelacion.motivo)}</span>` : "";

    return `
        <div class="tarjetaPedidoNivan tarjetaGestionNivan ${urgente ? "urgenteGestionNivan" : ""}">
            <div class="cabeceraPedidoNivan">
                <div>
                    <strong>Pedido ${id}</strong>
                    <small>${escaparHTMLNivan(p.compradorNombre)} · ${tiempoTranscurridoGestionNivan(p.fecha)}${urgente ? " · ⏰ esperando" : ""}</small>
                </div>
                <span class="estadoPedidoNivan ${escaparHTMLNivan(p.estado)}">${etiqueta}</span>
            </div>
            ${puntos}
            ${items}
            <div class="datosPedidoNivan">
                <span>📍 ${escaparHTMLNivan(p.ciudad)} · 🚚 ${escaparHTMLNivan(p.envio)} · 💳 ${escaparHTMLNivan(p.pago)}</span>
                ${seguimiento}
                ${cancelacion}
            </div>
            <div class="totalPedidoNivan"><span>Total</span><span>${simboloMonedaNivan(p.pais)}${formatearDineroNivan(p.total)}</span></div>
            ${accionesGestionNivan(p)}
        </div>
    `;
}

// ---- Cambios de estado ----

function notificarCompradorGestionNivan(p, icono, titulo, texto) {
    if (!p.compradorId) return;
    crearNotificacion(p.compradorId, {
        tipo: "pedidoEstado",
        icono: icono,
        titulo: titulo,
        texto: texto,
        pedidoId: p.id
    });
}

function refrescarTrasGestionNivan() {
    renderizarGestionNivan();
    if (typeof renderizarMisVentas === "function") renderizarMisVentas();
    if (typeof renderizarMisCompras === "function") renderizarMisCompras();
}

function accionGestionNivan(idPedido, accion) {
    if (!usuarioActual) return;

    if (accion === "comprador") { abrirCompradorGestionNivan(idPedido); return; }
    if (accion === "chat") { abrirChatDePedidoNivan(idPedido); return; }
    if (accion === "despachar") { abrirDespacharGestionNivan(idPedido); return; }
    if (accion === "cancelar") { abrirCancelarGestionNivan(idPedido); return; }

    const pedidos = obtenerPedidosNivan();
    const p = pedidos.find(function(x) { return x.id === idPedido; });
    if (!p || p.vendedorId !== usuarioActual.id) return;

    const ahora = Date.now();
    p.historial = p.historial || [];
    let aviso = "";

    if (accion === "aceptar" && p.estado === "pendiente" && !p.aceptado) {
        p.aceptado = ahora;
        p.historial.push({ estado: "pendiente", fecha: ahora, aceptado: true });
        notificarCompradorGestionNivan(p, "✅", "Aceptaron tu pedido", `${p.vendedorNombre} aceptó el pedido ${p.id}`);
        aviso = "Pedido aceptado";
    } else if (accion === "preparar" && p.estado === "pendiente" && p.aceptado) {
        p.estado = "preparando";
        p.historial.push({ estado: "preparando", fecha: ahora });
        notificarCompradorGestionNivan(p, "🧵", "Están preparando tu pedido", `${p.vendedorNombre} está preparando el pedido ${p.id}`);
        aviso = "Pasó a Preparando";
    } else if (accion === "listo" && p.estado === "preparando") {
        p.estado = "listo";
        p.historial.push({ estado: "listo", fecha: ahora });
        notificarCompradorGestionNivan(p, "📦", "Tu pedido está listo", `El pedido ${p.id} está listo para despachar`);
        aviso = "Pasó a Listos";
    } else if (accion === "atras" && (p.estado === "preparando" || p.estado === "listo")) {
        p.estado = p.estado === "listo" ? "preparando" : "pendiente";
        p.historial.push({ estado: p.estado, fecha: ahora, atras: true });
        aviso = p.estado === "preparando" ? "Volvió a Preparando" : "Volvió a Nuevos";
    } else {
        return;
    }

    guardarPedidosNivan(pedidos);
    refrescarTrasGestionNivan();
    mostrarToastNivan(aviso);
}

// ---- Ventanas (despachar, cancelar, ver comprador) ----

function abrirVentanaGestionNivan(html) {
    let overlay = document.getElementById("overlayGestionNivan");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "overlayCalifNivan";
        overlay.id = "overlayGestionNivan";
        overlay.addEventListener("click", function(e) { if (e.target === overlay) cerrarVentanaGestionNivan(); });
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `<div class="cajaCalifNivan">${html}</div>`;
    overlay.classList.add("abierto");
}

function cerrarVentanaGestionNivan() {
    const overlay = document.getElementById("overlayGestionNivan");
    if (overlay) overlay.classList.remove("abierto");
}

function pedidoDelVendedorGestionNivan(idPedido) {
    const p = obtenerPedidosNivan().find(function(x) { return x.id === idPedido; });
    return (p && usuarioActual && p.vendedorId === usuarioActual.id) ? p : null;
}

function abrirDespacharGestionNivan(idPedido) {
    const p = pedidoDelVendedorGestionNivan(idPedido);
    if (!p || p.estado !== "listo") return;

    const id = escaparHTMLNivan(p.id);
    abrirVentanaGestionNivan(`
        <h3>Despachar pedido</h3>
        <p class="subCalifNivan">Pedido ${id} · ${escaparHTMLNivan(p.envio)}</p>
        <input type="text" id="empresaGestionNivan" class="campoGestionNivan" maxlength="30" placeholder="Empresa de envío (opcional)">
        <input type="text" id="codigoGestionNivan" class="campoGestionNivan" maxlength="40" placeholder="Código de seguimiento (opcional)">
        <div class="botonesCalifNivan">
            <button type="button" class="cancelar" onclick="cerrarVentanaGestionNivan()">Cancelar</button>
            <button type="button" class="enviar" onclick="confirmarDespachoGestionNivan('${id}')">🚚 Despachar</button>
        </div>
    `);
}

function confirmarDespachoGestionNivan(idPedido) {
    const pedidos = obtenerPedidosNivan();
    const p = pedidos.find(function(x) { return x.id === idPedido; });
    if (!p || p.vendedorId !== usuarioActual.id || p.estado !== "listo") {
        cerrarVentanaGestionNivan();
        return;
    }

    const empresa = document.getElementById("empresaGestionNivan").value.trim().slice(0, 30);
    const codigo = document.getElementById("codigoGestionNivan").value.trim().slice(0, 40);
    if (empresa || codigo) p.seguimiento = { empresa: empresa, codigo: codigo };
    guardarPedidosNivan(pedidos);

    // La notificación y el cambio a "enviado" son los mismos que usa Mis ventas.
    cambiarEstadoPedidoNivan(idPedido, "enviado");

    cerrarVentanaGestionNivan();
    refrescarTrasGestionNivan();
    mostrarToastNivan("Pedido despachado");
}

function abrirCancelarGestionNivan(idPedido) {
    const p = pedidoDelVendedorGestionNivan(idPedido);
    if (!p || ["pendiente", "preparando", "listo"].indexOf(p.estado) === -1) return;

    const id = escaparHTMLNivan(p.id);
    const rechazo = p.estado === "pendiente" && !p.aceptado;
    abrirVentanaGestionNivan(`
        <h3>${rechazo ? "Rechazar pedido" : "Cancelar pedido"}</h3>
        <p class="subCalifNivan">Pedido ${id} · se le avisa al comprador.</p>
        <select id="motivoGestionNivan" class="campoGestionNivan">
            ${MOTIVOS_CANCELACION_NIVAN.map(function(m) { return `<option>${escaparHTMLNivan(m)}</option>`; }).join("")}
        </select>
        <textarea id="comentarioGestionNivan" class="campoGestionNivan" maxlength="200" placeholder="Comentario (opcional)"></textarea>
        <div class="botonesCalifNivan">
            <button type="button" class="cancelar" onclick="cerrarVentanaGestionNivan()">Volver</button>
            <button type="button" class="enviar" onclick="confirmarCancelacionGestionNivan('${id}')">${rechazo ? "Rechazar" : "Cancelar pedido"}</button>
        </div>
    `);
}

function confirmarCancelacionGestionNivan(idPedido) {
    const pedidos = obtenerPedidosNivan();
    const p = pedidos.find(function(x) { return x.id === idPedido; });
    if (!p || p.vendedorId !== usuarioActual.id || ["pendiente", "preparando", "listo"].indexOf(p.estado) === -1) {
        cerrarVentanaGestionNivan();
        return;
    }

    const motivo = document.getElementById("motivoGestionNivan").value;
    const ahora = Date.now();
    p.estado = "cancelado";
    p.cancelacion = {
        motivo: MOTIVOS_CANCELACION_NIVAN.indexOf(motivo) !== -1 ? motivo : "Otro motivo",
        comentario: document.getElementById("comentarioGestionNivan").value.trim().slice(0, 200),
        fecha: ahora
    };
    p.historial = p.historial || [];
    p.historial.push({ estado: "cancelado", fecha: ahora });
    guardarPedidosNivan(pedidos);

    notificarCompradorGestionNivan(p, "🚫", "Cancelaron tu pedido", `Pedido ${p.id}: ${p.cancelacion.motivo}`);

    cerrarVentanaGestionNivan();
    refrescarTrasGestionNivan();
    mostrarToastNivan("Pedido cancelado");
}

function abrirCompradorGestionNivan(idPedido) {
    const p = pedidoDelVendedorGestionNivan(idPedido);
    if (!p) return;

    const u = p.compradorId ? obtenerUsuarioPorIdNivan(p.compradorId) : null;
    const id = escaparHTMLNivan(p.id);
    const direccionCompleta = [p.direccion, p.ciudad, p.codigoPostal ? "CP " + p.codigoPostal : ""].filter(Boolean).join(", ");

    // Historial de este comprador con vos.
    const anteriores = obtenerPedidosNivan().filter(function(x) {
        return x.vendedorId === usuarioActual.id && x.id !== p.id &&
            ((p.compradorId && x.compradorId === p.compradorId) || (!p.compradorId && p.compradorEmail && x.compradorEmail === p.compradorEmail));
    });
    const entregadas = anteriores.filter(function(x) { return x.estado === "entregado"; });
    const historial = anteriores.length
        ? `${anteriores.length} pedido${anteriores.length === 1 ? "" : "s" } anterior${anteriores.length === 1 ? "" : "es"} · ${entregadas.length} entregado${entregadas.length === 1 ? "" : "s"}`
        : "Primera compra en tu tienda";

    const puedePerfil = !!(u && !hayBloqueoEntreNivan(usuarioActual.id, u.id));
    const telefono = p.compradorTelefono ? escaparHTMLNivan(p.compradorTelefono) : "";
    const telefonoLink = telefono.replace(/[^\d+]/g, "");

    abrirVentanaGestionNivan(`
        <h3>👤 ${escaparHTMLNivan(p.compradorNombre)}</h3>
        <p class="subCalifNivan">${historial}</p>
        <div class="datosCompradorGestionNivan">
            ${p.compradorEmail ? `<span>✉️ <a href="mailto:${escaparHTMLNivan(p.compradorEmail)}">${escaparHTMLNivan(p.compradorEmail)}</a></span>` : ""}
            ${telefono ? `<span>📞 ${telefonoLink ? `<a href="tel:${telefonoLink}">${telefono}</a>` : telefono}</span>` : ""}
            <span>📍 ${escaparHTMLNivan(direccionCompleta)}</span>
            <span>🚚 ${escaparHTMLNivan(p.envio)} · 💳 ${escaparHTMLNivan(p.pago)}</span>
            <span>🧾 Pedido ${id}</span>
        </div>
        <div class="filaBotonesGestionNivan">
            <button type="button" class="botonGestionNivan" onclick="copiarDireccionGestionNivan('${id}')">📋 Copiar dirección</button>
            ${(p.vendedorId && p.compradorId) ? `<button type="button" class="botonGestionNivan" onclick="cerrarVentanaGestionNivan(); abrirChatDePedidoNivan('${id}')">💬 Chat</button>` : ""}
            ${puedePerfil ? `<button type="button" class="botonGestionNivan" onclick="cerrarVentanaGestionNivan(); abrirPerfilPersonalNivan('${escaparHTMLNivan(u.id)}', true)">👤 Ver perfil</button>` : ""}
        </div>
        <div class="botonesCalifNivan">
            <button type="button" class="cancelar" onclick="cerrarVentanaGestionNivan()">Cerrar</button>
        </div>
    `);
}

function copiarDireccionGestionNivan(idPedido) {
    const p = pedidoDelVendedorGestionNivan(idPedido);
    if (!p) return;

    const texto = [p.compradorNombre, p.direccion, p.ciudad, p.codigoPostal ? "CP " + p.codigoPostal : "", p.compradorTelefono]
        .filter(Boolean).join("\n");

    function listo() { mostrarToastNivan("Dirección copiada"); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(listo, function() { copiarTextoRespaldoGestionNivan(texto, listo); });
    } else {
        copiarTextoRespaldoGestionNivan(texto, listo);
    }
}

function copiarTextoRespaldoGestionNivan(texto, alTerminar) {
    const area = document.createElement("textarea");
    area.value = texto;
    area.className = "copiarOcultoGestionNivan";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); alTerminar(); } catch (e) {}
    area.remove();
}

// ---- Contador de pedidos nuevos en el Panel de Vendedor (lo llama irAVender) ----

function actualizarBadgeGestionNivan() {
    const badge = document.getElementById("badgeGestionNivan");
    if (!badge) return;

    const nuevos = obtenerPedidosGestionNivan().filter(function(p) { return p.estado === "pendiente" && !p.aceptado; }).length;
    badge.textContent = nuevos;
    badge.hidden = !nuevos;
}

// Que el buscador de Configuración también lo encuentre.
if (typeof BUSCADOR_CONFIG_NIVAN !== "undefined") {
    BUSCADOR_CONFIG_NIVAN.push({
        texto: "Gestión de pedidos",
        ruta: "Panel de Vendedor",
        accion: function () { abrirGestionPedidosNivan(); }
    });
}
