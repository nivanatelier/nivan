// ==============================
// CURRÍCULUM Y PORTAFOLIO DEL PERFIL
// ==============================

function subirCurriculumPerfilLateral(input) {
    if (!usuarioActual || !input.files || !input.files[0]) return;

    const archivo = input.files[0];
    const lector = new FileReader();

    lector.onload = function() {
        persistirUsuarioActual({
            curriculum: {
                nombreArchivo: archivo.name,
                src: lector.result
            }
        });
        abrirCurriculumPerfilLateral();
    };

    lector.readAsDataURL(archivo);
}

function verCurriculumPerfilLateral() {
    if (!usuarioActual || !usuarioActual.curriculum) return;
    const ventana = window.open();
    if (ventana) ventana.location.href = usuarioActual.curriculum.src;
}

function borrarCurriculumPerfilLateral() {
    if (!usuarioActual) return;
    mostrarConfirmacionNivan("¿Querés borrar tu currículum?", function() {
        persistirUsuarioActual({ curriculum: null });
        abrirCurriculumPerfilLateral();
    });
}

// ==============================
// PANTALLAS COMPLETAS (genérico)
// ==============================

// Pantalla que se abrió desde el menú de Configuración: al volver atrás,
// se reabre Configuración en vez de salir al Home.
let __pantallaVuelveAConfigNivan = null;

function abrirDesdeConfigNivan(abrir, idPantalla) {
    cerrarPerfilLateral();
    abrir();
    const pantalla = document.getElementById(idPantalla);
    __pantallaVuelveAConfigNivan = (pantalla && pantalla.classList.contains("abierta")) ? idPantalla : null;
}

function abrirPantallaCompleta(id) {
    if (id === __pantallaVuelveAConfigNivan) __pantallaVuelveAConfigNivan = null;
    const pantalla = document.getElementById(id);
    if (pantalla) {
        // Mis compras y el Panel de Vendedor (y lo que se abre desde ahí) tapan la barra de abajo.
        if (id === "pantallaMisCompras" || id === "pantallaVender" || document.querySelector(".pantallaCompleta.abierta.sobreBarraNivan")) {
            pantalla.classList.add("sobreBarraNivan");
        }
        // La mandamos al final del body para que quede siempre por encima
        // de cualquier otra pantalla abierta y se vea apenas se toca.
        document.body.appendChild(pantalla);
        pantalla.classList.add("abierta");
        pantalla.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function cerrarPantallaCompleta(id) {
    const pantalla = document.getElementById(id);
    if (pantalla) pantalla.classList.remove("abierta", "sobreBarraNivan");

    if (id === "pantallaActividad" && __comentariosVuelveAConfigNivan) {
        __comentariosVuelveAConfigNivan = false;
        abrirConfigAppNivan();
        return;
    }

    if (id === __pantallaVuelveAConfigNivan) {
        __pantallaVuelveAConfigNivan = null;
        abrirPerfilLateral();
    }
}

function abrirTerminos() {
    if (typeof renderizarLegalNivan === "function") renderizarLegalNivan("terminos", "contenidoTerminosNivan");
    abrirPantallaCompleta("pantallaTerminos");
}

function abrirCentroAyudaNivan() {
    alert('Próximamente: Centro de ayuda / FAQ con instrucciones de uso.');
}

function abrirReportarErrorNivan() {
    alert('Próximamente: formulario para reportar errores y dejar sugerencias.');
}

// ==============================
// TIPO DE TRABAJO DEL USUARIO
// ==============================

function irATipoTrabajo() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    cargarTipoTrabajo();
    abrirPantallaCompleta("pantallaTipoTrabajo");
}

function cargarTipoTrabajo() {
    if (!usuarioActual) return;

    const tipos = usuarioActual.tiposTrabajo || [];

    document.querySelectorAll('#listaTiposTrabajo input[name="tipoTrabajo"]')
        .forEach(function(casilla) {
            casilla.checked = tipos.includes(casilla.value);
        });
}

function guardarTipoTrabajo() {
    if (!usuarioActual) {
        alert("Iniciá sesión para guardar tu tipo de trabajo.");
        return;
    }

    const seleccionados = Array.from(
        document.querySelectorAll('#listaTiposTrabajo input[name="tipoTrabajo"]:checked')
    ).map(function(casilla) {
        return casilla.value;
    });

    usuarioActual.tiposTrabajo = seleccionados;
    guardarJSONNivan("nivanSesion", usuarioActual);

    // También lo actualizamos en la lista de usuarios guardados.
    const usuarios = obtenerUsuariosNivan();
    const indice = usuarios.findIndex(function(u) {
        return u.id === usuarioActual.id;
    });

    if (indice !== -1) {
        usuarios[indice].tiposTrabajo = seleccionados;
        guardarUsuariosNivan(usuarios);
    }

    // Refrescamos el perfil para que el botón de tipo de trabajo
    // muestre la nueva selección en vez de seguir diciendo
    // "Agregar tipo de trabajo".
    renderizarPerfilLateral();

    // Guardamos y salimos de la pantalla.
    cerrarPantallaCompleta("pantallaTipoTrabajo");
}

  // --- SONIDO --- //
// El audio se carga desde un link (SONIDO_CLICK_URL_NIVAN) para no hacer pesado el archivo.
// Ruta del sonido de click (carpeta "sonidos" al lado del HTML). Si queda vacío, la app anda igual pero sin sonido.
// Para probar abrí la app con Live Server (con doble clic en el archivo el navegador bloquea la carga del audio).
const SONIDO_CLICK_URL_NIVAN = "sonidos/Pup.m4a";
const VOLUMEN_CLICK_NIVAN = 0.8; // de 0 a 1
const INICIO_CLICK_NIVAN = 0.15; // segundos de silencio que se saltea al principio del audio

let audioCtxNivan = null;
let bufferClickNivan = null;   // null = sin cargar, "cargando", "fallo" o el AudioBuffer listo
let audioRespaldoNivan = null;

function prepararSonidoNivan() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { bufferClickNivan = bufferClickNivan || "fallo"; return; }
        if (!audioCtxNivan) audioCtxNivan = new AC();
        if (audioCtxNivan.state === "suspended") audioCtxNivan.resume();
        if (bufferClickNivan) return;
        if (!SONIDO_CLICK_URL_NIVAN) return;

        bufferClickNivan = "cargando";
        fetch(SONIDO_CLICK_URL_NIVAN)
            .then(function(r) {
                if (!r.ok) throw new Error("no se pudo leer el sonido");
                return r.arrayBuffer();
            })
            .then(function(datos) {
                return new Promise(function(ok, fallo) {
                    const promesa = audioCtxNivan.decodeAudioData(datos, ok, fallo);
                    if (promesa && promesa.catch) promesa.catch(function() {});
                });
            })
            .then(function(buffer) { bufferClickNivan = buffer; })
            // Si no se puede (por ejemplo, abriendo el HTML con doble clic) se usa un <audio> común.
            .catch(function() { bufferClickNivan = "fallo"; });
    } catch (e) { bufferClickNivan = "fallo"; }
}

// Preferencia del usuario: sonidos de la app activados o no (por defecto, activados).
function sonidosActivosNivan() {
    try {
        return localStorage.getItem("nivanSonidosActivos") !== "0";
    } catch (e) {
        return true;
    }
}

function guardarSonidosActivosNivan(valor) {
    try {
        localStorage.setItem("nivanSonidosActivos", valor ? "1" : "0");
    } catch (e) {}
}

// Respaldo: reproduce el archivo con un elemento <audio> (anda también sin servidor).
function reproducirRespaldoNivan() {
    try {
        if (!SONIDO_CLICK_URL_NIVAN) return;
        if (!audioRespaldoNivan) {
            audioRespaldoNivan = new Audio(SONIDO_CLICK_URL_NIVAN);
            audioRespaldoNivan.preload = "auto";
        }
        const copia = audioRespaldoNivan.cloneNode();
        copia.volume = Math.min(1, VOLUMEN_CLICK_NIVAN);
        copia.currentTime = INICIO_CLICK_NIVAN;
        const intento = copia.play();
        if (intento && intento.catch) intento.catch(function() {});
    } catch (e) {}
}

function sonidoClickNivan() {
    try {
        if (!sonidosActivosNivan()) return;
        prepararSonidoNivan();

        if (bufferClickNivan === "fallo") { reproducirRespaldoNivan(); return; }
        if (!audioCtxNivan || !bufferClickNivan || bufferClickNivan === "cargando") return;

        const reproducir = function() {
            const fuente = audioCtxNivan.createBufferSource();
            const ganancia = audioCtxNivan.createGain();
            fuente.buffer = bufferClickNivan;
            ganancia.gain.value = VOLUMEN_CLICK_NIVAN;
            fuente.connect(ganancia);
            ganancia.connect(audioCtxNivan.destination);
            fuente.start(0, INICIO_CLICK_NIVAN);
        };

        // En iPhone/Safari el audio arranca "suspendido" hasta el primer toque.
        if (audioCtxNivan.state === "suspended") {
            audioCtxNivan.resume().then(reproducir).catch(function() {});
        } else {
            reproducir();
        }
    } catch (e) {}
}

