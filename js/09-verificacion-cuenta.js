// ==============================
// ESTADO DE VERIFICACIÓN (documento de identidad: DNI en Argentina, cédula en Uruguay)
// ==============================
// usuario.verificacion = { estado: "pendiente"|"aprobada"|"rechazada", enviada, revisada, motivo }
// Las fotos se guardan aparte y se BORRAN apenas se revisa la solicitud.
// No se pide ni se guarda el número del documento.
// Hasta que haya un panel de moderación, la revisión se hace con
// revisarVerificacionNivan(idUsuario, "aprobada" | "rechazada", motivo).

const CLAVE_FOTOS_VERIFICACION_NIVAN = "nivanVerificacionFotos";
const FOTOS_VERIFICACION_NIVAN = [
    { clave: "dniFrente", titulo: nombreDocumentoNivan(true) + " (frente)" },
    { clave: "dniDorso", titulo: nombreDocumentoNivan(true) + " (dorso)" },
    { clave: "rostro", titulo: "Biometría facial (selfie de tu rostro)" }
];
let fotosVerifNuevasNivan = {};
let fotosRegistroNivan = {};

function obtenerFotosVerificacionNivan() {
    const o = leerJSONNivan(CLAVE_FOTOS_VERIFICACION_NIVAN, {});
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
}

// Puede PUBLICAR: aprobada, o con la biometría facial aprobada por la app
// (el estado sigue "pendiente" hasta que una persona lo revise).
// Comprar no pasa por acá: se puede comprar aunque la identidad no esté aprobada.
function usuarioPuedeComprarNivan(idUsuario) {
    const u = idUsuario ? obtenerUsuarioPorIdNivan(idUsuario) : null;
    const v = u && u.verificacion;
    return !!(v && v.estado === "aprobada");
}

// Reclamos, devoluciones, reembolsos, calificaciones y comentarios: solo con la
// identidad aprobada por una persona. Pendiente, rechazada o sin verificar: bloqueado.
function usuarioPuedeReclamarNivan(idUsuario) {
    const u = idUsuario ? obtenerUsuarioPorIdNivan(idUsuario) : null;
    const v = u && u.verificacion;
    return !!(v && v.estado === "aprobada" && !v.bloqueoReclamos);
}

function usuarioComproNivan(idUsuario, idProducto) {
    return obtenerPedidosNivan().some(function(p) {
        return p.compradorId === idUsuario && (idProducto == null || (p.items || []).some(function(it) { return String(it.id) === String(idProducto); }));
    });
}

function exigirPuedeReclamarNivan() {
    if (!usuarioActual || usuarioPuedeReclamarNivan(usuarioActual.id)) return true;

    const u = obtenerUsuarioPorIdNivan(usuarioActual.id) || {};
    const estado = u.verificacion ? u.verificacion.estado : "ninguna";

    if (estado === "pendiente") {
        alert("Tu " + nombreDocumentoNivan() + " todavía está pendiente de revisión.");
        return false;
    }

    alert(estado === "rechazada"
        ? "Tu verificación fue rechazada. Volvé a enviarla."
        : "Cargá tu " + nombreDocumentoNivan() + " para continuar.");
    abrirEstadoVerificacionNivan();
    return false;
}
// Para comprar alcanza con tener la sesión iniciada: la identidad puede estar pendiente.
function exigirSesionParaComprarNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión para continuar.");
        abrirCuenta();
        return false;
    }
    if (usuarioPuedeComprarNivan(usuarioActual.id)) return true;

    const u = obtenerUsuarioPorIdNivan(usuarioActual.id) || {};
    if (u.verificacion && u.verificacion.estado === "pendiente") {
        alert("Tu " + nombreDocumentoNivan() + " está pendiente de revisión. Todavía no podés comprar.");
        return false;
    }

    alert("Para comprar tenés que cargar tu " + nombreDocumentoNivan() + ".");
    abrirEstadoVerificacionNivan();
    return false;
}

// ----- Reconocimiento facial (face-api, se descarga recién al verificar) -----
const UMBRAL_ROSTRO_NIVAN = 0.55; // distancia máxima para ser la misma persona (más bajo = más estricto)
const URL_FACEAPI_NIVAN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js";
const URL_MODELOS_FACEAPI_NIVAN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/";
let modelosRostroNivan = null;

function cargarScriptNivan(src) {
    return new Promise(function(ok, mal) {
        const el = document.createElement("script");
        el.src = src;
        el.onload = ok;
        el.onerror = function() { mal(new Error("script")); };
        document.head.appendChild(el);
    });
}

function prepararModelosRostroNivan() {
    if (!modelosRostroNivan) {
        modelosRostroNivan = (async function() {
            if (!window.faceapi) await cargarScriptNivan(URL_FACEAPI_NIVAN);
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(URL_MODELOS_FACEAPI_NIVAN),
                faceapi.nets.faceLandmark68Net.loadFromUri(URL_MODELOS_FACEAPI_NIVAN),
                faceapi.nets.faceRecognitionNet.loadFromUri(URL_MODELOS_FACEAPI_NIVAN)
            ]);
        })();
        modelosRostroNivan.catch(function() { modelosRostroNivan = null; });
    }
    return modelosRostroNivan;
}

function imagenDesdeDataUrlNivan(src) {
    return new Promise(function(ok, mal) {
        const img = new Image();
        img.onload = function() { ok(img); };
        img.onerror = function() { mal(new Error("imagen")); };
        img.src = src;
    });
}

async function descriptorRostroNivan(dataUrl) {
    const img = await imagenDesdeDataUrlNivan(dataUrl);
    const r = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
        .withFaceLandmarks().withFaceDescriptor();
    return r ? r.descriptor : null;
}

// resultado: "coincide" | "no_coincide" | "sin_rostro_dni" | "sin_rostro_selfie" | "no_disponible"
async function compararRostroConDniNivan(fotoDni, fotoSelfie) {
    try { await prepararModelosRostroNivan(); } catch (e) { return { resultado: "no_disponible" }; }
    try {
        const dDni = await descriptorRostroNivan(fotoDni);
        if (!dDni) return { resultado: "sin_rostro_dni" };
        const dSelfie = await descriptorRostroNivan(fotoSelfie);
        if (!dSelfie) return { resultado: "sin_rostro_selfie" };
        const distancia = faceapi.euclideanDistance(dDni, dSelfie);
        return { resultado: distancia <= UMBRAL_ROSTRO_NIVAN ? "coincide" : "no_coincide" };
    } catch (e) {
        return { resultado: "no_disponible" };
    }
}

// Analiza las fotos. { ok:true, verificacion, sinAnalisis? } o { ok:false, mensaje, repetir:[claves] }
async function evaluarVerificacionNivan(fotos, previa) {
    const analisis = await compararRostroConDniNivan(fotos.dniFrente, fotos.rostro);
    const base = { estado: "pendiente", enviada: Date.now(), bloqueoReclamos: !!(previa && previa.bloqueoReclamos) };

    if (analisis.resultado === "coincide") {
        return { ok: true, verificacion: Object.assign(base, { biometria: "aprobada" }) };
    }
    if (analisis.resultado === "no_disponible") {
        return { ok: true, sinAnalisis: true, verificacion: base };
    }
    if (analisis.resultado === "sin_rostro_dni") {
        return { ok: false, mensaje: "No se ve con claridad la cara en la foto de tu " + nombreDocumentoNivan() + " (frente). Volvé a subirla.", repetir: ["dniFrente"] };
    }
    if (analisis.resultado === "sin_rostro_selfie") {
        return { ok: false, mensaje: "No pudimos ver tu rostro con claridad. Repetí la biometría facial.", repetir: ["rostro"] };
    }
    return { ok: false, mensaje: "Tu rostro no coincide con el de tu " + nombreDocumentoNivan() + ". Repetí la biometría facial.", repetir: ["rostro"] };
}

function guardarFotosVerificacionDeNivan(idUsuario, fotos) {
    try {
        const todas = obtenerFotosVerificacionNivan();
        todas[idUsuario] = Object.assign({}, fotos);
        localStorage.setItem(CLAVE_FOTOS_VERIFICACION_NIVAN, JSON.stringify(todas));
        return true;
    } catch (e) {
        return false;
    }
}

async function elegirFotoRegistroNivan(clave, input) {
    const aviso = document.getElementById("okFotoReg_" + clave);
    if (!input.files || !input.files[0]) {
        delete fotosRegistroNivan[clave];
        if (aviso) aviso.textContent = "";
        return;
    }
    if (!/^image\//.test(input.files[0].type)) {
        alert("Elegí una imagen.");
        input.value = "";
        return;
    }
    try {
        fotosRegistroNivan[clave] = await comprimirImagenADataURLNivan(input.files[0]);
        if (aviso) aviso.textContent = "✓ Foto cargada";
    } catch (e) {
        delete fotosRegistroNivan[clave];
        input.value = "";
        if (aviso) aviso.textContent = "";
        alert("No se pudo leer esa imagen. Probá con otra.");
    }
}

