// ==============================
// LÍMITES DE CARACTERES EN TODOS LOS CAMPOS
// ==============================
// Cada campo de texto tiene un máximo, se limpian los caracteres de
// control/invisibles al escribir o pegar, y esto también vale para los
// campos que la app crea después (perfil, respuestas, etc.).
// Ojo: corre en el navegador; con backend hay que repetirlo en el servidor.

const REGEX_RAROS_NIVAN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

const LIMITES_CAMPOS_NIVAN = {
    buscadorRapido: 150, buscador: 150, disenoElegido: 60, descripcionIdea: 300, colorMedida: 20,
    emailMedida: 60, nombrePublicacion: 60, marcaPublicacion: 40, precioPublicacion: 7,
    tramoPrecioInput: 7, etiquetasPublicacion: 120, descripcionPublicacion: 500,
    historiaDisenadaPor: 60, historiaFabricadaPor: 60, historiaMateriales: 120, historiaTecnica: 60,
    nombreRuedaColorInput: 30, loginEmail: 60, loginPassword: 128, recuperarEmail: 60, cuentaPassConfirmNivan: 128, cuentaCodigo2FANivan: 12, cuentaTextoEliminarNivan: 10, dosPasosCodigoLogin: 12, dosPasosCodigoActivarNivan: 6, dosPasosPassConfirmNivan: 128, recuperarCodigo: 6, recuperarPassNueva: 128, recuperarPassRepetir: 128, registroNombre: 50,
    registroEmail: 60, registroPassword: 128, textoPreguntaVendedor: 300, nombreCompra: 50,
    telefonoCompra: 20, emailCompra: 60, direccionCompra: 80, ciudadCompra: 40, codigoPostal: 8,
    notasCompra: 300, dirAliasNivan: 20, dirCalleNivan: 80, dirCiudadNivan: 40, dirCPNivan: 8, tarjetaTitularNivan: 40, mpCuentaNivan: 60, bioPerfilLateralInput: 300, bioTrabajoPerfilLateralInput: 500,
    bioTiendaPerfilLateralInput: 500,
    textoNuevaPublicacionPerfil: 500, editarNombrePerfilLateral: 50, editarApodoPerfilLateral: 25,
    editarIdPublicoPerfilLateral: 25, editarGmailPerfilLateral: 60, editarNombreTiendaPerfilLateral: 40
};

// Límites de los campos numéricos: min, max y si tiene que ser entero.
// Precio máximo de una prenda: depende del país (Argentina ARS 250.000, Uruguay UYU 7.000). Medidas en cm.
const PRECIO_MAXIMO_NIVAN = datosPaisNivan().precioMaximo;
const LIMITES_NUMEROS_NIVAN = {
    bustoMedida: [1, 250, false], cinturaMedida: [1, 250, false], caderaMedida: [1, 250, false], alturaMedida: [1, 250, false],
    perfilBusto: [1, 250, false], perfilCintura: [1, 250, false], perfilCadera: [1, 250, false], perfilAltura: [1, 250, false],
    presupuestoMedida: [0, PRECIO_MAXIMO_NIVAN, true],
    filtroPrecioMin: [0, PRECIO_MAXIMO_NIVAN, true], filtroPrecioMax: [0, PRECIO_MAXIMO_NIVAN, true],
    cantidadMinimaMayorPublicacion: [1, 10000, true], tramoCantidadInput: [1, 10000, true],
    stockPublicacion: [0, 10000, true], diasPublicacion: [0, 365, true], tramoDiasInput: [0, 365, true],
    cantidadCompraDetalle: [1, 1000, true]
};
const LIMITE_NUMERO_PREDETERMINADO_NIVAN = [0, 10000, true];

function obtenerLimiteNumeroNivan(el) {
    const id = el.id || "";
    if (LIMITES_NUMEROS_NIVAN[id]) return LIMITES_NUMEROS_NIVAN[id];
    // Tabla de medidas de cada publicación (busto_, cintura_, cadera_, largo_).
    if (/^(busto|cintura|cadera|largo)_/.test(id)) return [0, 250, false];
    return LIMITE_NUMERO_PREDETERMINADO_NIVAN;
}

function numeroValidoNivan(el) {
    const v = el.value;
    if (v === "") return true;
    const lim = obtenerLimiteNumeroNivan(el);
    const digitos = String(lim[1]).length;
    const formato = lim[2]
        ? new RegExp("^\\d{1," + digitos + "}$")
        : new RegExp("^\\d{1," + digitos + "}(\\.\\d{0,1})?$");
    return formato.test(v) && Number(v) <= lim[1];
}

// Guarda el valor bueno antes de cada cambio, para poder volver a él.
document.addEventListener("beforeinput", function(e) {
    const el = e.target;
    if (el && el.tagName === "INPUT" && el.type === "number" && !el.validity.badInput) el.dataset.valorPrevio = el.value;
}, true);

