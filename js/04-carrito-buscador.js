// ==============================
// EDITAR TALLE/COLOR DE UN ITEM DEL CARRITO
// (pestaña que sube desde abajo, más chica que el modal completo)
// ==============================

// Índice, dentro de "carrito", del item que se está editando en la
// pestaña de abajo. Se usa al tocar "Guardar cambios".
let indiceEditandoItemCarrito = null;

function abrirEditorItemCarrito(indice) {
    const itemCarrito = carrito[indice];

    if (!itemCarrito) return;

    const estado = obtenerEstadoPublicacionCarrito(itemCarrito);

    if (estado !== "disponible") {
        alert(estado === "inactiva"
            ? "Esta publicación está pausada por el vendedor: no se puede modificar."
            : estado === "otroPais"
                ? "Esta publicación es de otro país: cambiá de país para modificarla."
                : "Esta publicación ya no está disponible."
        );
        return;
    }

    // Mostramos los datos más actuales de la publicación (por si el
    // vendedor cambió el precio, el stock o los talles/colores
    // después de que se agregó al carrito), no la foto congelada
    // que quedó guardada en el item del carrito.
    const producto = productos.find(function(p) {
        return p.id === itemCarrito.id;
    }) || itemCarrito;

    indiceEditandoItemCarrito = indice;

    let talles = Array.isArray(producto.talles) && producto.talles.length
        ? producto.talles
        : ["Consultar"];

    if (actuaComoRevendedorEnPublicacion(producto)) {
        talles = talles.filter(function(talle) {
            return talle.toLowerCase() !== "a medida";
        });
    }

    const colores = renderizarColoresDetalle(producto.colores);

    const panel = document.getElementById("panelEditorCarrito");

    panel.innerHTML = `
        <div class="manijaEditorCarrito"></div>
        <button type="button" class="cerrarEditorCarritoBtn" onclick="cerrarEditorItemCarrito()">×</button>

        <div class="editorCarritoImagen">
            <img src="${escaparHTMLNivan(urlImagenNivan(producto.imagen))}"${atributosImagenNivan()} alt="${escaparHTMLNivan(producto.nombre)}">
        </div>

        <h3>${escaparHTMLNivan(producto.nombre)}</h3>

        <p class="detallePrecio">${simboloMonedaNivan()}${Number(producto.precio).toLocaleString("es-AR")}</p>
        <p class="precioSinImpuestosNivan">${textoSinImpuestosNivan(producto.precio, producto.pais || "AR")}</p>

        <p>${producto.descripcion || "Prenda publicada en NIVAN."}</p>

        <div class="infoStockEntrega">
            <span>
                <strong>Stock disponible</strong>
                ${producto.stock !== undefined ? (producto.stock > 0 ? producto.stock + " unidad(es)" : "Sin stock por ahora") : "Consultar al vendedor"}
            </span>
            <span>
                <strong>Tiempo a tener el producto disponible</strong>
                ${producto.diasEntrega !== undefined ? producto.diasEntrega + " día(s)" : "Consultar al vendedor"}
            </span>
        </div>

        <p><strong>Colores:</strong></p>
        ${colores}

        <div class="detalleSeccion">
            <h3>Elegí tu talle</h3>
            <div class="selectorTalle">
                ${talles.map(function(talle) {
                    return `
                        <button type="button"
                            class="talleBtn ${talle === itemCarrito.talleElegido ? "activo" : ""}"
                            onclick="seleccionarTalle(this)"
                        >
                            ${talle}
                        </button>
                    `;
                }).join("")}
            </div>
        </div>

        <button type="button"
            onclick="abrirPreguntaVendedor(${producto.id})"
            style="margin-top:16px; background:transparent; border:1px solid #fff; color:#fff; width:100%;"
        >
            ❓ Preguntarle al vendedor
        </button>

        <button type="button"
            class="botonAgregarCarritoDetalle"
            style="margin-top:10px;"
            onclick="guardarCambiosItemCarrito()"
        >
            Guardar cambios
        </button>
    `;

    // Marcamos como activo el color que ya tenía elegido este item.
    // Si no coincide con ninguno de los chips actuales (por ejemplo,
    // el vendedor cambió los colores disponibles), dejamos el primero
    // que ya marca por defecto renderizarColoresDetalle().
    if (itemCarrito.colorElegido) {
        const chips = panel.querySelectorAll(".colorChipDetalle");
        let coincide = false;

        chips.forEach(function(chip) {
            if (chip.getAttribute("data-hex") === itemCarrito.colorElegido) {
                coincide = true;
            }
        });

        if (coincide) {
            chips.forEach(function(chip) {
                chip.classList.toggle(
                    "activo",
                    chip.getAttribute("data-hex") === itemCarrito.colorElegido
                );
            });
        }
    }

    document.getElementById("overlayEditorCarrito").classList.add("abierto");
}

function cerrarEditorItemCarrito() {
    document.getElementById("overlayEditorCarrito").classList.remove("abierto");
    indiceEditandoItemCarrito = null;
}

function guardarCambiosItemCarrito() {
    if (indiceEditandoItemCarrito === null || !carrito[indiceEditandoItemCarrito]) {
        cerrarEditorItemCarrito();
        return;
    }

    const panel = document.getElementById("panelEditorCarrito");
    const talleBtn = panel.querySelector(".talleBtn.activo");
    const colorBtn = panel.querySelector(".colorChipDetalle.activo");

    carrito[indiceEditandoItemCarrito].talleElegido = talleBtn ? talleBtn.textContent.trim() : null;
    carrito[indiceEditandoItemCarrito].colorElegido = colorBtn ? colorBtn.getAttribute("data-hex") : null;

    cerrarEditorItemCarrito();
    actualizarCarrito();
}

// ==============================
// REPORTAR PUBLICACIONES Y USUARIOS
// ==============================
// Permite denunciar una publicación o un usuario que infrinja las
// normas de NIVAN (estafas, contenido prohibido, acoso, etc). Los
// reportes quedan guardados para que moderación pueda revisarlos;
// si un mismo usuario ya reportó ese mismo objetivo, no se le deja
// reportarlo dos veces.

const MOTIVOS_REPORTE_NIVAN = [
    { id: "estafa", texto: "Estafa o intento de fraude" },
    { id: "prohibido", texto: "Producto prohibido o ilegal" },
    { id: "engañoso", texto: "Publicación falsa o engañosa" },
    { id: "ofensivo", texto: "Contenido ofensivo, discriminatorio o acoso" },
    { id: "spam", texto: "Spam o publicidad no autorizada" },
    { id: "suplantacion", texto: "Suplantación de identidad" },
    { id: "otro", texto: "Otro motivo" }
];

// { tipo: "publicacion" | "usuario", id, nombre } del objetivo que
// se está reportando en el panel actualmente abierto.
let reporteNivanActual = null;
let motivoReporteNivanElegido = null;

function obtenerReportesNivan() {
    return leerJSONNivan("nivanReportes", []);
}

function guardarReportesNivan(lista) {
    try {
        localStorage.setItem("nivanReportes", JSON.stringify(lista));
    } catch (e) {
        console.warn("No se pudieron guardar los reportes", e);
    }
}

function yaReportadoNivan(tipo, idObjetivo) {
    if (!usuarioActual) return false;

    return obtenerReportesNivan().some(function(reporte) {
        return reporte.tipo === tipo
            && String(reporte.idObjetivo) === String(idObjetivo)
            && reporte.reportadoPorId === usuarioActual.id;
    });
}