function limpiarFotoNivan(idInput, idAviso, almacen, clave) {
    const input = document.getElementById(idInput);
    if (input) input.value = "";
    delete almacen[clave];
    const aviso = document.getElementById(idAviso);
    if (aviso) aviso.textContent = "";
}
function exigirVerificacionNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión para continuar.");
        abrirCuenta();
        return false;
    }
    if (usuarioPuedeComprarNivan(usuarioActual.id)) return true;

    const u = obtenerUsuarioPorIdNivan(usuarioActual.id) || {};
    if (u.verificacion && u.verificacion.estado === "pendiente") {
        alert("Tu identidad está pendiente de revisión. Cuando se apruebe vas a poder publicar.");
        return false;
    }

    alert("Para continuar tenés que verificar tu identidad.");
    abrirEstadoVerificacionNivan();
    return false;
}

// Achica la foto antes de guardarla (máx. 900 px, JPEG).
function comprimirImagenADataURLNivan(archivo) {
    return new Promise(function(resolve, reject) {
        const url = URL.createObjectURL(archivo);
        const img = new Image();
        img.onload = function() {
            const escala = Math.min(1, 900 / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(img.width * escala));
            c.height = Math.max(1, Math.round(img.height * escala));
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL("image/jpeg", 0.6));
        };
        img.onerror = function() { URL.revokeObjectURL(url); reject(new Error("imagen")); };
        img.src = url;
    });
}

function abrirEstadoVerificacionNivan() {
    if (!usuarioActual) {
        abrirPerfilLateral();
        alert("Iniciá sesión para ver el estado de tu verificación.");
        return;
    }

    const u = obtenerUsuarioPorIdNivan(usuarioActual.id) || {};
    const v = u.verificacion || null;
    const estado = v ? v.estado : "ninguna";
    let cuerpo = "";

    const formulario = `
        <p class="subTextoPerfilLateral">Subí 3 fotos claras y con buena luz. Las usamos solo para confirmar que sos vos.</p>
        ${FOTOS_VERIFICACION_NIVAN.map(function(f) {
            return `<div class="campoFotoVerifNivan">
                <label>${escaparHTMLNivan(f.titulo)}</label>
                <input type="file" id="fotoVerif_${f.clave}" accept="image/*"${f.clave === "rostro" ? ' capture="user"' : ''} onchange="elegirFotoVerificacionNivan('${f.clave}', this)">
                <span class="okFotoNivan" id="okFoto_${f.clave}"></span>
            </div>`;
        }).join("")}
        <button type="button" class="botonAgregarGuardadoNivan" style="margin-top:14px;" id="botonEnviarVerifNivan" onclick="enviarVerificacionNivan()">Enviar para revisión</button>
    `;

    if (estado === "aprobada") {
        cuerpo = `<div class="estadoVerificacionNivan aprobadaNivan"><strong>✅ Verificada</strong><br><span>Revisada el ${escaparHTMLNivan(formatearFechaLoginNivan(v.revisada))}. </span></div>`;
    } else if (estado === "pendiente") {
                cuerpo = `<div class="estadoVerificacionNivan pendienteNivan"><strong>⏳ Pendiente de revisión</strong><br><span>La enviaste el ${escaparHTMLNivan(formatearFechaLoginNivan(v.enviada))}. Te avisamos cuando esté revisada.</span></div>`;
    } else if (estado === "rechazada") {
                cuerpo = `<div class="estadoVerificacionNivan rechazadaNivan"><strong>❌ Rechazada</strong><br><span>Motivo: ${escaparHTMLNivan(v.motivo || "las fotos no se pudieron validar")}. Volvé a cargarlo para poder comprar.</span></div>
            <h3 class="subtituloSoporteNivan">Enviar de nuevo</h3>${formulario}`;
    } else {
                cuerpo = `<div class="estadoVerificacionNivan"><strong>Sin verificar</strong><br><span>Mientras no cargues tu ${nombreDocumentoNivan()} no vas a poder comprar. Podés cargarlo ahora o más tarde.</span></div>${formulario}`;
    }
    fotosVerifNuevasNivan = {};
    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="cerrarPrivacidadSeguridadNivan(); abrirPerfilLateral();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">✅ Estado de verificación</h2>
        </div>
        <p class="subTextoPerfilLateral"><strong>¿Para qué sirve?</strong> Confirma que sos una persona real. Hace falta para comprar y publicar, y mantiene a NIVAN libre de cuentas falsas. Acá ves si tu ${nombreDocumentoNivan()} está pendiente, aprobado o rechazado.</p>
        ${cuerpo}
        ${estado === "pendiente" ? htmlRevisionTemporalNivan() /* TEMPORAL */ : ""}
    `);
}

async function elegirFotoVerificacionNivan(clave, input) {
    const aviso = document.getElementById("okFoto_" + clave);
    if (!input.files || !input.files[0]) {
        delete fotosVerifNuevasNivan[clave];
        if (aviso) aviso.textContent = "";
        return;
    }

    if (!/^image\//.test(input.files[0].type)) {
        alert("Elegí una imagen.");
        input.value = "";
        return;
    }

    try {
        fotosVerifNuevasNivan[clave] = await comprimirImagenADataURLNivan(input.files[0]);
        if (aviso) aviso.textContent = "✓ Foto cargada";
    } catch (e) {
        delete fotosVerifNuevasNivan[clave];
        input.value = "";
        if (aviso) aviso.textContent = "";
        alert("No se pudo leer esa imagen. Probá con otra.");
    }
}

async function enviarVerificacionNivan() {
    if (!usuarioActual) return;

    const faltan = FOTOS_VERIFICACION_NIVAN.filter(function(f) { return !fotosVerifNuevasNivan[f.clave]; });
    if (faltan.length) {
        alert("Falta: " + faltan.map(function(f) { return f.titulo; }).join(", ") + ".");
        return;
    }

    const idUsuario = usuarioActual.id;
    const fotos = Object.assign({}, fotosVerifNuevasNivan);
    const boton = document.getElementById("botonEnviarVerifNivan");
    if (boton) { boton.disabled = true; boton.textContent = "Analizando…"; }

    const previa = (obtenerUsuarioPorIdNivan(idUsuario) || {}).verificacion || null;
    const evaluacion = await evaluarVerificacionNivan(fotos, previa);
    if (!usuarioActual || usuarioActual.id !== idUsuario) return;

    if (boton) { boton.disabled = false; boton.textContent = "Enviar para revisión"; }

    if (!evaluacion.ok) {
        alert(evaluacion.mensaje);
        evaluacion.repetir.forEach(function(clave) {
            limpiarFotoNivan("fotoVerif_" + clave, "okFoto_" + clave, fotosVerifNuevasNivan, clave);
        });
        return;
    }

    if (!guardarFotosVerificacionDeNivan(idUsuario, fotos)) {
        alert("No se pudieron guardar las fotos: el almacenamiento del dispositivo está lleno.");
        return;
    }

    actualizarUsuarioListaNivan(idUsuario, { verificacion: evaluacion.verificacion });
    fotosVerifNuevasNivan = {};
    if (evaluacion.sinAnalisis) alert("Recibimos tus fotos: quedaron pendientes de revisión.");
    abrirEstadoVerificacionNivan();
}

function fotosVerificacionDeNivan(idUsuario) {
    return obtenerFotosVerificacionNivan()[idUsuario] || null;
}

function revisarVerificacionNivan(idUsuario, resultado, motivo) {
    if (resultado !== "aprobada" && resultado !== "rechazada") return false;
    const u = obtenerUsuarioPorIdNivan(idUsuario);
    if (!u || !u.verificacion || u.verificacion.estado !== "pendiente") return false;

    actualizarUsuarioListaNivan(idUsuario, {
        verificacion: { estado: resultado, enviada: u.verificacion.enviada, revisada: Date.now(), motivo: resultado === "rechazada" ? String(motivo || "").slice(0, 120) : "", bloqueoReclamos: resultado === "rechazada" }
    });

    const todas = obtenerFotosVerificacionNivan();
    delete todas[idUsuario];
    guardarJSONNivan(CLAVE_FOTOS_VERIFICACION_NIVAN, todas);

    crearNotificacion(idUsuario, {
        tipo: "verificacion",
        icono: resultado === "aprobada" ? "✅" : "❌",
        titulo: resultado === "aprobada" ? "Identidad verificada" : "Verificación rechazada",
        texto: resultado === "aprobada" ? "Tu identidad quedó verificada." : "Volvé a cargar tus fotos desde Privacidad y seguridad. Hasta que se apruebe no vas a poder hacer reclamos (devolución, reembolso) ni dejar comentarios sobre lo que compraste."
    });
    return true;
}

// ===== TEMPORAL: BORRAR CUANDO HAYA BACKEND (aceptar/rechazar la verificación desde la app) =====
// También borrá la línea marcada con /* TEMPORAL */ en abrirEstadoVerificacionNivan.
function htmlRevisionTemporalNivan() {
    if (!usuarioActual) return "";
    const f = fotosVerificacionDeNivan(usuarioActual.id) || {};
    const fotos = FOTOS_VERIFICACION_NIVAN.map(function(x) {
        return f[x.clave] ? `<img src="${f[x.clave]}" alt="${escaparHTMLNivan(x.titulo)}" style="width:32%;border-radius:8px;">` : "";
    }).join("");
    return `<div class="estadoVerificacionNivan" style="border-style:dashed;margin-top:16px;">
        <strong>🛠️ Revisión (temporal)</strong>
        <div style="display:flex;gap:6px;margin-top:8px;">${fotos}</div>
        <div style="display:flex;gap:8px;margin-top:10px;">
            <button type="button" class="botonAgregarGuardadoNivan" onclick="aprobarVerificacionTemporalNivan()">Aceptar</button>
            <button type="button" class="botonAgregarGuardadoNivan zonaPeligroNivan" onclick="rechazarVerificacionTemporalNivan()">Rechazar</button>
        </div>
    </div>`;
}

function aprobarVerificacionTemporalNivan() {
    if (!usuarioActual) return;
    revisarVerificacionNivan(usuarioActual.id, "aprobada");
    abrirEstadoVerificacionNivan();
}

function rechazarVerificacionTemporalNivan() {
    if (!usuarioActual) return;
    const motivo = prompt("Motivo del rechazo:", "las fotos no se pueden validar");
    if (motivo === null) return;
    revisarVerificacionNivan(usuarioActual.id, "rechazada", motivo);
    abrirEstadoVerificacionNivan();
}
// ===== FIN TEMPORAL =====

// ==============================
// PERMISOS (ubicación, cámara y galería)
// ==============================
// El navegador es quien guarda los permisos: NIVAN puede mostrarte el estado
// y pedirlos, pero para quitarlos hay que hacerlo en los ajustes del sitio.

async function estadoPermisoNavegadorNivan(nombre) {
    try {
        if (!navigator.permissions || !navigator.permissions.query) return "desconocido";
        return (await navigator.permissions.query({ name: nombre })).state;
    } catch (e) {
        return "desconocido";
    }
}

function textoEstadoPermisoNivan(estado) {
    if (estado === "granted") return { clase: "okNivan", texto: "Permitido" };
    if (estado === "denied") return { clase: "noNivan", texto: "Bloqueado" };
    if (estado === "prompt") return { clase: "askNivan", texto: "Sin decidir" };
    return { clase: "askNivan", texto: "No se puede consultar en este navegador" };
}

async function abrirPermisosNivan() {
    const ubicacion = await estadoPermisoNavegadorNivan("geolocation");
    const camara = await estadoPermisoNavegadorNivan("camera");

    const fila = function(icono, titulo, estado, tipo) {
        const t = textoEstadoPermisoNivan(estado);
        const boton = estado === "granted"
            ? ""
            : (estado === "denied" ? "" : `<button type="button" onclick="pedirPermisoNivan('${tipo}')">Permitir</button>`);
        return `<div class="filaPermisoNivan">
            <div class="datosPermisoNivan"><strong>${icono} ${titulo}</strong><span class="estadoPermisoNivan ${t.clase}">${t.texto}</span></div>
            ${boton}
        </div>`;
    };

    const ayuda = (ubicacion === "granted" || ubicacion === "denied" || camara === "granted" || camara === "denied")
        ? `<p class="subTextoPerfilLateral" style="margin-top:14px;">Para cambiar un permiso que ya decidiste, tocá el candado (o el ícono de ajustes) al lado de la dirección del sitio en tu navegador y modificalo ahí.</p>`
        : "";

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">📍 Permisos</h2>
            <p class="subTextoPerfilLateral">Lo que NIVAN puede usar de tu dispositivo.</p>
        </div>
        ${fila("📍", "Ubicación", ubicacion, "ubicacion")}
        ${fila("📷", "Cámara", camara, "camara")}
        <div class="filaPermisoNivan">
            <div class="datosPermisoNivan"><strong>🖼️ Galería</strong><span>No requiere permiso: solo accedemos a las fotos y videos que vos elegís al publicar o verificarte.</span></div>
        </div>
        ${ayuda}
    `);
}