// En campos numéricos no se pueden escribir e, +, - ni (si es entero) decimales.
document.addEventListener("keydown", function(e) {
    const el = e.target;
    if (!el || el.tagName !== "INPUT" || el.type !== "number" || e.ctrlKey || e.metaKey || e.altKey) return;
    const lim = obtenerLimiteNumeroNivan(el);
    if (["e", "E", "+", "-"].indexOf(e.key) !== -1 || (lim[2] && (e.key === "." || e.key === ","))) e.preventDefault();
}, true);

// Deja el valor dentro de [min, max] (y entero si corresponde).
function acotarNumeroNivan(el, alSalir) {
    if (el.value === "") return;
    const lim = obtenerLimiteNumeroNivan(el);
    const min = el.hasAttribute("min") ? Math.max(Number(el.min), lim[0]) : lim[0];
    let n = Number(el.value);

    if (!isFinite(n)) { el.value = ""; return; }
    if (lim[2]) n = Math.floor(n);
    if (n > lim[1]) n = lim[1];
    if (alSalir && n < min) n = min;
    if (String(n) !== el.value && (n > lim[1] || alSalir || lim[2])) el.value = String(n);
}

const LIMITES_TIPO_NIVAN = { text: 100, search: 80, email: 120, tel: 20, password: 128, url: 200, textarea: 500 };

// Correo válido: algo antes del @, un dominio (gmail.com, hotmail.com,
// outlook.com, yahoo.com.ar, etc.) y una terminación de 2 letras o más.
// Sin espacios, sin puntos seguidos, sin punto al principio o al final.
const MENSAJE_EMAIL_INVALIDO_NIVAN = "Ingresá un correo electrónico válido";

const TLDS_GENERICOS_NIVAN = ["com","net","org","edu","gov","mil","int","info","biz","name","pro","io","ai","app","dev","online","store","shop","site","tech","cloud","email","mobi","xyz","club","live","me","tv","cc"];
const TLDS_PAISES_NIVAN = "ad ae af ag al am ao ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cd cf cg ch ci ck cl cm cn co cr cu cv cw cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gt gu gw gy hk hn hr ht hu id ie il im in iq ir is it je jm jo jp ke kg kh ki km kn kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md mg mk ml mm mn mo mq mr ms mt mu mv mw mx my mz na nc ne ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg si sk sl sm sn so sr st sv sy sz tc td tg th tj tl tm tn to tr tt tw tz ua ug uk us uy uz va vc ve vg vi vn vu ws ye za zm zw".split(" ");

// Proveedores conocidos: con qué terminaciones existen de verdad.
const PROVEEDORES_EMAIL_NIVAN = {
    gmail: ["com"], hotmail: ["com", "es", "com.ar"], outlook: ["com", "es"],
    yahoo: ["com", "es", "com.ar", "com.mx"], icloud: ["com"], protonmail: ["com"]
};
const OTROS_PROVEEDORES_NIVAN = ["mail", "live", "msn", "gmx", "zoho", "proton", "aol", "fastmail", "yandex", "tutanota"];

function distanciaTextoNivan(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) { d[0][j] = j; }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return d[a.length][b.length];
}