// Precarga el audio apenas abre la página, así el primer toque ya suena al instante.
prepararSonidoNivan();

// El sonido suena solo cuando se hace click de verdad en un botón (al
// soltar), no cuando apenas se apoya el dedo o se empieza a deslizar.
// Un solo listener para todos los botones, incluso los que se crean después.
document.addEventListener("click", function(e) {
    if (e.target.closest(".sinSonidoClickNivan")) return;
    if (e.target.closest("button, .navItem, .categoriaBtn, [onclick]")) {
        sonidoClickNivan();
    }
}, true);

// ==============================
// VENDER / CREAR PUBLICACIÓN
// ==============================

function irAVender() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    actualizarBotonMisCuponesNivan();
    actualizarBadgeGestionNivan();
    abrirPantallaCompleta("pantallaVender");
}

// Tiene tienda quien ya publicó algo o quien la creó desde Panel de Vendedor → Mi tienda.
function usuarioHaPublicadoNivan(idUsuario) {
    if (!idUsuario) return false;
    return productos.some(function(p) { return p.vendedorId === idUsuario; });
}

// Igual que usuarioTieneTiendaNivan pero SIN mirar el país: la tienda es de la cuenta,
// no del país. Sirve para separar los mensajes y avisos de la tienda del perfil
// personal aunque estés viendo la app en otro país (donde no publicaste nada).
// Se calcula una sola vez y se renueva cada vez que se guardan las publicaciones.
window.__idsConTiendaNivan = null;

function usuarioTieneCuentaTiendaNivan(idUsuario) {
    if (!idUsuario) return false;

    try {
        if (!window.__idsConTiendaNivan) {
            const inactivas = (typeof idsCuentasInactivasNivan === "function") ? idsCuentasInactivasNivan() : {};
            const ids = {};
            obtenerPublicacionesNivan().forEach(function(p) {
                if (!p || !p.vendedorId || p.activo === false || inactivas[p.vendedorId]) return;
                ids[p.vendedorId] = true;
            });
            window.__idsConTiendaNivan = ids;
        }
        if (window.__idsConTiendaNivan[idUsuario]) return true;
    } catch (e) {}

    return usuarioTieneTiendaNivan(idUsuario);
}

function usuarioTieneTiendaNivan(idUsuario) {
    if (!idUsuario) return false;
    if (usuarioHaPublicadoNivan(idUsuario)) return true;
    if (usuarioActual && usuarioActual.id === idUsuario) return !!usuarioActual.tiendaCreada;
    const u = obtenerUsuarioPorIdNivan(idUsuario);
    return !!(u && u.tiendaCreada);
}

function actualizarBotonMisCuponesNivan() {
    // "Mis cupones" solo aparece cuando ya publicaste algo.
    const haPublicado = !!(usuarioActual && usuarioHaPublicadoNivan(usuarioActual.id));
    const boton = document.getElementById("botonMisCuponesVenderNivan");
    if (boton) boton.style.display = haPublicado ? "" : "none";

    // Las herramientas premium salen apenas tenés tu tienda (creada o con publicaciones).
    const tieneTienda = !!(usuarioActual && usuarioTieneTiendaNivan(usuarioActual.id));
    const premium = document.getElementById("botonHerramientasPremiumNivan");
    if (premium) premium.style.display = tieneTienda ? "" : "none";
}

let periodoEstadisticasVentaNivan = "30";

function abrirEstadisticasVentaNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    renderizarEstadisticasVentaNivan();
    abrirPantallaCompleta("pantallaEstadisticasVenta");
}

function cambiarPeriodoEstadisticasVentaNivan(periodo) {
    periodoEstadisticasVentaNivan = periodo;
    renderizarEstadisticasVentaNivan();
}

// Un reembolso o devolución ya completado no cuenta como venta real.
function pedidoEsNetoNivan(p) {
    return p.estado !== "cancelado" && !(p.reclamo && p.reclamo.estado === "completado");
}