async function pedirPermisoNivan(tipo) {
    try {
        if (tipo === "ubicacion") {
            if (!navigator.geolocation) throw new Error("sin soporte");
            await new Promise(function(resolve, reject) {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 600000 });
            });
        } else if (tipo === "camara") {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("sin soporte");
            const flujo = await navigator.mediaDevices.getUserMedia({ video: true });
            flujo.getTracks().forEach(function(t) { t.stop(); });
        }
    } catch (e) {
        if (!(e && (e.name === "NotAllowedError" || e.code === 1))) {
            alert("No se pudo pedir el permiso en este navegador o dispositivo.");
        }
    }
    abrirPermisosNivan();
}

// ==============================
// ELIMINAR / DESACTIVAR CUENTA
// ==============================
// Desactivar: reversible. Se oculta tu perfil y se pausan tus publicaciones
// hasta que vuelvas a iniciar sesión.
// Eliminar: queda programada y la cuenta se comporta como desactivada
// durante DIAS_GRACIA_ELIMINACION_NIVAN días; si volvés a iniciar sesión
// antes, se cancela. Pasado ese plazo se borran los datos.

const DIAS_GRACIA_ELIMINACION_NIVAN = 30;

function recargarAppNivan() { location.reload(); }

function cuentaInactivaNivan(idUsuario) {
    const u = idUsuario ? obtenerUsuarioPorIdNivan(idUsuario) : null;
    return !!(u && (u.desactivada || u.eliminacionProgramada));
}

function idsCuentasInactivasNivan() {
    const o = {};
    obtenerUsuariosNivan().forEach(function(u) { if (u.desactivada || u.eliminacionProgramada) o[u.id] = true; });
    return o;
}

function pedidosEnCursoNivan(idUsuario) {
    return obtenerPedidosNivan().filter(function(p) {
        return (p.vendedorId === idUsuario || p.compradorId === idUsuario) && p.estado !== "entregado" && p.estado !== "cancelado";
    }).length;
}

function cerrarSesionSilenciosaNivan() {
    if (usuarioActual) {
        const ses = obtenerSesionesActivasNivan();
        ses.forEach(function(x) { if (x.usuarioId === usuarioActual.id) x.revocada = true; });
        guardarSesionesActivasNivan(ses);
    }
    localStorage.removeItem("nivanSesionId");
    usuarioActual = null;
    localStorage.removeItem("nivanSesion");
    sincronizarFavoritosConCuentaNivan(true);
}

// Pide contraseña (y el código de 2 pasos si la cuenta lo tiene).
async function confirmarIdentidadNivan() {
    const pass = (document.getElementById("cuentaPassConfirmNivan") || {}).value || "";
    if (!pass) return { ok: false, mensaje: "Escribí tu contraseña." };
    if (!(await verificarPasswordActualNivan(pass))) return { ok: false, mensaje: "La contraseña es incorrecta." };

    const usuarios = obtenerUsuariosNivan();
    const i = usuarios.findIndex(function(x) { return x.id === usuarioActual.id; });
    if (i === -1) return { ok: false, mensaje: "No se encontró tu cuenta." };

    const dp = usuarios[i].dosPasos;
    if (dp && dp.activo) {
        const codigo = normalizarCodigoRespaldoNivan((document.getElementById("cuentaCodigo2FANivan") || {}).value);
        if (!codigo) return { ok: false, mensaje: "Escribí el código de tu app de autenticación." };

        if (/^\d{6}$/.test(codigo)) {
            const paso = await verificarTotpNivan(dp.secreto, codigo, dp.ultimoPaso);
            if (paso === null) return { ok: false, mensaje: "El código de 2 pasos es incorrecto." };
            dp.ultimoPaso = paso;
        } else if (codigo.length === 10) {
            const k = (dp.respaldo || []).indexOf(await hashPasswordNivan("NVB:" + codigo));
            if (k === -1) return { ok: false, mensaje: "El código de respaldo es incorrecto." };
            dp.respaldo.splice(k, 1);
        } else {
            return { ok: false, mensaje: "El código de 2 pasos es incorrecto." };
        }
        guardarUsuariosNivan(usuarios);
    }
    return { ok: true };
}

function camposConfirmacionCuentaNivan() {
    const u = obtenerUsuarioPorIdNivan(usuarioActual.id) || {};
    const con2FA = !!(u.dosPasos && u.dosPasos.activo);
    return `
        <div class="campoEditarPerfilLateral" style="margin-top:14px;">
            <label for="cuentaPassConfirmNivan">Tu contraseña</label>
            <input type="password" id="cuentaPassConfirmNivan" autocomplete="current-password" maxlength="128">
        </div>
        ${con2FA ? `<div class="campoEditarPerfilLateral">
            <label for="cuentaCodigo2FANivan">Código de 2 pasos (o de respaldo)</label>
            <input type="text" id="cuentaCodigo2FANivan" maxlength="12" autocomplete="one-time-code">
        </div>` : ""}
    `;
}