function esEmailValidoNivan(email) {
    const e = String(email == null ? "" : email).trim().toLowerCase();
    if (!e || e.length > 60 || e.indexOf("..") !== -1) return false;
    if (!/^[a-z0-9](?:[a-z0-9._%+\-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(e)) return false;

    const dominio = e.split("@")[1];
    const partes = dominio.split(".");
    const terminacion = partes[partes.length - 1];

    // La terminación tiene que existir de verdad (.com, .uy, .ar...): "fail.xom" no pasa.
    if (TLDS_GENERICOS_NIVAN.indexOf(terminacion) === -1 && TLDS_PAISES_NIVAN.indexOf(terminacion) === -1) return false;
    if (partes[0].length < 2) return false;

    // Proveedores conocidos: tienen que estar bien escritos (no "gmial.com" ni "gmail.co").
    const nombre = partes[0];
    const resto = partes.slice(1).join(".");
    if (PROVEEDORES_EMAIL_NIVAN[nombre]) return PROVEEDORES_EMAIL_NIVAN[nombre].indexOf(resto) !== -1;

    if (nombre.length >= 4 && OTROS_PROVEEDORES_NIVAN.indexOf(nombre) === -1) {
        const parecido = Object.keys(PROVEEDORES_EMAIL_NIVAN).some(function(prov) {
            return distanciaTextoNivan(nombre, prov) <= (nombre.length >= 5 ? 2 : 1);
        });
        if (parecido) return false;
    }

    return true;
}

function limpiarTextoNivan(texto, max) {
    let t = String(texto == null ? "" : texto).replace(REGEX_RAROS_NIVAN, "").replace(/[<>]/g, "");
    if (max && t.length > max) {
        t = t.slice(0, max);
        if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
    }
    return t;
}

function esCampoTextoNivan(el) {
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && Object.prototype.hasOwnProperty.call(LIMITES_TIPO_NIVAN, el.type);
}

function actualizarContadorNivan(el) {
    const c = el.nextElementSibling;
    if (!c || !c.classList.contains("contadorCaracteresNivan")) return;
    c.textContent = el.value.length + "/" + el.maxLength + (el.value.length >= el.maxLength ? " · límite alcanzado" : "");
    c.classList.toggle("lleno", el.value.length >= el.maxLength);
}

function prepararContadorNivan(el) {
    const c = el.nextElementSibling;
    if (!c || !c.classList.contains("contadorCaracteresNivan")) {
        el.insertAdjacentHTML("afterend", '<small class="contadorCaracteresNivan"></small>');
    }
    actualizarContadorNivan(el);
}

function aplicarLimitesNivan(raiz) {
    if (!raiz || raiz.nodeType !== 1) return;
    const lista = Array.from(raiz.querySelectorAll("input, textarea"));
    if (raiz.matches("input, textarea")) lista.push(raiz);

    lista.forEach(function(el) {
        if (el.readOnly) return;

        if (el.tagName === "INPUT" && el.type === "number") {
            const lim = obtenerLimiteNumeroNivan(el);
            el.max = String(lim[1]);
            if (!el.hasAttribute("min") || Number(el.min) < lim[0]) el.min = String(lim[0]);
            return;
        }

        if (!esCampoTextoNivan(el)) return;

        if (!el.hasAttribute("maxlength")) {
            const id = el.id || "";
            const tipo = el.tagName === "TEXTAREA" ? "textarea" : el.type;
            let limite = LIMITES_CAMPOS_NIVAN[id];
            if (!limite && id.indexOf("respuestaPregunta_") === 0) limite = 500;
            el.maxLength = limite || LIMITES_TIPO_NIVAN[tipo];
        }

        // Los campos con data-contador muestran "0/300" debajo. El resto
        // (buscadores, etc.) simplemente no deja escribir de más, sin avisar.
        if (el.hasAttribute("data-contador")) prepararContadorNivan(el);
    });
}

document.addEventListener("input", function(e) {
    const el = e.target;
    if (!el || !el.tagName || el.readOnly) return;

    if (el.tagName === "INPUT" && el.type === "number") {
        // Si lo escrito pasa el máximo (o tiene más dígitos de los
        // permitidos), se deshace y queda el valor anterior: no deja escribir de más.
        if (!el.validity.badInput && !numeroValidoNivan(el)) el.value = el.dataset.valorPrevio || "";
        return;
    }

    if (!esCampoTextoNivan(el)) return;

    let limpio = limpiarTextoNivan(el.value, el.maxLength > 0 ? el.maxLength : 0);
    // Las contraseñas pueden llevar < o >; el resto de los campos no.
    if (el.type === "password") limpio = String(el.value).replace(REGEX_RAROS_NIVAN, "").slice(0, el.maxLength > 0 ? el.maxLength : 128);
    if (limpio !== el.value) el.value = limpio;
    if (el.hasAttribute("data-contador")) actualizarContadorNivan(el);
}, true);

// Por si el campo se vació desde el código (al enviar), el contador se
// actualiza cuando la persona vuelve a tocarlo.
document.addEventListener("focusin", function(e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-contador")) actualizarContadorNivan(e.target);
});

// Al salir del campo también se corrige si quedó por debajo del mínimo.
document.addEventListener("change", function(e) {
    const el = e.target;
    if (el && el.tagName === "INPUT" && el.type === "number" && !el.readOnly) acotarNumeroNivan(el, true);
}, true);

// ==============================
// ARCHIVOS SUBIDOS (fotos, videos, currículum)
// ==============================
// Todo archivo se revisa ANTES de que la app lo use: máximo 5 MB, cantidad
// máxima, y el tipo se comprueba por el contenido real (no por el nombre).
// Las fotos se vuelven a dibujar y guardar como JPG más chico (así se
// elimina cualquier contenido escondido y no se llena el almacenamiento).

const MAX_BYTES_ARCHIVO_NIVAN = 5 * 1024 * 1024;
// Las fotos sacadas con la cámara del celular pueden pesar 10 MB o más: se aceptan hasta este tope
// y se achican enseguida. El límite de 5 MB se aplica al resultado ya achicado.
const MAX_BYTES_FOTO_ORIGINAL_NIVAN = 40 * 1024 * 1024;
const MAX_ARCHIVOS_POR_CAMPO_NIVAN = 6;

async function detectarTipoArchivoNivan(archivo) {
    const b = new Uint8Array(await archivo.slice(0, 16).arrayBuffer());
    const t = function(i, txt) { return txt.split("").every(function(c, k) { return b[i + k] === c.charCodeAt(0); }); };

    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "jpeg";
    if (b[0] === 0x89 && t(1, "PNG")) return "png";
    if (t(0, "GIF8")) return "gif";
    if (t(0, "RIFF") && t(8, "WEBP")) return "webp";
    if (t(4, "ftyp")) {
        const marca = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
        if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].indexOf(marca) !== -1) return "heic";
        if (marca === "avif" || marca === "avis") return "heic";
        return "mp4";
    }
    if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return "webm";
    if (t(0, "%PDF")) return "pdf";
    if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return "doc";
    if (b[0] === 0x50 && b[1] === 0x4B && b[2] === 3 && b[3] === 4) return "docx";
    return "";
}