// tipo: "publicacion" o "usuario". idObjetivo: id del producto o
// del usuario. nombreObjetivo: para mostrar en el subtítulo.
function abrirReporteNivan(tipo, idObjetivo, nombreObjetivo) {
    if (!usuarioActual) {
        alert("Iniciá sesión para poder reportar.");
        abrirCuenta();
        return;
    }

    if (yaReportadoNivan(tipo, idObjetivo)) {
        alert("Ya reportaste esto. Nuestro equipo lo va a revisar.");
        return;
    }

    reporteNivanActual = { tipo: tipo, id: idObjetivo, nombre: nombreObjetivo || "" };
    motivoReporteNivanElegido = null;

     document.getElementById("subReporteNivan").textContent = tipo === "usuario"
        ? `Vas a reportar al usuario ${nombreObjetivo || ""}. Contanos por qué.`
        : tipo === "comentario"
            ? `Vas a reportar el comentario "${nombreObjetivo || ""}". Contanos por qué.`
            : `Vas a reportar la publicación "${nombreObjetivo || ""}". Contanos por qué.`;
  
    document.getElementById("listaMotivosReporte").innerHTML = MOTIVOS_REPORTE_NIVAN.map(function(motivo) {
        return `
            <label class="opcionMotivoReporte" id="opcionMotivo_${motivo.id}">
                <input
                    type="radio"
                    name="motivoReporteNivan"
                    value="${motivo.id}"
                    onchange="seleccionarMotivoReporteNivan('${motivo.id}')"
                >
                ${motivo.texto}
            </label>
        `;
    }).join("");

    document.getElementById("detalleReporteNivan").value = "";
    mostrarAvisoErrorReporteNivan("");

    document.getElementById("overlayReporteNivan").classList.add("abierto");
}

function seleccionarMotivoReporteNivan(idMotivo) {
    motivoReporteNivanElegido = idMotivo;

    document.querySelectorAll(".opcionMotivoReporte").forEach(function(opcion) {
        opcion.classList.toggle("activa", opcion.id === "opcionMotivo_" + idMotivo);
    });

    mostrarAvisoErrorReporteNivan("");
}

function mostrarAvisoErrorReporteNivan(texto) {
    const aviso = document.getElementById("avisoErrorReporteNivan");
    if (!aviso) return;
    aviso.textContent = texto || "";
    aviso.classList.toggle("visible", !!texto);
}

function cerrarReporteNivan() {
    document.getElementById("overlayReporteNivan").classList.remove("abierto");
    reporteNivanActual = null;
    motivoReporteNivanElegido = null;
}

// ==============================
// BLOQUEAR USUARIOS
// ==============================

// Vendedor cuyo perfil está abierto ahora mismo (para el cartel de
// "Bloquear / Reportar"). Se setea en abrirPerfilVendedor().
let perfilVendedorActualNivan = null;

function obtenerBloqueadosNivan() {
    return leerJSONNivan("nivanUsuariosBloqueados", {});
}

function obtenerIdsBloqueadosPorMi() {
    if (!usuarioActual) return [];
    const todos = obtenerBloqueadosNivan();
    return todos[usuarioActual.id] || [];
}

// Bloqueo de ida y vuelta: si cualquiera de los dos bloqueó al otro,
// no pueden verse el perfil ni chatear.
function hayBloqueoEntreNivan(idA, idB) {
    if (!idA || !idB) return false;
    const todos = obtenerBloqueadosNivan();
    return ((todos[idA] || []).indexOf(idB) !== -1) || ((todos[idB] || []).indexOf(idA) !== -1);
}

function bloquearUsuarioNivan(idUsuario, nombreUsuario) {
    if (!usuarioActual || !idUsuario) return;

    const confirmado = confirm(
        `¿Bloquear a ${nombreUsuario || "este usuario"}? No van a poder chatear ni ver el perfil el uno del otro.`
    );
    if (!confirmado) return;

    const todos = obtenerBloqueadosNivan();
    const lista = todos[usuarioActual.id] || [];
    if (lista.indexOf(idUsuario) === -1) lista.push(idUsuario);
    todos[usuarioActual.id] = lista;
    guardarJSONNivan("nivanUsuariosBloqueados", todos);

    // Bloquear corta el seguimiento en los dos sentidos.
    quitarSeguimientosEntreNivan(usuarioActual.id, idUsuario);

    alert("Usuario bloqueado.");
    cerrarPantallaCompleta("pantallaPerfilVendedor");
}

// Quita el bloqueo sin re-renderizar ninguna pantalla en particular,
// para poder usarse tanto desde la lista de bloqueados como desde el chat.
function quitarBloqueoNivan(idUsuario) {
    if (!usuarioActual || !idUsuario) return;

    const todos = obtenerBloqueadosNivan();
    todos[usuarioActual.id] = (todos[usuarioActual.id] || []).filter(function(id) { return id !== idUsuario; });
    guardarJSONNivan("nivanUsuariosBloqueados", todos);
}

function desbloquearUsuarioNivan(idUsuario) {
    if (!usuarioActual) return;

    quitarBloqueoNivan(idUsuario);
    abrirUsuariosBloqueadosNivan();
}

// ---- Cartel de abajo "Bloquear / Reportar" en el perfil de vendedor ----

function abrirMasOpcionesPerfilVendedorNivan() {
    if (!perfilVendedorActualNivan) return;
    document.getElementById("overlayMasOpcionesPerfilVendedorNivan").classList.add("abierto");
}

function cerrarMasOpcionesPerfilVendedorNivan() {
    document.getElementById("overlayMasOpcionesPerfilVendedorNivan").classList.remove("abierto");
}

function bloquearDesdeMasOpcionesPerfilVendedorNivan() {
    if (!perfilVendedorActualNivan) return;
    const objetivo = perfilVendedorActualNivan;
    cerrarMasOpcionesPerfilVendedorNivan();
    bloquearUsuarioNivan(objetivo.id, objetivo.nombre);
}

function reportarDesdeMasOpcionesPerfilVendedorNivan() {
    if (!perfilVendedorActualNivan) return;
    const objetivo = perfilVendedorActualNivan;
    cerrarMasOpcionesPerfilVendedorNivan();
    abrirReporteNivan('usuario', objetivo.id, objetivo.nombre);
}

function enviarReporteNivan() {
    if (!usuarioActual || !reporteNivanActual) {
        cerrarReporteNivan();
        return;
    }

    if (!motivoReporteNivanElegido) {
        mostrarAvisoErrorReporteNivan("Elegí un motivo antes de enviar el reporte.");
        return;
    }

    const detalle = limpiarTextoNivan(document.getElementById("detalleReporteNivan").value, 300).trim();

    const reportes = obtenerReportesNivan();

    reportes.push({
        id: "REP-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        tipo: reporteNivanActual.tipo,
        idObjetivo: reporteNivanActual.id,
        nombreObjetivo: reporteNivanActual.nombre,
        motivo: motivoReporteNivanElegido,
        detalle: detalle,
        reportadoPorId: usuarioActual.id,
        reportadoPorNombre: usuarioActual.nombre,
        fecha: Date.now(),
        estado: "pendiente"
    });

    guardarReportesNivan(reportes);

    cerrarReporteNivan();
    alert("Gracias, recibimos tu reporte. Nuestro equipo lo va a revisar.");
}

// ==============================
// PREGUNTAS AL VENDEDOR
// ==============================

// Id de la publicación sobre la que se está preguntando/respondiendo
// en el panel de preguntas actualmente abierto.
let idProductoPreguntaActual = null;

function obtenerPreguntasProducto(idProducto) {
    const todas = leerJSONNivan("nivanPreguntas", {});
    return todas[idProducto] || [];
}

function guardarPreguntasProducto(idProducto, preguntas) {
    const todas = leerJSONNivan("nivanPreguntas", {});
    todas[idProducto] = preguntas;
    guardarJSONNivan("nivanPreguntas", todas);
}