function abrirEliminarCuentaNivan() {
    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para administrar tu cuenta.");
        return;
    }

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🗑️ Eliminar / desactivar cuenta</h2>
            <p class="subTextoPerfilLateral">Elegí qué querés hacer con tu cuenta.</p>
        </div>
        <button type="button" class="opcionPrivacidadNivan" onclick="abrirDesactivarCuentaNivan()">
            ⏸️ Desactivar temporalmente
            <small>Ocultamos tu perfil y pausamos tus publicaciones. Volvés a iniciar sesión cuando quieras y todo queda como estaba.</small>
        </button>
        <button type="button" class="opcionPrivacidadNivan zonaPeligroNivan" onclick="abrirConfirmarEliminarNivan()">
            🗑️ Eliminar mi cuenta
            <small>Se borra definitivamente tras ${DIAS_GRACIA_ELIMINACION_NIVAN} días. Si iniciás sesión antes, se cancela.</small>
        </button>
    `);
}

function avisoPedidosEnCursoNivan() {
    const n = pedidosEnCursoNivan(usuarioActual.id);
    if (!n) return "";
    return `<div class="estadoVerificacionNivan rechazadaNivan"><strong>Tenés ${n} ${n === 1 ? "pedido en curso" : "pedidos en curso"}.</strong><br><span>Esperá a que se entreguen para poder desactivar o eliminar tu cuenta.</span></div>`;
}

function abrirDesactivarCuentaNivan() {
    if (!usuarioActual) return;
    const bloqueado = pedidosEnCursoNivan(usuarioActual.id) > 0;

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirEliminarCuentaNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">⏸️ Desactivar cuenta</h2>
        </div>
        <ul class="listaCuentaNivan">
            <li>Tu perfil deja de ser visible y nadie puede escribirte.</li>
            <li>Tus publicaciones desaparecen del catálogo.</li>
            <li>Cerramos tu sesión en todos los dispositivos.</li>
            <li>Para reactivarla, iniciá sesión de nuevo.</li>
        </ul>
        ${avisoPedidosEnCursoNivan()}
        ${bloqueado ? "" : camposConfirmacionCuentaNivan() + `<button type="button" class="botonAgregarGuardadoNivan" id="botonDesactivarCuentaNivan" onclick="desactivarCuentaNivan()">Desactivar mi cuenta</button>`}
    `);
}

async function desactivarCuentaNivan() {
    if (!usuarioActual || pedidosEnCursoNivan(usuarioActual.id) > 0) return;

    const boton = document.getElementById("botonDesactivarCuentaNivan");
    if (boton) boton.disabled = true;

    try {
        const r = await confirmarIdentidadNivan();
        if (!r.ok) { alert(r.mensaje); return; }
        if (!confirm("¿Desactivar tu cuenta? Vamos a cerrar tu sesión.")) return;

        const id = usuarioActual.id;
        actualizarUsuarioListaNivan(id, { desactivada: Date.now() });
        registrarEventoLoginNivan(id, "cuenta_desactivada");
        cerrarSesionSilenciosaNivan();
        cerrarPrivacidadSeguridadNivan();
        alert("Tu cuenta quedó desactivada. Iniciá sesión cuando quieras reactivarla.");
        recargarAppNivan();
    } finally {
        if (boton) boton.disabled = false;
    }
}