function tipoPermitidoEnCampoNivan(tipo, accept) {
    const fichas = (accept || "image/*").split(",").map(function(x) { return x.trim(); });
    if (["jpeg", "png", "gif", "webp"].indexOf(tipo) !== -1) return fichas.indexOf("image/*") !== -1;
    if (["mp4", "webm"].indexOf(tipo) !== -1) return fichas.indexOf("video/*") !== -1;
    if (tipo === "pdf") return fichas.indexOf(".pdf") !== -1;
    if (tipo === "doc") return fichas.indexOf(".doc") !== -1;
    if (tipo === "docx") return fichas.indexOf(".docx") !== -1;
    return false;
}

async function comprimirImagenNivan(archivo, medidas) {
    try {
        const bmp = await createImageBitmap(archivo);
        if (bmp.width * bmp.height > 40000000) { if (bmp.close) bmp.close(); return null; }

        const calidadSubida = medidas || calidadSubidaNivan();
        const escala = Math.min(1, calidadSubida.lado / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * escala));
        c.height = Math.max(1, Math.round(bmp.height * escala));

        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();

        const blob = await new Promise(function(ok) { c.toBlob(ok, "image/jpeg", calidadSubida.calidad); });
        return blob ? new File([blob], "img_" + Date.now() + ".jpg", { type: "image/jpeg" }) : null;
    } catch (e) {
        return null;
    }
}

async function validarArchivosNivan(el) {
    const archivos = Array.from(el.files);
    const rechazar = function(msg) { alert(msg); el.value = ""; return false; };

    if (archivos.length > MAX_ARCHIVOS_POR_CAMPO_NIVAN) return rechazar("Podés subir hasta " + MAX_ARCHIVOS_POR_CAMPO_NIVAN + " archivos.");

    const listos = [];

    // Los campos de la verificación de identidad guardan la foto con más detalle para que se lea el documento.
    const esDocumento = /^registroFoto_/.test(el.id || "");
    const medidasDocumento = esDocumento ? { lado: 2000, calidad: 0.88 } : null;

    for (const f of archivos) {
        const tipo = await detectarTipoArchivoNivan(f);

        if (tipo === "heic") {
            return rechazar("Tu celular guardó la foto en formato HEIC y no se puede leer. Cambiá la cámara a formato \"Más compatible\" (JPG) o sacá una captura de pantalla de la foto, y subila de nuevo.");
        }

        const esFoto = tipo === "jpeg" || tipo === "png" || tipo === "webp";
        if (f.size > (esFoto ? MAX_BYTES_FOTO_ORIGINAL_NIVAN : MAX_BYTES_ARCHIVO_NIVAN)) {
            return rechazar(esFoto ? "La foto es demasiado grande." : "El archivo no puede pesar más de 5 MB.");
        }
        if (!tipoPermitidoEnCampoNivan(tipo, el.getAttribute("accept"))) return rechazar("Ese tipo de archivo no está permitido.");

        if (esFoto) {
            const nueva = await comprimirImagenNivan(f, medidasDocumento);
            if (!nueva) return rechazar("La imagen no es válida.");
            if (nueva.size > MAX_BYTES_ARCHIVO_NIVAN) return rechazar("La foto sigue pesando más de 5 MB. Probá con otra.");
            listos.push(nueva);
        } else {
            listos.push(f);
        }
    }

    try {
        const dt = new DataTransfer();
        listos.forEach(function(f) { dt.items.add(f); });
        el.files = dt.files;
    } catch (e) {}

    return true;
}

// Se revisa antes que cualquier otro código de la app: si el archivo no pasa,
// el resto de la app ni se entera; si pasa, se vuelve a avisar el cambio.
document.addEventListener("change", function(e) {
    const el = e.target;
    if (!el || el.tagName !== "INPUT" || el.type !== "file" || !el.files || !el.files.length) return;

    if (el.dataset.archivoRevisado === "1") {
        delete el.dataset.archivoRevisado;
        return;
    }

    e.stopImmediatePropagation();
    e.stopPropagation();

    validarArchivosNivan(el).then(function(ok) {
        if (!ok) return;
        el.dataset.archivoRevisado = "1";
        el.dispatchEvent(new Event("change", { bubbles: true }));
    });
}, true);