// modoVendedor = true muestra un campo para responder las preguntas
// que todavía no tienen respuesta; en modo comprador solo se ve la
// pregunta y, si la hay, la respuesta del vendedor.
function renderizarPreguntasVendedor(idProducto, modoVendedor) {
    const preguntas = obtenerPreguntasProducto(idProducto);

    if (!preguntas.length) {
        return `<p class="sinPreguntasNivan">Todavía no hay preguntas sobre esta publicación.</p>`;
    }

    return preguntas.map(function(pregunta, indice) {
        let respuestaHTML;

        if (pregunta.respuesta) {
            respuestaHTML = `<p class="respuestaVendedorItem"><strong>Vendedor:</strong> ${escaparHTMLNivan(pregunta.respuesta)}</p>`;
        } else if (modoVendedor) {
            respuestaHTML = `
                <div class="formResponderPregunta">
                    <textarea id="respuestaPregunta_${indice}" placeholder="Escribí tu respuesta..."></textarea>
                    <button type="button" onclick="responderPreguntaVendedor(${idProducto}, ${indice})">Responder</button>
                </div>
            `;
        } else {
            respuestaHTML = `<p class="respuestaPendientePregunta">El vendedor todavía no respondió.</p>`;
        }

        return `
            <div class="preguntaVendedorItem">
                <p><strong>${escaparHTMLNivan(pregunta.usuarioNombre || "Comprador")}:</strong> ${escaparHTMLNivan(pregunta.texto)}</p>
                ${respuestaHTML}
            </div>
        `;
    }).join("");
}

// Abre el panel en modo "comprador": puede ver las preguntas ya
// hechas y escribir una nueva.
function abrirPreguntaVendedor(idProducto) {
    idProductoPreguntaActual = idProducto;

    const producto = productos.find(function(p) {
        return p.id === idProducto;
    });

    document.getElementById("nombreProductoPreguntaVendedor").textContent = producto ? producto.nombre : "";
    document.getElementById("textoPreguntaVendedor").value = "";
    document.getElementById("formPreguntaVendedor").style.display = "block";
    document.getElementById("listaPreguntasVendedor").innerHTML = renderizarPreguntasVendedor(idProducto, false);

    document.getElementById("overlayPreguntaVendedor").classList.add("abierto");
}

// Abre el mismo panel pero en modo "vendedor" (desde Mis
// publicaciones): no puede preguntarse a sí mismo, así que se
// esconde el formulario y en cambio puede responder.
function abrirPreguntasComoVendedor(idProducto) {
    idProductoPreguntaActual = idProducto;

    const publicacion = obtenerPublicacionesNivan().find(function(p) {
        return p.id === idProducto;
    });

    document.getElementById("nombreProductoPreguntaVendedor").textContent = publicacion ? publicacion.nombre : "";
    document.getElementById("formPreguntaVendedor").style.display = "none";
    document.getElementById("listaPreguntasVendedor").innerHTML = renderizarPreguntasVendedor(idProducto, true);

    document.getElementById("overlayPreguntaVendedor").classList.add("abierto");
}

function cerrarPreguntaVendedor() {
    document.getElementById("overlayPreguntaVendedor").classList.remove("abierto");
    idProductoPreguntaActual = null;
}

function enviarPreguntaVendedor() {
    if (!usuarioActual) {
        alert("Iniciá sesión para hacerle una pregunta al vendedor.");
        abrirCuenta();
        return;
    }

    const texto = limpiarTextoNivan(document.getElementById("textoPreguntaVendedor").value, 300).trim();

    if (!texto) {
        alert("Escribí tu pregunta antes de enviarla.");
        return;
    }

    const preguntas = obtenerPreguntasProducto(idProductoPreguntaActual);

    preguntas.push({
        usuarioId: usuarioActual.id,
        usuarioNombre: usuarioActual.nombre,
        texto: texto,
        respuesta: null
    });

    guardarPreguntasProducto(idProductoPreguntaActual, preguntas);

    document.getElementById("textoPreguntaVendedor").value = "";
    document.getElementById("listaPreguntasVendedor").innerHTML = renderizarPreguntasVendedor(idProductoPreguntaActual, false);

    // Avisamos al vendedor de la publicación que le llegó una pregunta.
    const productoPreguntado = productos.find(function(p) {
        return p.id === idProductoPreguntaActual;
    });

    if (productoPreguntado && productoPreguntado.vendedorId && productoPreguntado.vendedorId !== usuarioActual.id) {
        crearNotificacion(productoPreguntado.vendedorId, {
            tipo: "pregunta",
            icono: "❓",
            titulo: "Nueva pregunta",
            texto: `${escaparHTMLNivan(usuarioActual.nombre)} preguntó algo sobre "${escaparHTMLNivan(productoPreguntado.nombre)}"`,
            productoId: productoPreguntado.id
        });
    }

    alert("Tu pregunta fue enviada al vendedor.");
}