function renderizarEstadisticasVentaNivan() {
    const contenedor = document.getElementById("contenidoEstadisticasVentaNivan");
    if (!contenedor || !usuarioActual) return;

    ["7", "30", "todo"].forEach(function(p) {
        const btn = document.getElementById("periodoEstad_" + p);
        if (btn) btn.classList.toggle("activo", periodoEstadisticasVentaNivan === p);
    });

    const ahora = Date.now();
    const limite = periodoEstadisticasVentaNivan === "7" ? ahora - 7 * 24 * 60 * 60 * 1000
        : periodoEstadisticasVentaNivan === "30" ? ahora - 30 * 24 * 60 * 60 * 1000
        : 0;

    const misPedidos = obtenerPedidosDelPaisNivan().filter(function(p) {
        return p.vendedorId === usuarioActual.id && p.fecha >= limite && pedidoEsNetoNivan(p);
    });

    const totalVendido = misPedidos.reduce(function(acum, p) { return acum + (Number(p.total) || 0); }, 0);
    const cantidadPedidos = misPedidos.length;
    const prendasVendidas = misPedidos.reduce(function(acum, p) {
        return acum + (p.items || []).reduce(function(a, it) { return a + (Number(it.cantidad) || 1); }, 0);
    }, 0);

    // Visitas y favoritos: se miran en TODAS tus publicaciones (activas o
    // no), filtrando el historial de actividad por el mismo período.
    const misIdsProductos = obtenerPublicacionesNivan()
        .filter(function(p) { return p.vendedorId === usuarioActual.id; })
        .map(function(p) { return p.id; });

    const eventos = leerJSONNivan("nivanActividadProductos", []).filter(function(e) {
        return misIdsProductos.includes(e.i) && e.t >= limite;
    });

    const visitas = eventos.filter(function(e) { return e.k === "vista"; }).length;
    const favoritosNuevos = eventos.filter(function(e) { return e.k === "favorito"; }).length;

    // Top publicaciones por ingresos, dentro del período elegido.
    const porProducto = {};
    misPedidos.forEach(function(p) {
        (p.items || []).forEach(function(it) {
            if (!porProducto[it.id]) porProducto[it.id] = { nombre: it.nombre, cantidad: 0, ingresos: 0 };
            porProducto[it.id].cantidad += Number(it.cantidad) || 1;
            porProducto[it.id].ingresos += (Number(it.precioUnitario) || 0) * (Number(it.cantidad) || 1);
        });
    });

    const topProductos = Object.keys(porProducto)
        .map(function(id) { return porProducto[id]; })
        .sort(function(a, b) { return b.ingresos - a.ingresos; })
        .slice(0, 5);

    contenedor.innerHTML = `
        <div class="gridEstadisticasNivan">
            <div class="tarjetaEstadisticaNivan">
                <span>💰 Vendido</span>
                <strong>${simboloMonedaNivan()}${formatearDineroNivan(totalVendido)}</strong>
            </div>
            <div class="tarjetaEstadisticaNivan">
                <span>🧾 Pedidos</span>
                <strong>${cantidadPedidos}</strong>
            </div>
            <div class="tarjetaEstadisticaNivan">
                <span>👕 Prendas vendidas</span>
                <strong>${prendasVendidas}</strong>
            </div>
            <div class="tarjetaEstadisticaNivan">
                <span>👀 Visitas</span>
                <strong>${visitas}</strong>
            </div>
            <div class="tarjetaEstadisticaNivan">
                <span>❤️ Favoritos nuevos</span>
                <strong>${favoritosNuevos}</strong>
            </div>
        </div>

        <p class="etiquetaSeccionPerfilLateral">Lo más vendido${periodoEstadisticasVentaNivan === "todo" ? "" : " en este período"}</p>
        ${topProductos.length ? `
            <div class="listaTopProductosNivan">
                ${topProductos.map(function(p, i) {
                    return `
                        <div class="itemTopProductoNivan">
                            <span class="posicionTopProductoNivan">${i + 1}</span>
                            <div class="datosTopProductoNivan">
                                <strong>${escaparHTMLNivan(p.nombre)}</strong>
                                <span>${p.cantidad} vendid${p.cantidad === 1 ? "a" : "as"} · ${simboloMonedaNivan()}${formatearDineroNivan(p.ingresos)}</span>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        ` : `<p class="pedidosVaciosNivan">Todavía no tenés ventas en este período.</p>`}
    `;
}

function abrirCrearPublicacion() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    prepararFormularioPublicacion();
    abrirPantallaCompleta("pantallaCrearPublicacion");
}

// ==============================
// MIS PUBLICACIONES (pausar / activar / eliminar)
// ==============================

let filtroMisPublicacionesActual = "activas";

function irAMisPublicaciones() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    filtrarMisPublicaciones("activas");
    abrirPantallaCompleta("pantallaMisPublicaciones");
}

function filtrarMisPublicaciones(filtro) {
    filtroMisPublicacionesActual = filtro;

    document.getElementById("filtroActivasBtn")
        .classList.toggle("activo", filtro === "activas");

    document.getElementById("filtroInactivasBtn")
        .classList.toggle("activo", filtro === "inactivas");

    renderizarMisPublicaciones();
}

function renderizarMisPublicaciones() {
    const lista = document.getElementById("listaMisPublicaciones");
    const vacio = document.getElementById("misPublicacionesVacio");

    if (!usuarioActual) return;

    const misPublicaciones = obtenerPublicacionesNivan().filter(function(p) {
        return p.vendedorId === usuarioActual.id && (p.pais || "AR") === (paisNivan() || "AR");
    });

    const filtradas = misPublicaciones.filter(function(p) {
        const estaActiva = p.activo !== false;
        return filtroMisPublicacionesActual === "activas" ? estaActiva : !estaActiva;
    });

    if (!filtradas.length) {
        lista.innerHTML = "";
        vacio.style.display = "block";
        return;
    }

    vacio.style.display = "none";

    lista.innerHTML = filtradas.map(function(producto) {
        const estaActiva = producto.activo !== false;
        const preguntasPendientes = obtenerPreguntasProducto(producto.id).filter(function(p) {
            return !p.respuesta;
        }).length;

        return `
            <div class="itemMisPublicaciones">
                <img src="${escaparHTMLNivan(urlImagenNivan(producto.imagen))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(producto.nombre)}">

                <div class="infoMisPublicaciones">
                    <strong>${escaparHTMLNivan(producto.nombre)}</strong>
                    <p>${simboloMonedaNivan()}${formatearDineroNivan(producto.precio)}</p>
                </div>

                <div class="accionesMisPublicaciones">
                    <button type="button" class="editarPublicacionBtn" onclick="editarPublicacion(${producto.id})">
                        Editar
                    </button>

                    <button type="button" class="preguntasPublicacionBtn" onclick="abrirPreguntasComoVendedor(${producto.id})">
                        ❓ Preguntas${preguntasPendientes ? ` (${preguntasPendientes})` : ""}
                    </button>

                    <button type="button" class="pausarPublicacionBtn" onclick="pausarOActivarPublicacion(${producto.id})">
                        ${estaActiva ? "Pausar" : "Activar"}
                    </button>

                    <button type="button" class="eliminarPublicacionBtn" onclick="eliminarPublicacion(${producto.id})">
                        Eliminar
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function pausarOActivarPublicacion(id) {
    const publicaciones = obtenerPublicacionesNivan();

    const indice = publicaciones.findIndex(function(p) {
        return p.id === id;
    });

    if (indice === -1) return;

    publicaciones[indice].activo = publicaciones[indice].activo === false ? true : false;

    guardarPublicacionesNivan(publicaciones);
    sincronizarCatalogoConPublicaciones();
    renderizarMisPublicaciones();
}

// Si tiene un valor, el formulario de "Crear publicación" está
// editando esa publicación en vez de crear una nueva.
let publicacionEditandoId = null;

function editarPublicacion(id) {
    const producto = obtenerPublicacionesNivan().find(function(p) {
        return p.id === id;
    });

    if (!producto) return;

    prepararFormularioPublicacion();
    publicacionEditandoId = id;

    document.querySelector('#pantallaCrearPublicacion .tituloPantallaCompleta h2').textContent = "🧾 Editar publicación";
    document.querySelector('#pantallaCrearPublicacion .botonPantallaCompleta').textContent = "Guardar cambios";

    document.getElementById("nombrePublicacion").value = producto.nombre || "";
    document.getElementById("marcaPublicacion").value = producto.marca || "";
    document.getElementById("categoriaPublicacion").value = producto.categoria || "";
    document.getElementById("precioPublicacion").value = producto.precio != null ? Number(producto.precio).toLocaleString("es-AR") : "";

    // Carga venta por menor/mayor.
    document.getElementById("tipoVentaPublicacion").value = producto.tipoVenta || "menor";
    document.getElementById("cantidadMinimaMayorPublicacion").value = producto.cantidadMinimaMayor || "";
    tramosPrecioMayorPublicacion = Array.isArray(producto.tramosPrecioMayor)
        ? producto.tramosPrecioMayor.slice()
        : [];
    actualizarVisibilidadMayorPublicacion();
    renderizarTramosMayorPublicacion();

    document.getElementById("stockPublicacion").value = producto.stock != null ? producto.stock : "";
    document.getElementById("diasPublicacion").value = producto.diasEntrega != null ? producto.diasEntrega : "";
    document.getElementById("descripcionPublicacion").value = producto.descripcion || "";
    document.getElementById("etiquetasPublicacion").value = Array.isArray(producto.etiquetas) ? producto.etiquetas.join(" ") : "";
    cargarHistoriaPublicacionNivan(producto.historia);

    if (document.getElementById("campoOrigenPrendaPublicacion").style.display !== "none") {
        document.getElementById("origenPrendaPublicacion").value = producto.origenPrenda || "";
        // El campo puede cambiar si es reventa u obligar/deshabilitar
        // "A medida": volvemos a armar los talles con ese valor cargado
        // ANTES de tildar los que ya tenía guardados esta publicación.
        renderizarTallesPublicacion();
    }

    // Carga las fotos/videos que ya tenía la publicación para poder
    // editarlos (sacar alguno, agregar otros nuevos, etc.).
    mediosPublicacionSeleccionados = Array.isArray(producto.medios) && producto.medios.length
        ? producto.medios.slice()
        : (producto.imagen ? [{ tipo: "imagen", src: producto.imagen }] : []);
    renderizarPreviewMediosPublicacion();

    const talles = Array.isArray(producto.talles) ? producto.talles : [];
    document.querySelectorAll('#listaTallesPublicacion input').forEach(function(casilla) {
        if (talles.includes(casilla.value)) {
            casilla.checked = true;
        }
    });

    actualizarTablaMedidasPublicacion();

    const tablaMedidas = producto.tablaMedidas || {};
    Object.keys(tablaMedidas).forEach(function(talle) {
        const idSeguro = talle.replace(/\s+/g, "_");
        const m = tablaMedidas[talle] || {};

        const bustoEl = document.getElementById("busto_" + idSeguro);
        const cinturaEl = document.getElementById("cintura_" + idSeguro);
        const caderaEl = document.getElementById("cadera_" + idSeguro);
        const largoEl = document.getElementById("largo_" + idSeguro);

        if (bustoEl) bustoEl.value = m.busto || "";
        if (cinturaEl) cinturaEl.value = m.cintura || "";
        if (caderaEl) caderaEl.value = m.cadera || "";
        if (largoEl) largoEl.value = m.largo || "";
    });

    coloresSeleccionadosPublicacion = Array.isArray(producto.colores)
        ? producto.colores.slice()
        : [];
    renderizarChipsColoresElegidosPublicacion();

    abrirPantallaCompleta("pantallaCrearPublicacion");
}

// ==============================
// HISTORIA DE LA PRENDA (opcional)
// ==============================
// producto.historia = { disenadaPor, fabricadaPor, materiales, fechaCreacion ("AAAA-MM"),
// tecnica, produccion ("mano" | "produccion" | "reventa") }. Si no se cargó nada, es null.

const CAMPOS_HISTORIA_NIVAN = {
    disenadaPor: "historiaDisenadaPor",
    fabricadaPor: "historiaFabricadaPor",
    materiales: "historiaMateriales",
    fechaCreacion: "historiaFecha",
    tecnica: "historiaTecnica",
    produccion: "historiaProduccion"
};

function leerHistoriaPublicacionNivan() {
    const historia = {};
    let hayDatos = false;

    Object.keys(CAMPOS_HISTORIA_NIVAN).forEach(function(clave) {
        const valor = document.getElementById(CAMPOS_HISTORIA_NIVAN[clave]).value.trim();
        historia[clave] = valor;
        if (valor) hayDatos = true;
    });

    return hayDatos ? historia : null;
}

function cargarHistoriaPublicacionNivan(historia) {
    Object.keys(CAMPOS_HISTORIA_NIVAN).forEach(function(clave) {
        document.getElementById(CAMPOS_HISTORIA_NIVAN[clave]).value = (historia && historia[clave]) || "";
    });
}

function eliminarPublicacion(id) {
    if (!confirm("¿Seguro que querés eliminar esta publicación? No se puede deshacer.")) {
        return;
    }

    const publicaciones = obtenerPublicacionesNivan().filter(function(p) {
        return p.id !== id;
    });

    guardarPublicacionesNivan(publicaciones);
    sincronizarCatalogoConPublicaciones();
    renderizarMisPublicaciones();
}

// Reconstruye el catálogo general ("productos") a partir de las
// publicaciones guardadas: saca las que fueron eliminadas y las
// que están pausadas, y deja el resto tal como estaban.
function sincronizarCatalogoConPublicaciones() {
    const publicaciones = obtenerPublicacionesNivan();

    // Sacamos del catálogo TODAS las publicaciones de usuarios (tengan
    // o no vendedorId cargado), no solo las que siguen existiendo en el
    // storage. Antes esto se basaba en los ids que quedaban en
    // "publicaciones", así que una publicación recién eliminada (que ya
    // no está en esa lista) nunca se sacaba de "productos" y seguía
    // apareciendo en el catálogo general.
    productos = productos.filter(function(p) {
        return !p.vendedorId;
    });

    publicaciones
        .filter(function(p) {
            return p.activo !== false && (p.pais || "AR") === (paisNivan() || "AR");
        })
        .forEach(function(p) {
            productos.push(p);
        });

    mostrarProductos(productos);
    revisarBajasDePrecio();
}

// Calcula, según "Mi tipo de trabajo", si el usuario es diseñador,
// revendedor, o ambas cosas a la vez.
function calcularTiposTrabajoPublicacion() {
    const tipos = (usuarioActual && usuarioActual.tiposTrabajo) || [];

    const esDisenador = tipos.some(function(tipo) {
        return ["disenador", "disenador_taller"].includes(tipo);
    });

    const esRevendedor = tipos.includes("revendedor");

    return {
        esDisenador: esDisenador,
        esRevendedor: esRevendedor,
        ambosTipos: esDisenador && esRevendedor
    };
}

// Para una publicación YA CREADA: decide si en los hechos se comporta
// como "reventa" (sin a medida, con cartel de "pedime a medida") o
// como "fabricación propia" (con a medida, sin ese cartel).
// - Si el vendedor tiene un solo tipo de trabajo, se guía directo por ese.
// - Si tiene ambos tipos de trabajo a la vez, se guía por lo que declaró en ESA
//   publicación puntual (producto.origenPrenda: "reventa" o "fabricacion").
function actuaComoRevendedorEnPublicacion(producto) {
    const tipos = obtenerTiposTrabajoProducto(producto);

    const esDisenador = tipos.some(function(tipo) {
        return ["disenador", "disenador_taller"].includes(tipo);
    });

    const esRevendedor = tipos.includes("revendedor");

    if (esDisenador && esRevendedor) {
        return producto.origenPrenda === "reventa";
    }

    return esRevendedor;
}

// Arma el selector de talles del formulario de publicación, según el
// tipo de trabajo del usuario y (si tiene AMBOS tipos) lo que eligió en el campo
// "¿Es reventa o la fabricás vos?":
// - Solo diseñador, o ambos tipos + "la fabrico yo": "A medida" obligatorio.
// - Solo revendedor, o ambos tipos + "es reventa": no se ofrece "a medida".
// - Ninguno de los dos tipos, o ambos tipos sin elegir todavía: opcional.
function renderizarTallesPublicacion() {
    const tiposTrabajo = calcularTiposTrabajoPublicacion();
    const esDisenador = tiposTrabajo.esDisenador;
    const esRevendedor = tiposTrabajo.esRevendedor;
    const ambosTipos = tiposTrabajo.ambosTipos;

    const origenPrenda = ambosTipos
        ? document.getElementById("origenPrendaPublicacion").value
        : "";

    const tallesEstandar = ["XS", "S", "M", "L", "XL", "XXL"];

    const contenedor = document.getElementById("listaTallesPublicacion");
    const aviso = document.getElementById("avisoTipoTrabajoPublicacion");
    const campoOrigen = document.getElementById("campoOrigenPrendaPublicacion");

    // ¿En los hechos, para ESTA publicación, se comporta como
    // diseñador (fabrica) o como revendedor (no fabrica)?
    let modoEfectivo = "neutral";

    if (ambosTipos) {
        campoOrigen.style.display = "block";

        if (origenPrenda === "fabricacion") {
            modoEfectivo = "disenador";
        } else if (origenPrenda === "reventa") {
            modoEfectivo = "revendedor";
        } else {
            modoEfectivo = "neutral";
        }
    } else {
        campoOrigen.style.display = "none";
        document.getElementById("origenPrendaPublicacion").value = "";

        if (esDisenador) {
            modoEfectivo = "disenador";
        } else if (esRevendedor) {
            modoEfectivo = "revendedor";
        } else {
            modoEfectivo = "neutral";
        }
    }

    let html = "";

    if (modoEfectivo === "disenador") {
        aviso.textContent = ambosTipos
            ? "Dijiste que la fabricás vos: la opción “A medida” va sí o sí en esta publicación."
            : "Como diseñador/a, la opción “A medida” va sí o sí en tu publicación. También podés sumar talles estándar si querés.";
        html += `
            <label class="talleCheckPublicacion fijo">
                <input type="checkbox" value="A medida" checked disabled onchange="actualizarTablaMedidasPublicacion()">
                A medida (obligatorio)
            </label>
        `;
    } else if (modoEfectivo === "revendedor") {
        aviso.textContent = ambosTipos
            ? "Dijiste que es reventa: no se habilita la opción a medida para esta publicación."
            : "Como revendedor/a, solo podés ofrecer talles estándar: no se habilita la opción a medida.";
    } else if (ambosTipos) {
        aviso.textContent = "Sos diseñador/a y revendedor/a. Elegí primero si esta prenda es reventa o la fabricás vos.";
    } else {
        aviso.textContent = "Todavía no cargaste tu tipo de trabajo. Por ahora podés elegir talles estándar y, si querés, ofrecer a medida.";
    }

    tallesEstandar.forEach(function(talle) {
        html += `
            <label class="talleCheckPublicacion">
                <input type="checkbox" value="${talle}" name="tallePublicacion" onchange="actualizarTablaMedidasPublicacion()">
                ${talle}
            </label>
        `;
    });

    // "A medida" queda como opción no obligatoria solo en el modo
    // neutral (nadie tildó tipo de trabajo, o tildó ambos y todavía no eligió).
    if (modoEfectivo === "neutral") {
        html += `
            <label class="talleCheckPublicacion">
                <input type="checkbox" value="A medida" name="tallePublicacion" onchange="actualizarTablaMedidasPublicacion()">
                A medida
            </label>
        `;
    }

    contenedor.innerHTML = html;
    actualizarTablaMedidasPublicacion();
}

// Se llama cuando el usuario cambia la respuesta de "¿Es reventa o
// la fabricás vos?": recalcula si "A medida" va obligatorio,
// opcional o deshabilitado para esta publicación puntual.
function actualizarTallesSegunOrigenPublicacion() {
    renderizarTallesPublicacion();
}

function prepararFormularioPublicacion() {
    // Por defecto arrancamos en modo "publicación nueva". editarPublicacion()
    // pisa esto después si corresponde.
    publicacionEditandoId = null;
    document.querySelector('#pantallaCrearPublicacion .tituloPantallaCompleta h2').textContent = "🧾 Crear publicación nueva";
    document.querySelector('#pantallaCrearPublicacion .botonPantallaCompleta').textContent = "Publicar";

    document.getElementById("origenPrendaPublicacion").value = "";
    renderizarTallesPublicacion();

    // Reseteamos el resto del formulario.
    document.getElementById("fotoPublicacion").value = "";
    mediosPublicacionSeleccionados = [];
    renderizarPreviewMediosPublicacion();
    document.getElementById("nombrePublicacion").value = "";
    document.getElementById("marcaPublicacion").value = "";
    document.getElementById("categoriaPublicacion").value = "";
    document.getElementById("precioPublicacion").value = "";

    // Reiniciamos venta por menor/mayor.
    document.getElementById("tipoVentaPublicacion").value = "menor";
    document.getElementById("cantidadMinimaMayorPublicacion").value = "";
    tramosPrecioMayorPublicacion = [];
    actualizarVisibilidadMayorPublicacion();
    renderizarTramosMayorPublicacion();

    document.getElementById("stockPublicacion").value = "";
    document.getElementById("diasPublicacion").value = "";
    document.getElementById("descripcionPublicacion").value = "";
    document.getElementById("etiquetasPublicacion").value = "";
    cargarHistoriaPublicacionNivan(null);

    actualizarTablaMedidasPublicacion();

    // Reiniciamos los colores elegidos y volvemos a armar
    // predeterminados + recientes para esta nueva publicación.
    coloresSeleccionadosPublicacion = [];
    renderizarColoresPredeterminadosPublicacion();
    renderizarColoresRecientesPublicacion();
    renderizarChipsColoresElegidosPublicacion();
}

// ==============================
// COLORES DE LA PUBLICACIÓN
// ==============================

// Colores predeterminados que siempre se ofrecen para elegir rápido.
const COLORES_PREDETERMINADOS_NIVAN = [
    { nombre: "Negro", hex: "#000000" },
    { nombre: "Blanco", hex: "#ffffff" },
    { nombre: "Gris", hex: "#9e9e9e" },
    { nombre: "Beige", hex: "#d7cca3" },
    { nombre: "Marrón", hex: "#6d4c41" },
    { nombre: "Rojo", hex: "#e53935" },
    { nombre: "Rosa", hex: "#ec407a" },
    { nombre: "Naranja", hex: "#fb8c00" },
    { nombre: "Amarillo", hex: "#fdd835" },
    { nombre: "Verde", hex: "#43a047" },
    { nombre: "Azul", hex: "#1e88e5" },
    { nombre: "Violeta", hex: "#8e24aa" }
];

// Usado para poder mostrar el tono exacto también de publicaciones
// viejas que sólo guardaron el color como texto (ej: "Negro").
const NIVAN_COLOR_HEX_POR_NOMBRE = COLORES_PREDETERMINADOS_NIVAN.reduce(
    function(mapa, color) {
        mapa[color.nombre.toLowerCase()] = color.hex;
        return mapa;
    },
    {}
);

// ==============================
// CONVERSIONES DE COLOR (hex ↔ rgb ↔ hsv)
// Se usan tanto para la rueda de color como para reconocer el
// nombre más parecido de cualquier tono que el usuario elija.
// ==============================

// Acepta "#fff" o "#ffffff" (con o sin variantes de mayúsculas) y
// devuelve siempre un hex de 6 dígitos en minúscula, o null si no
// es un color válido.
function normalizarHexColor(hex) {
    if (!hex) return null;

    hex = hex.trim();

    if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
        hex = "#" + hex.slice(1).split("").map(function(c) {
            return c + c;
        }).join("");
    }

    if (!/^#([0-9a-fA-F]{6})$/.test(hex)) {
        return null;
    }

    return hex.toLowerCase();
}

function hexARgbObjeto(hex) {
    const limpio = hex.replace("#", "");
    const numero = parseInt(limpio, 16);

    return {
        r: (numero >> 16) & 255,
        g: (numero >> 8) & 255,
        b: numero & 255
    };
}

function rgbAHex(r, g, b) {
    return "#" + [r, g, b].map(function(valor) {
        return Math.max(0, Math.min(255, Math.round(valor)))
            .toString(16)
            .padStart(2, "0");
    }).join("");
}

// h: 0-360, s: 0-1, v: 0-1 → [r, g, b] de 0 a 255
function hsvARgb(h, s, v) {
    const c = v * s;
    const hh = h / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));

    let r = 0, g = 0, b = 0;

    if (hh >= 0 && hh < 1) { r = c; g = x; b = 0; }
    else if (hh >= 1 && hh < 2) { r = x; g = c; b = 0; }
    else if (hh >= 2 && hh < 3) { r = 0; g = c; b = x; }
    else if (hh >= 3 && hh < 4) { r = 0; g = x; b = c; }
    else if (hh >= 4 && hh < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const m = v - c;

    return [
        (r + m) * 255,
        (g + m) * 255,
        (b + m) * 255
    ];
}

// [r, g, b] de 0-255 → [h (0-360), s (0-1), v (0-1)]
function rgbAHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;

    if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * (((b - r) / d) + 2);
        else h = 60 * (((r - g) / d) + 4);
    }

    if (h < 0) h += 360;

    const s = max === 0 ? 0 : d / max;
    const v = max;

    return [h, s, v];
}