// Si el almacenamiento del navegador se llena, guardar ya no rompe la página.
(function() {
    const guardarOriginal = Storage.prototype.setItem;

    Storage.prototype.setItem = function(clave, valor) {
        try {
            return guardarOriginal.call(this, clave, valor);
        } catch (e) {
            console.warn("No se pudo guardar", clave, e);
        }
    };
})();

aplicarLimitesNivan(document.body);

new MutationObserver(function(cambios) {
    cambios.forEach(function(c) {
        c.addedNodes.forEach(function(n) { aplicarLimitesNivan(n); });
    });
}).observe(document.body, { childList: true, subtree: true });

function seleccionarTalle(boton, idProducto) {
    document.querySelectorAll(".talleBtn").forEach(function(btn) {
        btn.classList.remove("activo");
    });

    boton.classList.add("activo");

    mostrarAvisoMedidasTalle(boton, idProducto);
}

// ==============================
// AVISO "¿TE QUEDA?" AL ELEGIR TALLE
// ==============================
// Compara las medidas guardadas del usuario (nivanPerfilCorporal)
// con la fila del talle en la tabla de medidas de la publicación.
// Diferencias en cm: más de 2 cm por encima del talle = ajustado;
// más de 12 cm por debajo = holgado.

const MEDIDAS_AVISO_TALLE = [
    { clave: "busto", perfil: "busto", etiqueta: "de busto" },
    { clave: "cintura", perfil: "cintura", etiqueta: "de cintura" },
    { clave: "cadera", perfil: "cadera", etiqueta: "de cadera" }
];

function evaluarTalleSegunMedidas(medidasTalle, perfil) {
    const resultado = { ajustado: [], holgado: [], comparadas: 0 };

    MEDIDAS_AVISO_TALLE.forEach(function(m) {
        const talle = Number(medidasTalle && medidasTalle[m.clave]);
        const cuerpo = Number(perfil[m.perfil]);
        if (!talle || !cuerpo) return;

        resultado.comparadas++;
        const etiqueta = (m.clave === "busto" && perfil.tipo === "Hombre") ? "de pecho" : m.etiqueta;

        if (cuerpo - talle > 2) resultado.ajustado.push(etiqueta);
        else if (talle - cuerpo > 12) resultado.holgado.push(etiqueta);
    });

    return resultado;
}

function unirListaAvisoTalle(lista) {
    if (lista.length <= 1) return lista.join("");
    return lista.slice(0, -1).join(", ") + " y " + lista[lista.length - 1];
}

function mostrarAvisoMedidasTalle(boton, idProducto) {
    const seccion = boton.closest(".detalleSeccion");
    if (!seccion) return;

    let aviso = seccion.querySelector(".avisoMedidasTalle");
    const talle = boton.textContent.trim();
    const producto = productos.find(function(p) { return p.id === idProducto; });

    // "A medida" y "Consultar" no tienen medidas fijas: sin aviso.
    if (!producto || ["a medida", "consultar"].indexOf(talle.toLowerCase()) !== -1) {
        if (aviso) aviso.remove();
        return;
    }

    if (!aviso) {
        aviso = document.createElement("div");
        aviso.className = "avisoMedidasTalle";
        seccion.appendChild(aviso);
    }

    let perfil = null;
    try {
        perfil = JSON.parse(localStorage.getItem("nivanPerfilCorporal") || "null");
    } catch (e) {}

    const tabla = producto.tablaMedidas || {};
    let estado = "neutro";
    let titulo = "📏 ¿Te queda?";
    let cuerpo = "";
    let accion = "";

    if (!perfil || !perfil.busto || !perfil.cintura || !perfil.cadera) {
        cuerpo = "Cargá tus medidas y te avisamos si este talle te va a quedar bien.";
        accion = '<button type="button" class="avisoMedidasTalleBtn" onclick="irAAyudaTalle()">Cargar mis medidas</button>';
    } else {
        const evaluacion = evaluarTalleSegunMedidas(tabla[talle], perfil);

        if (evaluacion.comparadas === 0) {
            cuerpo = "Este talle no tiene medidas cargadas en la tabla.";
        } else if (evaluacion.ajustado.length) {
            estado = "alerta";
            cuerpo = "⚠️ Este producto podría quedarte ajustado " + unirListaAvisoTalle(evaluacion.ajustado) + ".";

            const alternativa = Object.keys(tabla).find(function(otro) {
                if (otro === talle) return false;
                const ev = evaluarTalleSegunMedidas(tabla[otro], perfil);
                return ev.comparadas > 0 && !ev.ajustado.length && !ev.holgado.length;
            });
            if (alternativa) {
                cuerpo += " Según tus medidas, el talle " + escaparHTMLNivan(alternativa) + " sería compatible.";
            }
        } else if (evaluacion.holgado.length) {
            estado = "alerta";
            cuerpo = "⚠️ Este producto podría quedarte holgado " + unirListaAvisoTalle(evaluacion.holgado) + ".";
        } else {
            estado = "ok";
            cuerpo = "Según tus medidas: ✅ Compatible con este talle.";
        }
    }

    aviso.className = "avisoMedidasTalle " + estado;
    aviso.innerHTML =
        '<button type="button" class="avisoMedidasTalleCerrar" aria-label="Cerrar" onclick="this.parentNode.remove()">×</button>' +
        "<strong>" + titulo + "</strong>" +
        "<p>" + cuerpo + "</p>" +
        accion +
        '<small>Compará tus medidas con la tabla de medidas de la tienda.</small>';
}