function responderPreguntaVendedor(idProducto, indice) {
    const textarea = document.getElementById("respuestaPregunta_" + indice);
    const texto = textarea ? limpiarTextoNivan(textarea.value, 500).trim() : "";

    if (!texto) {
        alert("Escribí una respuesta antes de enviarla.");
        return;
    }

    const preguntas = obtenerPreguntasProducto(idProducto);

    if (!preguntas[indice]) return;

    preguntas[indice].respuesta = texto;
    guardarPreguntasProducto(idProducto, preguntas);

    document.getElementById("listaPreguntasVendedor").innerHTML = renderizarPreguntasVendedor(idProducto, true);

    // Avisamos al comprador que le respondieron (si preguntó estando
    // logueado: las preguntas de antes de este cambio no tienen
    // usuarioId guardado, así que no podemos avisarles).
    if (preguntas[indice].usuarioId) {
        const productoRespondido = productos.find(function(p) {
            return p.id === idProducto;
        });

        crearNotificacion(preguntas[indice].usuarioId, {
            tipo: "respuesta",
            icono: "💬",
            titulo: "Te respondieron",
            texto: `El vendedor respondió tu pregunta sobre "${productoRespondido ? productoRespondido.nombre : "tu producto"}"`,
            productoId: idProducto
        });
    }

    // Si estamos viendo esta publicación desde "Mis publicaciones",
    // refrescamos el contador de preguntas pendientes del botón.
    if (typeof renderizarMisPublicaciones === "function" && document.getElementById("listaMisPublicaciones")) {
        renderizarMisPublicaciones();
    }
}

    // ==============================
    // BUSCADORES
    // ==============================

    function buscarNivan(texto, destino) {
        const textoNormalizado = texto.trim().toLowerCase();

        registrarBusquedaNivan(textoNormalizado);

        const resultados = productos.filter(function(producto) {
            const etiquetasProducto = Array.isArray(producto.etiquetas) ? producto.etiquetas : [];
            return producto.nombre.toLowerCase().includes(textoNormalizado) ||
                   producto.categoria.toLowerCase().includes(textoNormalizado) ||
                   obtenerNombreVendedorProducto(producto).toLowerCase().includes(textoNormalizado) ||
                   (producto.marca && producto.marca.toLowerCase().includes(textoNormalizado)) ||
                   etiquetasProducto.some(function(etiqueta) {
                       return etiqueta.toLowerCase().includes(textoNormalizado.replace(/^#+/, ""));
                   });
        });

        if (destino === "productosBusqueda") {
            resultadosBuscadorActuales = resultados;
            mostrarProductos(ordenarProductos(resultados, ordenActual), destino);
        } else {
            mostrarProductos(resultados, destino);
        }
    }

    const buscador = document.getElementById('buscador');
    if (buscador) {
        buscador.addEventListener('input', function() {
            buscarNivan(this.value, 'productosBusqueda');
        });
    }

    const buscadorRapido = document.getElementById('buscadorRapido');
    if (buscadorRapido) {
        buscadorRapido.addEventListener('input', function() {
            const texto = this.value.trim().toLowerCase();

            registrarBusquedaNivan(texto);

            // Sin texto se vuelve al listado completo, con sus secciones.
            if (!texto) {
                mostrarProductos(productos);
                return;
            }

            // El buscador rápido muestra los resultados directamente en Home.
            // Busca igual que el buscador completo: por nombre, categoría,
            // vendedor y también por etiquetas/hashtags.
            const resultados = productos.filter(function(producto) {
                const etiquetasProducto = Array.isArray(producto.etiquetas) ? producto.etiquetas : [];
                return producto.nombre.toLowerCase().includes(texto) ||
                       producto.categoria.toLowerCase().includes(texto) ||
                       obtenerNombreVendedorProducto(producto).toLowerCase().includes(texto) ||
                       (producto.marca && producto.marca.toLowerCase().includes(texto)) ||
                       etiquetasProducto.some(function(etiqueta) {
                           return etiqueta.toLowerCase().includes(texto.replace(/^#+/, ""));
                       });
            });

            mostrarProductos(resultados);
        });

        buscadorRapido.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && this.value.trim() !== '') {
                irAPagina('paginaBuscador');
                const buscadorCompleto = document.getElementById('buscador');
                if (buscadorCompleto) {
                    buscadorCompleto.value = this.value;
                    buscarNivan(this.value, 'productosBusqueda');
                }
            }
        });
    }


    // ABRIR CARRITO

    document
        .getElementById("carritoBtn")
        .addEventListener("click", function() {

            document
                .getElementById("carrito")
                .classList.add("abierto");

            document.body.style.overflow = "hidden";

            // Por si alguna publicación se pausó o se eliminó mientras
            // el carrito estaba cerrado.
            revisarBajasDePrecio();
            actualizarCarrito();
        });


    // CERRAR CARRITO

    document
        .getElementById("cerrarCarrito")
        .addEventListener("click", function() {

            document
                .getElementById("carrito")
                .classList.remove("abierto");

            document.body.style.overflow = "";
        });


    // MENSAJE

    // Cartelito que aparece unos segundos y se desvanece solo.
    let temporizadorToastNivan = null;
    function mostrarToastNivan(texto, duracion) {
        const toast = document.getElementById("toastNivan");
        if (!toast) return;

        toast.textContent = texto;
        toast.classList.add("visible");

        clearTimeout(temporizadorToastNivan);
        temporizadorToastNivan = setTimeout(function() {
            toast.classList.remove("visible");
        }, duracion || 2200);
    }


    // // FINALIZAR COMPRA

document
    .getElementById("comprarBtn")
    .addEventListener("click", function() {

        if (carrito.length === 0) {

            alert("El carrito está vacío.");

            return;
        }

        const hayNoDisponibles = carrito.some(function(producto) {
            return obtenerEstadoPublicacionCarrito(producto) !== "disponible";
        });

        if (hayNoDisponibles) {

            alert(mensajeCarritoNoDisponibleNivan());

            return;
        }

        if (!exigirSesionParaComprarNivan()) return;

        document.getElementById("checkoutForm").style.display = "block";

        cargarDatosCuentaEnCompra();
        cargarDatosGuardadosEnCompra();
        prepararGuardadosCompraNivan();

        document
            .getElementById("checkoutForm")
            .scrollIntoView({
                behavior: "smooth"
            });

    });// CONFIRMAR COMPRA Y COMPROBANTE

    // CERRAR FORMULARIO DE COMPRA

    document
        .getElementById("cerrarCheckout")
        .addEventListener("click", function() {

            document
                .getElementById("checkoutForm")
                .style.display = "none";
        });

// ==============================
// DATOS GUARDADOS DEL CARRITO
// ==============================

const CAMPOS_DATOS_COMPRA = {
    nombre: "nombreCompra",
    telefono: "telefonoCompra",
    email: "emailCompra",
    direccion: "direccionCompra",
    ciudad: "ciudadCompra",
    codigoPostal: "codigoPostal"
};

function claveDatosCompra() {
    const dueno = (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.email)
        ? usuarioActual.email
        : "invitado";
    return "nivanDatosCompra_" + dueno;
}

function leerDatosCompraGuardados() {
    try {
        return leerJSONNivan(claveDatosCompra(), null);
    } catch (e) {
        return null;
    }
}

function leerDatosCompraFormulario() {
    const datos = {};
    Object.keys(CAMPOS_DATOS_COMPRA).forEach(function(clave) {
        datos[clave] = document.getElementById(CAMPOS_DATOS_COMPRA[clave]).value.trim();
    });
    return datos;
}

function cargarDatosGuardadosEnCompra() {
    const guardados = leerDatosCompraGuardados();
    if (!guardados) return;

    Object.keys(CAMPOS_DATOS_COMPRA).forEach(function(clave) {
        const campo = document.getElementById(CAMPOS_DATOS_COMPRA[clave]);
        if (campo && guardados[clave]) campo.value = guardados[clave];
    });

    reformatearTelefonoCompraNivan();
}

function mostrarEstadoDatosCompra(texto, tipo) {
    const estado = document.getElementById("estadoDatosCompra");
    estado.textContent = texto;
    estado.className = "estadoDatosCompra " + tipo;
}

// La PRIMERA dirección que se guarda desde el carrito también pasa a la
// lista de "Direcciones de envío guardadas" (como predeterminada).
// Las siguientes ya no se copian solas.
function sincronizarPrimeraDireccionCarritoNivan(datos) {
    try {
        if (typeof obtenerDireccionesNivan !== "function") return;
        if (!datos.direccion || !datos.ciudad || !datos.codigoPostal) return;

        const lista = obtenerDireccionesNivan();

        // Primera dirección: se crea como predeterminada
        if (!lista.length) {
            guardarDireccionesDelPaisNivan([{
                id: nuevoIdGuardadoNivan(), alias: "",
                direccion: datos.direccion, ciudad: datos.ciudad,
                codigoPostal: datos.codigoPostal,
                predeterminada: true, pais: paisNivan() || "AR"
            }]);
            return;
        }

        // Ya hay direcciones: se actualiza la elegida en el desplegable,
        // o si no hay ninguna elegida, la predeterminada.
        const sel = document.getElementById("direccionGuardadaCompra");
        const idElegido = sel ? sel.value : "";
        const destino = lista.find(function(d) { return d.id === idElegido; })
            || lista.find(function(d) { return d.predeterminada; })
            || lista[0];

        destino.direccion = datos.direccion;
        destino.ciudad = datos.ciudad;
        destino.codigoPostal = datos.codigoPostal;
        guardarDireccionesDelPaisNivan(lista);

        // refrescar el texto de esa opción en el desplegable
        if (sel) {
            const op = sel.querySelector('option[value="' + destino.id + '"]');
            if (op) op.textContent = (destino.alias ? destino.alias + " — " : "") + destino.direccion + ", " + destino.ciudad;
        }
    } catch (e) {}
}

document.getElementById("guardarDatosCompraBtn").addEventListener("click", function() {
    const actuales = leerDatosCompraFormulario();

    const hayVacios = Object.keys(actuales).some(function(clave) {
        return !actuales[clave];
    });

    if (hayVacios) {
        mostrarEstadoDatosCompra("Completá todos los datos para guardarlos.", "error");
        return;
    }

    const guardados = leerDatosCompraGuardados();

    if (guardados) {
        const iguales = Object.keys(actuales).every(function(clave) {
            return (guardados[clave] || "") === actuales[clave];
        });

        if (iguales) {
            sincronizarPrimeraDireccionCarritoNivan(actuales);
            mostrarEstadoDatosCompra("Tus datos ya fueron cargados", "info");
            return;
        }
    }

    try {
        localStorage.setItem(claveDatosCompra(), JSON.stringify(actuales));
    } catch (e) {
        mostrarEstadoDatosCompra("No se pudieron guardar los datos.", "error");
        return;
    }

    sincronizarPrimeraDireccionCarritoNivan(actuales);

    mostrarEstadoDatosCompra(
        guardados ? "Datos actualizados" : "Datos guardados correctamente",
        "ok"
    );
});

// Al editar cualquier campo se borra el mensaje anterior
Object.keys(CAMPOS_DATOS_COMPRA).forEach(function(clave) {
    document.getElementById(CAMPOS_DATOS_COMPRA[clave]).addEventListener("input", function() {
        mostrarEstadoDatosCompra("", "");
    });
});


// ==============================
// FILTROS DEL BUSCADOR: precio, talle y color
// ==============================

const filtrosBuscador = { precioMin: null, precioMax: null, talles: [], colores: [] };

const ORDEN_TALLES_FILTRO = ["A medida", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const FAMILIAS_COLOR_FILTRO = [
    { nombre: "Negro",    hex: "#111111" },
    { nombre: "Blanco",   hex: "#ffffff" },
    { nombre: "Gris",     hex: "#8a8a8a" },
    { nombre: "Beige",    hex: "#d8c3a5" },
    { nombre: "Marrón",   hex: "#7b4a2d" },
    { nombre: "Rojo",     hex: "#d32f2f" },
    { nombre: "Naranja",  hex: "#f57c00" },
    { nombre: "Amarillo", hex: "#fbc02d" },
    { nombre: "Verde",    hex: "#388e3c" },
    { nombre: "Azul",     hex: "#1976d2" },
    { nombre: "Violeta",  hex: "#7b1fa2" },
    { nombre: "Rosa",     hex: "#ec6ea6" }
];

// Agrupa cualquier tono (incluso uno elegido a mano en la rueda de
// color) en una familia simple para poder filtrar.
function familiaDeColor(color) {
    let hex = null;

    if (color && typeof color === "object") {
        hex = normalizarHexColor(color.hex || "");
    } else if (typeof color === "string") {
        hex = normalizarHexColor(color) || normalizarHexColor(NIVAN_COLOR_HEX_POR_NOMBRE[color.toLowerCase()] || "");
    }

    if (!hex) return null;

    const rgb = hexARgbObjeto(hex);
    const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }

    if (l < 0.13) return "Negro";
    if (l > 0.92 && sat < 0.4) return "Blanco";
    if (sat < 0.12) return l > 0.8 ? "Blanco" : "Gris";
    if (h >= 20 && h < 50 && l > 0.68 && sat < 0.55) return "Beige";
    if (h >= 8 && h < 50 && l < 0.4) return "Marrón";

    if (h < 15 || h >= 345) return "Rojo";
    if (h < 40) return "Naranja";
    if (h < 68) return "Amarillo";
    if (h < 165) return "Verde";
    if (h < 255) return "Azul";
    if (h < 290) return "Violeta";
    return "Rosa";
}

function familiasColorDeProducto(producto) {
    const colores = Array.isArray(producto.colores) ? producto.colores : [];
    const familias = [];

    colores.forEach(function(color) {
        const familia = familiaDeColor(color);
        if (familia && !familias.includes(familia)) familias.push(familia);
    });

    return familias;
}

function pasaFiltrosBuscador(producto) {
    const f = filtrosBuscador;

    if (f.precioMin !== null && producto.precio < f.precioMin) return false;
    if (f.precioMax !== null && producto.precio > f.precioMax) return false;

    if (f.talles.length) {
        const tallesProducto = (Array.isArray(producto.talles) ? producto.talles : []).filter(function(t) {
            // Una prenda de reventa no ofrece "A medida", aunque figure en la lista.
            return !(String(t).toLowerCase() === "a medida" && actuaComoRevendedorEnPublicacion(producto));
        }).map(function(t) { return String(t).toLowerCase(); });

        const coincide = f.talles.some(function(t) {
            return tallesProducto.includes(t.toLowerCase());
        });
        if (!coincide) return false;
    }

    if (f.colores.length) {
        const familias = familiasColorDeProducto(producto);
        if (!f.colores.some(function(c) { return familias.includes(c); })) return false;
    }

    return true;
}

function hayFiltrosBuscadorActivos() {
    const f = filtrosBuscador;
    return f.precioMin !== null || f.precioMax !== null || f.talles.length > 0 || f.colores.length > 0;
}

function aplicarFiltrosBuscador() {
    const boton = document.getElementById("botonFiltrosBuscador");
    if (boton) {
        const f = filtrosBuscador;
        const cantidad = (f.precioMin !== null || f.precioMax !== null ? 1 : 0) + f.talles.length + f.colores.length;
        boton.textContent = cantidad ? "Filtros (" + cantidad + ")" : "Filtros";
        boton.classList.toggle("conFiltros", cantidad > 0);
    }

    mostrarProductos(ordenarProductos(resultadosBuscadorActuales, ordenActual), "productosBusqueda");
}

// Las opciones de talle y color salen de lo que realmente hay publicado.
function renderizarOpcionesFiltrosBuscador() {
    const talles = [];
    const familias = [];

    productos.forEach(function(p) {
        (Array.isArray(p.talles) ? p.talles : []).forEach(function(t) {
            const talle = String(t);
            if (talle.toLowerCase() === "a medida" && actuaComoRevendedorEnPublicacion(p)) return;
            const canonico = ORDEN_TALLES_FILTRO.find(function(o) { return o.toLowerCase() === talle.toLowerCase(); }) || talle;
            if (!talles.includes(canonico)) talles.push(canonico);
        });

        familiasColorDeProducto(p).forEach(function(f) {
            if (!familias.includes(f)) familias.push(f);
        });
    });

    talles.sort(function(a, b) {
        const ia = ORDEN_TALLES_FILTRO.indexOf(a), ib = ORDEN_TALLES_FILTRO.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });

    const contTalle = document.getElementById("chipsFiltroTalle");
    contTalle.innerHTML = talles.length
        ? talles.map(function(t) {
            const activo = filtrosBuscador.talles.includes(t) ? "activo" : "";
            return `<button type="button" class="chipFiltroBuscador ${activo}" data-valor="${t}" onclick="alternarFiltroTalle(this.dataset.valor)">${t}</button>`;
        }).join("")
        : `<span class="subTextoPerfilLateral">Todavía no hay talles cargados.</span>`;

    const contColor = document.getElementById("chipsFiltroColor");
    const familiasOrdenadas = FAMILIAS_COLOR_FILTRO.filter(function(f) { return familias.includes(f.nombre); });
    contColor.innerHTML = familiasOrdenadas.length
        ? familiasOrdenadas.map(function(f) {
            const activo = filtrosBuscador.colores.includes(f.nombre) ? "activo" : "";
            return `<button type="button" class="chipFiltroBuscador ${activo}" data-valor="${escaparHTMLNivan(f.nombre)}" onclick="alternarFiltroColor(this.dataset.valor)"><span class="puntoColorFiltro" style="background:${f.hex};"></span>${escaparHTMLNivan(f.nombre)}</button>`;
        }).join("")
        : `<span class="subTextoPerfilLateral">Todavía no hay colores cargados.</span>`;
}

function toggleFiltrosBuscador() {
    const panel = document.getElementById("panelFiltrosBuscador");
    const abrir = !panel.classList.contains("abierto");

    if (abrir) renderizarOpcionesFiltrosBuscador();
    panel.classList.toggle("abierto", abrir);
}

function cambiarFiltroPrecio() {
    const min = document.getElementById("filtroPrecioMin").value;
    const max = document.getElementById("filtroPrecioMax").value;

    filtrosBuscador.precioMin = min === "" ? null : Number(min);
    filtrosBuscador.precioMax = max === "" ? null : Number(max);

    aplicarFiltrosBuscador();
}

function alternarFiltroTalle(talle) {
    const lista = filtrosBuscador.talles;
    const indice = lista.indexOf(talle);
    if (indice === -1) lista.push(talle); else lista.splice(indice, 1);

    renderizarOpcionesFiltrosBuscador();
    aplicarFiltrosBuscador();
}

function alternarFiltroColor(color) {
    const lista = filtrosBuscador.colores;
    const indice = lista.indexOf(color);
    if (indice === -1) lista.push(color); else lista.splice(indice, 1);

    renderizarOpcionesFiltrosBuscador();
    aplicarFiltrosBuscador();
}

function limpiarFiltrosBuscador() {
    filtrosBuscador.precioMin = null;
    filtrosBuscador.precioMax = null;
    filtrosBuscador.talles = [];
    filtrosBuscador.colores = [];

    document.getElementById("filtroPrecioMin").value = "";
    document.getElementById("filtroPrecioMax").value = "";

    renderizarOpcionesFiltrosBuscador();
    aplicarFiltrosBuscador();
}

// ==============================
// VENTAS Y ACTIVIDAD POR PUBLICACIÓN (para el feed de Home)
// ==============================

function leerJSONNivan(clave, porDefecto) {
    try {
        const valor = JSON.parse(localStorage.getItem(clave) || "null");
        return valor === null ? porDefecto : valor;
    } catch (e) {
        return porDefecto;
    }
}

// Guarda sin romper la app si el dispositivo se quedó sin espacio (pasa seguido
// con fotos). Devuelve true/false y avisa con un cartelito si falló.
function guardarJSONNivan(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
        return true;
    } catch (e) {
        if (typeof mostrarToastNivan === "function") {
            mostrarToastNivan("No se pudo guardar: falta espacio en el dispositivo.", 3500);
        }
        return false;
    }
}