function abrirConfirmarEliminarNivan() {
    if (!usuarioActual) return;
    const bloqueado = pedidosEnCursoNivan(usuarioActual.id) > 0;

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirEliminarCuentaNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🗑️ Eliminar cuenta</h2>
        </div>
        <p class="subTextoPerfilLateral">Durante ${DIAS_GRACIA_ELIMINACION_NIVAN} días tu cuenta queda desactivada. Si no iniciás sesión en ese plazo, se borra definitivamente:</p>
        <ul class="listaCuentaNivan">
            <li>Tu perfil, foto y datos de la cuenta.</li>
            <li>Tus publicaciones.</li>
            <li>Tus chats y notificaciones.</li>
            <li>Direcciones, medios de pago y datos guardados.</li>
            <li>Tu historial de accesos y tus sesiones.</li>
        </ul>
        <p class="subTextoPerfilLateral">Los pedidos ya hechos se conservan en el historial de la otra persona.</p>
        ${avisoPedidosEnCursoNivan()}
        ${bloqueado ? "" : `
            ${camposConfirmacionCuentaNivan()}
            <div class="campoEditarPerfilLateral">
                <label for="cuentaTextoEliminarNivan">Escribí ELIMINAR para confirmar</label>
                <input type="text" id="cuentaTextoEliminarNivan" maxlength="10" autocomplete="off" autocapitalize="characters">
            </div>
            <button type="button" class="botonAgregarGuardadoNivan zonaPeligroNivan" id="botonEliminarCuentaNivan" onclick="programarEliminacionCuentaNivan()">Eliminar mi cuenta</button>`}
    `);
}

async function programarEliminacionCuentaNivan() {
    if (!usuarioActual || pedidosEnCursoNivan(usuarioActual.id) > 0) return;

    if ((document.getElementById("cuentaTextoEliminarNivan").value || "").trim().toUpperCase() !== "ELIMINAR") {
        alert("Escribí ELIMINAR para confirmar.");
        return;
    }

    const boton = document.getElementById("botonEliminarCuentaNivan");
    if (boton) boton.disabled = true;

    try {
        const r = await confirmarIdentidadNivan();
        if (!r.ok) { alert(r.mensaje); return; }
        if (!confirm("¿Seguro? Tu cuenta se va a borrar definitivamente en " + DIAS_GRACIA_ELIMINACION_NIVAN + " días.")) return;

        const id = usuarioActual.id;
        const fecha = Date.now() + DIAS_GRACIA_ELIMINACION_NIVAN * 24 * 60 * 60 * 1000;
        actualizarUsuarioListaNivan(id, { eliminacionProgramada: fecha });
        registrarEventoLoginNivan(id, "eliminacion_programada");
        cerrarSesionSilenciosaNivan();
        cerrarPrivacidadSeguridadNivan();
        alert("Tu cuenta se eliminará el " + new Date(fecha).toLocaleDateString("es-AR") + ". Si iniciás sesión antes, se cancela.");
        recargarAppNivan();
    } finally {
        if (boton) boton.disabled = false;
    }
}

// Borra de este dispositivo todo lo que pertenece a la cuenta.
function eliminarDatosUsuarioNivan(usuario) {
    if (!usuario || !usuario.id) return;
    const id = usuario.id;
    const email = usuario.email;

    try { guardarPublicacionesNivan(obtenerPublicacionesNivan().filter(function(pub) { return pub.vendedorId !== id; })); } catch (e) {}
    try { guardarChatsNivan(obtenerChatsNivan().filter(function(c) { return c.vendedorId !== id && c.compradorId !== id; })); } catch (e) {}

    try {
        const notif = obtenerTodasLasNotificaciones();
        delete notif[id];
        guardarTodasLasNotificaciones(notif);
    } catch (e) {}

    try {
        const bloq = obtenerBloqueadosNivan();
        delete bloq[id];
        Object.keys(bloq).forEach(function(k) {
            bloq[k] = (bloq[k] || []).filter(function(x) { return x !== id; });
        });
        localStorage.setItem("nivanUsuariosBloqueados", JSON.stringify(bloq));
    } catch (e) {}

    try {
        if (email) {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.indexOf("nivan") === 0 && k.slice(-(email.length + 1)) === "_" + email) localStorage.removeItem(k);
            }
        }
    } catch (e) {}

    try {
        const seguidos = leerJSONNivan("nivanPreciosSeguidos", {});
        delete seguidos[id];
        localStorage.setItem("nivanPreciosSeguidos", JSON.stringify(seguidos));
    } catch (e) {}

    try { localStorage.setItem(CLAVE_HISTORIAL_LOGIN_NIVAN, JSON.stringify(obtenerHistorialLoginNivan().filter(function(e) { return e.usuarioId !== id; }))); } catch (e) {}
    try { guardarSesionesActivasNivan(obtenerSesionesActivasNivan().filter(function(x) { return x.usuarioId !== id; })); } catch (e) {}
    try {
        const fotos = obtenerFotosVerificacionNivan();
        delete fotos[id];
        localStorage.setItem(CLAVE_FOTOS_VERIFICACION_NIVAN, JSON.stringify(fotos));
    } catch (e) {}

    guardarUsuariosNivan(obtenerUsuariosNivan().filter(function(u) { return u.id !== id; }));
}

// Corre al abrir la app: borra las cuentas cuyo plazo ya venció.
function purgarCuentasVencidasNivan() {
    try {
        const ahora = Date.now();
        obtenerUsuariosNivan()
            .filter(function(u) { return u.eliminacionProgramada && u.eliminacionProgramada <= ahora; })
            .forEach(eliminarDatosUsuarioNivan);
    } catch (e) {}
}
function abrirUsuariosBloqueadosNivan() {
    const contenido = document.getElementById("contenidoPrivacidadNivan");
    if (!contenido) return;

    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        return;
    }

    const usuarios = obtenerUsuariosNivan();
    const idsBloqueados = obtenerIdsBloqueadosPorMi();

    const filas = idsBloqueados.length
        ? idsBloqueados.map(function(id) {
            const u = usuarios.find(function(usr) { return usr.id === id; });
            const nombre = u ? obtenerNombreVendedorUsuario(u) : "Usuario";
            return `
                <div class="filaUsuarioBloqueadoNivan">
                    <span>${escaparHTMLNivan(nombre)}</span>
                    <button type="button" onclick="desbloquearUsuarioNivan('${escaparHTMLNivan(id)}')">Desbloquear</button>
                </div>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral">Todavía no bloqueaste a nadie.</p>`;

    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="cerrarPrivacidadSeguridadNivan(); abrirPerfilLateral();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🚫 Usuarios bloqueados</h2>
            <p class="subTextoPerfilLateral">No pueden chatear con vos ni ver tu perfil, y vos tampoco ves el de ellos.</p>
        </div>
        <div>${filas}</div>
    `;

    document.getElementById("panelPrivacidadNivan").classList.add("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.add("abierto");
}

function cambiarVistaPerfilLateral(vista) {
    vistaPerfilLateralActual = vista;

    // Tocar "Tienda" o "Personal" cambia con qué perfil usás la app:
    // mensajes y publicaciones salen desde ahí.
    if (modoCuentaNivan() !== vista) establecerModoCuentaNivan(vista, true);

    renderizarPerfilLateral();
}

function obtenerMisPublicacionesPerfilLateral() {
    if (!usuarioActual) return [];

    return productos.filter(function(p) {
        return p.vendedorId === usuarioActual.id;
    });
}

function obtenerMisComentariosPerfilLateral() {
    if (!usuarioActual) return [];

    const todasLasResenias = leerJSONNivan("nivanResenias", {});
    const misComentarios = [];

    Object.keys(todasLasResenias).forEach(function(idProducto) {
        todasLasResenias[idProducto].forEach(function(resenia, indice) {
            // Comentarios nuevos se identifican por usuarioId (no se
            // pierden si cambiás tu nombre o tu identificación única).
            // Los viejos, guardados antes de este cambio, todavía se
            // reconocen por nombre para no perderlos.
            const esMio = resenia.usuarioId
                ? resenia.usuarioId === usuarioActual.id
                : resenia.usuario === usuarioActual.nombre;

            if (esMio) {
                const producto = productos.find(function(p) {
                    return String(p.id) === String(idProducto);
                });

                misComentarios.push({
                    idProducto: idProducto,
                    indice: indice,
                    texto: resenia.texto,
                    estrellas: resenia.estrellas || "",
                    producto: producto ? producto.nombre : "una publicación"
                });
            }
        });
    });

    return misComentarios;
}

// Muestra una confirmación propia de la app (en vez de usar el
// confirm() nativo del navegador, que en algunos entornos/embeds
// queda bloqueado y hacía que "Borrar comentario" pareciera roto).
// textoAceptar cambia el texto del botón (por defecto "Borrar", en rojo);
// con esPositivo el botón se ve como una acción normal, no destructiva.
function mostrarConfirmacionNivan(mensaje, alConfirmar, textoAceptar, esPositivo) {
    document.getElementById("mensajeConfirmacionNivan").textContent = mensaje;

    const overlay = document.getElementById("overlayConfirmacionNivan");
    const botonAceptar = document.getElementById("botonAceptarConfirmacionNivan");

    // Reemplazamos el botón para sacarnos de encima cualquier
    // listener viejo de una confirmación anterior.
    const botonNuevo = botonAceptar.cloneNode(true);
    botonAceptar.parentNode.replaceChild(botonNuevo, botonAceptar);

    botonNuevo.textContent = textoAceptar || "Borrar";
    botonNuevo.classList.toggle("positivo", !!esPositivo);

    botonNuevo.addEventListener("click", function() {
        cerrarConfirmacionNivan();
        alConfirmar();
    });

    overlay.classList.add("abierto");
}

function cerrarConfirmacionNivan() {
    document.getElementById("overlayConfirmacionNivan").classList.remove("abierto");
}

function eliminarComentarioPerfilLateral(idProducto, indice) {
    mostrarConfirmacionNivan("¿Querés borrar este comentario?", function() {
        const todasLasResenias = leerJSONNivan("nivanResenias", {});

        if (todasLasResenias[idProducto]) {
            todasLasResenias[idProducto].splice(indice, 1);

            if (todasLasResenias[idProducto].length === 0) {
                delete todasLasResenias[idProducto];
            }

            guardarJSONNivan("nivanResenias", todasLasResenias);
        }

        renderizarPerfilLateral();
        renderizarActividad();
    });
}

// Estado de edición/visualización dentro del panel de perfil.
let bioEdicionActiva = false;
let bioTiendaEdicionActiva = false;
let formNuevaPublicacionVisible = false;
// Formato elegido al publicar en el perfil personal: "post" | "publicacion" | null (todavía no eligió).
let formatoNuevaPublicacionPerfil = null;
let indicePosteoPerfilAbierto = null;

// Dibuja el perfil y mide el alto real del pie (botones Tienda/Personal)
// para que el botón + fijo quede siempre justo arriba de él.
function renderizarPerfilLateral() {
    renderizarPerfilLateralBaseNivan();
    ajustarBotonMasPerfilNivan();
    requestAnimationFrame(ajustarBotonMasPerfilNivan);
}


function ajustarBotonMasPerfilNivan() {
    const panel = document.getElementById("panelMiPerfilNivan");
    const pie = document.getElementById("piePerfilLateral");
    if (!panel || !pie) return;
    panel.style.setProperty("--altoPieNivan", pie.offsetHeight + "px");

    // Si la barra de publicar está abierta, el + sube para quedar arriba de ella
    const form = document.getElementById("formNuevaPublicacionPerfil");
    const alto = form && form.classList.contains("abierto") ? form.offsetHeight : 0;
    panel.style.setProperty("--altoFormNivan", alto ? (alto + 12) + "px" : "0px");
}

function renderizarPerfilLateralBaseNivan() {
    const contenido = document.getElementById("contenidoPerfilLateral");
    const pie = document.getElementById("piePerfilLateral");

    if (!usuarioActual) {
        contenido.innerHTML = `
            <div class="perfilLateralVacio">
                <p>Todavía no iniciaste sesión.</p>
                <button type="button" class="botonPerfilLateral" onclick="cerrarPerfilLateral(); abrirCuenta();">
                    Iniciar sesión / Crear cuenta
                </button>
            </div>
        `;
        pie.innerHTML = "";
        return;
    }

    const foto = usuarioActual.foto
        ? `<img class="fotoPerfilLateral" src="${escaparHTMLNivan(usuarioActual.foto)}" alt="Foto de perfil">`
        : `<div class="fotoPerfilLateralVacia">👤</div>`;

    const misPublicaciones = obtenerMisPublicacionesPerfilLateral();
    const tieneTienda = misPublicaciones.length > 0 || usuarioTieneTiendaNivan(usuarioActual.id);
    const nombreVendedor = obtenerNombreVendedorUsuario(usuarioActual);

    // Si el usuario dejó de tener tienda (o nunca la tuvo), no puede
    // quedar trabada en la pestaña de tienda.
    if (vistaPerfilLateralActual === "tienda" && !tieneTienda) {
        vistaPerfilLateralActual = "personal";
    }

    const enTiendaNivan = vistaPerfilLateralActual === "tienda";

    const fotoTiendaNivan = usuarioActual.fotoTienda
        ? `<img class="fotoPerfilLateral" src="${escaparHTMLNivan(usuarioActual.fotoTienda)}" alt="Foto de la tienda">`
        : `<div class="fotoPerfilLateralVacia">🛍️</div>`;

    const claveCuentaVistaNivan = claveCuentaNivan(usuarioActual.id, enTiendaNivan ? "tienda" : "personal");

    const cabecera = `
        <div class="cabeceraPerfilLateral" onclick="${enTiendaNivan ? "abrirEdicionTiendaPerfilLateral()" : "abrirEdicionPerfilLateral()"}">
            <button type="button" class="botonMensajesPerfilLateral" onclick="event.stopPropagation(); cerrarPerfilLateral(); abrirMisChatsNivan();" aria-label="Mensajes">
                💬<span class="contadorChatsNivan">${textoContadorChatsNivan()}</span>
            </button>
            ${enTiendaNivan ? fotoTiendaNivan : foto}
            <div>
                <p class="nombrePerfilLateral">${enTiendaNivan ? nombreVendedor : obtenerNombreMostradoUsuario(usuarioActual)}</p>
                ${enTiendaNivan
                    ? `<p class="subTextoPerfilLateral">ID: ${escaparHTMLNivan(obtenerIdTiendaNivan(usuarioActual.id) || "—")}</p>`
                    : `<p class="subTextoPerfilLateral">ID: ${usuarioActual.idPublico || "—"}</p>
                <p class="subTextoPerfilLateral">${usuarioActual.email}</p>`}
                <p class="contadoresSeguidoresNivan" onclick="event.stopPropagation();">
                    <span onclick="cerrarPerfilLateral(); abrirListaSeguidoresNivan('${escaparHTMLNivan(claveCuentaVistaNivan)}', 'seguidores')"><strong>${idsSeguidoresNivan(claveCuentaVistaNivan).length}</strong> seguidores</span>
                    <span onclick="cerrarPerfilLateral(); abrirListaSeguidoresNivan('${escaparHTMLNivan(claveCuentaVistaNivan)}', 'seguidos')"><strong>${idsSeguidosNivan(claveCuentaVistaNivan).length}</strong> seguidos</span>
                </p>
                <p class="pistaEditarPerfilLateral">${enTiendaNivan ? "✏️ Tocá para editar tu tienda" : "✏️ Tocá para editar tu perfil"}</p>
            </div>
        </div>
    `;

    const contenidoVista = vistaPerfilLateralActual === "tienda"
        ? generarVistaTiendaPerfilLateral(misPublicaciones, nombreVendedor)
        : generarVistaPersonalPerfilLateral(tieneTienda);

    contenido.innerHTML = `
        ${cabecera}
        ${contenidoVista}
    `;

    // Las pestañas de abajo (personal / tienda) van en un contenedor
    // aparte que no scrollea, para que queden siempre fijas abajo
    // del panel en vez de moverse con el contenido.
    pie.innerHTML = `
        <div class="tabsVistaPerfilLateral">
            ${tieneTienda ? `
                <button type="button" class="tabVistaPerfilLateral ${vistaPerfilLateralActual === "tienda" ? "activa" : ""}" onclick="cambiarVistaPerfilLateral('tienda')">
                    🔒 Tienda ${nombreVendedor}
                </button>
            ` : ""}
            <button type="button" class="tabVistaPerfilLateral ${vistaPerfilLateralActual === "personal" ? "activa" : ""}" onclick="cambiarVistaPerfilLateral('personal')">
                👤 ${obtenerNombreMostradoUsuario(usuarioActual)}
            </button>
        </div>
    `;
}

// Vista "personal": biografía, currículum, publicaciones personales
// (fotos/videos con texto) y mis comentarios.
function generarVistaPersonalPerfilLateral(tieneTienda) {
    const etiquetaTipoTrabajo = obtenerEtiquetaTipoTrabajoPerfilLateral();

    const filaTipoTrabajoCurriculum = `
        <div class="filaTipoTrabajoCurriculumPerfilLateral">
            <button type="button" class="tipoTrabajoPerfilLateral" onclick="cerrarPerfilLateral(); irATipoTrabajo();">${etiquetaTipoTrabajo}</button>
            <span class="separadorTipoTrabajoCurriculumPerfilLateral">/</span>
            <button type="button" class="linkCurriculumPerfilLateral" onclick="abrirCurriculumPerfilLateral()">Currículum</button>
        </div>
    `;

    const bio = bioEdicionActiva
        ? `
            <div class="bioPerfilLateralContenedor">
                <textarea id="bioPerfilLateralInput" class="bioPerfilLateralTextarea" placeholder="Contanos algo sobre vos o tu trabajo...">${(usuarioActual.bio || "").replace(/</g, "&lt;")}</textarea>
                <span class="pistaCampoPerfil" style="margin-bottom:8px;">Tus compradores te encuentran por tu perfil de NIVAN: no se pueden poner teléfonos, mails, redes sociales ni links.</span>
                <button type="button" class="botonPerfilLateral" onclick="guardarBioPerfilLateral()">💾 Guardar biografía</button>
            </div>
        `
        : `
            <div class="bioPerfilLateralContenedor">
                <p class="bioPerfilLateralTexto" onclick="alternarEdicionBioPerfilLateral()">
                    <span class="etiquetaBioPerfilLateral">Bio:</span>
                    ${usuarioActual.bio ? usuarioActual.bio : "Tocá para escribir tu biografía"}
                </p>
            </div>
        `;

    const portafolio = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio : [];

    const grillaPublicaciones = portafolio.length
        ? htmlPublicacionesPersonalesNivan(
            portafolio.map(function(item, indice) { return { usuario: usuarioActual, indice: indice, item: item }; }),
            { alClick: function(e) { return `verPosteoPersonalPerfil(${e.indice})`; } }
        )
        : `<p class="vacioPublicacionesPerfilLateral">Aún no tenés ninguna publicación.</p>`;

    const formNuevaPublicacion = `
        <div class="formNuevaPublicacionPerfil ${formNuevaPublicacionVisible ? "abierto" : ""}" id="formNuevaPublicacionPerfil">
            <span class="pistaCampoPerfil">¿Qué querés subir? Elegí una opción.</span>
            <div class="selectorFormatoPerfilNivan">
                <button type="button" id="botonFormatoPublicacionPerfil" class="${formatoNuevaPublicacionPerfil === "publicacion" ? "activo" : ""}" onclick="elegirFormatoNuevaPublicacionPerfil('publicacion')">📷 Publicación</button>
                <button type="button" id="botonFormatoPostPerfil" class="${formatoNuevaPublicacionPerfil === "post" ? "activo" : ""}" onclick="elegirFormatoNuevaPublicacionPerfil('post')">📝 Post</button>
            </div>
            <div class="camposNuevaPublicacionPerfil ${formatoNuevaPublicacionPerfil ? "abierto" : ""}" id="camposNuevaPublicacionPerfil">
                
                <input type="file" id="archivoNuevaPublicacionPerfil" accept="image/*,video/*">
                ${htmlCampoTextoEtiquetasNivan("textoNuevaPublicacionPerfil", 'maxlength="1000" placeholder="Escribí algo."')}
                <span class="pistaCampoPerfil">Etiquetá a una persona o tienda con @ y su ID (ej: @maria22 o @T-mariashop).</span>
                <button type="button" class="botonPerfilLateral" onclick="publicarNuevaPublicacionPerfil()">Publicar</button>
            </div>
        </div>
    `;

    const promoTienda = !tieneTienda
        ? `
            <div class="bloqueTiendaPerfilLateral">
                <p class="subTextoPerfilLateral">Todavía no tenés una tienda en NIVAN.</p>
                <button type="button" class="botonPerfilLateral botonVenderPerfilLateral" onclick="cerrarPerfilLateral(); irAVender();">
                    🛍️ Empezar a vender
                </button>
            </div>
        `
        : "";

    return `
        ${filaTipoTrabajoCurriculum}
        ${bio}
        <hr class="divisorPublicacionesPerfilLateral">
        <p class="tituloPublicacionesPerfilLateral">Publicaciones</p>
        ${grillaPublicaciones}
        <button type="button" class="botonAgregarPublicacionPerfil" onclick="alternarFormNuevaPublicacionPerfil()" aria-label="Agregar publicación">+</button>
        ${formNuevaPublicacion}
        ${promoTienda}
    `;
}

// Vista "tienda": solo aparece si el usuario ya tiene publicaciones
// en venta. Muestra su nombre de tienda, tipo de trabajo y una
// grilla con sus productos publicados.
function generarVistaTiendaPerfilLateral(misPublicaciones, nombreVendedor) {
    const bioTienda = bioTiendaEdicionActiva
        ? `
            <div class="bioPerfilLateralContenedor">
                <textarea id="bioTiendaPerfilLateralInput" class="bioPerfilLateralTextarea" placeholder="Contanos sobre tu tienda: qué vendés, tu estilo, tiempos de entrega...">${(usuarioActual.bioTienda || "").replace(/</g, "&lt;")}</textarea>
                <span class="pistaCampoPerfil" style="margin-bottom:8px;">Los compradores te encuentran por tu perfil de NIVAN: no se pueden poner teléfonos, mails, redes sociales ni links.</span>
                <button type="button" class="botonPerfilLateral" onclick="guardarBioTiendaPerfilLateral()">💾 Guardar biografía de la tienda</button>
            </div>
        `
        : `
            <div class="bioPerfilLateralContenedor">
                <p class="bioPerfilLateralTexto" onclick="alternarEdicionBioTiendaPerfilLateral()">
                    <span class="etiquetaBioPerfilLateral">Bio de la tienda:</span>
                    ${usuarioActual.bioTienda ? usuarioActual.bioTienda : "Tocá para escribir la biografía de tu tienda"}
                </p>
            </div>
        `;

    const grillaProductos = misPublicaciones.length
        ? `
            <div class="gridPublicacionesPerfilLateral">
                ${misPublicaciones.map(function(p) {
                    return `
                        <div class="itemPublicacionGridPerfil" onclick="cerrarPerfilLateral(); abrirProducto(${JSON.stringify(p.id)});">
                            <img src="${escaparHTMLNivan(urlImagenNivan(p.imagen))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(p.nombre)}">
                        </div>
                    `;
                }).join("")}
            </div>
        `
        : `<p class="vacioPublicacionesPerfilLateral">Aún no tenés ninguna publicación en tu tienda.</p>`;

    return `
        ${bioTienda}
        <hr class="divisorPublicacionesPerfilLateral">
        ${typeof htmlBotonVacantesPerfilLateralNivan === "function" ? htmlBotonVacantesPerfilLateralNivan() : ""}
        <p class="tituloPublicacionesPerfilLateral">Publicaciones de la tienda</p>
        ${grillaProductos}

        <button type="button" class="botonAgregarPublicacionPerfil" onclick="cerrarPerfilLateral(); abrirCrearPublicacion();" aria-label="Crear publicación">+</button>
    `;
}

// ---- Biografía de la tienda editable ----

function alternarEdicionBioTiendaPerfilLateral() {
    bioTiendaEdicionActiva = true;
    renderizarPerfilLateral();
}

function guardarBioTiendaPerfilLateral() {
    if (!usuarioActual) return;
    const nuevaBio = document.getElementById("bioTiendaPerfilLateralInput").value.trim();

    persistirUsuarioActual({ bioTienda: nuevaBio });
    bioTiendaEdicionActiva = false;
    renderizarPerfilLateral();
}

// ---- Biografía editable ----

function alternarEdicionBioPerfilLateral() {
    bioEdicionActiva = true;
    renderizarPerfilLateral();
}

function guardarBioPerfilLateral() {
    if (!usuarioActual) return;
    const nuevaBio = document.getElementById("bioPerfilLateralInput").value.trim();

    persistirUsuarioActual({ bio: nuevaBio });
    bioEdicionActiva = false;
    renderizarPerfilLateral();
}

// ---- Currículum (bio de trabajo + archivo de CV) ----

function abrirCurriculumPerfilLateral() {
    if (!usuarioActual) return;

    const contenido = document.getElementById("contenidoPerfilLateral");
    document.getElementById("piePerfilLateral").innerHTML = "";

    contenido.innerHTML = `
        <button type="button" class="volverAtras" style="padding:0 0 14px;" onclick="renderizarPerfilLateral()">← Volver</button>
        <h3>Currículum</h3>

        <div class="campoEditarPerfilLateral">
            <label for="bioTrabajoPerfilLateralInput">Contanos sobre tu trabajo</label>
            <textarea id="bioTrabajoPerfilLateralInput" class="bioPerfilLateralTextarea" placeholder="Ej: Me destaco diseñando ropa femenina...">${(usuarioActual.bioTrabajo || "").replace(/</g, "&lt;")}</textarea>
        </div>

        <div class="campoEditarPerfilLateral">
            <label>Tu CV</label>
            ${usuarioActual.curriculum
                ? `<p class="subTextoPerfilLateral">${(usuarioActual.curriculum.nombreArchivo || "Currículum cargado")}</p>
                   <button type="button" class="botonPerfilLateral" onclick="verCurriculumPerfilLateral()">📄 Ver currículum</button>
                   <button type="button" class="botonPerfilLateral" onclick="borrarCurriculumPerfilLateral()">🗑 Borrar currículum</button>`
                : `<p class="subTextoPerfilLateral">Todavía no subiste tu currículum.</p>`
            }
            <input type="file" id="subirCurriculumPerfilLateral" accept=".pdf,.doc,.docx,image/*" onchange="subirCurriculumPerfilLateral(this)" style="margin-top:8px;">
        </div>

        <button type="button" class="botonPerfilLateral" onclick="guardarBioTrabajoPerfilLateral()">💾 Guardar</button>
    `;
}

function guardarBioTrabajoPerfilLateral() {
    if (!usuarioActual) return;
    const texto = document.getElementById("bioTrabajoPerfilLateralInput").value.trim();

    persistirUsuarioActual({ bioTrabajo: texto });
    abrirCurriculumPerfilLateral();
}


    function alternarFormNuevaPublicacionPerfil() {
    formNuevaPublicacionVisible = !formNuevaPublicacionVisible;
    if (!formNuevaPublicacionVisible) formatoNuevaPublicacionPerfil = null;
    renderizarPerfilLateral();
    }
    if (formNuevaPublicacionVisible) {
        const form = document.getElementById("formNuevaPublicacionPerfil");
        if (form) form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

function elegirFormatoNuevaPublicacionPerfil(formato) {
    formatoNuevaPublicacionPerfil = formato === "post" ? "post" : "publicacion";
    const bPub = document.getElementById("botonFormatoPublicacionPerfil");
    const bPost = document.getElementById("botonFormatoPostPerfil");
    const campos = document.getElementById("camposNuevaPublicacionPerfil");
    const pista = document.getElementById("pistaFormatoNuevaPublicacionPerfil");
    if (bPub) bPub.classList.toggle("activo", formatoNuevaPublicacionPerfil === "publicacion");
    if (bPost) bPost.classList.toggle("activo", formatoNuevaPublicacionPerfil === "post");
    if (campos) campos.classList.add("abierto");
    if (pista) pista.textContent = formatoNuevaPublicacionPerfil === "post"
       
}

function publicarNuevaPublicacionPerfil() {
    if (!usuarioActual) return;
    if (!exigirVerificacionNivan()) return;

    const input = document.getElementById("archivoNuevaPublicacionPerfil");
    const textoInput = document.getElementById("textoNuevaPublicacionPerfil");
    const texto = textoInput ? textoInput.value.trim() : "";

    const archivo = input && input.files && input.files[0] ? input.files[0] : null;

    const formato = formatoNuevaPublicacionPerfil;
    if (formato !== "post" && formato !== "publicacion") {
        alert("Primero elegí si es una Publicación o un Post.");
        return;
    }

    if (formato === "publicacion" && !archivo) {
        alert("Una publicación necesita una foto o un video. Si solo querés escribir, elegí Post.");
        return;
    }

    if (!archivo && !texto) {
        alert("Escribí un texto o elegí una foto o video para publicar.");
        return;
    }

    const esVideo = !!archivo && archivo.type.startsWith("video");

    // Todo se guarda en el almacenamiento del dispositivo (unos 5 MB en total):
    // los videos pesados no entran y las fotos se achican antes de guardarlas.
    if (esVideo && archivo.size > 1500000) {
        alert("Ese video es muy pesado para guardarlo (máximo 1,5 MB). Probá con uno más corto o con una foto.");
        return;
    }

    function guardarPublicacionPerfil(src) {
        const portafolioActual = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio.slice() : [];
        portafolioActual.unshift({
            tipo: archivo ? (esVideo ? "video" : "imagen") : "texto",
            formato: formato,
            src: src || "",
            texto: texto,
            fecha: Date.now()
        });
        if (persistirUsuarioActual({ portafolio: portafolioActual }) === false) return;
        formNuevaPublicacionVisible = false;
        formatoNuevaPublicacionPerfil = null;
        renderizarPerfilLateral();
        if (typeof renderizarFeedPersonalNivan === "function") renderizarFeedPersonalNivan();
    }

    if (!archivo) { guardarPublicacionPerfil(""); return; }

    const lector = new FileReader();

    lector.onload = function() {
        if (esVideo) { guardarPublicacionPerfil(lector.result); return; }

        const img = new Image();
        img.onload = function() {
            const maximo = 900;
            const escala = Math.min(1, maximo / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * escala));
            canvas.height = Math.max(1, Math.round(img.height * escala));
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            guardarPublicacionPerfil(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = function() { guardarPublicacionPerfil(lector.result); };
        img.src = lector.result;
    };

    lector.readAsDataURL(archivo);
}

function verPosteoPersonalPerfil(indice) {
    if (!usuarioActual) return;

    const portafolio = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio : [];
    const item = portafolio[indice];
    if (!item) return;

    indicePosteoPerfilAbierto = indice;

    const media = !item.src ? ""
        : item.tipo === "video"
            ? `<video src="${item.src}" controls${preloadVideoNivan()}></video>`
            : `<img src="${item.src}" alt="Publicación">`;

    document.getElementById("mediaPosteoPerfil").innerHTML = media;
    document.getElementById("textoPosteoPerfil").innerHTML = textoConEtiquetasNivan(item.texto || "")
        + (typeof htmlEditadoNivan === "function" ? htmlEditadoNivan(item) : "");
    const botonEditarPerfil = document.getElementById("botonEditarPosteoPerfil");
    if (botonEditarPerfil) botonEditarPerfil.style.display = (typeof puedeEditarPostNivan === "function" && puedeEditarPostNivan(item)) ? "" : "none";
    document.getElementById("overlayPosteoPerfil").classList.add("abierto");
}

function cerrarPosteoPerfilLateral() {
    document.getElementById("overlayPosteoPerfil").classList.remove("abierto");
    indicePosteoPerfilAbierto = null;
}

function borrarPosteoPersonalPerfil() {
    if (!usuarioActual || indicePosteoPerfilAbierto === null) return;

    mostrarConfirmacionNivan("¿Querés borrar esta publicación?", function() {
        const portafolioActual = Array.isArray(usuarioActual.portafolio) ? usuarioActual.portafolio.slice() : [];
        portafolioActual.splice(indicePosteoPerfilAbierto, 1);
        persistirUsuarioActual({ portafolio: portafolioActual });
        indicePosteoPerfilAbierto = null;
        document.getElementById("overlayPosteoPerfil").classList.remove("abierto");
        renderizarPerfilLateral();
    });
}

function abrirEdicionPerfilLateral() {
    if (!usuarioActual) return;

    const contenido = document.getElementById("contenidoPerfilLateral");
    document.getElementById("piePerfilLateral").innerHTML = "";
    const fotoActual = usuarioActual.foto || "";

    const previewInicial = fotoActual
        ? `<img id="previewFotoEditarPerfilLateral" src="${fotoActual}" class="fotoPerfilLateral" alt="Foto de perfil">`
        : `<div id="previewFotoEditarPerfilLateral" class="fotoPerfilLateralVacia">👤</div>`;

    contenido.innerHTML = `
        <button type="button" class="volverAtras" style="padding:0 0 14px;" onclick="renderizarPerfilLateral()">← Volver</button>
        <h3>Editar perfil</h3>

        <div class="campoEditarPerfilLateral">
            <label>Foto de perfil</label>
            <div style="margin-bottom:10px;">${previewInicial}</div>
            <input type="file" id="editarFotoPerfilLateral" accept="image/*" onchange="previsualizarFotoEdicionPerfilLateral(this)">
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="editarNombrePerfilLateral">Tu nombre real</label>
            <input type="text" id="editarNombrePerfilLateral" value="${(usuarioActual.nombre || "").replace(/"/g, "&quot;")}">
            <span class="avisoNombreDniNivan">⚠️ Tiene que ser tal cual figura en tu ${nombreDocumentoNivan()}.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="editarApodoPerfilLateral">Apodo</label>
            <input type="text" id="editarApodoPerfilLateral" placeholder="Opcional" value="${(usuarioActual.apodo || "").replace(/"/g, "&quot;")}">
            <span class="pistaCampoPerfil">Si cargás un apodo, es lo que se muestra en vez de tu nombre real.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="editarIdPublicoPerfilLateral">Identificación única</label>
            <input type="text" id="editarIdPublicoPerfilLateral" value="${(usuarioActual.idPublico || "").replace(/"/g, "&quot;")}">
            <span class="pistaCampoPerfil">Es tuya y no se puede compartir con nadie más. La podés cambiar cuando quieras, pero no puede repetirse con la de otra cuenta.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="editarGmailPerfilLateral">Gmail</label>
            <input type="email" id="editarGmailPerfilLateral" value="${(usuarioActual.email || "").replace(/"/g, "&quot;")}">
        </div>

        <p class="pistaCampoPerfil" style="margin-bottom:12px;">La foto y el nombre de tu tienda se editan desde la pestaña de tu tienda: son independientes de tu perfil personal.</p>

        <button type="button" class="botonPerfilLateral" onclick="guardarEdicionPerfilLateral()">💾 Guardar cambios</button>
    `;
}

function abrirEdicionTiendaPerfilLateral() {
    if (!usuarioActual) return;

    const contenido = document.getElementById("contenidoPerfilLateral");
    document.getElementById("piePerfilLateral").innerHTML = "";
    const fotoActual = usuarioActual.fotoTienda || "";
const idTiendaActualCompleto = obtenerIdTiendaNivan(usuarioActual.id) || "";
const baseIdTiendaActual = limpiarBaseIdTienda(idTiendaActualCompleto);
const prefijoIdTiendaActual = prefijoIdTiendaNivan(paisDeIdTiendaNivan(idTiendaActualCompleto));

  
    const previewInicial = fotoActual
        ? `<img id="previewFotoEditarTiendaPerfilLateral" src="${escaparHTMLNivan(fotoActual)}" class="fotoPerfilLateral" alt="Foto de la tienda">`
        : `<div id="previewFotoEditarTiendaPerfilLateral" class="fotoPerfilLateralVacia">🛍️</div>`;

    contenido.innerHTML = `
        <button type="button" class="volverAtras" style="padding:0 0 14px;" onclick="renderizarPerfilLateral()">← Volver</button>
        <h3>Editar tienda</h3>
        <p class="pistaCampoPerfil" style="margin-bottom:12px;">Tu tienda y tu perfil personal son cosas distintas: si cambiás la foto de la tienda, tu foto de perfil personal no cambia.</p>

        <div class="campoEditarPerfilLateral">
            <label>Foto de la tienda</label>
            <div style="margin-bottom:10px;">${previewInicial}</div>
            <input type="file" id="editarFotoTiendaPerfilLateral" accept="image/*" onchange="previsualizarFotoEdicionTiendaPerfilLateral(this)">
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="editarNombreTiendaPerfilLateral">Nombre de la tienda</label>
            <input type="text" id="editarNombreTiendaPerfilLateral" placeholder="Si lo dejás vacío se usa tu nombre" value="${(usuarioActual.nombreTienda || "").replace(/"/g, "&quot;")}">
            <span class="pistaCampoPerfil">Es el nombre que va a aparecer en tus publicaciones.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label for="editarIdTiendaPerfilLateral">Identificación de la tienda</label>
            <div class="campoIdTiendaNivan">
                <span>${prefijoIdTiendaActual}</span>
                <input type="text" id="editarIdTiendaPerfilLateral" maxlength="16" autocapitalize="none" autocomplete="off" value="${escaparHTMLNivan(baseIdTiendaActual)}">
            </div>
            <span class="pistaCampoPerfil">No puede repetirse con la de otra tienda.</span>
        </div>

        <div class="campoEditarPerfilLateral">
            <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
                <input type="checkbox" id="editarMostrarPersonalEnTiendaPerfilLateral" ${usuarioActual.mostrarPersonalEnTienda ? "checked" : ""} style="width:auto; margin-top:3px;">
                <span>Mostrar mi perfil personal en mi tienda</span>
            </label>
            <span class="pistaCampoPerfil">Si lo activás, cuando abran tu tienda va a aparecer un botón "Ver perfil personal". Quién puede verlo lo elegís en Privacidad y seguridad.</span>
        </div>

        <button type="button" class="botonPerfilLateral" onclick="guardarEdicionTiendaPerfilLateral()">💾 Guardar cambios</button>
    `;
}

// Muestra la foto elegida en la <img> indicada (la reemplaza por una nueva).
function previsualizarFotoPerfilLateralNivan(input, idImagen) {
    if (!input.files || !input.files[0]) return;

    const lector = new FileReader();

    lector.onload = function() {
        const anterior = document.getElementById(idImagen);
        const nuevaImg = document.createElement("img");
        nuevaImg.id = idImagen;
        nuevaImg.className = "fotoPerfilLateral";
        nuevaImg.src = lector.result;
        anterior.replaceWith(nuevaImg);
    };

    lector.readAsDataURL(input.files[0]);
}

function previsualizarFotoEdicionTiendaPerfilLateral(input) {
    previsualizarFotoPerfilLateralNivan(input, "previewFotoEditarTiendaPerfilLateral");
}

function guardarEdicionTiendaPerfilLateral() {
    if (!usuarioActual) return;

    const nuevoNombreTienda = document.getElementById("editarNombreTiendaPerfilLateral").value.trim();
    const baseIdTienda = limpiarBaseIdTienda(document.getElementById("editarIdTiendaPerfilLateral").value);

    if (!baseIdTienda) {
        alert("La identificación de la tienda no puede quedar vacía.");
        return;
    }

    const nuevoIdTienda = prefijoIdTiendaNivan(paisDeIdTiendaNivan(obtenerIdTiendaNivan(usuarioActual.id))) + baseIdTienda;

    if (!idTiendaEstaDisponible(nuevoIdTienda, usuarioActual.id)) {
        alert("Esa identificación ya la usa otra tienda. Elegí otra.");
        return;
    }

    const mostrarPersonal = !!document.getElementById("editarMostrarPersonalEnTiendaPerfilLateral").checked;

    const previsualizacion = document.getElementById("previewFotoEditarTiendaPerfilLateral");
    const nuevaFoto = (previsualizacion && previsualizacion.tagName === "IMG")
        ? previsualizacion.src
        : (usuarioActual.fotoTienda || "");

    persistirUsuarioActual({
        nombreTienda: nuevoNombreTienda,
        idTienda: nuevoIdTienda,
        fotoTienda: nuevaFoto,
        mostrarPersonalEnTienda: mostrarPersonal
    });

    renderizarPerfilLateral();
}

function previsualizarFotoEdicionPerfilLateral(input) {
    previsualizarFotoPerfilLateralNivan(input, "previewFotoEditarPerfilLateral");
}

function guardarEdicionPerfilLateral() {
    if (!usuarioActual) return;

    const nuevoNombre = document.getElementById("editarNombrePerfilLateral").value.trim();
    const nuevoApodo = document.getElementById("editarApodoPerfilLateral").value.trim();
    const nuevoIdPublico = normalizarBaseIdPublico(document.getElementById("editarIdPublicoPerfilLateral").value.trim());
    const nuevoGmail = document.getElementById("editarGmailPerfilLateral").value.trim().toLowerCase();

    if (!nuevoNombre) {
        alert("El nombre no puede quedar vacío.");
        return;
    }

    if (!nuevoIdPublico) {
        alert("La identificación única no puede quedar vacía.");
        return;
    }

    if (!idPublicoEstaDisponible(nuevoIdPublico, usuarioActual.id)) {
        alert("Esa identificación ya la está usando otra cuenta. Elegí otra.");
        return;
    }

    if (!esEmailValidoNivan(nuevoGmail)) {
        alert(MENSAJE_EMAIL_INVALIDO_NIVAN);
        return;
    }

    const usuarios = obtenerUsuariosNivan();
    const yaUsado = usuarios.some(function(u) {
        return u.email === nuevoGmail && u.id !== usuarioActual.id;
    });

    if (yaUsado) {
        alert("Ese email ya está en uso por otra cuenta.");
        return;
    }

    const previsualizacion = document.getElementById("previewFotoEditarPerfilLateral");
    const nuevaFoto = (previsualizacion && previsualizacion.tagName === "IMG")
        ? previsualizacion.src
        : (usuarioActual.foto || "");

    persistirUsuarioActual({
        nombre: nuevoNombre,
        apodo: nuevoApodo,
        idPublico: nuevoIdPublico,
        email: nuevoGmail,
        foto: nuevaFoto
    });

    renderizarPerfilLateral();
}