document.getElementById("modalProducto").addEventListener(
    "click",
    function(event) {
        if (event.target === this) {
            cerrarProducto();
        }
    }
);

document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        cerrarProducto();
    }
});

// INICIAR APLICACIÓN

// Sumamos al catálogo las publicaciones que se crearon desde
// "Vender" en sesiones anteriores (se guardan en este dispositivo).
// Las que están pausadas (activo: false) no se muestran en el catálogo.
purgarCuentasVencidasNivan();
const cuentasInactivasCatalogoNivan = idsCuentasInactivasNivan();
obtenerPublicacionesNivan().forEach(function(publicacion) {
    if (publicacion.activo === false) return;
    if (publicacion.vendedorId && cuentasInactivasCatalogoNivan[publicacion.vendedorId]) return;
    productos.push(publicacion);
});

// Cada país ve solo las publicaciones de gente de ese país.
// Las publicaciones anteriores (sin país cargado) cuentan como de Argentina.
productos = productos.filter(function(p) {
    return (p.pais || "AR") === (paisNivan() || "AR");
});

    actualizarFavoritos();
    // Dibuja el carrito guardado y su contador apenas abre la app
    // (antes el número quedaba en 0 hasta abrir el carrito).
    actualizarCarrito();
    mostrarProductos(productos);
    renderizarFeedNivan();
    renderizarVistosRecientemente();
    revisarBajasDePrecio();
    actualizarBadgeNotificaciones();
    aplicarPaisEnPantallaNivan();
    abrirProductoDesdeURL();

// Variables para poder pausar/reanudar el render loop
// cuando el usuario entra o sale de la pestaña "Medidas".
let bucle3DActivo = false;
let bucle3DListo = false;

