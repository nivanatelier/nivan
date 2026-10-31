// ==============================
// CUENTA DE USUARIO
// ==============================


let usuarioActual = leerJSONNivan("nivanSesion", null);

// Compatibilidad: sesiones guardadas antes de tener identificación
// única / apodo / tienda / currículum / portafolio.
if (usuarioActual) {
    try {
        const guardadoEnLista = obtenerUsuarioPorIdNivan(usuarioActual.id);
        if (guardadoEnLista && Array.isArray(guardadoEnLista.portafolio)) {
            usuarioActual.portafolio = guardadoEnLista.portafolio;
        }
              // La tienda es del país elegido: se cargan los datos de la tienda de este país.
        if (guardadoEnLista) {
            camposTiendaNivan().forEach(function(campo) { usuarioActual[campo] = guardadoEnLista[campo]; });
        }
    } catch (e) {}

    if (!usuarioActual.idPublico) {
        usuarioActual.idPublico = normalizarBaseIdPublicoSeguro(usuarioActual.nombre);
    }
    if (usuarioActual.apodo === undefined) usuarioActual.apodo = "";
    if (usuarioActual.nombreTienda === undefined) usuarioActual.nombreTienda = "";
    if (usuarioActual.curriculum === undefined) usuarioActual.curriculum = null;
    if (!Array.isArray(usuarioActual.portafolio)) usuarioActual.portafolio = [];
    if (usuarioActual.bio === undefined) usuarioActual.bio = "";
    if (usuarioActual.bioTrabajo === undefined) usuarioActual.bioTrabajo = "";
    guardarJSONNivan("nivanSesion", usuarioActual);
}

// Los favoritos son de cada cuenta: se cargan los de quien tiene la sesión abierta.
sincronizarFavoritosConCuentaNivan(false);

// Wrapper mínimo porque en este punto del archivo todavía no están
// definidas las funciones de identificación única (se definen más
// abajo, junto con el resto de "CUENTA DE USUARIO"); si ya están
// disponibles, se delega en generarIdPublicoUnico.
function normalizarBaseIdPublicoSeguro(nombre) {
    if (typeof generarIdPublicoUnico === "function") {
        try { return generarIdPublicoUnico(nombre); } catch (e) {}
    }
    return "usuario" + Math.floor(Math.random() * 10000);
}

// ---- La tienda es de cada país ----
// Una misma cuenta puede tener una tienda en Argentina y otra distinta en Uruguay.
// Cada una guarda por separado su nombre, foto, biografía e identificación.
// Si cambiás de país y ahí no creaste tienda, es como si no tuvieras tienda.
function camposTiendaNivan() {
    return ["tiendaCreada", "nombreTienda", "fotoTienda", "bioTienda", "idTienda", "paisTienda", "mostrarPersonalEnTienda"];
}

function extraerDatosTiendaNivan(u) {
    const datos = {};
    camposTiendaNivan().forEach(function(campo) {
        if (u[campo] !== undefined) datos[campo] = u[campo];
    });
    return datos;
}

// Cuentas viejas: su tienda se queda en el país donde la crearon.
function paisTiendaViejaNivan(u) {
    const porId = paisDeIdTiendaNivan(u.idTienda);
    if (porId) return porId;
    if (PAISES_NIVAN[u.paisTienda]) return u.paisTienda;

    try {
        const pubs = leerJSONNivan("nivanPublicaciones", []);
        const mia = pubs.find(function(p) { return p && p.vendedorId === u.id && PAISES_NIVAN[p.pais]; });
        if (mia) return mia.pais;
    } catch (e) {}

    return "AR";
}

function tieneDatosTiendaNivan(u) {
    return camposTiendaNivan().some(function(campo) { return !!u[campo]; });
}

function obtenerUsuariosNivan() {
    const pais = paisNivan() || "AR";
    const lista = leerJSONNivan("nivanUsuarios", []);
    if (!Array.isArray(lista)) return [];

    return lista.map(function(u) {
        if (!u || typeof u !== "object") return u;

        let datos = {};
        if (u.tiendas && typeof u.tiendas === "object") {
            datos = u.tiendas[pais] || {};
        } else if (tieneDatosTiendaNivan(u) && paisTiendaViejaNivan(u) === pais) {
            datos = extraerDatosTiendaNivan(u);
        }

        const copia = Object.assign({}, u);
        camposTiendaNivan().forEach(function(campo) {
            const vacio = (campo === "tiendaCreada" || campo === "mostrarPersonalEnTienda") ? false : "";
            copia[campo] = datos[campo] !== undefined ? datos[campo] : vacio;
        });
        return copia;
    });
}

function guardarUsuariosNivan(usuarios) {
    const pais = paisNivan() || "AR";
    const previos = leerJSONNivan("nivanUsuarios", []);
    const previoPorId = {};
    (Array.isArray(previos) ? previos : []).forEach(function(u) { if (u && u.id) previoPorId[u.id] = u; });

    const aGuardar = usuarios.map(function(u) {
        if (!u || typeof u !== "object") return u;

        const previo = previoPorId[u.id];
        let tiendas = null;

        if (u.tiendas && typeof u.tiendas === "object") {
            tiendas = Object.assign({}, u.tiendas);
        } else if (previo && previo.tiendas && typeof previo.tiendas === "object") {
            tiendas = Object.assign({}, previo.tiendas);
        } else {
            tiendas = {};
            if (previo && tieneDatosTiendaNivan(previo)) {
                tiendas[paisTiendaViejaNivan(previo)] = extraerDatosTiendaNivan(previo);
            }
        }

        tiendas[pais] = extraerDatosTiendaNivan(u);
        return Object.assign({}, u, { tiendas: tiendas });
    });

    guardarJSONNivan("nivanUsuarios", aGuardar);
}

async function hashPasswordNivan(password) {
    const datos = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", datos);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// ==============================
// IDENTIFICACIÓN ÚNICA, NOMBRE MOSTRADO Y NOMBRE DE VENDEDOR
// ==============================
// La cuenta interna (usuario.id, tipo "NVU-...") nunca se toca: es la
// clave permanente que conecta publicaciones, comentarios y favoritos
// con su dueño, así que cambiar el nombre o la identificación pública
// nunca puede "desconectar" nada de eso.
//
// usuario.idPublico es la identificación única y editable que la
// persona ve y puede cambiar (pero nunca puede repetirse entre dos
// cuentas ni compartirse).

function normalizarBaseIdPublico(texto) {
    return (texto || "")
        .toString()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 16) || "usuario";
}

function idPublicoEstaDisponible(idPublico, idUsuarioAExcluir) {
    const usuarios = obtenerUsuariosNivan();
    return !usuarios.some(function(u) {
        return u.idPublico === idPublico && u.id !== idUsuarioAExcluir;
    });
}

function generarIdPublicoUnico(base) {
    const raiz = normalizarBaseIdPublico(base);
    let candidato = raiz;
    let sufijo = 0;

    while (!idPublicoEstaDisponible(candidato, null)) {
        sufijo++;
        candidato = raiz + sufijo;
    }

    return candidato;
}

// ---- Tienda: identificación propia ----
// La tienda es una cuenta aparte del perfil personal: tiene su propia
// identificación única, que siempre empieza con "T-" (esa parte no se
// puede borrar) y no puede repetirse con la de otra tienda.
const PREFIJO_ID_TIENDA_NIVAN = "T-";