// Ventas de muestra que ya trae la publicación ("Más de 120 ventas")
// más las que se confirmaron en esta app.
function obtenerCantidadVentasProducto(producto) {
    const guardadas = leerJSONNivan("nivanVentasProductos", {});
    let base = 0;

    if (typeof producto.ventas === "number") {
        base = producto.ventas;
    } else if (typeof producto.ventas === "string") {
        const coincidencia = producto.ventas.replace(/\./g, "").match(/\d+/);
        base = coincidencia ? Number(coincidencia[0]) : 0;
    }

    return base + (Number(guardadas[producto.id]) || 0);
}

function registrarVentasDelCarrito() {
    const guardadas = leerJSONNivan("nivanVentasProductos", {});

    carrito.forEach(function(item) {
        guardadas[item.id] = (Number(guardadas[item.id]) || 0) + (Number(item.cantidad) || 1);
        registrarActividadProducto(item.id, "compra");
    });

    guardarJSONNivan("nivanVentasProductos", guardadas);
}

const DIAS_VENTANA_TENDENCIA = 7;
const DIAS_HISTORIAL_ACTIVIDAD = 60;
const PESO_ACTIVIDAD_TENDENCIA = { vista: 1, favorito: 3, carrito: 4 };

// tipo: "vista" | "favorito" | "carrito" | "compra"
// Se guarda un historial largo: Tendencia mira solo la última semana y
// "Recomendados para vos" usa todo el historial con más peso a lo reciente.
function registrarActividadProducto(idProducto, tipo) {
    const eventos = leerJSONNivan("nivanActividadProductos", []);

    eventos.push({ i: idProducto, k: tipo, t: Date.now() });

    const limite = Date.now() - DIAS_HISTORIAL_ACTIVIDAD * 24 * 60 * 60 * 1000;
    const recientes = eventos.filter(function(e) { return e.t >= limite; }).slice(-1000);

    try {
        localStorage.setItem("nivanActividadProductos", JSON.stringify(recientes));
    } catch (e) {}
}