// Busca, entre los colores predeterminados, cuál se parece más
// (distancia entre valores RGB) a cualquier tono elegido. Así
// #171719 se reconoce como "Negro" aunque sea otro tono exacto,
// y el predeterminado "Negro" (#000000) sigue siendo el más oscuro.
function nombreColorMasCercano(hex) {
    const objetivo = hexARgbObjeto(hex);

    let mejor = COLORES_PREDETERMINADOS_NIVAN[0];
    let mejorDistancia = Infinity;

    COLORES_PREDETERMINADOS_NIVAN.forEach(function(color) {
        const c = hexARgbObjeto(color.hex);

        const distancia = Math.sqrt(
            Math.pow(objetivo.r - c.r, 2) +
            Math.pow(objetivo.g - c.g, 2) +
            Math.pow(objetivo.b - c.b, 2)
        );

        if (distancia < mejorDistancia) {
            mejorDistancia = distancia;
            mejor = color;
        }
    });

    return mejor.nombre;
}

// Colores que el usuario va eligiendo mientras arma ESTA publicación.
let coloresSeleccionadosPublicacion = [];

function obtenerColoresRecientesNivan() {
    return leerJSONNivan("nivanColoresRecientes", []);
}

function guardarColorComoRecienteNivan(color) {
    let recientes = obtenerColoresRecientesNivan();

    // Sacamos el color si ya estaba (para subirlo al frente) y
    // limitamos la lista a los últimos 8 colores usados.
    recientes = recientes.filter(function(c) {
        return c.hex.toLowerCase() !== color.hex.toLowerCase();
    });

    recientes.unshift({ nombre: color.nombre, hex: color.hex });
    recientes = recientes.slice(0, 8);

    guardarJSONNivan("nivanColoresRecientes", recientes);
}