async function iniciarCuerpo3D() {

    const visor = document.getElementById("visor3D");

    if (!visor) return;

    // Evita crear el visor dos veces.
    if (visor.dataset.modelo3dIniciado === "1") {
        // El modelo ya está cargado: solo hace falta reanudar el render.
        reanudarBucle3D();
        return;
    }
    visor.dataset.modelo3dIniciado = "1";

    try {

        // Cargamos Three.js y sus controles desde el importmap.
        const THREE = await import("three");

        const { OrbitControls } =
            await import("three/addons/controls/OrbitControls.js");

        const { GLTFLoader } =
            await import("three/addons/loaders/GLTFLoader.js");

        // Limpiar el mensaje de ejemplo.
        visor.innerHTML = "";

        const escena = new THREE.Scene();
        escena.background = new THREE.Color(0x111111);

        const ancho = Math.max(1, visor.clientWidth);
        const alto = Math.max(1, visor.clientHeight);

        const camara = new THREE.PerspectiveCamera(
            35,
            ancho / alto,
            0.01,
            1000
        );

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );

        renderer.setSize(ancho, alto, false);

        if ("outputColorSpace" in renderer) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }

        visor.appendChild(renderer.domElement);

        // Luces.
        const luzPrincipal = new THREE.DirectionalLight(
            0xffffff,
            3
        );
        luzPrincipal.position.set(2, 4, 5);
        escena.add(luzPrincipal);

        const luzRelleno = new THREE.DirectionalLight(
            0xffffff,
            1.5
        );
        luzRelleno.position.set(-3, 2, 2);
        escena.add(luzRelleno);

        escena.add(
            new THREE.AmbientLight(0xffffff, 1.4)
        );

        // Rotación y zoom táctil.
        const controles = new OrbitControls(
            camara,
            renderer.domElement
        );

        controles.enableDamping = true;
        controles.dampingFactor = 0.08;
        controles.enablePan = false;
        controles.minDistance = 0.05;
        controles.maxDistance = 1000;

        // Cargar el modelo.
        const loader = new GLTFLoader();

        loader.load(
    "cuerpo3d.glb",

            function(gltf) {

                const cuerpo = gltf.scene;

                // Forzamos doble cara en todos los materiales
                // para que el modelo se vea completo al girarlo
                // (si no, las caras traseras quedan invisibles).
                cuerpo.traverse(function(hijo) {
                    if (hijo.isMesh && hijo.material) {
                        const materiales = Array.isArray(hijo.material)
                            ? hijo.material
                            : [hijo.material];

                        materiales.forEach(function(mat) {
                            mat.side = THREE.DoubleSide;
                        });
                    }
                });

                escena.add(cuerpo);

                // Calculamos el tamaño real del modelo
                // para centrarlo y encuadrarlo automáticamente.
                const caja = new THREE.Box3()
                    .setFromObject(cuerpo);

                const centro = caja.getCenter(
                    new THREE.Vector3()
                );

                const tamaño = caja.getSize(
                    new THREE.Vector3()
                );

                const mayor = Math.max(
                    tamaño.x,
                    tamaño.y,
                    tamaño.z
                );

                if (!isFinite(mayor) || mayor <= 0) {
                    throw new Error(
                        "El GLB no tiene un tamaño válido."
                    );
                }

                cuerpo.position.sub(centro);

                const distancia =
                    mayor /
                    (2 * Math.tan(
                        THREE.MathUtils.degToRad(35 / 2)
                    )) * 1.25;

                camara.position.set(
                    0,
                    0,
                    distancia
                );

                camara.near = Math.max(
                    mayor / 1000,
                    0.001
                );

                camara.far = Math.max(
                    mayor * 100,
                    100
                );

                camara.updateProjectionMatrix();

                controles.target.set(0, 0, 0);
                controles.update();

            },

            function(progreso) {

            },

            function(error) {

                console.error(
                    "❌ ERROR CARGANDO EL GLB:",
                    error
                );

                visor.innerHTML = `
                    <div style="
                        color:white;
                        text-align:center;
                        padding:25px;
                        font-family:Arial,sans-serif;
                    ">
                        <div style="font-size:45px;">⚠️</div>
                        <strong>No se pudo cargar el modelo 3D</strong>
                        <div style="
                            margin-top:8px;
                            font-size:13px;
                            color:#bbb;
                        ">
                            Hubo un problema leyendo el modelo 3D.
                        </div>
                    </div>
                `;
            }
        );

        function animar() {

            // Si el usuario salió de la pestaña "Medidas",
            // dejamos de pedir frames: no seguimos gastando
            // CPU/GPU en segundo plano.
            if (!bucle3DActivo) return;

            requestAnimationFrame(animar);

            controles.update();

            renderer.render(
                escena,
                camara
            );
        }

        // Exponemos funciones simples para pausar/reanudar
        // el bucle de render desde cambiarPagina().
        window.reanudarBucle3D = function() {
            if (bucle3DActivo) return;
            bucle3DActivo = true;
            animar();
        };

        window.pausarBucle3D = function() {
            bucle3DActivo = false;
        };

        bucle3DListo = true;
        bucle3DActivo = true;
        animar();

        function ajustarVisor3D() {

            const nuevoAncho =
                Math.max(1, visor.clientWidth);

            const nuevoAlto =
                Math.max(1, visor.clientHeight);

            camara.aspect =
                nuevoAncho / nuevoAlto;

            camara.updateProjectionMatrix();

            renderer.setSize(
                nuevoAncho,
                nuevoAlto,
                false
            );
        }

        window.addEventListener(
            "resize",
            ajustarVisor3D
        );

        // El visor arranca dentro de una pestaña oculta (display:none),
        // así que al iniciar mide 0x0. Con ResizeObserver detectamos
        // el instante en que el contenedor pasa a tener tamaño real
        // (por ejemplo, al abrir la pestaña "Medidas") y reajustamos
        // la cámara y el renderer en ese momento, no solo al mover
        // la ventana del navegador.
        if (typeof ResizeObserver !== "undefined") {

            const observadorVisor3D = new ResizeObserver(
                ajustarVisor3D
            );

            observadorVisor3D.observe(visor);
        }

    } catch (error) {

        console.error(
            "❌ NO SE PUDO INICIAR EL VISOR 3D:",
            error
        );

        visor.innerHTML = `
            <div style="
                color:white;
                text-align:center;
                padding:25px;
                font-family:Arial,sans-serif;
            ">
                <div style="font-size:45px;">⚠️</div>
                <strong>No se pudo iniciar el visor 3D</strong>
                <div style="
                    margin-top:8px;
                    font-size:13px;
                    color:#bbb;
                ">
                    Abrí la consola de Acode para ver el error.
                </div>
            </div>
        `;
    }
}

// ==============================
// DESLIZAR ENTRE PESTAÑAS (como IG): funciona en todas las
// pestañas de abajo. Deslizar a la izquierda avanza a la
// siguiente pestaña; deslizar a la derecha vuelve a la anterior,
// y desde Home abre el panel de Configuración (las tres rayitas).
// ==============================
const ORDEN_PESTANAS_SWIPE = [
    'paginaHome',
    'paginaBuscador',
    'paginaMedidas',
    'paginaNotificaciones',
    'paginaPerfil'
];