function obtenerPuntajeTendencia(idProducto) {
    const limite = Date.now() - DIAS_VENTANA_TENDENCIA * 24 * 60 * 60 * 1000;

    return leerJSONNivan("nivanActividadProductos", []).reduce(function(total, e) {
        if (e.i !== idProducto || e.t < limite) return total;
        return total + (PESO_ACTIVIDAD_TENDENCIA[e.k] || 0);
    }, 0);
}

// ==============================
// CUPONES
// ==============================
// Cada cupón es de UN vendedor y sólo descuenta en los productos de ESA
// tienda dentro del carrito (no en todo el pedido si hay varios
// vendedores). "nivanCupones" guarda todos los cupones de todos los
// vendedores; cada comprador tiene su propia lista de códigos
// guardados en "nivanCuponesGuardados_<idUsuario>".

function obtenerCuponesNivan() {
    return leerJSONNivan("nivanCupones", []);
}

function guardarCuponesNivan(lista) {
    try {
        localStorage.setItem("nivanCupones", JSON.stringify(lista));
    } catch (e) {
        console.warn("No se pudieron guardar los cupones", e);
    }
}

function normalizarCodigoCuponNivan(codigo) {
    return String(codigo || "").trim().toUpperCase().replace(/\s+/g, "");
}

function cuponVencidoNivan(cupon) {
    return !!cupon.vigenciaHasta && Date.now() > cupon.vigenciaHasta;
}

function cuponAgotadoNivan(cupon) {
    return !!cupon.usosMaximos && (cupon.usos || 0) >= cupon.usosMaximos;
}

function cuponUsableNivan(cupon) {
    if (!cupon || !cupon.activo || cuponVencidoNivan(cupon) || cuponAgotadoNivan(cupon)) return false;

    // Si es de una publicación específica, esa publicación tiene que seguir existiendo.
    if (cupon.productoId && !productos.some(function(p) { return p.id === cupon.productoId; })) return false;

    return true;
}

function textoAlcanceCuponNivan(cupon) {
    if (!cupon || !cupon.productoId) return "Aplica en toda la tienda";
    const p = productos.find(function(x) { return x.id === cupon.productoId; });
    return "Solo en: " + (p ? p.nombre : (cupon.productoNombre || "una publicación"));
}

// ¿Este producto del carrito entra dentro del alcance del cupón?
function itemEntraEnCuponNivan(cupon, producto) {
    if (!cupon || producto.vendedorId !== cupon.vendedorId) return false;
    if (cupon.productoId && producto.id !== cupon.productoId) return false;
    return true;
}

function buscarCuponPorCodigoNivan(codigo) {
    const cod = normalizarCodigoCuponNivan(codigo);
    if (!cod) return null;
    // Los códigos no se repiten entre cupones vigentes, pero puede haber viejos
    // vencidos o pausados con el mismo código: preferimos siempre el vigente.
    const coinciden = obtenerCuponesNivan().filter(function(c) { return normalizarCodigoCuponNivan(c.codigo) === cod; });
    return coinciden.find(cuponUsableNivan) || coinciden[0] || null;
}

// Código ya usado por OTRO cupón vigente de cualquier tienda.
function codigoCuponEnUsoNivan(codigo, idCuponExcluido) {
    const cod = normalizarCodigoCuponNivan(codigo);
    return obtenerCuponesNivan().some(function(c) {
        return c.id !== idCuponExcluido && normalizarCodigoCuponNivan(c.codigo) === cod && cuponUsableNivan(c);
    });
}

function textoValorCuponNivan(cupon) {
    return cupon.tipo === "porcentaje"
        ? (cupon.valor + "% de descuento")
        : (simboloMonedaNivan() + formatearDineroNivan(cupon.valor) + " de descuento");
}

// ---- Mis cupones (lado vendedor) ----

function misCuponesNivan() {
    if (!usuarioActual) return [];
    return obtenerCuponesNivan().filter(function(c) { return c.vendedorId === usuarioActual.id; });
}

function abrirMisCuponesNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }

    if (!usuarioTieneTiendaNivan(usuarioActual.id)) {
        alert("Para crear cupones primero tenés que publicar algo en tu tienda.");
        return;
    }

    abrirPantallaCompleta("pantallaMisCupones");

    const form = document.getElementById("formCuponNivan");
    if (form) form.reset();
    prepararFormCuponNivan();

    try {
        renderizarMisCuponesNivan();
    } catch (e) {
        console.warn("No se pudo mostrar la lista de cupones", e);
    }
}

function renderizarMisCuponesNivan() {
    const lista = document.getElementById("listaMisCuponesNivan");
    if (!lista || !usuarioActual) return;

    const cupones = misCuponesNivan().sort(function(a, b) { return b.creado - a.creado; });

    if (!cupones.length) {
        lista.innerHTML = `<p class="pedidosVaciosNivan">Todavía no creaste ningún cupón. Armá uno arriba para que tus compradores lo usen en el carrito.</p>`;
        return;
    }

    lista.innerHTML = cupones.map(function(c) {
        const vencido = cuponVencidoNivan(c);
        const agotado = cuponAgotadoNivan(c);
        const usable = cuponUsableNivan(c);
        const estado = !c.activo ? "Pausado" : vencido ? "Vencido" : agotado ? "Agotado" : "Activo";

        return `
            <div class="tarjetaCuponNivan ${usable ? "" : "cuponInactivoNivan"}">
                <div class="datosCuponNivan">
                    <strong>${escaparHTMLNivan(c.codigo)}</strong>
                    <span>${textoValorCuponNivan(c)}</span>
                    <span>${escaparHTMLNivan(textoAlcanceCuponNivan(c))}</span>
                    <small>${c.vigenciaHasta ? "Vence el " + new Date(c.vigenciaHasta).toLocaleDateString("es-AR") : "Sin vencimiento"} · ${c.usosMaximos ? (c.usos || 0) + "/" + c.usosMaximos + " usos" : (c.usos || 0) + " usos"}</small>
                    <span class="estadoCuponNivan">${estado}</span>
                    <span class="etiquetaVisibilidadCuponNivan">${textoVisibilidadCuponNivan(c)}</span>
                </div>
                <div class="accionesCuponNivan">
                    <button type="button" onclick="abrirEnviarCuponNivan('${c.id}')">📤 Enviar</button>
                    <button type="button" onclick="abrirAudienciaCuponNivan('${c.id}')">👥 ¿Quién?</button>
                    <button type="button" onclick="alternarCuponActivoNivan('${c.id}')">${c.activo ? "Pausar" : "Activar"}</button>
                    <button type="button" onclick="eliminarCuponNivan('${c.id}')">Eliminar</button>
                </div>
            </div>
        `;
    }).join("");
}