function colorYaElegidoPublicacion(hex) {
    return coloresSeleccionadosPublicacion.some(function(c) {
        return c.hex.toLowerCase() === hex.toLowerCase();
    });
}

function renderizarColoresPredeterminadosPublicacion() {
    const contenedor = document.getElementById("listaColoresPredeterminados");

    contenedor.innerHTML = COLORES_PREDETERMINADOS_NIVAN.map(function(color) {
        const seleccionado = colorYaElegidoPublicacion(color.hex);

        return `
            <button
                type="button"
                class="colorSwatchPublicacion ${seleccionado ? "seleccionado" : ""}"
                style="background:${color.hex};"
                title="${color.hex.toUpperCase()}"
                onclick="toggleColorPublicacion('${color.hex}', '${color.nombre.replace(/'/g, "")}')"
            ></button>
        `;
    }).join("");
}

function renderizarColoresRecientesPublicacion() {
    const recientes = obtenerColoresRecientesNivan();
    const bloque = document.getElementById("bloqueColoresRecientes");
    const contenedor = document.getElementById("listaColoresRecientes");

    if (!recientes.length) {
        bloque.style.display = "none";
        contenedor.innerHTML = "";
        return;
    }

    bloque.style.display = "block";

    contenedor.innerHTML = recientes.map(function(color) {
        const seleccionado = colorYaElegidoPublicacion(color.hex);

        return `
            <button
                type="button"
                class="colorSwatchPublicacion ${seleccionado ? "seleccionado" : ""}"
                style="background:${color.hex};"
                title="${color.hex.toUpperCase()}"
                onclick="abrirRuedaColorEnHex('${color.hex}')"
            ></button>
        `;
    }).join("");
}

function toggleColorPublicacion(hex, nombre) {
    if (colorYaElegidoPublicacion(hex)) {
        coloresSeleccionadosPublicacion = coloresSeleccionadosPublicacion.filter(function(c) {
            return c.hex.toLowerCase() !== hex.toLowerCase();
        });
    } else {
        coloresSeleccionadosPublicacion.push({ nombre: nombre, hex: hex });
        guardarColorComoRecienteNivan({ nombre: nombre, hex: hex });
    }

    renderizarColoresPredeterminadosPublicacion();
    renderizarColoresRecientesPublicacion();
    renderizarChipsColoresElegidosPublicacion();
}

// Agrega un color por hex (viene de la rueda de color o de
// cualquier otro lado). Si no le pusiste nombre, le buscamos el
// nombre del color predeterminado más parecido (ej: #171719 se
// reconoce como "Negro", aunque el tono exacto se guarda igual).
function agregarColorSeleccionadoPublicacion(hex, nombreIngresado) {
    hex = normalizarHexColor(hex);

    if (!hex) {
        alert("Ingresá un color válido (ej: #171719).");
        return;
    }

    let nombre = (nombreIngresado || "").trim();

    if (!nombre) {
        nombre = nombreColorMasCercano(hex);
    }

    if (colorYaElegidoPublicacion(hex)) {
        alert("Ese color ya está agregado a la publicación.");
        return;
    }

    coloresSeleccionadosPublicacion.push({ nombre: nombre, hex: hex });
    guardarColorComoRecienteNivan({ nombre: nombre, hex: hex });

    renderizarColoresPredeterminadosPublicacion();
    renderizarColoresRecientesPublicacion();
    renderizarChipsColoresElegidosPublicacion();
}

function quitarColorElegidoPublicacion(hex) {
    coloresSeleccionadosPublicacion = coloresSeleccionadosPublicacion.filter(function(c) {
        return c.hex.toLowerCase() !== hex.toLowerCase();
    });

    renderizarColoresPredeterminadosPublicacion();
    renderizarColoresRecientesPublicacion();
    renderizarChipsColoresElegidosPublicacion();
}

function renderizarChipsColoresElegidosPublicacion() {
    const contenedor = document.getElementById("chipsColoresElegidosPublicacion");

    if (!coloresSeleccionadosPublicacion.length) {
        contenedor.innerHTML = `<p style="font-size:12px;color:#888;">Todavía no elegiste ningún color.</p>`;
        return;
    }

    contenedor.innerHTML = coloresSeleccionadosPublicacion.map(function(color) {
        return `
            <span class="chipColorElegido">
                <span class="colorTagInfo" onclick="abrirRuedaColorEnHex('${color.hex}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                    <span class="puntoColor" style="background:${color.hex};"></span>
                    ${color.hex.toUpperCase()}
                </span>
                <button type="button" onclick="quitarColorElegidoPublicacion('${color.hex}')">×</button>
            </span>
        `;
    }).join("");
}

// ==============================
// RUEDA DE COLOR (elegir cualquier tono, estilo ibis paint)
// ==============================

let ruedaColorHue = 260;
let ruedaColorSat = 0.55;
let ruedaColorValor = 0.85;
let ruedaColorArrastrando = false;