function hayModalAbiertoSwipeNivan() {
    const selectores = [
        '.pantallaCompleta.abierta',
        '#modalCuenta.abierto',
        '#overlayPosteoFeedNivan.abierto',
        '#overlayDocumentacionNivan.abierto',
        '#overlayAccionChatNivan.abierto',
        '#modalRuedaColor.abierto',
        '#modalProducto.abierto',
        '#overlayCalifNivan.abierto',
        '#overlayChatNivan.abierto',
        '#overlayCompartirNivan.abierto',
        '#overlayEditorCarrito.abierto',
        '#overlayListaChatsNivan.abierto',
        '#overlayPosteoPerfil.abierto',
        '#overlayPreguntaVendedor.abierto',
        '#overlayReporteNivan.abierto',
        '#overlayConfirmacionNivan.abierto',
        '#carrito.abierto'
    ];

    return selectores.some(function(sel) {
        return document.querySelector(sel);
    });
}

// Si el toque arranca dentro de algo que ya se desliza/scrollea
// horizontalmente por su cuenta (carrusel de anuncios, galería de
// fotos del producto, filtros de categorías), dejamos que ese
// elemento maneje el gesto y no cambiamos de pestaña.
function empiezaEnScrollHorizontalPropioNivan(el) {
    let nodo = el;
    let saltos = 0;

    while (nodo && nodo !== document.body && saltos < 8) {
        if (nodo.id === 'carruselAnuncios') return true;

        if (nodo.scrollWidth > nodo.clientWidth + 2) {
            const estilo = getComputedStyle(nodo);
            if (estilo.overflowX === 'auto' || estilo.overflowX === 'scroll') return true;
        }

        nodo = nodo.parentElement;
        saltos++;
    }

    return false;
}

let inicioXSwipeTabsNivan = 0;
let inicioYSwipeTabsNivan = 0;
let empiezaEnScrollPropioSwipeTabsNivan = false;

document.addEventListener('touchstart', function(e) {
    if (!e.touches || e.touches.length !== 1) return;

    inicioXSwipeTabsNivan = e.touches[0].clientX;
    inicioYSwipeTabsNivan = e.touches[0].clientY;
    empiezaEnScrollPropioSwipeTabsNivan = empiezaEnScrollHorizontalPropioNivan(e.target);
}, { passive: true });

document.addEventListener('touchend', function(e) {
    if (empiezaEnScrollPropioSwipeTabsNivan) return;
    if (!e.changedTouches || e.changedTouches.length !== 1) return;

    const finalX = e.changedTouches[0].clientX;
    const finalY = e.changedTouches[0].clientY;
    const deltaX = finalX - inicioXSwipeTabsNivan;
    const deltaY = finalY - inicioYSwipeTabsNivan;

    const UMBRAL_SWIPE_TABS = 70;
    if (Math.abs(deltaX) < UMBRAL_SWIPE_TABS) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    const panelMiPerfilEl = document.getElementById('panelMiPerfilNivan');
    if (panelMiPerfilEl && panelMiPerfilEl.classList.contains('abierto')) {
        // Con "Mi perfil" abierto, deslizar a la derecha lo cierra.
        if (deltaX > 0) cerrarMiPerfilNivan();
        return;
    }

    const panelPerfilLateralEl = document.getElementById('panelPerfilLateral');
    const panelConfigAbierto = panelPerfilLateralEl && panelPerfilLateralEl.classList.contains('abierto');

    if (panelConfigAbierto) {
        // Con Configuración ya abierta, deslizar a la izquierda la cierra.
        if (deltaX < 0) cerrarPerfilLateral();
        return;
    }

    if (hayModalAbiertoSwipeNivan()) return;

    const paginaActivaEl = document.querySelector('.pagina.activa');
    if (!paginaActivaEl) return;

    const indice = ORDEN_PESTANAS_SWIPE.indexOf(paginaActivaEl.id);
    if (indice === -1) return;

    if (deltaX > 0) {
        // Deslizar a la derecha: pestaña anterior, o Configuración desde Home.
        if (paginaActivaEl.id === 'paginaHome') {
            abrirPerfilLateral();
        } else if (indice > 0) {
            irAPagina(ORDEN_PESTANAS_SWIPE[indice - 1]);
        }
    } else if (indice < ORDEN_PESTANAS_SWIPE.length - 1) {
        // Deslizar a la izquierda: siguiente pestaña.
        irAPagina(ORDEN_PESTANAS_SWIPE[indice + 1]);
    }
}, { passive: true });

// Al abrir la app: contador del círculo rojo de la foto de perfil.
try { actualizarBadgePerfilNivan(); } catch (e) {}

// Si llegan avisos desde otra pestaña/dispositivo, se actualiza solo.
window.addEventListener("storage", function() {
    try { actualizarBadgePerfilNivan(); } catch (e) {}
});
document.addEventListener("visibilitychange", function() {
    if (!document.hidden) { try { actualizarBadgePerfilNivan(); } catch (e) {} }
});