function crearCuponNivan() {
    if (!usuarioActual) return;

    const codigo = normalizarCodigoCuponNivan(document.getElementById("codigoCuponNivan").value);
    const tipo = document.getElementById("tipoCuponNivan").value;
    const valor = Number(document.getElementById("valorCuponNivan").value);
    const vigenciaInput = document.getElementById("vigenciaCuponNivan").value;
    const usosInput = document.getElementById("usosCuponNivan").value;

    if (!codigo || codigo.length < 3 || codigo.length > 20 || !/^[A-Z0-9]+$/.test(codigo)) {
        alert("El código tiene que tener entre 3 y 20 letras o números, sin espacios ni símbolos.");
        return;
    }

    if (!Number.isFinite(valor) || valor <= 0 || (tipo === "porcentaje" && valor > 90)) {
        alert(tipo === "porcentaje" ? "El porcentaje tiene que ser mayor a 0 y hasta 90%." : "El monto tiene que ser mayor a 0.");
        return;
    }

    if (codigoCuponEnUsoNivan(codigo)) {
        alert("Ese código ya está en uso en un cupón vigente. Elegí otro distinto.");
        return;
    }

    const alcance = document.getElementById("alcanceCuponNivan").value;
    const productoElegidoId = alcance === "una" ? Number(document.getElementById("productoCuponNivan").value) : null;
    const productoElegido = productoElegidoId
        ? productos.find(function(p) { return p.id === productoElegidoId && p.vendedorId === usuarioActual.id; })
        : null;

    if (alcance === "una" && !productoElegido) {
        alert("Elegí la publicación en la que querés que aplique el cupón.");
        return;
    }

    const vigenciaHasta = vigenciaInput ? new Date(vigenciaInput + "T23:59:59").getTime() : null;
    const usosMaximos = usosInput ? Math.max(1, Math.round(Number(usosInput))) : null;

    const cupones = obtenerCuponesNivan();
    cupones.unshift({
        id: "CUP-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        codigo: codigo,
        vendedorId: usuarioActual.id,
        tipo: tipo,
        valor: valor,
        vigenciaHasta: vigenciaHasta,
        usosMaximos: usosMaximos,
        usos: 0,
        activo: true,
        audiencia: leerAudienciaNivan("audienciaCuponFormNivan"),
        habilitados: [],
        productoId: productoElegido ? productoElegido.id : null,
        productoNombre: productoElegido ? productoElegido.nombre : "",
        creado: Date.now()
    });

    guardarCuponesNivan(cupones);
    document.getElementById("formCuponNivan").reset();
    prepararFormCuponNivan();
    renderizarMisCuponesNivan();
    mostrarToastNivan("Cupón creado con éxito");
}

function alternarAlcanceCuponNivan() {
    const una = document.getElementById("alcanceCuponNivan").value === "una";
    document.getElementById("campoProductoCuponNivan").style.display = una ? "" : "none";
}

function prepararFormCuponNivan() {
    const select = document.getElementById("productoCuponNivan");
    if (!select || !usuarioActual) return;

    const mias = productos.filter(function(p) { return p.vendedorId === usuarioActual.id; });
    select.innerHTML = mias.length
        ? mias.map(function(p) { return `<option value="${p.id}">${escaparHTMLNivan(p.nombre)}</option>`; }).join("")
        : `<option value="">Todavía no tenés publicaciones</option>`;

    alternarAlcanceCuponNivan();

    const audienciaForm = document.getElementById("audienciaCuponFormNivan");
    if (audienciaForm) audienciaForm.innerHTML = audienciaCheckboxesHTMLNivan("audienciaCuponFormNivan", []);
}

function alternarCuponActivoNivan(idCupon) {
    if (!usuarioActual) return;

    const cupones = obtenerCuponesNivan();
    const c = cupones.find(function(x) { return x.id === idCupon && x.vendedorId === usuarioActual.id; });
    if (!c) return;

    if (!c.activo && codigoCuponEnUsoNivan(c.codigo, c.id)) {
        alert("No se puede activar: ya hay otro cupón vigente con el código " + c.codigo + ".");
        return;
    }

    c.activo = !c.activo;
    guardarCuponesNivan(cupones);
    renderizarMisCuponesNivan();
}

function eliminarCuponNivan(idCupon) {
    if (!usuarioActual) return;
    if (!confirm("¿Eliminar este cupón? Los compradores que lo tengan guardado ya no van a poder usarlo.")) return;

    const cupones = obtenerCuponesNivan().filter(function(c) {
        return !(c.id === idCupon && c.vendedorId === usuarioActual.id);
    });

    guardarCuponesNivan(cupones);
    renderizarMisCuponesNivan();
}

// ---- Tus cupones (lado comprador) ----

function claveCuponesGuardadosNivan() {
    return usuarioActual ? ("nivanCuponesGuardados_" + usuarioActual.id) : null;
}

function obtenerCuponesGuardadosNivan() {
    const clave = claveCuponesGuardadosNivan();
    return clave ? leerJSONNivan(clave, []) : [];
}

function guardarCuponesGuardadosNivan(lista) {
    const clave = claveCuponesGuardadosNivan();
    if (!clave) return;
    try { localStorage.setItem(clave, JSON.stringify(lista)); } catch (e) {}
}

function renderizarTusCuponesNivan() {
    const lista = document.getElementById("listaTusCuponesNivan");
    if (!lista || !usuarioActual) return;

    const guardados = obtenerCuponesGuardadosNivan();
    const usuarios = obtenerUsuariosNivan();

    if (!guardados.length) {
        lista.innerHTML = `<p class="pedidosVaciosNivan">Todavía no guardaste ningún cupón. Pedile un código a tu vendedor favorito y agregalo arriba.</p>`;
        return;
    }

    lista.innerHTML = guardados.map(function(codigoGuardado) {
        const cupon = buscarCuponPorCodigoNivan(codigoGuardado);

        if (!cupon) {
            return `
                <div class="tarjetaCuponNivan cuponInactivoNivan">
                    <div class="datosCuponNivan">
                        <strong>${escaparHTMLNivan(codigoGuardado)}</strong>
                        <span class="estadoCuponNivan">Ya no existe</span>
                    </div>
                    <div class="accionesCuponNivan">
                        <button type="button" onclick="quitarCuponGuardadoNivan('${escaparHTMLNivan(codigoGuardado)}')">Quitar</button>
                    </div>
                </div>
            `;
        }

        const vendedor = obtenerUsuarioPorIdNivan(cupon.vendedorId, usuarios);
        const nombreTienda = vendedor ? obtenerNombreVendedorUsuario(vendedor) : "una tienda de NIVAN";
        const puedeUsarPorSeguir = usuarioPuedeUsarCuponNivan(cupon);
        const usable = cuponUsableNivan(cupon) && puedeUsarPorSeguir;
        const estado = !puedeUsarPorSeguir ? textoRestriccionCuponNivan(cupon) : !cupon.activo ? "El vendedor lo pausó" : cuponVencidoNivan(cupon) ? "Vencido" : cuponAgotadoNivan(cupon) ? "Agotado" : "Vigente";

        return `
            <div class="tarjetaCuponNivan ${usable ? "" : "cuponInactivoNivan"}">
                <div class="datosCuponNivan">
                    <strong>${escaparHTMLNivan(cupon.codigo)}</strong>
                    <span>${textoValorCuponNivan(cupon)} en ${escaparHTMLNivan(nombreTienda)}</span>
                    <span>${escaparHTMLNivan(textoAlcanceCuponNivan(cupon))}</span>
                    <small>${cupon.vigenciaHasta ? "Vence el " + new Date(cupon.vigenciaHasta).toLocaleDateString("es-AR") : "Sin vencimiento"}</small>
                    <span class="estadoCuponNivan">${estado}</span>
                </div>
                <div class="accionesCuponNivan">
                    ${usable ? `<button type="button" onclick="usarCuponDesdeListaNivan('${escaparHTMLNivan(cupon.codigo)}')">Usar en el carrito</button>` : ""}
                    <button type="button" onclick="quitarCuponGuardadoNivan('${escaparHTMLNivan(codigoGuardado)}')">Quitar</button>
                </div>
            </div>
        `;
    }).join("");
}