// Dibuja el círculo completo de matices/saturación para el brillo
// (value) actual. El brillo se maneja aparte con el control deslizante.
function dibujarRuedaColor(valor) {
    const canvas = document.getElementById("canvasRuedaColor");
    const contexto = canvas.getContext("2d");
    const tamanio = canvas.width;
    const radio = tamanio / 2;

    const imagen = contexto.createImageData(tamanio, tamanio);

    for (let y = 0; y < tamanio; y++) {
        for (let x = 0; x < tamanio; x++) {
            const dx = x - radio;
            const dy = y - radio;
            const distancia = Math.sqrt(dx * dx + dy * dy);
            const indice = (y * tamanio + x) * 4;

            if (distancia <= radio) {
                let angulo = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angulo < 0) angulo += 360;

                const saturacion = Math.min(distancia / radio, 1);
                const [r, g, b] = hsvARgb(angulo, saturacion, valor);

                imagen.data[indice] = r;
                imagen.data[indice + 1] = g;
                imagen.data[indice + 2] = b;
                imagen.data[indice + 3] = 255;
            } else {
                imagen.data[indice + 3] = 0;
            }
        }
    }

    contexto.putImageData(imagen, 0, 0);
}

function abrirRuedaColorPublicacion() {
    document.getElementById("modalRuedaColor").classList.add("abierto");
    document.getElementById("nombreRuedaColorInput").value = "";
    document.getElementById("brilloRuedaColor").value = Math.round(ruedaColorValor * 100);

    dibujarRuedaColor(ruedaColorValor);
    actualizarMarcadorRuedaColor();
    actualizarPreviewRuedaColor();
}

function cerrarRuedaColorPublicacion() {
    document.getElementById("modalRuedaColor").classList.remove("abierto");
}

// Abre la rueda de color ya posicionada sobre un hex existente
// (se usa desde los colores "recientes" y desde los ya "añadidos"
// a la publicación, para poder revisarlos/retocarlos).
function abrirRuedaColorEnHex(hexEntrada) {
    const hex = normalizarHexColor(hexEntrada);
    if (!hex) return;

    const { r, g, b } = hexARgbObjeto(hex);
    const [h, s, v] = rgbAHsv(r, g, b);

    ruedaColorHue = h;
    ruedaColorSat = s;
    ruedaColorValor = v;

    document.getElementById("modalRuedaColor").classList.add("abierto");
    document.getElementById("nombreRuedaColorInput").value = "";
    document.getElementById("brilloRuedaColor").value = Math.round(v * 100);

    dibujarRuedaColor(ruedaColorValor);
    actualizarMarcadorRuedaColor();
    actualizarPreviewRuedaColor();

    // Forzamos el hex exacto (evita el pequeño redondeo de ida y
    // vuelta por HSV) tanto en el input como en el punto de preview.
    document.getElementById("hexRuedaColorInput").value = hex;
    document.getElementById("puntoPreviewRuedaColor").style.background = hex;
}

function actualizarMarcadorRuedaColor() {
    const canvas = document.getElementById("canvasRuedaColor");
    const radio = canvas.width / 2;
    const anguloRad = ruedaColorHue * Math.PI / 180;

    const x = radio + ruedaColorSat * radio * Math.cos(anguloRad);
    const y = radio + ruedaColorSat * radio * Math.sin(anguloRad);

    const marcador = document.getElementById("marcadorRuedaColor");
    marcador.style.left = x + "px";
    marcador.style.top = y + "px";
}

function actualizarPreviewRuedaColor() {
    const [r, g, b] = hsvARgb(ruedaColorHue, ruedaColorSat, ruedaColorValor);
    const hex = rgbAHex(r, g, b);

    document.getElementById("puntoPreviewRuedaColor").style.background = hex;
    document.getElementById("hexRuedaColorInput").value = hex;
}

// Se llama al tocar/arrastrar dentro del círculo: calcula matiz y
// saturación según el ángulo y la distancia al centro.
function manejarPunteroRuedaColor(event) {
    const canvas = document.getElementById("canvasRuedaColor");
    const rect = canvas.getBoundingClientRect();
    const radio = rect.width / 2;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dx = x - radio;
    const dy = y - radio;

    let distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > radio) distancia = radio;

    let angulo = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angulo < 0) angulo += 360;

    ruedaColorHue = angulo;
    ruedaColorSat = distancia / radio;

    actualizarMarcadorRuedaColor();
    actualizarPreviewRuedaColor();
}

function cambiarBrilloRuedaColor(valor) {
    ruedaColorValor = Number(valor) / 100;
    dibujarRuedaColor(ruedaColorValor);
    actualizarPreviewRuedaColor();
}

// Permite también escribir el hex a mano y que la rueda, el
// marcador y el brillo se acomoden solos.
function actualizarDesdeHexRuedaColor(valorTexto) {
    const hex = normalizarHexColor(valorTexto);
    if (!hex) return;

    const { r, g, b } = hexARgbObjeto(hex);
    const [h, s, v] = rgbAHsv(r, g, b);

    ruedaColorHue = h;
    ruedaColorSat = s;
    ruedaColorValor = v;

    document.getElementById("brilloRuedaColor").value = Math.round(v * 100);
    document.getElementById("puntoPreviewRuedaColor").style.background = hex;

    dibujarRuedaColor(ruedaColorValor);
    actualizarMarcadorRuedaColor();
}

function confirmarColorDeRueda() {
    const hex = document.getElementById("hexRuedaColorInput").value;
    const nombre = document.getElementById("nombreRuedaColorInput").value;

    agregarColorSeleccionadoPublicacion(hex, nombre);
    cerrarRuedaColorPublicacion();
}

document.getElementById("canvasRuedaColor").addEventListener("pointerdown", function(event) {
    ruedaColorArrastrando = true;
    event.target.setPointerCapture(event.pointerId);
    manejarPunteroRuedaColor(event);
});

document.getElementById("canvasRuedaColor").addEventListener("pointermove", function(event) {
    if (ruedaColorArrastrando) {
        manejarPunteroRuedaColor(event);
    }
});

document.getElementById("canvasRuedaColor").addEventListener("pointerup", function() {
    ruedaColorArrastrando = false;
});

document.getElementById("canvasRuedaColor").addEventListener("pointercancel", function() {
    ruedaColorArrastrando = false;
});

// Medios (fotos y videos) elegidos para la publicación que se está
// creando o editando. Cada elemento: { tipo: "imagen" | "video", src: dataURL }.
// La primera imagen de la lista es la que se usa como foto principal
// (tarjetas, recomendadas, etc.).
let mediosPublicacionSeleccionados = [];

function previsualizarFotoPublicacion(input) {
    if (!input.files || !input.files.length) return;

    // Se van agregando a lo que ya había elegido (así se puede subir
    // primero unas fotos y después más, o fotos y videos por separado).
    Array.from(input.files).forEach(function(archivo) {
        const esVideo = archivo.type.indexOf("video") === 0;
        const lector = new FileReader();

        lector.onload = function() {
            mediosPublicacionSeleccionados.push({
                tipo: esVideo ? "video" : "imagen",
                src: lector.result
            });
            renderizarPreviewMediosPublicacion();
        };

        lector.readAsDataURL(archivo);
    });

    // Se limpia el input para poder volver a elegir (incluso el mismo
    // archivo) más adelante sin que el navegador lo ignore.
    input.value = "";
}

function renderizarPreviewMediosPublicacion() {
    const contenedor = document.getElementById("previewMediosPublicacion");
    if (!contenedor) return;

    contenedor.innerHTML = mediosPublicacionSeleccionados.map(function(medio, indice) {
        const elementoMedio = medio.tipo === "video"
            ? `<video src="${medio.src}" muted></video><span class="indicadorVideoMiniatura">▶ video</span>`
            : `<img src="${medio.src}" alt="Vista previa">`;

        return `
            <div class="medioPublicacionMiniatura">
                ${elementoMedio}
                <button type="button" class="botonQuitarMedioPublicacion" onclick="eliminarMedioPublicacion(${indice})" aria-label="Quitar">×</button>
            </div>
        `;
    }).join("");
}

function eliminarMedioPublicacion(indice) {
    mediosPublicacionSeleccionados.splice(indice, 1);
    renderizarPreviewMediosPublicacion();
}

// ==============================
// VENTA POR MENOR / MAYOR
// ==============================

// Tramos de precio mayorista cargados para la publicación que se
// está creando o editando. Cada elemento: { cantidadMinima, precio }.
// Se mantienen siempre ordenados de menor a mayor cantidadMinima.
let tramosPrecioMayorPublicacion = [];

function actualizarVisibilidadMayorPublicacion() {
    const tipoVenta = document.getElementById("tipoVentaPublicacion").value;
    const campoMayor = document.getElementById("campoMayorPublicacion");

    campoMayor.style.display = (tipoVenta === "mayor" || tipoVenta === "menor_mayor")
        ? "block"
        : "none";
}