function limpiarBaseIdTienda(texto) {
    return String(texto || "")
        .replace(/^\s*t-/i, "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 16);
}

function idTiendaEstaDisponible(idTienda, idUsuarioAExcluir) {
    const buscado = String(idTienda || "").toLowerCase();
    return !obtenerUsuariosNivan().some(function(u) {
        return u.idTienda && String(u.idTienda).toLowerCase() === buscado && u.id !== idUsuarioAExcluir;
    });
}

function generarIdTiendaUnico(base) {
    const raiz = limpiarBaseIdTienda(base) || "tienda";
    let candidato = PREFIJO_ID_TIENDA_NIVAN + raiz;
    let sufijo = 0;

    while (!idTiendaEstaDisponible(candidato, null)) {
        sufijo++;
        candidato = PREFIJO_ID_TIENDA_NIVAN + raiz + sufijo;
    }

    return candidato;
}

// Identificación de la tienda de una persona. Si ya tiene tienda (publicó
// algo) y todavía no tenía una, se le crea a partir de su identificación personal.
function obtenerIdTiendaNivan(idUsuario) {
    if (!idUsuario) return "";

    const usuarios = obtenerUsuariosNivan();
    const indice = usuarios.findIndex(function(u) { return u.id === idUsuario; });
    if (indice === -1) return "";
    if (usuarios[indice].idTienda) return usuarios[indice].idTienda;
    if (typeof usuarioTieneTiendaNivan !== "function" || !usuarioTieneTiendaNivan(idUsuario)) return "";

    const nuevo = generarIdTiendaUnico(usuarios[indice].idPublico || usuarios[indice].nombre);
    usuarios[indice].idTienda = nuevo;
    guardarUsuariosNivan(usuarios);

    if (usuarioActual && usuarioActual.id === idUsuario) {
        usuarioActual.idTienda = nuevo;
        guardarJSONNivan("nivanSesion", usuarioActual);
    }

    return nuevo;
}

function prefijoIdTiendaNivan(pais) {
    const codigo = PAISES_NIVAN[pais] ? pais : (paisNivan() || "AR");
    return "T-" + codigo + "-";
}

function paisDeIdTiendaNivan(idTienda) {
    const m = /^t-(ar|uy)-/i.exec(String(idTienda || ""));
    return m ? m[1].toUpperCase() : null;
}

function limpiarBaseIdTienda(texto) {
    return String(texto || "")
        .replace(/^\s*t-(ar|uy)-/i, "")
        .replace(/^\s*t-/i, "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 16);
}

function idTiendaEstaDisponible(idTienda, idUsuarioAExcluir) {
    const buscado = String(idTienda || "").toLowerCase();
    return !obtenerUsuariosNivan().some(function(u) {
        return u.idTienda && String(u.idTienda).toLowerCase() === buscado && u.id !== idUsuarioAExcluir;
    });
}

function generarIdTiendaUnico(base, pais) {
    const prefijo = prefijoIdTiendaNivan(pais);
    const raiz = limpiarBaseIdTienda(base) || "tienda";
    let candidato = prefijo + raiz;
    let sufijo = 0;

    while (!idTiendaEstaDisponible(candidato, null)) {
        sufijo++;
        candidato = prefijo + raiz + sufijo;
    }

    return candidato;
}

function guardarIdTiendaGeneradoNivan(usuarios, indice, nuevo) {
    usuarios[indice].idTienda = nuevo;
    usuarios[indice].paisTienda = paisDeIdTiendaNivan(nuevo) || usuarios[indice].paisTienda;
    guardarUsuariosNivan(usuarios);

    if (usuarioActual && usuarioActual.id === usuarios[indice].id) {
        usuarioActual.idTienda = nuevo;
        usuarioActual.paisTienda = usuarios[indice].paisTienda;
        guardarJSONNivan("nivanSesion", usuarioActual);
    }
}

function obtenerIdTiendaNivan(idUsuario) {
    if (!idUsuario) return "";

    const usuarios = obtenerUsuariosNivan();
    const indice = usuarios.findIndex(function(u) { return u.id === idUsuario; });
    if (indice === -1) return "";

    const actual = usuarios[indice].idTienda;
    if (actual) {
        if (paisDeIdTiendaNivan(actual)) return actual;
        const paisViejo = PAISES_NIVAN[usuarios[indice].paisTienda] ? usuarios[indice].paisTienda : null;
        const migrado = generarIdTiendaUnico(actual, paisViejo);
        guardarIdTiendaGeneradoNivan(usuarios, indice, migrado);
        return migrado;
    }

    if (typeof usuarioTieneTiendaNivan !== "function" || !usuarioTieneTiendaNivan(idUsuario)) return "";

    const nuevo = generarIdTiendaUnico(usuarios[indice].idPublico || usuarios[indice].nombre, null);
    guardarIdTiendaGeneradoNivan(usuarios, indice, nuevo);
    return nuevo;
}

// ---- Cuentas: perfil personal y tienda son dos cuentas distintas ----
// La clave de una cuenta es el id de la persona (perfil personal) o
// "T:" + ese id (tienda). Seguidores, seguidos y solicitudes se guardan
// por clave, así lo de la tienda nunca se mezcla con lo del perfil personal.
const PREFIJO_CLAVE_TIENDA_NIVAN = "T:";

function claveCuentaNivan(idUsuario, ambito) {
    return ambito === "tienda" ? PREFIJO_CLAVE_TIENDA_NIVAN + idUsuario : String(idUsuario);
}

function datosClaveCuentaNivan(clave) {
    const c = String(clave || "");
    return c.indexOf(PREFIJO_CLAVE_TIENDA_NIVAN) === 0
        ? { id: c.slice(PREFIJO_CLAVE_TIENDA_NIVAN.length), ambito: "tienda" }
        : { id: c, ambito: "personal" };
}

function claveCuentaActivaNivan() {
    return usuarioActual ? claveCuentaNivan(usuarioActual.id, modoCuentaNivan()) : null;
}

// ¿Esta persona sigue a esa cuenta con alguna de las suyas (personal o tienda)?
function personaSigueCuentaNivan(idPersona, claveSeguido) {
    if (!idPersona) return false;
    return usuarioSigueANivan(idPersona, claveSeguido) ||
        usuarioSigueANivan(claveCuentaNivan(idPersona, "tienda"), claveSeguido);
}

// Abre el perfil de una cuenta: la tienda o el perfil personal.
function abrirPerfilDeClaveNivan(clave) {
    const d = datosClaveCuentaNivan(clave);
    if (!d.id) return;
    if (d.ambito === "tienda") abrirPerfilVendedor(d.id);
    else abrirPerfilPersonalNivan(d.id, true);
}

// Nombre que se muestra en la app: el apodo si cargó uno, si no el
// nombre real.
function obtenerNombreMostradoUsuario(usuario) {
    if (!usuario) return "";
    return (usuario.apodo && usuario.apodo.trim()) ? usuario.apodo.trim() : (usuario.nombre || "");
}

// Nombre que aparece como "vendido por" en las publicaciones: el
// nombre de la tienda si la cargó, si no el nombre mostrado de arriba.
function obtenerNombreVendedorUsuario(usuario) {
    if (!usuario) return "";
    return (usuario.nombreTienda && usuario.nombreTienda.trim())
        ? usuario.nombreTienda.trim()
        : obtenerNombreMostradoUsuario(usuario);
}

// Resuelve el nombre de vendedor de una publicación en vivo a partir
// de su dueño (vendedorId), para que si esa persona cambia su nombre
// o el nombre de su tienda, las publicaciones ya hechas se actualicen
// solas. Si es una publicación vieja sin vendedorId, se usa el texto
// que ya tenía guardado.
function obtenerNombreVendedorProducto(producto) {
    if (producto && producto.vendedorId) {
        const usuarios = obtenerUsuariosNivan();
        const usuarioVendedor = usuarios.find(function(u) {
            return u.id === producto.vendedorId;
        });
        if (usuarioVendedor) return obtenerNombreVendedorUsuario(usuarioVendedor);
    }
    return (producto && producto.vendedor) || "Vendedor NIVAN";
}

// Guarda cambios sobre usuarioActual tanto en la sesión como en la
// lista de usuarios registrados, en un solo lugar.
function persistirUsuarioActual(camposActualizados) {
    if (!usuarioActual) return;

    const copiaAnterior = {};
    Object.keys(camposActualizados).forEach(function(k) { copiaAnterior[k] = usuarioActual[k]; });

    // Primero la lista general de usuarios (es la que lee el feed de publicaciones de la gente).
    const usuarios = obtenerUsuariosNivan();
    const indice = usuarios.findIndex(function(u) {
        return u.id === usuarioActual.id;
    });

    if (indice !== -1) {
        usuarios[indice] = Object.assign({}, usuarios[indice], camposActualizados);
        try {
            guardarUsuariosNivan(usuarios);
        } catch (e) {
            // No hay espacio: no dejamos el cambio "a medias" solo en memoria.
            alert("No se pudo guardar: el almacenamiento de este dispositivo está lleno. Probá con una foto más liviana o borrá publicaciones viejas.");
            return false;
        }
    }

    Object.assign(usuarioActual, camposActualizados);
    try {
        localStorage.setItem("nivanSesion", JSON.stringify(usuarioActual));
    } catch (e) {
        // La sesión es solo una copia: si no entra, queda la de la lista general.
        try {
            const sinPortafolio = Object.assign({}, usuarioActual, { portafolio: [] });
            localStorage.setItem("nivanSesion", JSON.stringify(sinPortafolio));
        } catch (e2) {}
    }
    return true;
}

function abrirCuenta() {
    document.getElementById("modalCuenta").classList.add("abierto");

    if (usuarioActual) {
        mostrarPerfil();
    } else {
        mostrarLogin();
    }
}

function cerrarCuenta() {
    document.getElementById("modalCuenta").classList.remove("abierto");
}

function mostrarRegistro() {
    ocultarVistasExtraNivan();
    document.getElementById("vistaLogin").style.display = "none";
    document.getElementById("vistaPerfil").style.display = "none";
    document.getElementById("vistaRegistro").style.display = "block";
    actualizarMedidorPasswordNivan();
}

// ==============================
// FUERZA DE LA CONTRASEÑA (al crear cuenta)
// ==============================
// Tiene que tener 8+ caracteres, una mayúscula, un número y un carácter
// especial (por ejemplo "."). Hasta que sea fuerte no se puede crear la cuenta.
function evaluarPasswordNivan(password) {
    const reglas = [
        { ok: password.length >= 8, falta: "8 caracteres" },
        { ok: /\p{Lu}/u.test(password), falta: "una mayúscula" },
        { ok: /\d/.test(password), falta: "un número" },
        { ok: /[^\p{L}\p{N}\s]/u.test(password), falta: "un símbolo (ej. .)" }
    ];

    return {
        cumplidas: reglas.filter(function(r) { return r.ok; }).length,
        faltan: reglas.filter(function(r) { return !r.ok; }).map(function(r) { return r.falta; }),
        fuerte: reglas.every(function(r) { return r.ok; })
    };
}

function actualizarMedidorPasswordNivan() {
    const campo = document.getElementById("registroPassword");
    const boton = document.getElementById("botonCrearCuentaNivan");
    const medidor = document.getElementById("medidorPasswordNivan");
    if (!campo || !medidor) return;

    const r = evaluarPasswordNivan(campo.value);
    const barra = document.getElementById("barraPasswordNivan");
    const texto = document.getElementById("textoPasswordNivan");
    const falta = document.getElementById("faltaPasswordNivan");

    medidor.style.display = campo.value ? "block" : "none";
    barra.style.width = (r.cumplidas * 25) + "%";

    if (r.fuerte) {
        barra.style.background = "#4cd08a";
        texto.textContent = "Contraseña fuerte";
        texto.style.color = "#4cd08a";
    } else if (r.cumplidas >= 2) {
        barra.style.background = "#f5b942";
        texto.textContent = "Contraseña media";
        texto.style.color = "#f5b942";
    } else {
        barra.style.background = "#ff4d4d";
        texto.textContent = "Contraseña débil";
        texto.style.color = "#ff4d4d";
    }

    falta.textContent = r.fuerte ? "" : "Falta: " + r.faltan.join(", ");
    if (boton) boton.disabled = !r.fuerte;
}

function mostrarLogin() {
    ocultarVistasExtraNivan();
    document.getElementById("vistaRegistro").style.display = "none";
    document.getElementById("vistaPerfil").style.display = "none";
    document.getElementById("vistaLogin").style.display = "block";
}

// Cartel al crear la cuenta sin documento ni biometría. Devuelve true si elige continuar.
function confirmarSinDocumentacionNivan() {
    return new Promise(function(resolve) {
        const overlay = document.getElementById("overlayDocumentacionNivan");
        const btnContinuar = document.getElementById("btnDocContinuarNivan");
        const btnCargar = document.getElementById("btnDocCargarNivan");

        if (!overlay || !btnContinuar || !btnCargar) { resolve(true); return; }

        function cerrar(continuar) {
            overlay.classList.remove("abierto");
            btnContinuar.onclick = null;
            btnCargar.onclick = null;
            overlay.onclick = null;

            if (!continuar) {
                const campo = document.getElementById("registroFoto_dniFrente");
                if (campo && campo.scrollIntoView) campo.scrollIntoView({ behavior: "smooth", block: "center" });
            }

            resolve(continuar);
        }

        btnContinuar.onclick = function() { cerrar(true); };
        btnCargar.onclick = function() { cerrar(false); };
        overlay.onclick = function(e) { if (e.target === overlay) cerrar(false); };
        overlay.classList.add("abierto");
    });
}

async function registrarUsuario() {
    const nombre = document.getElementById("registroNombre").value.trim();
    const email = document.getElementById("registroEmail").value.trim().toLowerCase();
    const password = document.getElementById("registroPassword").value;
    const fotoInput = document.getElementById("registroFoto");

    if (!nombre || !email || !password) {
        alert("Completá nombre, email y contraseña.");
        return;
    }

    if (!esEmailValidoNivan(email)) {
        alert(MENSAJE_EMAIL_INVALIDO_NIVAN);
        return;
    }

    if (!evaluarPasswordNivan(password).fuerte) {
        alert("La contraseña es débil.");
        return;
    }

    const usuarios = obtenerUsuariosNivan();

    if (usuarios.some(u => u.email === email)) {
        alert("Ya existe una cuenta con ese email.");
        return;
    }

    // La documentación es opcional al crear la cuenta: o se cargan las 3 fotos,
    // o ninguna (y se avisa qué se pierde hasta cargarla).
    const cargadasReg = FOTOS_VERIFICACION_NIVAN.filter(function(f) { return fotosRegistroNivan[f.clave]; });
    const faltanFotos = FOTOS_VERIFICACION_NIVAN.filter(function(f) { return !fotosRegistroNivan[f.clave]; });
    let sinDocumentacion = false;

    if (cargadasReg.length === 0) {
        const continuar = await confirmarSinDocumentacionNivan();
        if (!continuar) return;
        sinDocumentacion = true;
    } else if (faltanFotos.length) {
        alert("Falta: " + faltanFotos.map(function(f) { return f.titulo; }).join(", ") + ". Cargá las 3 fotos o dejalas todas vacías para continuar sin documentación.");
        return;
    }

    const botonCrear = document.getElementById("botonCrearCuentaNivan");
    const textoBotonCrear = botonCrear ? botonCrear.textContent : "";
    let evaluacion;

    if (sinDocumentacion) {
        evaluacion = { ok: true, verificacion: null };
    } else {
        if (botonCrear) { botonCrear.disabled = true; botonCrear.textContent = "Analizando…"; }
        evaluacion = await evaluarVerificacionNivan(fotosRegistroNivan, null);
        if (botonCrear) { botonCrear.disabled = false; botonCrear.textContent = textoBotonCrear; }
    }

    if (!evaluacion.ok) {
        alert(evaluacion.mensaje);
        evaluacion.repetir.forEach(function(clave) {
            limpiarFotoNivan("registroFoto_" + clave, "okFotoReg_" + clave, fotosRegistroNivan, clave);
        });
        return;
    }

    const crearUsuario = async (foto = "") => {
        const r = await apiNivan("/api/registro", { nombre: nombre, email: email, password: password, pais: paisNivan() || "AR" });
        if (!r.ok) { alert(r.error); return; }
        const usuario = {
            id: r.usuario.id,
            nombre,
            apodo: "",
            idPublico: r.usuario.idPublico,
            nombreTienda: "",
            email,
            passwordHash: "",
            foto,
            curriculum: null,
            portafolio: [],
            bio: "",
            bioTrabajo: "",
            verificacion: evaluacion.verificacion
        };

        usuarios.push(usuario);
        if (!sinDocumentacion) {
            const rv = await apiNivan("/api/verificacion", { fotos: fotosRegistroNivan });
            if (!rv.ok) {
                usuario.verificacion = null;
                alert("Tu cuenta se creó, pero no pudimos enviar las fotos: " + rv.error + " Enviálas de nuevo desde Privacidad y seguridad.");
            }
        }
        fotosRegistroNivan = {};
        guardarUsuariosNivan(usuarios);
        usuarioActual = {
            id: usuario.id,
            nombre: usuario.nombre,
            apodo: usuario.apodo,
            idPublico: usuario.idPublico,
            nombreTienda: usuario.nombreTienda,
            email: usuario.email,
            foto: usuario.foto,
            curriculum: usuario.curriculum,
            portafolio: usuario.portafolio,
            bio: usuario.bio || "",
            bioTrabajo: usuario.bioTrabajo || ""
        };
        guardarJSONNivan("nivanSesion", usuarioActual);
        sincronizarFavoritosConCuentaNivan(true);
        crearSesionActivaNivan(usuario.id);
        registrarEventoLoginNivan(usuario.id, "registro");
        alert(sinDocumentacion
        ? "¡Cuenta creada! Ya podés ver el marketplace, añadir a favoritos y al carrito. Cuando quieras, cargá tu " + nombreDocumentoNivan() + " desde Privacidad y seguridad › Estado de verificación para poder comprar y vender."
        : evaluacion.sinAnalisis
        ? "¡Cuenta creada! Tu " + nombreDocumentoNivan() + " quedó pendiente de revisión. Mientras tanto podés ver el marketplace, añadir a favoritos y al carrito."       
        : "¡Cuenta creada correctamente! Tu cuenta quedó creada.");
        mostrarPerfil();
        cargarDatosCuentaEnCompra();
        revisarBajasDePrecio();
    };

    if (fotoInput.files && fotoInput.files[0]) {
        const lector = new FileReader();
        lector.onload = () => crearUsuario(lector.result);
        lector.readAsDataURL(fotoInput.files[0]);
    } else {
        await crearUsuario("");
    }
}

async function iniciarSesion() {
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        alert("Completá tu email y contraseña.");
        return;
    }

    if (!esEmailValidoNivan(email)) {
        alert(MENSAJE_EMAIL_INVALIDO_NIVAN);
        return;
    }

    const r = await apiNivan("/api/login", { email: email, password: password });
    if (!r.ok) {
        const existente = obtenerUsuariosNivan().find(u => u.email === email);
        if (existente) registrarEventoLoginNivan(existente.id, "fallido");
        alert(r.error);
        return;
    }

    // La cuenta vive en el servidor; acá se guarda una copia para que el resto de la app funcione igual.
    const usuarios = obtenerUsuariosNivan();
    let usuario = usuarios.find(u => u.id === r.usuario.id);
    if (!usuario) {
        const s = r.usuario;
        usuarios.push({
            id: s.id, nombre: s.nombre, apodo: s.apodo || "", idPublico: s.idPublico, nombreTienda: s.nombreTienda || "",
            email: s.email, passwordHash: "", foto: s.foto || "", curriculum: null, portafolio: [],
            bio: s.bio || "", bioTrabajo: s.bioTrabajo || "", verificacion: null
        });
        guardarUsuariosNivan(usuarios);
        usuario = obtenerUsuariosNivan().find(u => u.id === s.id);
    }
    // El estado de la verificación lo decide el servidor (lo aprueba o rechaza una persona de Nivan).
    sincronizarVerificacionNivan(r.usuario);
    usuario = obtenerUsuariosNivan().find(u => u.id === r.usuario.id) || usuario;

    // Cuentas creadas antes de tener identificación única / apodo /
    // tienda: les completamos esos campos ahora, la primera vez que
    // inician sesión, sin pisar nada de lo que ya tenían.
    if (!usuario.idPublico) {
        usuario.idPublico = generarIdPublicoUnico(usuario.nombre);
        const usuariosActualizados = obtenerUsuariosNivan();
        const indiceUsuario = usuariosActualizados.findIndex(u => u.id === usuario.id);
        if (indiceUsuario !== -1) {
            usuariosActualizados[indiceUsuario].idPublico = usuario.idPublico;
            guardarUsuariosNivan(usuariosActualizados);
        }
    }

    if (usuario.dosPasos && usuario.dosPasos.activo) {
        iniciarVerificacion2PasosNivan(usuario);
        return;
    }

    completarInicioSesionNivan(usuario);
}

// Deja la sesión abierta una vez que la contraseña (y, si la tiene
// activada, la verificación en 2 pasos) salió bien.
function completarInicioSesionNivan(usuario) {
    let reactivadaNivan = null;

    if (usuario.desactivada || usuario.eliminacionProgramada) {
        const eliminando = !!usuario.eliminacionProgramada;
        const pregunta = eliminando
            ? "Tu cuenta está programada para eliminarse el " + new Date(usuario.eliminacionProgramada).toLocaleDateString("es-AR") + ". ¿Querés cancelar la eliminación y recuperarla?"
            : "Tu cuenta está desactivada. ¿Querés reactivarla?";
        if (!confirm(pregunta)) {
            mostrarLogin();
            return;
        }
        actualizarUsuarioListaNivan(usuario.id, { desactivada: null, eliminacionProgramada: null });
        usuario = Object.assign({}, usuario, { desactivada: null, eliminacionProgramada: null });
        reactivadaNivan = eliminando ? "eliminacion_cancelada" : "cuenta_reactivada";
    }

    usuarioActual = {
        id: usuario.id,
        nombre: usuario.nombre,
        apodo: usuario.apodo || "",
        idPublico: usuario.idPublico,
        nombreTienda: usuario.nombreTienda || "",
        email: usuario.email,
        foto: usuario.foto || "",
        curriculum: usuario.curriculum || null,
        portafolio: Array.isArray(usuario.portafolio) ? usuario.portafolio : [],
        tiposTrabajo: usuario.tiposTrabajo || [],
        bio: usuario.bio || "",
        bioTrabajo: usuario.bioTrabajo || "",
        idTienda: usuario.idTienda || "",
        fotoTienda: usuario.fotoTienda || "",
        bioTienda: usuario.bioTienda || "",
        mostrarPersonalEnTienda: !!usuario.mostrarPersonalEnTienda,
        tiendaCreada: !!usuario.tiendaCreada
    };
    guardarJSONNivan("nivanSesion", usuarioActual);
    sincronizarFavoritosConCuentaNivan(true);
    crearSesionActivaNivan(usuario.id);
    registrarEventoLoginNivan(usuario.id, "login");
    mostrarPerfil();
    cargarDatosCuentaEnCompra();
    revisarBajasDePrecio();

    if (reactivadaNivan) {
        registrarEventoLoginNivan(usuario.id, reactivadaNivan);
        // Se recarga para que vuelvan a verse sus publicaciones en el catálogo.
        setTimeout(recargarAppNivan, 50);
    }
}

function mostrarPerfil() {
    ocultarVistasExtraNivan();
    document.getElementById("vistaLogin").style.display = "none";
    document.getElementById("vistaRegistro").style.display = "none";
    document.getElementById("vistaPerfil").style.display = "block";

    const foto = usuarioActual && usuarioActual.foto
        ? `<img class="fotoPerfilNivan" src="${escaparHTMLNivan(usuarioActual.foto)}" alt="Foto de perfil">`
        : "";

    document.getElementById("informacionUsuario").innerHTML = `
        ${foto}
        <p><strong>${escaparHTMLNivan(usuarioActual.nombre)}</strong></p>
        <br>
        <p>${usuarioActual.email}</p>
        <br>
        <p>Cuenta de NIVAN</p>
    `;

    actualizarBadgeNotificaciones();
}

// ==============================
// PANEL LATERAL DE PERFIL (mi perfil / mis comentarios / mi tienda)
// ==============================

// Qué vista se muestra dentro del panel: el perfil personal (bio,
// currículum, publicaciones personales) o la tienda (si el usuario
// tiene una). Siempre arranca en "personal" cada vez que se abre.
let vistaPerfilLateralActual = "personal";

// Etiquetas cortas para mostrar el tipo de trabajo elegido en "Mi tipo de
// trabajo" arriba, al lado de "Currículum".
const ETIQUETAS_TIPO_TRABAJO_PERFIL = {
    disenador: "Diseñador/a",
    disenador_taller: "Diseñador/a con taller",
    costurero: "Costurero/a",
    revendedor: "Revendedor/a",
    molderista: "Molderista/Patronista",
    proveedor_telas: "Proveedor de telas",
    modelo_influencer: "Modelo/Influencer",
    cliente_mayorista: "Comprador mayorista",
    modista: "Modista/o",
    sastre: "Sastre",
    marroquineria_cuero: "Marroquinería / Cuero",
    taller_confeccion: "Taller de confección",
    bordador_estampador: "Bordado / Estampado",
    cortador: "Cortador/a"
};

function obtenerEtiquetaTipoTrabajoPerfilLateral() {
    const tipos = (usuarioActual && usuarioActual.tiposTrabajo) || [];
    if (!tipos.length) return "Agregar tipo de trabajo";
    return ETIQUETAS_TIPO_TRABAJO_PERFIL[tipos[0]] || "Tipo de trabajo";
}

function abrirPerfilLateral() {
    renderizarConfigLateral();
    document.getElementById("panelPerfilLateral").classList.add("abierto");
    document.getElementById("overlayPerfilLateral").classList.add("abierto");
}

function cerrarPerfilLateral() {
    document.getElementById("panelPerfilLateral").classList.remove("abierto");
    document.getElementById("overlayPerfilLateral").classList.remove("abierto");
    // Los botones de "Mi perfil" llaman a esta función antes de navegar:
    // también cerramos ese panel.
    cerrarMiPerfilNivan();
}

// Panel lateral de Configuración (se abre con las tres rayitas):
// cuenta, tipo de trabajo, vender, compras, mensajes, actividad,
// configuración de cuenta y privacidad.
function renderizarConfigLateral() {
    const contenido = document.getElementById("contenidoConfigLateral");
    const pie = document.getElementById("pieConfigLateral");
    if (!contenido) return;

    const bloqueCuenta = usuarioActual
        ? `
            <div class="cuentaResumenConfigLateral" onclick="cerrarPerfilLateral(); abrirCuenta();">
                ${usuarioActual.foto
                    ? `<img class="fotoPerfilLateral" src="${escaparHTMLNivan(usuarioActual.foto)}" alt="Foto de perfil">`
                    : `<div class="fotoPerfilLateralVacia">👤</div>`}
                <div>
                    <p class="nombrePerfilLateral">${obtenerNombreMostradoUsuario(usuarioActual)}</p>
                    <p class="subTextoPerfilLateral">ID: ${usuarioActual.idPublico || "—"}</p>
                    <p class="subTextoPerfilLateral">${usuarioActual.email}</p>
                </div>
            </div>
        `
        : `<button type="button" onclick="cerrarPerfilLateral(); abrirCuenta();"><span>Iniciar sesión / Registrarse</span></button>`;

    contenido.innerHTML = `
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">Configuración</h2>
            <p class="subTextoPerfilLateral">Tu cuenta y configuración.</p>
        </div>
        <div class="buscadorConfigLateralCont">
            <input
                type="text"
                id="buscadorConfigLateral"
                class="buscadorConfigLateral"
                placeholder="🔎 Buscar en Configuración..."
                oninput="buscarEnConfiguracionNivan(this.value)">
        </div>
        <div id="resultadosBuscadorConfigLateral" class="perfilMenu" style="display:none;"></div>
        <div class="perfilMenu" id="menuConfigLateralNormal">
            ${bloqueCuenta}
            ${usuarioActual ? `<button type="button" id="botonVerificacionLateralNivan" onclick="cerrarPerfilLateral(); abrirEstadoVerificacionNivan();"><span>✅ Estado de verificación</span></button>` : ""}
            <button type="button" onclick="abrirDesdeConfigNivan(abrirMisCompras, 'pantallaMisCompras');"><span>Mis compras</span></button>
            <button type="button" id="botonVenderLateralNivan" onclick="abrirDesdeConfigNivan(irAVender, 'pantallaVender');"><span>Panel de Vendedor</span></button>
                        <button type="button" id="botonHerramientasLateralNivan" onclick="abrirDesdeConfigNivan(abrirHerramientasAvanzadasNivan, 'pantallaPatronajeNivan');"><span>Herramientas avanzadas <span class="patPildoraBeta">BETA</span></span></button>
            <button type="button" onclick="cerrarPerfilLateral(); abrirConfigAppNivan();"><span>Configuración</span></button>
            <button type="button" onclick="cerrarPerfilLateral(); abrirPrivacidadSeguridadNivan();"><span>Privacidad y seguridad</span></button>
        </div>
    `;

    if (pie) {
        pie.innerHTML = usuarioActual
            ? `<button type="button" class="botonCerrarSesionConfigLateral" onclick="if (cerrarSesion()) cerrarPerfilLateral();">← Cerrar sesión</button>`
            : "";
    }
}

// ==============================
// BUSCADOR DENTRO DE CONFIGURACIÓN
// Busca por nombre entre TODOS los botones de Configuración,
// incluidos los que están adentro de Vender, Mis compras,
// Configuración (app) y Privacidad y seguridad.
// ==============================

const BUSCADOR_CONFIG_NIVAN = [
    { texto: "Mi tipo de trabajo", ruta: "Panel de Vendedor", accion: function () { abrirDesdeConfigNivan(irAVender, "pantallaVender"); if (usuarioActual) irATipoTrabajo(); } },
    { texto: "Panel de Vendedor", ruta: "Configuración", accion: function () { abrirDesdeConfigNivan(irAVender, "pantallaVender"); } },
    { texto: "Crear publicación nueva", ruta: "Panel de Vendedor", accion: function () { abrirCrearPublicacion(); } },
    { texto: "Mis publicaciones", ruta: "Panel de Vendedor", accion: function () { irAMisPublicaciones(); } },
    { texto: "Mis ventas", ruta: "Panel de Vendedor", accion: function () { abrirMisVentas(); } },
    { texto: "Estadísticas de venta", ruta: "Panel de Vendedor", accion: function () { abrirEstadisticasVentaNivan(); } },
    { texto: "Vacantes disponibles de mi negocio", ruta: "Panel de Vendedor", accion: function () { abrirPanelVacantesNivan(); } },
    { texto: "Herramientas avanzadas (Beta) · patronaje", ruta: "Panel de Vendedor", accion: function () { abrirDesdeConfigNivan(abrirHerramientasAvanzadasNivan, "pantallaPatronajeNivan"); } },
    { texto: "Herramientas premium", ruta: "Panel de Vendedor", accion: function () { abrirHerramientasPremiumNivan(); } },
    { texto: "Mis compras", ruta: "Configuración", accion: function () { abrirDesdeConfigNivan(abrirMisCompras, "pantallaMisCompras"); } },
    { texto: "Tus cupones", ruta: "Mis compras", accion: function () { abrirTusCuponesNivan(); } },
    { texto: "Configuración", ruta: "Configuración", accion: function () { abrirConfigAppNivan(); } },
    { texto: "Sonidos de la app", ruta: "Configuración", accion: function () { abrirSonidosConfigNivan(); } },
    { texto: "Moneda / País", ruta: "Configuración", accion: function () { abrirMonedaPaisConfigNivan(); } },
    { texto: "Mis comentarios", ruta: "Configuración", accion: function () { abrirMisComentariosDesdeConfigNivan(); } },
    { texto: "Métodos de pago guardados", ruta: "Carrito (⋮)", accion: function () { abrirGuardadosDesdeBuscadorNivan("pagos"); } },
    { texto: "Direcciones de envío guardadas", ruta: "Carrito (⋮)", accion: function () { abrirGuardadosDesdeBuscadorNivan("direcciones"); } },
    { texto: "Ahorro de datos / calidad de carga", ruta: "Configuración", accion: function () { abrirAhorroDatosNivan(); } },
    { texto: "Versión / Soporte", ruta: "Configuración", accion: function () { abrirVersionSoporteNivan(); } },
    { texto: "Privacidad y seguridad", ruta: "Configuración", accion: function () { abrirPrivacidadSeguridadNivan(); } },
    { texto: "Cambiar contraseña", ruta: "Privacidad y seguridad", accion: function () { abrirCambiarPasswordNivan(); } },
    { texto: "Sesiones activas", ruta: "Privacidad y seguridad", accion: function () { abrirSesionesActivasNivan(); } },
    { texto: "Historial de inicios de sesión", ruta: "Privacidad y seguridad", accion: function () { abrirHistorialLoginNivan(); } },
    { texto: "Autenticación en 2 pasos", ruta: "Privacidad y seguridad", accion: function () { abrirAutenticacion2PasosNivan(); } },
    { texto: "Privacidad del perfil", ruta: "Privacidad y seguridad", accion: function () { abrirPrivacidadPerfilNivan(); } },
    { texto: "Quién puede escribirme", ruta: "Privacidad y seguridad", accion: function () { abrirQuienPuedeEscribirmeNivan(); } },
    { texto: "Estado de verificación", ruta: "Configuración", accion: function () { abrirEstadoVerificacionNivan(); } },
    { texto: "Usuarios bloqueados", ruta: "Privacidad y seguridad", accion: function () { abrirUsuariosBloqueadosNivan(); } },
    { texto: "Eliminar / desactivar cuenta", ruta: "Privacidad y seguridad", accion: function () { abrirEliminarCuentaNivan(); } },
    { texto: "Cerrar sesión", ruta: "Configuración", accion: function () { cerrarSesion(); } }
];

let __resultadosBuscadorConfigNivanActual = [];

function buscarEnConfiguracionNivan(valor) {
    const menu = document.getElementById("menuConfigLateralNormal");
    const resultados = document.getElementById("resultadosBuscadorConfigLateral");
    if (!menu || !resultados) return;

    const texto = valor.trim().toLowerCase();

    if (!texto) {
        resultados.style.display = "none";
        resultados.innerHTML = "";
        menu.style.display = "";
        return;
    }

    const coincidencias = BUSCADOR_CONFIG_NIVAN.filter(function (item) {
        return item.texto.toLowerCase().includes(texto);
    });

    __resultadosBuscadorConfigNivanActual = coincidencias;
    menu.style.display = "none";
    resultados.style.display = "flex";

    resultados.innerHTML = coincidencias.length
        ? coincidencias.map(function (item, i) {
            return `
                <button type="button" onclick="ejecutarResultadoBuscadorConfigNivan(${i})">
                    <div style="display:flex; flex-direction:column; gap:2px; transform:skewX(18deg);">
                        <span>${escaparHTMLNivan(item.texto)}</span>
                        <small class="rutaBuscadorConfigNivan">En: ${escaparHTMLNivan(item.ruta)}</small>
                    </div>
                </button>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral" style="padding:10px 4px;">No encontramos ningún botón con ese nombre.</p>`;
}

function ejecutarResultadoBuscadorConfigNivan(i) {
    const item = __resultadosBuscadorConfigNivanActual[i];
    if (!item) return;
    cerrarPerfilLateral();
    item.accion();
}

// Panel "Configuración"

function abrirConfigAppNivan() {
    const contenido = document.getElementById("contenidoConfigAppNivan");
    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="cerrarConfigAppNivan(); abrirPerfilLateral();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">Configuración</h2>
        </div>
        <div class="listaVender" style="margin-top:20px;">
            <button type="button" onclick="abrirSonidosConfigNivan()"><span>🔊 Sonidos de la app</span></button>
            <button type="button" onclick="abrirMonedaPaisConfigNivan()"><span>💱 Moneda / País</span></button>
            <button type="button" onclick="abrirMisComentariosDesdeConfigNivan()"><span>💬 Mis comentarios</span></button>
            <button type="button" onclick="abrirAhorroDatosNivan()"><span>📶 Ahorro de datos / calidad de carga</span></button>
            <button type="button" onclick="cerrarConfigAppNivan(); abrirTutorialNivan();"><span>📖 Tutorial de uso</span></button>
            <button type="button" onclick="abrirVersionSoporteNivan()"><span>ℹ️ Versión / Soporte</span></button>
        </div>
    `;
    document.getElementById("panelConfigAppNivan").classList.add("abierto");
    document.getElementById("overlayConfigAppNivan").classList.add("abierto");
}

function cerrarConfigAppNivan() {
    document.getElementById("panelConfigAppNivan").classList.remove("abierto");
    document.getElementById("overlayConfigAppNivan").classList.remove("abierto");
    __guardadosDesdeCarritoNivan = false;
    document.body.classList.remove("guardadosDesdeCarritoNivan");
}

function abrirSonidosConfigNivan() {
    const contenido = document.getElementById("contenidoConfigAppNivan");
    if (!contenido) return;

    const activo = sonidosActivosNivan();

    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="abrirConfigAppNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🔊 Sonidos de la app</h2>
            <p class="subTextoPerfilLateral">Activá o desactivá el sonido al tocar los botones.</p>
        </div>
        <div class="filaSonidosNivan">
            <span>Sonido al tocar</span>
            <button type="button" id="interruptorSonidosNivan"
                class="interruptorNivan sinSonidoClickNivan ${activo ? "activo" : ""}"
                role="switch" aria-checked="${activo}"
                aria-label="Sonido al tocar los botones"
                onclick="alternarSonidosNivan()"></button>
        </div>
        <p id="estadoSonidosNivan" class="subTextoPerfilLateral">${activo ? "Sonidos activados" : "Sonidos desactivados"}</p>
    `;

    document.getElementById("panelConfigAppNivan").classList.add("abierto");
    document.getElementById("overlayConfigAppNivan").classList.add("abierto");
}

function alternarSonidosNivan() {
    const nuevo = !sonidosActivosNivan();
    guardarSonidosActivosNivan(nuevo);

    const interruptor = document.getElementById("interruptorSonidosNivan");
    const estado = document.getElementById("estadoSonidosNivan");
    if (interruptor) {
        interruptor.classList.toggle("activo", nuevo);
        interruptor.setAttribute("aria-checked", String(nuevo));
    }
    if (estado) estado.textContent = nuevo ? "Sonidos activados" : "Sonidos desactivados";

    // Al activarlo suena un click de muestra; al desactivarlo queda en silencio.
    if (nuevo) sonidoClickNivan();
}
function abrirMonedaPaisConfigNivan() {
    const contenido = document.getElementById("contenidoConfigAppNivan");
    if (!contenido) return;

    const actual = paisNivan() || "AR";

    const opciones = Object.keys(PAISES_NIVAN).map(function(codigo) {
        const d = PAISES_NIVAN[codigo];
        const activo = codigo === actual;
        return `
            <button type="button" class="opcionPaisConfigNivan ${activo ? "activo" : ""}" onclick="cambiarPaisNivan('${codigo}')">
                <span class="banderaPaisNivan">${d.bandera}</span>
                <span class="textoOpcionPaisNivan"><strong>${d.nombre}</strong><small>${d.moneda} (${d.simbolo})</small></span>
                <span class="tildePaisNivan">${activo ? "✓" : ""}</span>
            </button>
        `;
    }).join("");

    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="abrirConfigAppNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">💱 Moneda / País</h2>
            <p class="subTextoPerfilLateral">Vas a ver solo publicaciones de gente de tu país, con su moneda.</p>
        </div>
        <div class="listaOpcionesPaisNivan">${opciones}</div>
        <p class="subTextoPerfilLateral">Precio máximo por prenda en ${datosPaisNivan(actual).nombre}: ${simboloMonedaNivan(actual)}${datosPaisNivan(actual).precioMaximo.toLocaleString("es-AR")}</p>
    `;

    document.getElementById("panelConfigAppNivan").classList.add("abierto");
    document.getElementById("overlayConfigAppNivan").classList.add("abierto");
}

function guardarPaisNivan(pais) {
    try {
        localStorage.setItem("nivanPais", pais);
    } catch (e) {}
}

// Primera vez: elige el país en el cartel de bienvenida.
function elegirPaisNivan(pais) {
    if (!PAISES_NIVAN[pais]) return;

    guardarPaisNivan(pais);
    location.reload();
}

// Desde Configuración: cambia de país y recarga la app con el otro catálogo.
function cambiarPaisNivan(pais) {
    if (!PAISES_NIVAN[pais]) return;
    if (pais === (paisNivan() || "AR")) return;

    const d = PAISES_NIVAN[pais];
    const ok = confirm(
        "¿Cambiar a " + d.nombre + "?\n\n" +
        "Vas a ver solo publicaciones de " + d.nombre + " en " + d.moneda.toLowerCase() + "."
    );
    if (!ok) return;

    guardarPaisNivan(pais);
    location.reload();
}

// Ajusta los textos fijos de la pantalla (símbolo, tope y ejemplos) al país elegido.
function aplicarPaisEnPantallaNivan() {
    const d = datosPaisNivan();

    const simboloTotal = document.getElementById("simboloTotalNivan");
    if (simboloTotal) simboloTotal.textContent = simboloMonedaNivan();

    const aviso = document.getElementById("avisoLimitePrecioMayorNivan");
    if (aviso) aviso.textContent = "Precio máximo por unidad: " + simboloMonedaNivan() + d.precioMaximo.toLocaleString("es-AR");

    const etiquetaPrecio = document.getElementById("etiquetaPrecioPublicacionNivan");
    if (etiquetaPrecio) etiquetaPrecio.textContent = "Precio por menor / unidad (" + d.simbolo + ")";

    const precio = document.getElementById("precioPublicacion");
    if (precio) precio.placeholder = "Ej: " + d.ejemploPrecio;

    const telefonoCompra = document.getElementById("telefonoCompra");
    if (telefonoCompra) telefonoCompra.placeholder = "Ej: " + ejemploTelefonoNivan();

    const prefijoTelefono = document.getElementById("prefijoTelefonoCompra");
    if (prefijoTelefono) prefijoTelefono.textContent = prefijoTelefonoNivan();

    const pistaTelefono = document.getElementById("pistaTelefonoCompra");
    if (pistaTelefono) pistaTelefono.textContent = pistaTelefonoNivan();

    const presupuesto = document.getElementById("presupuestoMedida");
    if (presupuesto) presupuesto.placeholder = "Ej: " + d.ejemploPresupuesto;

    // Documento de identidad: DNI en Argentina, cédula de identidad en Uruguay.
    document.querySelectorAll(".docIdNivan").forEach(function(el) {
        el.textContent = nombreDocumentoNivan(el.dataset.mayus === "1");
    });

    // Pie de página: enlace a Defensa del Consumidor del país elegido.
    const enlaceDefensa = document.getElementById("enlaceDefensaConsumidorNivan");
    if (enlaceDefensa) {
        enlaceDefensa.href = d.urlDefensaConsumidor;
        enlaceDefensa.textContent = "Defensa del Consumidor (" + d.nombre + ")";
    }
}
// ==============================
// DIRECCIONES DE ENVÍO Y MÉTODOS DE PAGO GUARDADOS
// ==============================
// Se guardan en este dispositivo, separados por usuario (igual que "Datos de compra").
// De las tarjetas NUNCA se guarda el número completo ni el código de seguridad:
// solo la marca, los últimos 4 dígitos, el titular y el vencimiento.

const MAX_DIRECCIONES_NIVAN = 5;
const MAX_METODOS_PAGO_NIVAN = 5;

function claveGuardadosNivan(tipo) {
    const dueno = (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.email)
        ? usuarioActual.email
        : "invitado";
    return "nivan" + tipo + "_" + dueno;
}

function leerGuardadosNivan(tipo) {
    const lista = leerJSONNivan(claveGuardadosNivan(tipo), []);
    return Array.isArray(lista) ? lista : [];
}

function escribirGuardadosNivan(tipo, lista) {
    try {
        localStorage.setItem(claveGuardadosNivan(tipo), JSON.stringify(lista));
        return true;
    } catch (e) {
        alert("No se pudo guardar. Revisá el espacio del dispositivo.");
        return false;
    }
}

function nuevoIdGuardadoNivan() {
    return "g" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

// Deja exactamente una opción como predeterminada (si hay alguna).
function normalizarPredeterminadoNivan(lista, idPreferido) {
    if (!lista.length) return lista;
    let elegido = lista.find(function(x) { return x.id === idPreferido; })
        || lista.find(function(x) { return x.predeterminada; })
        || lista[0];
    lista.forEach(function(x) { x.predeterminada = x.id === elegido.id; });
    return lista;
}

function pantallaGuardadosNivan(html) {
    const contenido = document.getElementById("contenidoConfigAppNivan");
    if (!contenido) return;
    contenido.innerHTML = html;
    document.getElementById("panelConfigAppNivan").classList.add("abierto");
    document.getElementById("overlayConfigAppNivan").classList.add("abierto");
}

// ----- DIRECCIONES -----

function obtenerDireccionesNivan() {
    const pais = paisNivan() || "AR";
    return leerGuardadosNivan("Direcciones").filter(function(d) {
        return (d.pais || "AR") === pais;
    });
}

function guardarDireccionesDelPaisNivan(listaPais) {
    const pais = paisNivan() || "AR";
    const otras = leerGuardadosNivan("Direcciones").filter(function(d) {
        return (d.pais || "AR") !== pais;
    });
    return escribirGuardadosNivan("Direcciones", otras.concat(listaPais));
}

function abrirDireccionesEnvioNivan() {
    const lista = obtenerDireccionesNivan();
    const desdeCarrito = __guardadosDesdeCarritoNivan;
    const cargadas = leerGuardadosNivan("DireccionesCarrito");

    const tarjetas = lista.length
        ? lista.map(function(d) {
            return `
                <div class="itemGuardadoNivan ${d.predeterminada ? "principal" : ""}">
                    <div class="datosItemGuardadoNivan">
                        <strong>${escaparHTMLNivan(d.alias || "Dirección")}</strong>
                        ${d.predeterminada ? '<em class="etiquetaPredeterminadaNivan">Predeterminada</em>' : ""}
                        <span>${escaparHTMLNivan(d.direccion)}</span>
                        <span>${escaparHTMLNivan(d.ciudad)} · CP ${escaparHTMLNivan(d.codigoPostal)}</span>
                        ${desdeCarrito ? `<label class="checkCargarDireccionNivan"><input type="checkbox" class="casillaDireccionCarritoNivan" value="${d.id}" ${cargadas.includes(d.id) ? "checked" : ""}> Cargar en el carrito</label>` : ""}
                    </div>
                    <div class="accionesItemGuardadoNivan">
                        ${d.predeterminada ? "" : `<button type="button" onclick="hacerPredeterminadaDireccionNivan('${d.id}')">Predeterminada</button>`}
                        <button type="button" onclick="abrirFormularioDireccionNivan('${d.id}')">Editar</button>
                        <button type="button" class="borrar" onclick="borrarDireccionNivan('${d.id}')">Borrar</button>
                    </div>
                </div>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral">Todavía no guardaste ninguna dirección.</p>`;

    const puedeAgregar = lista.length < MAX_DIRECCIONES_NIVAN;

    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="volverDeGuardadosNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">📦 Direcciones de envío</h2>
            <p class="subTextoPerfilLateral">${desdeCarrito ? "Marcá una o varias y tocá “Cargar en el carrito” para tenerlas a mano al finalizar la compra." : "Las vas a poder elegir al finalizar una compra."}</p>
        </div>
        <div class="listaGuardadosNivan">${tarjetas}</div>
        ${desdeCarrito && lista.length ? `<button type="button" class="botonAgregarGuardadoNivan" onclick="cargarDireccionesEnCarritoNivan()">🛒 Cargar en el carrito</button>` : ""}
        ${puedeAgregar
            ? `<button type="button" class="botonAgregarGuardadoNivan" onclick="abrirFormularioDireccionNivan()">＋ Agregar dirección</button>`
            : `<p class="subTextoPerfilLateral">Llegaste al máximo de ${MAX_DIRECCIONES_NIVAN} direcciones. Borrá una para agregar otra.</p>`}
    `);
}

function abrirFormularioDireccionNivan(id) {
    const existente = id ? obtenerDireccionesNivan().find(function(d) { return d.id === id; }) : null;
    const d = existente || { alias: "", direccion: "", ciudad: "", codigoPostal: "", predeterminada: false };

    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirDireccionesEnvioNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">${existente ? "Editar dirección" : "Nueva dirección"}</h2>
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="dirAliasNivan">Nombre (opcional)</label>
            <input type="text" id="dirAliasNivan" maxlength="20" placeholder="Ej: Casa, Trabajo" value="${escaparHTMLNivan(d.alias)}">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="dirCalleNivan">Dirección</label>
            <input type="text" id="dirCalleNivan" maxlength="80" placeholder="Calle y número" value="${escaparHTMLNivan(d.direccion)}">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="dirCiudadNivan">Ciudad</label>
            <input type="text" id="dirCiudadNivan" maxlength="40" value="${escaparHTMLNivan(d.ciudad)}">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="dirCPNivan">Código postal</label>
            <input type="text" id="dirCPNivan" maxlength="8" value="${escaparHTMLNivan(d.codigoPostal)}">
        </div>
        <label class="checkGuardadoNivan">
            <input type="checkbox" id="dirPredeterminadaNivan" ${d.predeterminada ? "checked" : ""}>
            <span>Usar como dirección predeterminada</span>
        </label>
        <button type="button" class="botonAgregarGuardadoNivan" onclick="guardarDireccionNivan('${existente ? existente.id : ""}')">Guardar dirección</button>
    `);
}

function guardarDireccionNivan(id) {
    const alias = document.getElementById("dirAliasNivan").value.trim();
    const direccion = document.getElementById("dirCalleNivan").value.trim();
    const ciudad = document.getElementById("dirCiudadNivan").value.trim();
    const codigoPostal = document.getElementById("dirCPNivan").value.trim();
    const predeterminada = document.getElementById("dirPredeterminadaNivan").checked;

    if (!direccion || !ciudad || !codigoPostal) {
        alert("Completá dirección, ciudad y código postal.");
        return;
    }

    const lista = obtenerDireccionesNivan();
    let idFinal = id;

    if (id) {
        const d = lista.find(function(x) { return x.id === id; });
        if (!d) return;
        d.alias = alias; d.direccion = direccion; d.ciudad = ciudad; d.codigoPostal = codigoPostal;
    } else {
        if (lista.length >= MAX_DIRECCIONES_NIVAN) {
            alert("Llegaste al máximo de " + MAX_DIRECCIONES_NIVAN + " direcciones.");
            return;
        }
        idFinal = nuevoIdGuardadoNivan();
        lista.push({
            id: idFinal, alias: alias, direccion: direccion, ciudad: ciudad,
            codigoPostal: codigoPostal, predeterminada: false, pais: paisNivan() || "AR"
        });
    }

    normalizarPredeterminadoNivan(lista, predeterminada ? idFinal : null);
    if (!guardarDireccionesDelPaisNivan(lista)) return;
    abrirDireccionesEnvioNivan();
}

function hacerPredeterminadaDireccionNivan(id) {
    const lista = obtenerDireccionesNivan();
    normalizarPredeterminadoNivan(lista, id);
    if (guardarDireccionesDelPaisNivan(lista)) abrirDireccionesEnvioNivan();
}

function borrarDireccionNivan(id) {
    if (!confirm("¿Borrar esta dirección?")) return;
    const lista = obtenerDireccionesNivan().filter(function(d) { return d.id !== id; });
    normalizarPredeterminadoNivan(lista, null);
    if (guardarDireccionesDelPaisNivan(lista)) abrirDireccionesEnvioNivan();
}

// ----- MÉTODOS DE PAGO -----

function obtenerMetodosPagoNivan() {
    return leerGuardadosNivan("MetodosPago");
}

// Algoritmo de Luhn: detecta números de tarjeta mal escritos.
function numeroTarjetaValidoNivan(numero) {
    if (!/^\d{13,19}$/.test(numero)) return false;
    let suma = 0;
    for (let i = 0; i < numero.length; i++) {
        let digito = Number(numero[numero.length - 1 - i]);
        if (i % 2 === 1) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
    }
    return suma % 10 === 0;
}

function marcaTarjetaNivan(numero) {
    if (/^4/.test(numero)) return "Visa";
    if (/^(5[1-5]|2(22[1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(numero)) return "Mastercard";
    if (/^3[47]/.test(numero)) return "American Express";
    return "Tarjeta";
}

function formatearNumeroTarjetaNivan(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 19);
    input.value = digitos.replace(/(.{4})/g, "$1 ").trim();
}

function formatearVencimientoNivan(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 4);
    input.value = digitos.length > 2 ? digitos.slice(0, 2) + "/" + digitos.slice(2) : digitos;
}

function vencimientoValidoNivan(texto) {
    const m = /^(\d{2})\/(\d{2})$/.exec(texto);
    if (!m) return false;
    const mes = Number(m[1]);
    const anio = 2000 + Number(m[2]);
    if (mes < 1 || mes > 12) return false;
    const hoy = new Date();
    return anio > hoy.getFullYear() || (anio === hoy.getFullYear() && mes >= hoy.getMonth() + 1);
}

function textoMetodoPagoNivan(m) {
    if (m.tipo === "mercadopago") return "Mercado Pago · " + m.cuenta;
    return m.marca + " •••• " + m.ultimos4 + " · " + (m.modalidad === "debito" ? "Débito" : "Crédito");
}

function abrirMetodosPagoNivan() {
    const lista = obtenerMetodosPagoNivan();

    const tarjetas = lista.length
        ? lista.map(function(m) {
            const detalle = m.tipo === "mercadopago"
                ? `<span>${escaparHTMLNivan(m.cuenta)}</span>`
                : `<span>${escaparHTMLNivan(m.titular)} · Vence ${escaparHTMLNivan(m.vence)}</span>`;
            const titulo = m.tipo === "mercadopago"
                ? "💙 Mercado Pago"
                : "💳 " + escaparHTMLNivan(m.marca) + " •••• " + escaparHTMLNivan(m.ultimos4) +
                  " <small>" + (m.modalidad === "debito" ? "Débito" : "Crédito") + "</small>";
            return `
                <div class="itemGuardadoNivan ${m.predeterminada ? "principal" : ""}">
                    <div class="datosItemGuardadoNivan">
                        <strong>${titulo}</strong>
                        ${m.predeterminada ? '<em class="etiquetaPredeterminadaNivan">Predeterminado</em>' : ""}
                        ${detalle}
                    </div>
                    <div class="accionesItemGuardadoNivan">
                        ${m.predeterminada ? "" : `<button type="button" onclick="hacerPredeterminadoMetodoPagoNivan('${m.id}')">Predeterminado</button>`}
                        <button type="button" class="borrar" onclick="borrarMetodoPagoNivan('${m.id}')">Borrar</button>
                    </div>
                </div>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral">Todavía no guardaste ningún método de pago.</p>`;

    const puedeAgregar = lista.length < MAX_METODOS_PAGO_NIVAN;

    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="volverDeGuardadosNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">💳 Métodos de pago</h2>
            <p class="subTextoPerfilLateral">Por seguridad, solo guardamos los últimos 4 dígitos de la tarjeta. Nunca guardamos el número completo ni el código de seguridad.</p>
        </div>
        <div class="listaGuardadosNivan">${tarjetas}</div>
        ${puedeAgregar
            ? `<div class="filaAgregarMetodoNivan">
                    <button type="button" class="botonAgregarGuardadoNivan" onclick="abrirFormularioTarjetaNivan()">＋ Tarjeta</button>
                    <button type="button" class="botonAgregarGuardadoNivan" onclick="abrirFormularioMercadoPagoNivan()">＋ Mercado Pago</button>
               </div>`
            : `<p class="subTextoPerfilLateral">Llegaste al máximo de ${MAX_METODOS_PAGO_NIVAN} métodos. Borrá uno para agregar otro.</p>`}
    `);
}

function abrirFormularioTarjetaNivan() {
    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirMetodosPagoNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">Nueva tarjeta</h2>
            <p class="subTextoPerfilLateral">Solo se guardan los últimos 4 dígitos.</p>
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="tarjetaNumeroNivan">Número de tarjeta</label>
            <input type="text" id="tarjetaNumeroNivan" inputmode="numeric" autocomplete="off" maxlength="23" placeholder="0000 0000 0000 0000" oninput="formatearNumeroTarjetaNivan(this)">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="tarjetaTitularNivan">Titular</label>
            <input type="text" id="tarjetaTitularNivan" autocomplete="off" maxlength="40" placeholder="Como figura en la tarjeta">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="tarjetaVenceNivan">Vencimiento (MM/AA)</label>
            <input type="text" id="tarjetaVenceNivan" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="MM/AA" oninput="formatearVencimientoNivan(this)">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="tarjetaModalidadNivan">Tipo</label>
            <select id="tarjetaModalidadNivan">
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
            </select>
        </div>
        <label class="checkGuardadoNivan">
            <input type="checkbox" id="metodoPredeterminadoNivan">
            <span>Usar como método predeterminado</span>
        </label>
        <button type="button" class="botonAgregarGuardadoNivan" onclick="guardarTarjetaNivan()">Guardar tarjeta</button>
    `);
}

function guardarTarjetaNivan() {
    const campoNumero = document.getElementById("tarjetaNumeroNivan");
    const numero = campoNumero.value.replace(/\D/g, "");
    const titular = document.getElementById("tarjetaTitularNivan").value.trim();
    const vence = document.getElementById("tarjetaVenceNivan").value.trim();
    const modalidad = document.getElementById("tarjetaModalidadNivan").value;
    const predeterminado = document.getElementById("metodoPredeterminadoNivan").checked;

    if (!numeroTarjetaValidoNivan(numero)) {
        alert("El número de tarjeta no es válido. Revisalo.");
        return;
    }
    if (titular.length < 2) {
        alert("Escribí el nombre del titular.");
        return;
    }
    if (!vencimientoValidoNivan(vence)) {
        alert("El vencimiento no es válido o la tarjeta está vencida.");
        return;
    }

    const lista = obtenerMetodosPagoNivan();
    if (lista.length >= MAX_METODOS_PAGO_NIVAN) {
        alert("Llegaste al máximo de " + MAX_METODOS_PAGO_NIVAN + " métodos de pago.");
        return;
    }

    const duplicada = lista.some(function(m) {
        return m.tipo === "tarjeta" && m.ultimos4 === numero.slice(-4) && m.vence === vence;
    });
    if (duplicada) {
        alert("Ya guardaste una tarjeta con esos últimos 4 dígitos y ese vencimiento.");
        return;
    }

    const nuevo = {
        id: nuevoIdGuardadoNivan(),
        tipo: "tarjeta",
        marca: marcaTarjetaNivan(numero),
        ultimos4: numero.slice(-4),
        titular: titular,
        vence: vence,
        modalidad: modalidad,
        predeterminada: false
    };

    // El número completo se descarta acá: no se guarda en ningún lado.
    campoNumero.value = "";

    lista.push(nuevo);
    normalizarPredeterminadoNivan(lista, predeterminado ? nuevo.id : null);
    if (!escribirGuardadosNivan("MetodosPago", lista)) return;
    abrirMetodosPagoNivan();
}

function abrirFormularioMercadoPagoNivan() {
    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirMetodosPagoNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">Cuenta de Mercado Pago</h2>
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="mpCuentaNivan">Email de tu cuenta</label>
            <input type="text" id="mpCuentaNivan" inputmode="email" autocomplete="off" maxlength="60" placeholder="Ej: ejemplo@gmail.com">
        </div>
        <label class="checkGuardadoNivan">
            <input type="checkbox" id="metodoPredeterminadoNivan">
            <span>Usar como método predeterminado</span>
        </label>
        <button type="button" class="botonAgregarGuardadoNivan" onclick="guardarMercadoPagoNivan()">Guardar cuenta</button>
    `);
}

function guardarMercadoPagoNivan() {
    const cuenta = document.getElementById("mpCuentaNivan").value.trim();
    const predeterminado = document.getElementById("metodoPredeterminadoNivan").checked;

    if (!esEmailValidoNivan(cuenta)) {
        alert("Escribí un email válido.");
        return;
    }

    const lista = obtenerMetodosPagoNivan();
    if (lista.length >= MAX_METODOS_PAGO_NIVAN) {
        alert("Llegaste al máximo de " + MAX_METODOS_PAGO_NIVAN + " métodos de pago.");
        return;
    }
    if (lista.some(function(m) { return m.tipo === "mercadopago" && m.cuenta.toLowerCase() === cuenta.toLowerCase(); })) {
        alert("Ya guardaste esa cuenta de Mercado Pago.");
        return;
    }

    const nuevo = { id: nuevoIdGuardadoNivan(), tipo: "mercadopago", cuenta: cuenta, predeterminada: false };
    lista.push(nuevo);
    normalizarPredeterminadoNivan(lista, predeterminado ? nuevo.id : null);
    if (!escribirGuardadosNivan("MetodosPago", lista)) return;
    abrirMetodosPagoNivan();
}

function hacerPredeterminadoMetodoPagoNivan(id) {
    const lista = obtenerMetodosPagoNivan();
    normalizarPredeterminadoNivan(lista, id);
    if (escribirGuardadosNivan("MetodosPago", lista)) abrirMetodosPagoNivan();
}

function borrarMetodoPagoNivan(id) {
    const m = obtenerMetodosPagoNivan().find(function(x) { return x.id === id; });
    if (!m) return;
    if (!confirm("¿Borrar " + textoMetodoPagoNivan(m) + "?")) return;
    const lista = obtenerMetodosPagoNivan().filter(function(x) { return x.id !== id; });
    normalizarPredeterminadoNivan(lista, null);
    if (escribirGuardadosNivan("MetodosPago", lista)) abrirMetodosPagoNivan();
}

// ----- MENÚ ⋮ DEL CARRITO (métodos de pago y direcciones guardadas) -----

let __guardadosDesdeCarritoNivan = false;

function alternarMenuCarritoNivan(cerrar) {
    const menu = document.getElementById("menuCarritoNivan");
    if (!menu) return;
    menu.classList.toggle("abierto", cerrar === true ? false : !menu.classList.contains("abierto"));
}

// Tocar fuera del menú ⋮ lo cierra.
document.addEventListener("click", function(e) {
    const menu = document.getElementById("menuCarritoNivan");
    if (!menu || !menu.classList.contains("abierto")) return;
    if (e.target.closest && e.target.closest(".envolturaMenuCarritoNivan")) return;
    menu.classList.remove("abierto");
});

function abrirGuardadosDesdeCarritoNivan(cual) {
    alternarMenuCarritoNivan(true);
    __guardadosDesdeCarritoNivan = true;
    document.body.classList.add("guardadosDesdeCarritoNivan");
    if (cual === "pagos") abrirMetodosPagoNivan();
    else abrirDireccionesEnvioNivan();
}

// Desde el buscador de Configuración: abre el carrito y el panel pedido.
function abrirGuardadosDesdeBuscadorNivan(cual) {
    const carrito = document.getElementById("carrito");
    if (carrito) {
        carrito.classList.add("abierto");
        document.body.style.overflow = "hidden";
        if (typeof actualizarCarrito === "function") actualizarCarrito();
    }
    abrirGuardadosDesdeCarritoNivan(cual);
}

// "← Volver" de las listas: al carrito si vinieron de ahí, si no a Configuración.
function volverDeGuardadosNivan() {
    if (__guardadosDesdeCarritoNivan) {
        cerrarConfigAppNivan();
        alternarMenuCarritoNivan();
    } else {
        abrirConfigAppNivan();
    }
}

function irAFavoritosDesdeCarritoNivan() {
    alternarMenuCarritoNivan(true);
    if (typeof revisarBajasDePrecio === "function") revisarBajasDePrecio();
    renderizarFavoritos();
    document.getElementById("paginaFavoritos").classList.add("sobreCarritoNivan");
    document.body.classList.add("favoritosSobreCarritoNivan");
}

function cerrarFavoritosSobreCarritoNivan() {
    const p = document.getElementById("paginaFavoritos");
    if (p && p.classList.contains("sobreCarritoNivan")) {
        p.classList.remove("sobreCarritoNivan");
        document.body.classList.remove("favoritosSobreCarritoNivan");
        actualizarCarrito();
        return;
    }
    cambiarPagina('paginaHome', document.querySelector('.navItem[data-pagina="paginaHome"]'));
}

// Guarda qué direcciones se cargan en el carrito (se pueden elegir varias).
function cargarDireccionesEnCarritoNivan() {
    const ids = Array.prototype.map.call(
        document.querySelectorAll("#contenidoConfigAppNivan .casillaDireccionCarritoNivan:checked"),
        function(c) { return c.value; }
    );
    if (!escribirGuardadosNivan("DireccionesCarrito", ids)) return;

    cerrarConfigAppNivan();

    const form = document.getElementById("checkoutForm");
    if (form && form.style.display === "block") prepararGuardadosCompraNivan();

    mostrarToastNivan(
        ids.length
            ? (ids.length === 1 ? "1 dirección cargada en el carrito" : ids.length + " direcciones cargadas en el carrito")
            : "Sin selección: vas a ver todas tus direcciones al comprar"
    );
}

// ----- USO EN EL CHECKOUT -----

function aplicarDireccionGuardadaCompraNivan(id) {
    const d = obtenerDireccionesNivan().find(function(x) { return x.id === id; });
    if (!d) return;
    document.getElementById("direccionCompra").value = d.direccion;
    document.getElementById("ciudadCompra").value = d.ciudad;
    document.getElementById("codigoPostal").value = d.codigoPostal;
    if (typeof mostrarEstadoDatosCompra === "function") mostrarEstadoDatosCompra("", "");
}

function aplicarMetodoPagoGuardadoCompraNivan(id) {
    const m = obtenerMetodosPagoNivan().find(function(x) { return x.id === id; });
    if (!m) return;
    document.getElementById("pagoCompra").value = m.tipo === "mercadopago" ? "Mercado Pago" : "Tarjeta";
}

// Llena los selectores "guardados" al abrir el formulario de compra.
function prepararGuardadosCompraNivan() {
    const todasLasDirs = obtenerDireccionesNivan();
    const idsCargadas = leerGuardadosNivan("DireccionesCarrito");
    const dirsCargadas = todasLasDirs.filter(function(d) { return idsCargadas.includes(d.id); });
    const dirs = dirsCargadas.length ? dirsCargadas : todasLasDirs;
    const campoDir = document.getElementById("campoDireccionGuardadaNivan");
    const selDir = document.getElementById("direccionGuardadaCompra");

    if (campoDir && selDir) {
        campoDir.style.display = dirs.length ? "block" : "none";
        selDir.innerHTML = '<option value="">Escribir otra dirección</option>' + dirs.map(function(d) {
            const nombre = d.alias ? d.alias + " — " : "";
            return '<option value="' + d.id + '">' + escaparHTMLNivan(nombre + d.direccion + ", " + d.ciudad) + '</option>';
        }).join("");

        const principal = dirs.find(function(d) { return d.predeterminada; })
            || (dirsCargadas.length ? dirs[0] : null);
        if (principal) {
            selDir.value = principal.id;
            aplicarDireccionGuardadaCompraNivan(principal.id);
        }
    }

    const metodos = obtenerMetodosPagoNivan();
    const campoPago = document.getElementById("campoMetodoPagoGuardadoNivan");
    const selPago = document.getElementById("metodoPagoGuardadoCompra");

    if (campoPago && selPago) {
        campoPago.style.display = metodos.length ? "block" : "none";
        selPago.innerHTML = '<option value="">Elegir uno guardado</option>' + metodos.map(function(m) {
            return '<option value="' + m.id + '">' + escaparHTMLNivan(textoMetodoPagoNivan(m)) + '</option>';
        }).join("");

        const principalPago = metodos.find(function(m) { return m.predeterminada; });
        const pagoActual = document.getElementById("pagoCompra");
        if (principalPago && pagoActual && !pagoActual.value) {
            selPago.value = principalPago.id;
            aplicarMetodoPagoGuardadoCompraNivan(principalPago.id);
        }
    }
}
// ==============================
// AHORRO DE DATOS / CALIDAD DE CARGA
// ==============================
// Apagado por defecto. Prendido: las fotos que subís se guardan más livianas,
// las fotos de internet se piden en tamaño chico, las imágenes se cargan recién
// cuando aparecen en pantalla y los videos no se descargan hasta que los tocás.

const CALIDAD_SUBIDA_NIVAN = {
    normal: { lado: 1280, calidad: 0.82 },
    ahorro: { lado: 800, calidad: 0.6 }
};

function ahorroDatosActivoNivan() {
    try {
        return localStorage.getItem("nivanAhorroDatos") === "1";
    } catch (e) {
        return false;
    }
}

function guardarAhorroDatosNivan(valor) {
    try {
        localStorage.setItem("nivanAhorroDatos", valor ? "1" : "0");
    } catch (e) {}
}

function calidadSubidaNivan() {
    return ahorroDatosActivoNivan() ? CALIDAD_SUBIDA_NIVAN.ahorro : CALIDAD_SUBIDA_NIVAN.normal;
}

// Con ahorro prendido, las fotos de Unsplash se piden más chicas y con menos calidad.
// Las fotos subidas por la gente (ya guardadas en el dispositivo) no se tocan.
function urlImagenNivan(url) {
    if (!url || !ahorroDatosActivoNivan() || String(url).indexOf("images.unsplash.com") === -1) return url;

    let nueva = String(url);
    nueva = /([?&])w=\d+/.test(nueva) ? nueva.replace(/([?&])w=\d+/, "$1w=320") : nueva + (nueva.indexOf("?") === -1 ? "?" : "&") + "w=320";
    nueva = /([?&])q=\d+/.test(nueva) ? nueva.replace(/([?&])q=\d+/, "$1q=50") : nueva + "&q=50";
    return nueva;
}

function atributosImagenNivan() {
    return ' loading="lazy" decoding="async"';
}

function preloadVideoNivan() {
    return ahorroDatosActivoNivan() ? ' preload="none"' : ' preload="metadata"';
}

function abrirAhorroDatosNivan() {
    const activo = ahorroDatosActivoNivan();

    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirConfigAppNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">📶 Ahorro de datos</h2>
            <p class="subTextoPerfilLateral">Usá menos datos móviles al navegar y al subir fotos.</p>
        </div>
        <div class="filaSonidosNivan">
            <span>Ahorro de datos</span>
            <button type="button" id="interruptorAhorroDatosNivan"
                class="interruptorNivan ${activo ? "activo" : ""}"
                role="switch" aria-checked="${activo}"
                aria-label="Ahorro de datos"
                onclick="alternarAhorroDatosNivan()"></button>
        </div>
        <p id="estadoAhorroDatosNivan" class="subTextoPerfilLateral">${activo ? "Ahorro de datos activado" : "Ahorro de datos desactivado (calidad normal)"}</p>
        <div class="itemGuardadoNivan" style="margin-top:14px;">
            <div class="datosItemGuardadoNivan">
                <strong>Cuando está activado</strong>
                <span>• Las fotos que subís se guardan más livianas (hasta 800 px, calidad media) en vez de 1280 px.</span>
                <span>• Las fotos de las publicaciones se piden en tamaño reducido.</span>
                <span>• Las imágenes se cargan recién cuando llegás a verlas.</span>
                <span>• Los videos no se descargan hasta que tocás reproducir.</span>
            </div>
        </div>
    `);
}

function alternarAhorroDatosNivan() {
    const nuevo = !ahorroDatosActivoNivan();
    guardarAhorroDatosNivan(nuevo);

    const interruptor = document.getElementById("interruptorAhorroDatosNivan");
    const estado = document.getElementById("estadoAhorroDatosNivan");
    if (interruptor) {
        interruptor.classList.toggle("activo", nuevo);
        interruptor.setAttribute("aria-checked", String(nuevo));
    }
    if (estado) estado.textContent = nuevo ? "Ahorro de datos activado" : "Ahorro de datos desactivado (calidad normal)";

    // Vuelve a dibujar las publicaciones para que el cambio se vea ya.
    try {
        mostrarProductos(productos);
        renderizarFeedNivan();
    } catch (e) {}
}
// ==============================
// VERSIÓN / SOPORTE /
// ==============================
const VERSION_APP_NIVAN = "1.0.0";
const PREGUNTAS_FRECUENTES_NIVAN = [
    { p: "¿Cómo publico una prenda?", r: "Entrá a Vender desde el menú de tu perfil, tocá Crear publicación nueva y completá fotos, precio, talles y descripción." },
    { p: "¿Cómo cambio de país o moneda?", r: "En Configuración › Moneda / País. Vas a ver solo publicaciones de gente de ese país." },
    { p: "¿Dónde veo mis compras y su estado?", r: "En Mis compras, dentro del menú de tu perfil. Ahí ves si el pedido está pendiente, enviado o entregado." },
    { p: "Olvidé mi contraseña", r: "En la pantalla de inicio de sesión tocá ¿Olvidaste tu contraseña? y seguí los pasos. Si ya tenés la sesión abierta, también podés cambiarla en Privacidad y seguridad › Cambiar contraseña." },
    { p: "Una publicación tiene algo que no corresponde", r: "Abrí el perfil del vendedor, tocá los tres puntos de arriba a la derecha y elegí Reportar." }
];

function abrirVersionSoporteNivan() {
    const faq = PREGUNTAS_FRECUENTES_NIVAN.map(function(f) {
        return `<details class="preguntaFrecuenteNivan"><summary>${escaparHTMLNivan(f.p)}</summary><p>${escaparHTMLNivan(f.r)}</p></details>`;
    }).join("");

    pantallaGuardadosNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirConfigAppNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">ℹ️ Versión / Soporte</h2>
        </div>
        <div class="itemGuardadoNivan" style="margin-top:14px;">
            <div class="datosItemGuardadoNivan">
                <strong>NIVAN</strong>
                <span>Versión ${escaparHTMLNivan(VERSION_APP_NIVAN)}</span>
                <span>País: ${escaparHTMLNivan(datosPaisNivan().nombre)}</span>
            </div>
        </div>
        <h3 class="subtituloSoporteNivan">Preguntas frecuentes</h3>
        <div>${faq}</div>
    `);
}

// Panel "Privacidad y seguridad"

function abrirPrivacidadSeguridadNivan() {
    const contenido = document.getElementById("contenidoPrivacidadNivan");
    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="cerrarPrivacidadSeguridadNivan(); abrirPerfilLateral();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">Privacidad y seguridad</h2>
        </div>
        <div class="listaVender" style="margin-top:20px;">
            <button type="button" onclick="abrirCambiarPasswordNivan()"><span>🔑 Cambiar contraseña</span></button>
            <button type="button" onclick="abrirSesionesActivasNivan()"><span>💻 Sesiones activas</span></button>
            <button type="button" onclick="abrirHistorialLoginNivan()"><span>🕒 Historial de inicios de sesión</span></button>
            <button type="button" onclick="abrirAutenticacion2PasosNivan()"><span>🛡️ Autenticación en 2 pasos</span></button>
            <button type="button" onclick="abrirPrivacidadPerfilNivan()"><span>👁️ Privacidad del perfil</span></button>
            <button type="button" onclick="abrirQuienPuedeEscribirmeNivan()"><span>✉️ Quién puede escribirme</span></button>
            <button type="button" onclick="abrirUsuariosBloqueadosNivan()"><span>🚫 Usuarios bloqueados</span></button>
            <button type="button" onclick="abrirEliminarCuentaNivan()"><span>🗑️ Eliminar / desactivar cuenta</span></button>
            <button type="button" onclick="abrirPoliticaPrivacidadPanelNivan()"><span>📄 Política de privacidad</span></button>
        </div>
    `;
    document.getElementById("panelPrivacidadNivan").classList.add("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.add("abierto");
}

function cerrarPrivacidadSeguridadNivan() {
    document.getElementById("panelPrivacidadNivan").classList.remove("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.remove("abierto");
}

function abrirCambiarPasswordNivan() {
    const contenido = document.getElementById("contenidoPrivacidadNivan");
    if (!contenido) return;

    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para cambiar tu contraseña.");
        return;
    }

    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🔑 Cambiar contraseña</h2>
            <p class="subTextoPerfilLateral">Tiene que tener 8 caracteres, una mayúscula, un número y un símbolo.</p>
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="passActualNivan">Contraseña actual</label>
            <input type="password" id="passActualNivan" autocomplete="current-password" maxlength="128">
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="passNuevaNivan">Contraseña nueva</label>
            <input type="password" id="passNuevaNivan" autocomplete="new-password" maxlength="128" oninput="actualizarAvisoPasswordNuevaNivan()">
            <span class="pistaCampoPerfil" id="avisoPassNuevaNivan"></span>
        </div>
        <div class="campoEditarPerfilLateral">
            <label for="passRepetirNivan">Repetir contraseña nueva</label>
            <input type="password" id="passRepetirNivan" autocomplete="new-password" maxlength="128" oninput="actualizarAvisoPasswordNuevaNivan()">
            <span class="pistaCampoPerfil" id="avisoPassRepetirNivan"></span>
        </div>
        <button type="button" class="botonAgregarGuardadoNivan" id="botonCambiarPassNivan" onclick="cambiarPasswordNivan()">Cambiar contraseña</button>
    `;

    document.getElementById("panelPrivacidadNivan").classList.add("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.add("abierto");
}

// Avisos en vivo de una contraseña nueva y de su repetición (fuerza y coincidencia).
function mostrarAvisosPasswordNivan(idNueva, idRepetir, idAvisoNueva, idAvisoRepetir) {
    const nueva = document.getElementById(idNueva);
    const repetir = document.getElementById(idRepetir);
    const avisoNueva = document.getElementById(idAvisoNueva);
    const avisoRepetir = document.getElementById(idAvisoRepetir);
    if (!nueva || !repetir) return;

    if (!nueva.value) {
        avisoNueva.textContent = "";
    } else {
        const r = evaluarPasswordNivan(nueva.value);
        avisoNueva.textContent = r.fuerte ? "Contraseña fuerte" : "Falta: " + r.faltan.join(", ");
        avisoNueva.style.color = r.fuerte ? "#4cd08a" : "#ff8c8c";
    }

    if (!repetir.value) {
        avisoRepetir.textContent = "";
    } else {
        const iguales = repetir.value === nueva.value;
        avisoRepetir.textContent = iguales ? "Coinciden" : "No coinciden";
        avisoRepetir.style.color = iguales ? "#4cd08a" : "#ff8c8c";
    }
}

function actualizarAvisoPasswordNuevaNivan() {
    mostrarAvisosPasswordNivan("passNuevaNivan", "passRepetirNivan", "avisoPassNuevaNivan", "avisoPassRepetirNivan");
}

async function cambiarPasswordNivan() {
    if (!usuarioActual) return;

    const actual = document.getElementById("passActualNivan").value;
    const nueva = document.getElementById("passNuevaNivan").value;
    const repetir = document.getElementById("passRepetirNivan").value;

    if (!actual || !nueva || !repetir) {
        alert("Completá los tres campos.");
        return;
    }

    if (!evaluarPasswordNivan(nueva).fuerte) {
        alert("La contraseña nueva es débil.");
        return;
    }

    if (nueva !== repetir) {
        alert("Las contraseñas nuevas no coinciden.");
        return;
    }

    if (nueva === actual) {
        alert("La contraseña nueva tiene que ser distinta de la actual.");
        return;
    }

    const boton = document.getElementById("botonCambiarPassNivan");
    if (boton) boton.disabled = true;

    try {
        const usuarios = obtenerUsuariosNivan();
        const indice = usuarios.findIndex(function(u) { return u.id === usuarioActual.id; });

        if (indice === -1) {
            alert("No se encontró tu cuenta. Volvé a iniciar sesión.");
            return;
        }

        const r = await apiNivan("/api/password", { actual: actual, nueva: nueva });
        if (!r.ok) { alert(r.error); return; }

        registrarEventoLoginNivan(usuarioActual.id, "password_cambiada");
        alert("Listo, tu contraseña se cambió.");
        abrirPrivacidadSeguridadNivan();
    } finally {
        if (boton) boton.disabled = false;
    }
}

// ==============================
// SESIONES ACTIVAS, HISTORIAL DE INICIOS Y RECUPERAR CONTRASEÑA
// ==============================
// Todo se guarda en este dispositivo (localStorage), igual que las
// cuentas. Cuando haya servidor, estas mismas funciones se conectan a él.

const CLAVE_SESIONES_NIVAN = "nivanSesionesActivas";
const CLAVE_HISTORIAL_LOGIN_NIVAN = "nivanHistorialLogin";
const MAX_EVENTOS_LOGIN_POR_USUARIO_NIVAN = 10;
const DIAS_VIDA_SESION_NIVAN = 30;

function idAleatorioNivan(prefijo) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return prefijo + Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function describirDispositivoNivan() {
    const ua = navigator.userAgent || "";
    let navegador = "Navegador";
    if (/Edg\//.test(ua)) navegador = "Edge";
    else if (/OPR\/|Opera/.test(ua)) navegador = "Opera";
    else if (/Firefox\//.test(ua)) navegador = "Firefox";
    else if (/Chrome\/|CriOS/.test(ua)) navegador = "Chrome";
    else if (/Safari\//.test(ua)) navegador = "Safari";

    let sistema = "dispositivo desconocido";
    if (/Android/.test(ua)) sistema = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) sistema = "iOS";
    else if (/Windows/.test(ua)) sistema = "Windows";
    else if (/Mac OS X|Macintosh/.test(ua)) sistema = "Mac";
    else if (/Linux/.test(ua)) sistema = "Linux";

    return navegador + " en " + sistema;
}

function formatearFechaLoginNivan(timestamp) {
    try {
        return new Date(timestamp).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
        return new Date(timestamp).toLocaleString();
    }
}

// ----- Historial de inicios de sesión -----

const TIPOS_EVENTO_LOGIN_NIVAN = {
    login: { icono: "✅", texto: "Inicio de sesión" },
    registro: { icono: "🆕", texto: "Cuenta creada" },
    fallido: { icono: "⚠️", texto: "Intento fallido (contraseña incorrecta)" },
    password_cambiada: { icono: "🔑", texto: "Contraseña cambiada" },
    password_restablecida: { icono: "🔁", texto: "Contraseña restablecida con código" },
    fallido_2fa: { icono: "⚠️", texto: "Código de 2 pasos incorrecto" },
    dos_pasos_activada: { icono: "🛡️", texto: "Autenticación en 2 pasos activada" },
    dos_pasos_desactivada: { icono: "🛡️", texto: "Autenticación en 2 pasos desactivada" },
    codigos_respaldo: { icono: "🗝️", texto: "Códigos de respaldo nuevos" },
    cuenta_desactivada: { icono: "⏸️", texto: "Cuenta desactivada" },
    cuenta_reactivada: { icono: "▶️", texto: "Cuenta reactivada" },
    eliminacion_programada: { icono: "🗑️", texto: "Eliminación de la cuenta programada" },
    eliminacion_cancelada: { icono: "↩️", texto: "Eliminación de la cuenta cancelada" }
};

function obtenerHistorialLoginNivan() {
    const lista = leerJSONNivan(CLAVE_HISTORIAL_LOGIN_NIVAN, []);
    return Array.isArray(lista) ? lista : [];
}

function registrarEventoLoginNivan(usuarioId, tipo) {
    if (!usuarioId) return;
    try {
        let lista = obtenerHistorialLoginNivan();
        lista.push({ id: idAleatorioNivan("EVL-"), usuarioId: usuarioId, tipo: tipo, fecha: Date.now(), dispositivo: describirDispositivoNivan() });

        // Se conservan solo los últimos eventos de cada cuenta.
        const propios = lista.filter(function(e) { return e.usuarioId === usuarioId; });
        if (propios.length > MAX_EVENTOS_LOGIN_POR_USUARIO_NIVAN) {
            const sobran = propios.length - MAX_EVENTOS_LOGIN_POR_USUARIO_NIVAN;
            const idsABorrar = propios.slice(0, sobran).map(function(e) { return e.id; });
            lista = lista.filter(function(e) { return idsABorrar.indexOf(e.id) === -1; });
        }
        localStorage.setItem(CLAVE_HISTORIAL_LOGIN_NIVAN, JSON.stringify(lista));
    } catch (e) {}
}

function abrirHistorialLoginNivan() {
    const contenido = document.getElementById("contenidoPrivacidadNivan");
    if (!contenido) return;

    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para ver tu historial.");
        return;
    }

    const eventos = obtenerHistorialLoginNivan()
        .filter(function(e) { return e.usuarioId === usuarioActual.id; })
        .sort(function(a, b) { return b.fecha - a.fecha; })
        .slice(0, MAX_EVENTOS_LOGIN_POR_USUARIO_NIVAN);

    const hayFallidos = eventos.some(function(e) { return String(e.tipo).indexOf("fallido") === 0; });

    const filas = eventos.length
        ? eventos.map(function(e) {
            const t = TIPOS_EVENTO_LOGIN_NIVAN[e.tipo] || { icono: "•", texto: "Actividad" };
            return `
                <div class="itemHistorialLoginNivan ${String(e.tipo).indexOf("fallido") === 0 ? "fallidoNivan" : ""}">
                    <span class="iconoHistorialNivan">${t.icono}</span>
                    <div class="datosHistorialNivan">
                        <strong>${escaparHTMLNivan(t.texto)}</strong>
                        <span>${escaparHTMLNivan(formatearFechaLoginNivan(e.fecha))}</span>
                        <span>${escaparHTMLNivan(e.dispositivo || "Dispositivo desconocido")}</span>
                    </div>
                </div>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral">Todavía no hay movimientos registrados.</p>`;

    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🕒 Historial de inicios de sesión</h2>
            <p class="subTextoPerfilLateral">Tus últimos ${MAX_EVENTOS_LOGIN_POR_USUARIO_NIVAN} movimientos de acceso en este dispositivo.</p>
        </div>
        ${hayFallidos ? `<p class="subTextoPerfilLateral">Si ves intentos que no reconocés, cambiá tu contraseña.</p>
        <button type="button" class="botonAgregarGuardadoNivan" onclick="abrirCambiarPasswordNivan()">🔑 Cambiar contraseña</button>` : ""}
        <div>${filas}</div>
        ${eventos.length ? `<button type="button" class="botonAgregarGuardadoNivan" style="margin-top:14px;" onclick="borrarHistorialLoginNivan()">🗑️ Borrar historial</button>` : ""}
    `;

    document.getElementById("panelPrivacidadNivan").classList.add("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.add("abierto");
}

function borrarHistorialLoginNivan() {
    if (!usuarioActual) return;
    if (!confirm("¿Borrar el historial de inicios de sesión de tu cuenta?")) return;
    const resto = obtenerHistorialLoginNivan().filter(function(e) { return e.usuarioId !== usuarioActual.id; });
    guardarJSONNivan(CLAVE_HISTORIAL_LOGIN_NIVAN, resto);
    abrirHistorialLoginNivan();
}

// ----- Sesiones activas -----

function obtenerSesionesActivasNivan() {
    const lista = leerJSONNivan(CLAVE_SESIONES_NIVAN, []);
    return Array.isArray(lista) ? lista : [];
}

function guardarSesionesActivasNivan(lista) {
    try { localStorage.setItem(CLAVE_SESIONES_NIVAN, JSON.stringify(lista)); } catch (e) {}
}

function idSesionActualNivan() {
    return localStorage.getItem("nivanSesionId") || "";
}

function crearSesionActivaNivan(usuarioId) {
    const limite = Date.now() - DIAS_VIDA_SESION_NIVAN * 24 * 60 * 60 * 1000;
    // Se descartan las muy viejas y la sesión anterior de este mismo navegador.
    const anterior = idSesionActualNivan();
    let lista = obtenerSesionesActivasNivan().filter(function(s) {
        return s.ultima >= limite && s.sid !== anterior;
    });
    const ahora = Date.now();
    const sid = idAleatorioNivan("SES-");
    lista.push({ sid: sid, usuarioId: usuarioId, inicio: ahora, ultima: ahora, dispositivo: describirDispositivoNivan(), revocada: false });
    guardarSesionesActivasNivan(lista);
    try { localStorage.setItem("nivanSesionId", sid); } catch (e) {}
    return sid;
}

function cerrarSesionActivaActualNivan() {
    const sid = idSesionActualNivan();
    if (sid) {
        guardarSesionesActivasNivan(obtenerSesionesActivasNivan().filter(function(s) { return s.sid !== sid; }));
    }
    localStorage.removeItem("nivanSesionId");
}

// Corre al abrir la página y al volver a la pestaña: si la sesión de
// este navegador fue cerrada desde "Sesiones activas", se cierra acá también.
function verificarSesionActivaNivan() {
    if (!usuarioActual) return;

    const sid = idSesionActualNivan();
    if (!sid) {
        // Sesión guardada antes de existir esta función: se le crea su registro.
        crearSesionActivaNivan(usuarioActual.id);
        return;
    }

    const lista = obtenerSesionesActivasNivan();
    const mia = lista.find(function(s) { return s.sid === sid; });

    if (!mia || mia.revocada) {
        localStorage.removeItem("nivanSesionId");
        usuarioActual = null;
        localStorage.removeItem("nivanSesion");
        sincronizarFavoritosConCuentaNivan(true);
        try { cerrarCuenta(); } catch (e) {}
        try { actualizarBadgeNotificaciones(); } catch (e) {}
        alert("Tu sesión se cerró desde otro lugar. Volvé a iniciar sesión.");
        return;
    }

    mia.ultima = Date.now();
    guardarSesionesActivasNivan(lista);
}

function abrirSesionesActivasNivan() {
    const contenido = document.getElementById("contenidoPrivacidadNivan");
    if (!contenido) return;

    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para ver tus sesiones.");
        return;
    }

    const miSid = idSesionActualNivan();
    const sesiones = obtenerSesionesActivasNivan()
        .filter(function(s) { return s.usuarioId === usuarioActual.id && !s.revocada; })
        .sort(function(a, b) {
            if (a.sid === miSid) return -1;
            if (b.sid === miSid) return 1;
            return b.ultima - a.ultima;
        });

    const otras = sesiones.filter(function(s) { return s.sid !== miSid; });

    const filas = sesiones.length
        ? sesiones.map(function(s) {
            const esta = s.sid === miSid;
            return `
                <div class="itemSesionNivan">
                    <div class="datosSesionNivan">
                        <strong>💻 ${escaparHTMLNivan(s.dispositivo || "Dispositivo desconocido")}</strong>
                        ${esta ? `<span class="etiquetaEsteDispositivoNivan">Este dispositivo</span>` : ""}
                        <span>Inició: ${escaparHTMLNivan(formatearFechaLoginNivan(s.inicio))}</span>
                        <span>Última actividad: ${escaparHTMLNivan(formatearFechaLoginNivan(s.ultima))}</span>
                    </div>
                    ${esta ? "" : `<button type="button" onclick="cerrarSesionRemotaNivan('${escaparHTMLNivan(s.sid)}')">Cerrar</button>`}
                </div>
            `;
        }).join("")
        : `<p class="subTextoPerfilLateral">No hay sesiones abiertas.</p>`;

    contenido.innerHTML = `
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">💻 Sesiones activas</h2>
            <p class="subTextoPerfilLateral">Dispositivos donde tu cuenta tiene la sesión abierta. Si no reconocés alguno, cerralo y cambiá tu contraseña.</p>
        </div>
        <div>${filas}</div>
        ${otras.length ? `<button type="button" class="botonAgregarGuardadoNivan" style="margin-top:14px;" onclick="cerrarOtrasSesionesNivan()">Cerrar todas las demás sesiones</button>` : `<p class="subTextoPerfilLateral" style="margin-top:14px;">No hay otras sesiones abiertas.</p>`}
    `;

    document.getElementById("panelPrivacidadNivan").classList.add("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.add("abierto");
}

function cerrarSesionRemotaNivan(sid) {
    if (!usuarioActual || sid === idSesionActualNivan()) return;
    if (!confirm("¿Cerrar esa sesión?")) return;
    const lista = obtenerSesionesActivasNivan();
    lista.forEach(function(s) {
        if (s.sid === sid && s.usuarioId === usuarioActual.id) s.revocada = true;
    });
    guardarSesionesActivasNivan(lista);
    abrirSesionesActivasNivan();
}

function cerrarOtrasSesionesNivan() {
    if (!usuarioActual) return;
    if (!confirm("¿Cerrar todas las sesiones menos esta?")) return;
    const miSid = idSesionActualNivan();
    const lista = obtenerSesionesActivasNivan();
    lista.forEach(function(s) {
        if (s.usuarioId === usuarioActual.id && s.sid !== miSid) s.revocada = true;
    });
    guardarSesionesActivasNivan(lista);
    abrirSesionesActivasNivan();
}

// ----- ¿Olvidaste tu contraseña? -----
// El código llega por email (lo envía el servidor), dura 10 minutos y permite 5 intentos.

let recuperacionNivan = null;
const MINUTOS_CODIGO_RECUPERACION_NIVAN = 10;
const MAX_INTENTOS_CODIGO_NIVAN = 5;

function mostrarPasoRecuperarNivan(n) {
    [1, 2, 3].forEach(function(i) {
        const el = document.getElementById("pasoRecuperar" + i);
        if (el) el.style.display = (i === n) ? "block" : "none";
    });
}

function mostrarRecuperarNivan() {
    document.getElementById("vistaLogin").style.display = "none";
    document.getElementById("vistaRegistro").style.display = "none";
    document.getElementById("vistaPerfil").style.display = "none";
    ocultarVistasExtraNivan();
    document.getElementById("vistaRecuperar").style.display = "block";

    recuperacionNivan = null;
    ["recuperarCodigo", "recuperarPassNueva", "recuperarPassRepetir"].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const emailLogin = document.getElementById("loginEmail");
    const emailRec = document.getElementById("recuperarEmail");
    if (emailRec) emailRec.value = emailLogin ? emailLogin.value.trim() : "";
    mostrarPasoRecuperarNivan(1);
}

async function enviarCodigoRecuperacionNivan() {
    const campo = document.getElementById("recuperarEmail");
    const email = (campo.value || (recuperacionNivan && recuperacionNivan.email) || "").trim().toLowerCase();

    if (!email) { alert("Escribí tu email."); return; }
    if (!esEmailValidoNivan(email)) { alert(MENSAJE_EMAIL_INVALIDO_NIVAN); return; }

    const r = await apiNivan("/api/recuperar/pedir", { email: email });
    if (!r.ok) { alert(r.error); return; }

    recuperacionNivan = { email: email, token: "" };
    document.getElementById("avisoCodigoRecuperarNivan").innerHTML =
        "📩 Si hay una cuenta con ese email, te enviamos un código de 6 dígitos (vale " + MINUTOS_CODIGO_RECUPERACION_NIVAN + " minutos). Revisá también la carpeta de spam.";
    document.getElementById("recuperarCodigo").value = "";
    document.getElementById("avisoCodigoErrorNivan").textContent = "";
    mostrarPasoRecuperarNivan(2);
}

async function verificarCodigoRecuperacionNivan() {
    const aviso = document.getElementById("avisoCodigoErrorNivan");
    const ingresado = document.getElementById("recuperarCodigo").value.trim();

    if (!recuperacionNivan) { mostrarPasoRecuperarNivan(1); return; }
    if (!/^\d{6}$/.test(ingresado)) {
        aviso.textContent = "Escribí los 6 dígitos.";
        aviso.style.color = "#ff8c8c";
        return;
    }

    const r = await apiNivan("/api/recuperar/verificar", { email: recuperacionNivan.email, codigo: ingresado });
    if (!r.ok) {
        aviso.textContent = r.error;
        aviso.style.color = "#ff8c8c";
        if (r.estado === 429 || /venci/.test(r.error)) { recuperacionNivan = null; mostrarPasoRecuperarNivan(1); }
        return;
    }

    recuperacionNivan.token = r.token;
    document.getElementById("recuperarPassNueva").value = "";
    document.getElementById("recuperarPassRepetir").value = "";
    actualizarAvisosRecuperarNivan();
    mostrarPasoRecuperarNivan(3);
}

function actualizarAvisosRecuperarNivan() {
    mostrarAvisosPasswordNivan("recuperarPassNueva", "recuperarPassRepetir", "avisoRecuperarNuevaNivan", "avisoRecuperarRepetirNivan");
}

async function restablecerPasswordNivan() {
    if (!recuperacionNivan || !recuperacionNivan.token) {
        recuperacionNivan = null;
        alert("Se agotó el tiempo. Pedí un código nuevo.");
        mostrarPasoRecuperarNivan(1);
        return;
    }

    const nueva = document.getElementById("recuperarPassNueva").value;
    const repetir = document.getElementById("recuperarPassRepetir").value;

    if (!nueva || !repetir) { alert("Completá los dos campos."); return; }
    if (!evaluarPasswordNivan(nueva).fuerte) { alert("La contraseña nueva es débil."); return; }
    if (nueva !== repetir) { alert("Las contraseñas no coinciden."); return; }

    const boton = document.getElementById("botonRecuperarNivan");
    if (boton) boton.disabled = true;
    try {
        const r = await apiNivan("/api/recuperar/restablecer", { email: recuperacionNivan.email, token: recuperacionNivan.token, nueva: nueva });
        if (!r.ok) {
            alert(r.error);
            if (/tiempo/.test(r.error)) { recuperacionNivan = null; mostrarPasoRecuperarNivan(1); }
            return;
        }

        const emailRecuperado = recuperacionNivan.email;
        const usuarioLocal = obtenerUsuariosNivan().find(function(u) { return u.email === emailRecuperado; });
        if (usuarioLocal) registrarEventoLoginNivan(usuarioLocal.id, "password_restablecida");
        recuperacionNivan = null;

        alert("Listo, cambiaste tu contraseña. Iniciá sesión con la nueva.");
        mostrarLogin();
        document.getElementById("loginEmail").value = emailRecuperado;
        document.getElementById("loginPassword").value = "";
        verificarSesionActivaNivan();   // si esta persona tenía la sesión abierta acá, se cierra
    } finally {
        if (boton) boton.disabled = false;
    }
}

// ==============================
// AUTENTICACIÓN EN 2 PASOS (TOTP, compatible con Google Authenticator,
// Microsoft Authenticator, Authy, etc.) + CÓDIGOS DE RESPALDO
// ==============================
// Los datos viven en el usuario guardado en este dispositivo (nunca en la
// sesión). Cuando haya servidor, la verificación se mueve allá.

const BASE32_NIVAN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALFABETO_RESPALDO_NIVAN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CANTIDAD_CODIGOS_RESPALDO_NIVAN = 8;
const MAX_INTENTOS_2FA_NIVAN = 5;

let activacion2FANivan = null;   // { secreto } mientras se está activando
let pendiente2FANivan = null;    // { usuarioId, intentos, expira } mientras se verifica el login

function ocultarVistasExtraNivan() {
    ["vistaRecuperar", "vistaDosPasos"].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

// Guarda campos en el usuario de la lista (sin tocar la sesión).
function actualizarUsuarioListaNivan(idUsuario, campos) {
    const usuarios = obtenerUsuariosNivan();
    const i = usuarios.findIndex(function(u) { return u.id === idUsuario; });
    if (i === -1) return false;
    usuarios[i] = Object.assign({}, usuarios[i], campos);
    guardarUsuariosNivan(usuarios);
    return true;
}

function generarSecretoBase32Nivan() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    let bits = "";
    bytes.forEach(function(b) { bits += b.toString(2).padStart(8, "0"); });
    let out = "";
    for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32_NIVAN[parseInt(bits.substr(i, 5), 2)];
    return out;
}

function base32ABytesNivan(texto) {
    const limpio = String(texto).toUpperCase().replace(/[^A-Z2-7]/g, "");
    let bits = "";
    for (const c of limpio) bits += BASE32_NIVAN.indexOf(c).toString(2).padStart(5, "0");
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
    return new Uint8Array(bytes);
}

async function totpNivan(secretoB32, paso) {
    const clave = await crypto.subtle.importKey("raw", base32ABytesNivan(secretoB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const contador = new ArrayBuffer(8);
    const vista = new DataView(contador);
    vista.setUint32(0, Math.floor(paso / 4294967296));
    vista.setUint32(4, paso >>> 0);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", clave, contador));
    const o = mac[mac.length - 1] & 15;
    const num = ((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
    return String(num % 1000000).padStart(6, "0");
}

// Devuelve el paso de 30 s que coincidió (o null). Acepta ±1 paso por
// diferencias de reloj y no deja reusar un código ya usado.
async function verificarTotpNivan(secreto, codigo, ultimoPaso) {
    const ahora = Math.floor(Date.now() / 30000);
    for (const d of [0, -1, 1]) {
        const paso = ahora + d;
        if (paso <= (ultimoPaso || 0)) continue;
        if ((await totpNivan(secreto, paso)) === codigo) return paso;
    }
    return null;
}

function normalizarCodigoRespaldoNivan(texto) {
    return String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function generarCodigosRespaldoNivan() {
    const visibles = [];
    const hashes = [];
    for (let n = 0; n < CANTIDAD_CODIGOS_RESPALDO_NIVAN; n++) {
        const bytes = new Uint8Array(10);
        crypto.getRandomValues(bytes);
        let codigo = "";
        bytes.forEach(function(b) { codigo += ALFABETO_RESPALDO_NIVAN[b % ALFABETO_RESPALDO_NIVAN.length]; });
        visibles.push(codigo.slice(0, 5) + "-" + codigo.slice(5));
        hashes.push(await hashPasswordNivan("NVB:" + codigo));
    }
    return { visibles: visibles, hashes: hashes };
}

function abrirPanelPrivacidadNivan(html) {
    const contenido = document.getElementById("contenidoPrivacidadNivan");
    if (!contenido) return;
    contenido.innerHTML = html;
    document.getElementById("panelPrivacidadNivan").classList.add("abierto");
    document.getElementById("overlayPrivacidadNivan").classList.add("abierto");
}

function abrirAutenticacion2PasosNivan() {
    if (!usuarioActual) {
        abrirPrivacidadSeguridadNivan();
        alert("Iniciá sesión para configurar la verificación en 2 pasos.");
        return;
    }

    activacion2FANivan = null;
    const u = obtenerUsuarioPorIdNivan(usuarioActual.id) || {};
    const dp = u.dosPasos && u.dosPasos.activo ? u.dosPasos : null;

    const cuerpo = dp
        ? `
            <div class="estadoDosPasosNivan activaNivan">
                <strong>🛡️ Activada</strong><br>
                <span>Desde el ${escaparHTMLNivan(formatearFechaLoginNivan(dp.desde))}</span><br>
                <span>Códigos de respaldo disponibles: ${(dp.respaldo || []).length}</span>
            </div>
            <div class="campoEditarPerfilLateral" style="margin-top:14px;">
                <label for="dosPasosPassConfirmNivan">Tu contraseña (para confirmar cambios)</label>
                <input type="password" id="dosPasosPassConfirmNivan" autocomplete="current-password" maxlength="128">
            </div>
            <button type="button" class="botonAgregarGuardadoNivan" onclick="regenerarCodigosRespaldoNivan()">🗝️ Generar códigos de respaldo nuevos</button>
            <button type="button" class="botonAgregarGuardadoNivan" style="margin-top:10px;" onclick="desactivar2PasosNivan()">Desactivar verificación en 2 pasos</button>
        `
        : `
            <div class="estadoDosPasosNivan">
                <strong>Desactivada</strong><br>
                <span>Además de la contraseña, te vamos a pedir un código que cambia cada 30 segundos desde una app de autenticación.</span>
            </div>
            <button type="button" class="botonAgregarGuardadoNivan" style="margin-top:14px;" onclick="comenzarActivacion2PasosNivan()">Activar</button>
        `;

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirPrivacidadSeguridadNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🛡️ Autenticación en 2 pasos</h2>
            <p class="subTextoPerfilLateral">Protege tu cuenta aunque alguien sepa tu contraseña.</p>
        </div>
        ${cuerpo}
    `);
}

function comenzarActivacion2PasosNivan() {
    if (!usuarioActual) return;
    activacion2FANivan = { secreto: generarSecretoBase32Nivan() };
    const secreto = activacion2FANivan.secreto;
    const grupos = secreto.match(/.{1,4}/g).join(" ");
    const uri = "otpauth://totp/NIVAN:" + encodeURIComponent(usuarioActual.email) +
        "?secret=" + secreto + "&issuer=NIVAN&algorithm=SHA1&digits=6&period=30";

    abrirPanelPrivacidadNivan(`
        <button type="button" class="botonVolverPanelLateral" onclick="abrirAutenticacion2PasosNivan();">← Volver</button>
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">Activar 2 pasos</h2>
        </div>
        <p class="subTextoPerfilLateral"><strong>1.</strong> Instalá una app de autenticación (Google Authenticator, Microsoft Authenticator, Authy…).</p>
        <p class="subTextoPerfilLateral"><strong>2.</strong> Agregá NIVAN con esta clave (tocala y copiala) o abriendo el enlace desde este celular:</p>
        <div class="claveDosPasosNivan">${escaparHTMLNivan(grupos)}</div>
        <a class="enlaceAutenticadorNivan" href="${escaparHTMLNivan(uri)}">📲 Abrir en mi app de autenticación</a>
        <p class="subTextoPerfilLateral"><strong>3.</strong> Escribí acá el código de 6 dígitos que te muestra la app:</p>
        <div class="campoEditarPerfilLateral">
            <input type="text" id="dosPasosCodigoActivarNivan" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">
        </div>
        <button type="button" class="botonAgregarGuardadoNivan" id="botonConfirmar2PasosNivan" onclick="confirmarActivacion2PasosNivan()">Confirmar y activar</button>
    `);
}

async function confirmarActivacion2PasosNivan() {
    if (!usuarioActual || !activacion2FANivan) return;

    const codigo = (document.getElementById("dosPasosCodigoActivarNivan").value || "").trim();
    if (!/^\d{6}$/.test(codigo)) {
        alert("Escribí los 6 dígitos que te muestra la app.");
        return;
    }

    const boton = document.getElementById("botonConfirmar2PasosNivan");
    if (boton) boton.disabled = true;

    try {
        const paso = await verificarTotpNivan(activacion2FANivan.secreto, codigo, 0);
        if (paso === null) {
            alert("Ese código no coincide. Revisá que la hora de tu celular esté en automático e intentá con el código nuevo.");
            return;
        }

        const respaldo = await generarCodigosRespaldoNivan();
        actualizarUsuarioListaNivan(usuarioActual.id, {
            dosPasos: { activo: true, secreto: activacion2FANivan.secreto, desde: Date.now(), ultimoPaso: paso, respaldo: respaldo.hashes }
        });
        registrarEventoLoginNivan(usuarioActual.id, "dos_pasos_activada");
        activacion2FANivan = null;
        mostrarCodigosRespaldoNivan(respaldo.visibles, "¡Listo! La verificación en 2 pasos quedó activada.");
    } finally {
        if (boton) boton.disabled = false;
    }
}

function mostrarCodigosRespaldoNivan(codigos, titulo) {
    abrirPanelPrivacidadNivan(`
        <div class="tituloPagina" style="padding:0;">
            <h2 style="margin-top:0;">🗝️ Códigos de respaldo</h2>
            <p class="subTextoPerfilLateral">${escaparHTMLNivan(titulo)}</p>
        </div>
        <p class="subTextoPerfilLateral">Guardalos en un lugar seguro. Cada uno sirve <strong>una sola vez</strong> si perdés el celular, y <strong>no se vuelven a mostrar</strong>.</p>
        <div class="codigosRespaldoNivan">${codigos.map(function(c) { return `<span>${escaparHTMLNivan(c)}</span>`; }).join("")}</div>
        <button type="button" class="botonAgregarGuardadoNivan" onclick="abrirAutenticacion2PasosNivan()">Ya los guardé</button>
    `);
}

async function verificarPasswordActualNivan(password) {
    if (!usuarioActual) return false;
    const r = await apiNivan("/api/confirmar-password", { password: password });
    return !!r.ok;
}

async function regenerarCodigosRespaldoNivan() {
    const pass = (document.getElementById("dosPasosPassConfirmNivan") || {}).value || "";
    if (!pass) {
        alert("Escribí tu contraseña para confirmar.");
        return;
    }
    if (!(await verificarPasswordActualNivan(pass))) {
        alert("La contraseña es incorrecta.");
        return;
    }

    const u = obtenerUsuarioPorIdNivan(usuarioActual.id);
    if (!u || !u.dosPasos || !u.dosPasos.activo) return;

    const respaldo = await generarCodigosRespaldoNivan();
    actualizarUsuarioListaNivan(usuarioActual.id, { dosPasos: Object.assign({}, u.dosPasos, { respaldo: respaldo.hashes }) });
    registrarEventoLoginNivan(usuarioActual.id, "codigos_respaldo");
    mostrarCodigosRespaldoNivan(respaldo.visibles, "Generamos códigos nuevos. Los anteriores ya no sirven.");
}

async function desactivar2PasosNivan() {
    const pass = (document.getElementById("dosPasosPassConfirmNivan") || {}).value || "";
    if (!pass) {
        alert("Escribí tu contraseña para confirmar.");
        return;
    }
    if (!(await verificarPasswordActualNivan(pass))) {
        alert("La contraseña es incorrecta.");
        return;
    }
    if (!confirm("¿Desactivar la verificación en 2 pasos? Tu cuenta va a quedar protegida solo con la contraseña.")) return;

    actualizarUsuarioListaNivan(usuarioActual.id, { dosPasos: { activo: false } });
    registrarEventoLoginNivan(usuarioActual.id, "dos_pasos_desactivada");
    abrirAutenticacion2PasosNivan();
}

// ----- Verificación al iniciar sesión -----

function iniciarVerificacion2PasosNivan(usuario) {
    pendiente2FANivan = { usuarioId: usuario.id, intentos: 0, expira: Date.now() + 10 * 60 * 1000 };
    ocultarVistasExtraNivan();
    document.getElementById("vistaLogin").style.display = "none";
    document.getElementById("vistaRegistro").style.display = "none";
    document.getElementById("vistaPerfil").style.display = "none";
    document.getElementById("vistaDosPasos").style.display = "block";
    document.getElementById("dosPasosCodigoLogin").value = "";
    document.getElementById("avisoDosPasosLoginNivan").textContent = "";
}

function cancelarVerificacion2PasosNivan() {
    pendiente2FANivan = null;
    const pass = document.getElementById("loginPassword");
    if (pass) pass.value = "";
    mostrarLogin();
}

async function verificarLogin2PasosNivan() {
    const aviso = document.getElementById("avisoDosPasosLoginNivan");

    if (!pendiente2FANivan || Date.now() > pendiente2FANivan.expira) {
        pendiente2FANivan = null;
        alert("Se agotó el tiempo. Iniciá sesión de nuevo.");
        cancelarVerificacion2PasosNivan();
        return;
    }

    const codigo = normalizarCodigoRespaldoNivan(document.getElementById("dosPasosCodigoLogin").value);
    if (!codigo) {
        aviso.textContent = "Escribí tu código.";
        aviso.style.color = "#ff8c8c";
        return;
    }

    const usuarios = obtenerUsuariosNivan();
    const i = usuarios.findIndex(function(u) { return u.id === pendiente2FANivan.usuarioId; });
    const u = i === -1 ? null : usuarios[i];
    if (!u || !u.dosPasos || !u.dosPasos.activo) {
        cancelarVerificacion2PasosNivan();
        return;
    }

    let ok = false;
    let usoRespaldo = false;

    if (/^\d{6}$/.test(codigo)) {
        const paso = await verificarTotpNivan(u.dosPasos.secreto, codigo, u.dosPasos.ultimoPaso);
        if (paso !== null) {
            ok = true;
            u.dosPasos.ultimoPaso = paso;
        }
    } else if (codigo.length === 10) {
        const h = await hashPasswordNivan("NVB:" + codigo);
        const k = (u.dosPasos.respaldo || []).indexOf(h);
        if (k !== -1) {
            ok = true;
            usoRespaldo = true;
            u.dosPasos.respaldo.splice(k, 1);
        }
    }

    if (!ok) {
        pendiente2FANivan.intentos++;
        registrarEventoLoginNivan(u.id, "fallido_2fa");
        if (pendiente2FANivan.intentos >= MAX_INTENTOS_2FA_NIVAN) {
            alert("Demasiados intentos. Iniciá sesión de nuevo.");
            cancelarVerificacion2PasosNivan();
            return;
        }
        aviso.textContent = "Código incorrecto. Te quedan " + (MAX_INTENTOS_2FA_NIVAN - pendiente2FANivan.intentos) + " intentos.";
        aviso.style.color = "#ff8c8c";
        return;
    }

    guardarUsuariosNivan(usuarios);
    pendiente2FANivan = null;
    completarInicioSesionNivan(u);

    if (usoRespaldo) {
        alert("Usaste un código de respaldo. Te quedan " + u.dosPasos.respaldo.length + ". Generá nuevos desde Privacidad y seguridad › Autenticación en 2 pasos.");
    }
}