function agregarCuponGuardadoNivan() {
    if (!usuarioActual) return;

    const input = document.getElementById("codigoCuponGuardarNivan");
    const codigo = normalizarCodigoCuponNivan(input.value);

    if (!codigo) {
        alert("Escribí un código de cupón.");
        return;
    }

    const cupon = buscarCuponPorCodigoNivan(codigo);
    if (!cupon) {
        alert("No encontramos ningún cupón con ese código.");
        return;
    }

    if (!usuarioPuedeUsarCuponNivan(cupon)) {
        alert("No estás habilitado para este cupón: " + textoRestriccionCuponNivan(cupon).toLowerCase() + ". Si es para seguidores, seguí a la tienda desde su perfil.");
        return;
    }

    const guardados = obtenerCuponesGuardadosNivan();
    if (guardados.some(function(c) { return normalizarCodigoCuponNivan(c) === codigo; })) {
        alert("Ya tenés guardado ese cupón.");
        return;
    }

    guardados.unshift(cupon.codigo);
    guardarCuponesGuardadosNivan(guardados);
    input.value = "";
    renderizarTusCuponesNivan();
}

function quitarCuponGuardadoNivan(codigo) {
    const guardados = obtenerCuponesGuardadosNivan().filter(function(c) {
        return normalizarCodigoCuponNivan(c) !== normalizarCodigoCuponNivan(codigo);
    });

    guardarCuponesGuardadosNivan(guardados);
    renderizarTusCuponesNivan();
}

// Lo manda directo al carrito con el cupón ya cargado en el campo.
function usarCuponDesdeListaNivan(codigo) {
    cerrarPantallaCompleta("pantallaTusCupones");

    const inputCarrito = document.getElementById("codigoCuponCarritoNivan");
    if (inputCarrito) inputCarrito.value = codigo;

    aplicarCuponCarritoNivan();
}

// ---- Aplicar el cupón en el carrito/checkout ----

let cuponAplicadoNivan = null; // { codigo, vendedorId }
let cuponPendienteNivan = null; // cupón esperando que agregues algo de esa tienda

// Si el cupón cargado dejó de servir (lo pausaron, venció, se agotó, o
// ya no hay nada de esa tienda en el carrito) se saca solo.
// Subtotal de lo que realmente alcanza el cupón (toda la tienda o una publicación).
function subtotalCuponEnCarritoNivan(cupon) {
    if (!cupon) return 0;
    return carrito.reduce(function(acum, producto) {
        if (!itemEntraEnCuponNivan(cupon, producto)) return acum;
        if (obtenerEstadoPublicacionCarrito(producto) !== "disponible") return acum;

        const unitario = producto.precioUnitario != null ? Number(producto.precioUnitario) : Number(producto.precio);
        return acum + unitario * (Number(producto.cantidad) || 1);
    }, 0);
}

function calcularDescuentoCuponNivan() {
    if (!cuponAplicadoNivan) return 0;

    const cupon = buscarCuponPorCodigoNivan(cuponAplicadoNivan.codigo);
    const subtotalVendedor = subtotalCuponEnCarritoNivan(cupon);

    if (!cuponUsableNivan(cupon) || !usuarioPuedeUsarCuponNivan(cupon) || subtotalVendedor <= 0) {
        cuponAplicadoNivan = null;
        return 0;
    }

    const descuento = cupon.tipo === "porcentaje"
        ? subtotalVendedor * (cupon.valor / 100)
        : Math.min(cupon.valor, subtotalVendedor);

    return Math.round(descuento);
}

function mostrarAvisoCuponCarritoNivan(texto) {
    const aviso = document.getElementById("avisoCuponCarritoNivan");
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.style.display = texto ? "block" : "none";

    // Si el carrito no está abierto (por ejemplo, vino desde "Tus cupones"),
    // el aviso no se vería: lo mostramos como cartelito.
    const carritoEl = document.getElementById("carrito");
    if (texto && carritoEl && !carritoEl.classList.contains("abierto")) {
        mostrarToastNivan(texto, 3500);
    }
}

function aplicarCuponCarritoNivan() {
    const input = document.getElementById("codigoCuponCarritoNivan");
    if (!input) return;

    const codigo = normalizarCodigoCuponNivan(input.value);
    if (!codigo) {
        mostrarAvisoCuponCarritoNivan("Escribí un código de cupón.");
        return;
    }

    const cupon = buscarCuponPorCodigoNivan(codigo);
    if (!cupon) {
        mostrarAvisoCuponCarritoNivan("No encontramos ningún cupón con ese código.");
        return;
    }

    if (!cuponUsableNivan(cupon)) {
        mostrarAvisoCuponCarritoNivan("Ese cupón ya no está disponible.");
        return;
    }

    if (!usuarioPuedeUsarCuponNivan(cupon)) {
        mostrarAvisoCuponCarritoNivan("No estás habilitado para este cupón (" + textoRestriccionCuponNivan(cupon).toLowerCase() + "). Si es para seguidores, seguí a la tienda desde su perfil.");
        return;
    }

    if (subtotalCuponEnCarritoNivan(cupon) <= 0) {
        // Nada del cupón en el carrito: lo mandamos a la tienda (o a la
        // publicación) y el cupón queda esperando para aplicarse solo.
        mostrarAvisoCuponCarritoNivan("");
        cuponPendienteNivan = { codigo: cupon.codigo, vendedorId: cupon.vendedorId, productoId: cupon.productoId || null };
        input.value = "";

        const carritoEl = document.getElementById("carrito");
        if (carritoEl) {
            carritoEl.classList.remove("abierto");
            carritoEl.classList.remove("abierta");
        }
        document.body.style.overflow = "";

        document.querySelectorAll(".pantallaCompleta.abierta").forEach(function(pantalla) {
            pantalla.classList.remove("abierta");
        });

        if (cupon.productoId) {
            abrirProducto(cupon.productoId);
            mostrarToastNivan("Este cupón es solo para esta publicación. Agregala al carrito para usar el descuento.", 4500);
        } else {
            abrirPerfilVendedor(cupon.vendedorId);
            mostrarToastNivan("Aún no tenés productos añadidos para usar el cupón de descuento, seleccioná algún producto.", 4500);
        }
        return;
    }

    cuponPendienteNivan = null;
    cuponAplicadoNivan = { codigo: cupon.codigo, vendedorId: cupon.vendedorId, productoId: cupon.productoId || null };
    mostrarAvisoCuponCarritoNivan("");

    // Si no estaba el carrito abierto, lo abrimos con el cupón ya puesto.
    const carritoAbierto = document.getElementById("carrito");
    if (carritoAbierto && !carritoAbierto.classList.contains("abierto")) {
        carritoAbierto.classList.add("abierto");
        document.body.style.overflow = "hidden";
    }
    actualizarCarrito();
}

function quitarCuponCarritoNivan() {
    cuponAplicadoNivan = null;
    cuponPendienteNivan = null;

    const input = document.getElementById("codigoCuponCarritoNivan");
    if (input) input.value = "";

    mostrarAvisoCuponCarritoNivan("");
    actualizarCarrito();
}