function agregarTramoMayorPublicacion() {
    const inputCantidad = document.getElementById("tramoCantidadInput");
    const inputPrecio = document.getElementById("tramoPrecioInput");
    const inputDias = document.getElementById("tramoDiasInput");

    const cantidadMinima = Number(inputCantidad.value);
    const precio = Number(inputPrecio.value.replace(/\D/g, ""));
    const dias = inputDias.value === "" ? NaN : Number(inputDias.value);

    if (!cantidadMinima || cantidadMinima < 1) {
        alert("Indicá a partir de cuántas unidades aplica este precio.");
        return;
    }

    if (!precio || precio <= 0) {
        alert("Indicá el precio por unidad para ese tramo.");
        return;
    }

    if (precio > PRECIO_MAXIMO_NIVAN) {
        alert("El precio máximo por prenda es " + simboloMonedaNivan() + PRECIO_MAXIMO_NIVAN.toLocaleString("es-AR") + ".");
        return;
    }

    if (inputDias.value === "" || isNaN(dias) || dias < 0) {
        alert("Indicá cuántos días tardás en tener lista esa cantidad.");
        return;
    }

    const yaExiste = tramosPrecioMayorPublicacion.some(function(tramo) {
        return tramo.cantidadMinima === cantidadMinima;
    });

    if (yaExiste) {
        alert("Ya cargaste un tramo con esa cantidad mínima.");
        return;
    }

    tramosPrecioMayorPublicacion.push({ cantidadMinima: cantidadMinima, precio: precio, dias: Math.floor(dias) });

    // Ordenamos de menor a mayor para que después sea fácil calcular
    // qué tramo corresponde según la cantidad que pida el comprador.
    tramosPrecioMayorPublicacion.sort(function(a, b) {
        return a.cantidadMinima - b.cantidadMinima;
    });

    inputCantidad.value = "";
    inputPrecio.value = "";
    inputDias.value = "";

    renderizarTramosMayorPublicacion();
}

function quitarTramoMayorPublicacion(indice) {
    tramosPrecioMayorPublicacion.splice(indice, 1);
    renderizarTramosMayorPublicacion();
}

function renderizarTramosMayorPublicacion() {
    const contenedor = document.getElementById("listaTramosMayorPublicacion");
    if (!contenedor) return;

    if (!tramosPrecioMayorPublicacion.length) {
        contenedor.innerHTML = `<p style="font-size:12px;color:#888;">Todavía no cargaste ningún tramo de precio mayorista.</p>`;
        return;
    }

    contenedor.innerHTML = tramosPrecioMayorPublicacion.map(function(tramo, indice) {
        const dias = tramo.dias != null ? tramo.dias : 0;
        const textoDias = dias === 0 ? "listo al toque" : (dias + (dias === 1 ? " día" : " días"));
        return `
            <div class="tramoMayorPublicacion">
                <span>A partir de ${tramo.cantidadMinima} unidades: ${simboloMonedaNivan()}${Number(tramo.precio).toLocaleString("es-AR")} c/u · ${textoDias}</span>
                <button type="button" onclick="quitarTramoMayorPublicacion(${indice})">×</button>
            </div>
        `;
    }).join("");
}

// Dado un producto y una cantidad que quiere comprar el cliente,
// devuelve el precio por unidad que corresponde: el del tramo
// mayorista más alto que la cantidad alcance a cubrir, o si no hay
// tramos (o no los alcanza) el precio de venta por menor de siempre.
function calcularPrecioUnitarioSegunCantidad(producto, cantidad) {
    let precioUnitario = producto.precio;

    if (Array.isArray(producto.tramosPrecioMayor)) {
        producto.tramosPrecioMayor.forEach(function(tramo) {
            if (cantidad >= tramo.cantidadMinima) {
                precioUnitario = tramo.precio;
            }
        });
    }

    return precioUnitario;
}

// Texto que se muestra en la ficha de producto para que el
// comprador sepa de qué forma puede comprar esta publicación.
function obtenerTextoTipoVentaPublicacion(producto) {
    const tipoVenta = producto.tipoVenta || "menor";

    if (tipoVenta === "mayor") {
        return `Esta tienda vende este producto solo por mayor (mínimo ${producto.cantidadMinimaMayor || 1} unidades).`;
    }

    if (tipoVenta === "menor_mayor") {
        return `Esta tienda vende este producto por menor y por mayor (mayor desde ${producto.cantidadMinimaMayor || 1} unidades).`;
    }

    return "Esta tienda vende este producto por menor.";
}

// Arma una fila de medidas por cada talle tildado. La fila de
// "A medida" no lleva números fijos: se cotiza con las medidas
// que mande el cliente al pedirla.
function actualizarTablaMedidasPublicacion() {
    const cuerpo = document.getElementById("cuerpoTablaMedidasPublicacion");

    const talles = Array.from(
        document.querySelectorAll('#listaTallesPublicacion input:checked')
    ).map(function(casilla) {
        return casilla.value;
    });

    cuerpo.innerHTML = talles.map(function(talle) {
        if (talle === "A medida") {
            return `
                <tr>
                    <td>A medida</td>
                    <td colspan="4">Se cotiza según las medidas que envíe el cliente.</td>
                </tr>
            `;
        }

        const idSeguro = talle.replace(/\s+/g, "_");

        return `
            <tr>
                <td>${talle}</td>
                <td><input type="number" min="0" id="busto_${idSeguro}"></td>
                <td><input type="number" min="0" id="cintura_${idSeguro}"></td>
                <td><input type="number" min="0" id="cadera_${idSeguro}"></td>
                <td><input type="number" min="0" id="largo_${idSeguro}"></td>
            </tr>
        `;
    }).join("");
}

function obtenerPublicacionesNivan() {
    return leerJSONNivan("nivanPublicaciones", []);
}

// Mientras el usuario escribe el precio, le mostramos los "." cada
// tres cifras (ej: 20000 -> 20.000) para que sea más fácil de leer.
// El valor real (sin puntos) se recupera al publicar con .replace(/\D/g, "").
function formatearPrecioPublicacionInput(input) {
    const soloNumeros = input.value.replace(/\D/g, "").slice(0, 6);

    if (soloNumeros && Number(soloNumeros) > PRECIO_MAXIMO_NIVAN) {
        input.value = input.dataset.precioPrevio || "";
        return;
    }

    input.value = soloNumeros ? Number(soloNumeros).toLocaleString("es-AR") : "";
    input.dataset.precioPrevio = input.value;
}

function guardarPublicacionesNivan(lista) {
    window.__idsConTiendaNivan = null;
    guardarJSONNivan("nivanPublicaciones", lista);
}

// Se ejecuta en cada tecla del campo "Etiquetas / estilo": no deja que
// quede ninguna palabra suelta sin "#", ni siquiera la primera que se
// escribe después de un espacio o una coma (separador). En vez de
// esperar a que el vendedor termine para "arreglarlo" en silencio,
// le agrega el "#" al toque, para que quede claro que es obligatorio.
function forzarAlmohadillaEtiquetasPublicacion(input) {
    const textoOriginal = input.value;
    const cursorOriginal = input.selectionStart == null ? textoOriginal.length : input.selectionStart;

    let resultado = "";
    let insertadosAntesDelCursor = 0;
    let esInicioDePalabra = true;

    for (let i = 0; i < textoOriginal.length; i++) {
        const caracter = textoOriginal[i];

        if (caracter === " " || caracter === ",") {
            resultado += caracter;
            esInicioDePalabra = true;
            continue;
        }

        if (esInicioDePalabra && caracter !== "#") {
            resultado += "#";
            if (i < cursorOriginal) insertadosAntesDelCursor++;
        }

        resultado += caracter;
        esInicioDePalabra = false;
    }

    if (resultado !== textoOriginal) {
        input.value = resultado;
        const nuevoCursor = cursorOriginal + insertadosAntesDelCursor;
        input.setSelectionRange(nuevoCursor, nuevoCursor);
    }
}

// Limpia lo que el vendedor escribió en "Etiquetas / estilo": separa
// por espacios o comas, agrega el "#" si falta, pasa todo a
// minúscula (para que "#Gotico" y "#gotico" cuenten como la misma
// etiqueta a la hora de recomendar publicaciones parecidas) y saca
// duplicados.
function normalizarEtiquetasPublicacion(texto) {
    if (!texto) return [];

    return texto
        .split(/[\s,]+/)
        .map(function(etiqueta) {
            return etiqueta.trim();
        })
        .filter(function(etiqueta) {
            return etiqueta.length > 0;
        })
        .map(function(etiqueta) {
            return "#" + etiqueta.replace(/^#+/, "").toLowerCase();
        })
        .filter(function(etiqueta, indice, arreglo) {
            return arreglo.indexOf(etiqueta) === indice;
        });
}

function publicarProducto() {
    if (!usuarioActual) {
        alert("Iniciá sesión para publicar.");
        abrirCuenta();
        return;
    }
    if (!exigirVerificacionNivan()) return;

    const nombre = document.getElementById("nombrePublicacion").value.trim();
    const marca = document.getElementById("marcaPublicacion").value.trim();
    const categoria = document.getElementById("categoriaPublicacion").value;
    const precio = Number(document.getElementById("precioPublicacion").value.replace(/\D/g, ""));

    if (precio > PRECIO_MAXIMO_NIVAN) {
        alert("El precio máximo por prenda es " + simboloMonedaNivan() + PRECIO_MAXIMO_NIVAN.toLocaleString("es-AR") + ".");
        return;
    }
    const stockInput = document.getElementById("stockPublicacion").value;
    const diasInput = document.getElementById("diasPublicacion").value;
    const descripcion = document.getElementById("descripcionPublicacion").value.trim();
    const etiquetas = normalizarEtiquetasPublicacion(document.getElementById("etiquetasPublicacion").value);

    const historia = leerHistoriaPublicacionNivan();

    if (historia && historia.fechaCreacion) {
        const hoy = new Date();
        const mesActual = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0");
        if (historia.fechaCreacion > mesActual) {
            alert("La fecha de creación no puede ser futura.");
            return;
        }
    }

    const tipoVenta = document.getElementById("tipoVentaPublicacion").value;
    const cantidadMinimaMayor = Number(document.getElementById("cantidadMinimaMayorPublicacion").value) || 0;
    const tramosPrecioMayor = tramosPrecioMayorPublicacion.slice();

    // La "foto" de portada (para tarjetas, recomendadas, etc.) es la
    // primera imagen cargada. Si sólo se cargaron videos, no hay
    // portada nueva y se usa la que ya tuviera la publicación. Sin
    // ninguna foto no se puede publicar.
    const medios = mediosPublicacionSeleccionados.slice();
    const primeraImagen = medios.find(function(medio) { return medio.tipo === "imagen"; });
    const foto = primeraImagen ? primeraImagen.src : "";

    const talles = Array.from(
        document.querySelectorAll('#listaTallesPublicacion input:checked')
    ).map(function(casilla) {
        return casilla.value;
    });

    const tiposTrabajo = calcularTiposTrabajoPublicacion();
    const origenPrenda = document.getElementById("origenPrendaPublicacion").value;

    if (!nombre || !marca || !categoria || !precio) {
        alert("Completá nombre, marca, categoría y precio.");
        return;
    }

    if (!foto) {
        alert("Subí al menos una foto para publicar tu prenda.");
        return;
    }

    if (tiposTrabajo.ambosTipos && !origenPrenda) {
        alert("Contanos si esta prenda es reventa o la fabricás vos antes de publicar.");
        return;
    }

    // Si el usuario tiene un solo tipo de trabajo, se infiere directo; si tiene
    // ambos, se usa lo que eligió en el campo obligatorio de arriba.
    const origenPrendaFinal = tiposTrabajo.ambosTipos
        ? origenPrenda
        : (tiposTrabajo.esDisenador ? "fabricacion" : (tiposTrabajo.esRevendedor ? "reventa" : ""));

    if (stockInput === "" || Number(stockInput) < 0) {
        alert("Indicá el stock disponible que tenés para esta prenda.");
        return;
    }

    if (diasInput === "" || Number(diasInput) < 0) {
        alert("Indicá cuántos días tardás en tener lista la prenda.");
        return;
    }

    if (!talles.length) {
        alert("Elegí al menos un talle.");
        return;
    }

    if (!coloresSeleccionadosPublicacion.length) {
        alert("Elegí al menos un color para la publicación.");
        return;
    }

    if (tipoVenta === "mayor" || tipoVenta === "menor_mayor") {
        if (!cantidadMinimaMayor || cantidadMinimaMayor < 1) {
            alert("Indicá la cantidad mínima para la venta mayorista.");
            return;
        }

        if (!tramosPrecioMayor.length) {
            alert("Agregá al menos un tramo de precio mayorista.");
            return;
        }
    }

    // Armamos la tabla de medidas cargada (solo talles con números).
    const tablaMedidas = {};

    talles.forEach(function(talle) {
        if (talle === "A medida") return;

        const idSeguro = talle.replace(/\s+/g, "_");

        tablaMedidas[talle] = {
            busto: document.getElementById("busto_" + idSeguro).value,
            cintura: document.getElementById("cintura_" + idSeguro).value,
            cadera: document.getElementById("cadera_" + idSeguro).value,
            largo: document.getElementById("largo_" + idSeguro).value
        };
    });

    if (publicacionEditandoId) {
        // MODO EDICIÓN: actualizamos la publicación existente en vez
        // de crear una nueva, conservando su id, fecha de creación
        // y estado (activa/pausada).
        const publicaciones = obtenerPublicacionesNivan();

        const indice = publicaciones.findIndex(function(p) {
            return p.id === publicacionEditandoId;
        });

        if (indice === -1) {
            alert("No se encontró la publicación a editar.");
            return;
        }

        const productoActualizado = Object.assign({}, publicaciones[indice], {
            nombre: nombre,
            precio: precio,
            marca: marca,
            vendedor: obtenerNombreVendedorUsuario(usuarioActual),
            categoria: categoria,
            imagen: foto || publicaciones[indice].imagen,
            medios: medios.length ? medios : publicaciones[indice].medios,
            descripcion: descripcion,
            etiquetas: etiquetas,
            historia: historia,
            talles: talles,
            tablaMedidas: tablaMedidas,
            stock: Number(stockInput),
            diasEntrega: Number(diasInput),
            colores: coloresSeleccionadosPublicacion.slice(),
            origenPrenda: origenPrendaFinal,
            tipoVenta: tipoVenta,
            cantidadMinimaMayor: (tipoVenta === "mayor" || tipoVenta === "menor_mayor") ? cantidadMinimaMayor : 0,
            tramosPrecioMayor: (tipoVenta === "mayor" || tipoVenta === "menor_mayor") ? tramosPrecioMayor : []
        });

        publicaciones[indice] = productoActualizado;
        guardarPublicacionesNivan(publicaciones);

        publicacionEditandoId = null;

        sincronizarCatalogoConPublicaciones();

        alert("¡Tu publicación se actualizó con éxito!");

        cerrarPantallaCompleta("pantallaCrearPublicacion");
        irAMisPublicaciones();
        return;
    }

    const nuevoProducto = {
        id: Date.now(),
        pais: paisNivan() || "AR",
        nombre: nombre,
        precio: precio,
        marca: marca,
        vendedor: obtenerNombreVendedorUsuario(usuarioActual),
        vendedorId: usuarioActual.id,
        activo: true,
        // Se usa para la etiqueta automática "Nuevo" en la tarjeta.
        fechaCreacion: Date.now(),
        tiposTrabajoTienda: usuarioActual.tiposTrabajo || [],
        categoria: categoria,
        imagen: foto,
        medios: medios,
        descripcion: descripcion,
        etiquetas: etiquetas,
        historia: historia,
        talles: talles,
        tablaMedidas: tablaMedidas,
        stock: Number(stockInput),
        diasEntrega: Number(diasInput),
        colores: coloresSeleccionadosPublicacion.slice(),
        origenPrenda: origenPrendaFinal,
        tipoVenta: tipoVenta,
        cantidadMinimaMayor: (tipoVenta === "mayor" || tipoVenta === "menor_mayor") ? cantidadMinimaMayor : 0,
        tramosPrecioMayor: (tipoVenta === "mayor" || tipoVenta === "menor_mayor") ? tramosPrecioMayor : []
    };

    productos.push(nuevoProducto);

    const publicaciones = obtenerPublicacionesNivan();
    publicaciones.push(nuevoProducto);
    guardarPublicacionesNivan(publicaciones);

    mostrarProductos(productos);

    // Avisamos a quienes siguen la tienda.
    try {
        const nombreTiendaAviso = escaparHTMLNivan(obtenerNombreVendedorUsuario(usuarioActual));
        idsSeguidoresNivan(claveCuentaNivan(usuarioActual.id, "tienda")).forEach(function(claveSeguidor) {
            const seguidor = datosClaveCuentaNivan(claveSeguidor);
            crearNotificacion(seguidor.id, {
                tipo: "nuevaPublicacion",
                icono: "🆕",
                titulo: nombreTiendaAviso + " publicó algo nuevo",
                texto: escaparHTMLNivan(nombre),
                productoId: nuevoProducto.id,
                cuenta: seguidor.ambito
            });
        });
    } catch (e) {}

    alert("¡Tu publicación se creó con éxito!");

    cerrarPantallaCompleta("pantallaCrearPublicacion");
    irAPagina("paginaHome");
}

function cargarDatosCuentaEnCompra() {
    if (!usuarioActual) return;

    const nombre = document.getElementById("nombreCompra");
    const email = document.getElementById("emailCompra");

    if (nombre) nombre.value = usuarioActual.nombre || "";
    if (email) email.value = usuarioActual.email || "";
}

function cerrarSesion() {
    const confirmado = confirm("¿Estás seguro/a que querés cerrar sesión? Podés volver a abrir tu cuenta cuando desees.");
    if (!confirmado) return false;

    apiNivan("/api/logout", {});
    cerrarSesionActivaActualNivan();
    usuarioActual = null;
    localStorage.removeItem("nivanSesion");
    sincronizarFavoritosConCuentaNivan(true);
    cerrarCuenta();
    actualizarBadgeNotificaciones();
    return true;
}

// Restaurar sesión al abrir la página
if (usuarioActual) {
    cargarDatosCuentaEnCompra();
}
verificarSesionActivaNivan();
window.addEventListener("focus", verificarSesionActivaNivan);
window.addEventListener("storage", function(e) {
    if (e.key === CLAVE_SESIONES_NIVAN || e.key === "nivanSesionId") verificarSesionActivaNivan();
});
document.addEventListener("visibilitychange", function() {
    if (!document.hidden) verificarSesionActivaNivan();
});

