
    // ==============================
    // PAÍS Y MONEDA
    // ==============================
    // Solo hay dos países. Cada uno tiene su moneda y su precio máximo por prenda.
    const PAISES_NIVAN = {
        AR: { nombre: "Argentina", bandera: "🇦🇷", moneda: "Pesos argentinos", simbolo: "ARS", iva: 21, precioMaximo: 250000, ejemploPrecio: "45.000", ejemploPresupuesto: "80000", urlDefensaConsumidor: "https://www.argentina.gob.ar/produccion/defensadelconsumidor" },
        UY: { nombre: "Uruguay", bandera: "🇺🇾", moneda: "Pesos uruguayos", simbolo: "UYU", iva: 22, precioMaximo: 7000, ejemploPrecio: "1.500", ejemploPresupuesto: "3000", urlDefensaConsumidor: "https://www.gub.uy/tramites/consulta-reclamo-yo-denuncia-materia-defensa-consumidor" }
    };

    // País elegido en este dispositivo ("AR", "UY" o null si todavía no eligió).
    function paisNivan() {
        try {
            const guardado = localStorage.getItem("nivanPais");
            return PAISES_NIVAN[guardado] ? guardado : null;
        } catch (e) {
            return null;
        }
    }

    function datosPaisNivan(pais) {
        return PAISES_NIVAN[pais || paisNivan() || "AR"] || PAISES_NIVAN.AR;
    }

    // Documento de identidad según el país: "DNI" (Argentina) o "cédula de identidad" (Uruguay).
    // Con mayuscula = true devuelve "DNI" / "Cédula de identidad" (para títulos y etiquetas).
    function nombreDocumentoNivan(mayuscula) {
        const texto = (paisNivan() || "AR") === "UY" ? "cédula de identidad" : "DNI";
        return mayuscula ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
    }

    // Precio sin impuestos nacionales: el precio publicado es el final (con IVA
    // incluido), así que el neto es precio / (1 + IVA). AR 21 %, UY 22 %.
    function precioSinImpuestosNivan(precio, pais) {
        const iva = datosPaisNivan(pais).iva || 0;
        return Math.round(Number(precio) / (1 + iva / 100));
    }

    function textoSinImpuestosNivan(precio, pais) {
        return "Precio sin impuestos nacionales: " +
            simboloMonedaNivan(pais) + precioSinImpuestosNivan(precio, pais).toLocaleString("es-AR");
    }

    // Para mostrar antes de un número, con espacio: "ARS 45.000" / "UYU 1.500".
    function simboloMonedaNivan(pais) {
        return datosPaisNivan(pais).simbolo + " ";
    }

    // Si todavía no eligió país, el cartel se muestra de inmediato y tapa toda la app.
    (function() {
        if (paisNivan()) return;
        const cartel = document.getElementById("selectorPaisNivan");
        if (cartel) cartel.classList.add("visible");
    })();

    // VARIABLES

    let carrito = (function() {
        try {
            const guardado = leerJSONNivan('nivanCarrito', []);
            return Array.isArray(guardado) ? guardado : [];
        } catch (e) {
            return [];
        }
    })();

    function guardarCarritoNivan() {
        try {
            localStorage.setItem('nivanCarrito', JSON.stringify(carrito));
        } catch (e) {}
    }
  
  let favoritos = (function() {
      try {
          const guardados = leerJSONNivan('nivanFavoritos', []);
          return Array.isArray(guardados) ? guardados : [];
      } catch (e) {
          return [];
      }
  })();

    let productos = [];

    // ORDEN Y RESULTADOS ACTUALES DEL BUSCADOR
    let ordenActual = "relevancia";
    let resultadosBuscadorActuales = productos;


    // ==============================
    // ETIQUETAS DE TIPO DE VENTA
    // ==============================
    // La etiqueta aparece debajo del nombre de la tienda y sale del tipo
    // de trabajo que esa tienda tildó en "¿Qué tipo de trabajo tenés?".
    // - "A medida": se muestra en todas las ventas que tienen disponible
    //   la opción a medida.
    // - "Talle estándar": se muestra solo si la tienda es revendedora o
    //   la prenda es de reventa.

    const etiquetasVendedor = {
        aMedida: {
            texto: "A medida"
        },

        talleEstandar: {
            texto: "Talle estándar",
            descripcion: "Vende ropa ya hecha, en talles estándar."
        }
    };

    // Tipos de trabajo que tildó la tienda de una publicación. Las
    // publicaciones guardadas antes del cambio de nombre usaban otro campo.
    function obtenerTiposTrabajoProducto(producto) {
        if (Array.isArray(producto.tiposTrabajoTienda)) return producto.tiposTrabajoTienda;
        return Array.isArray(producto.rolesTienda) ? producto.rolesTienda : [];
    }

    function productoTieneAMedida(producto) {
        const talles = Array.isArray(producto.talles) ? producto.talles : [];

        const ofreceAMedida = talles.some(function(talle) {
            return String(talle).toLowerCase() === "a medida";
        });

        // Una prenda de reventa nunca ofrece a medida, aunque figure en la lista.
        return ofreceAMedida && !actuaComoRevendedorEnPublicacion(producto);
    }

    function obtenerEtiquetaVendedorHTML(producto) {
        const etiquetas = [];

        if (productoTieneAMedida(producto)) {
            etiquetas.push(etiquetasVendedor.aMedida);
        }

        if (actuaComoRevendedorEnPublicacion(producto)) {
            etiquetas.push(etiquetasVendedor.talleEstandar);
        }

        return etiquetas
            .map(function(etiqueta) {
                return `
                    <span class="etiquetaVendedor">${etiqueta.texto}</span>
                    ${etiqueta.descripcion ? `<p class="descripcionEtiquetaVendedor">${etiqueta.descripcion}</p>` : ""}
                `;
            })
            .join("");
    }

    // ==============================
    // ETIQUETAS DESTACADAS (Nuevo / Última unidad)
    // ==============================
    // No rediseña la tarjeta: solo agrega chips sobre la imagen para
    // ayudar a destacar publicaciones sin tocar el resto del layout.

    function esProductoNuevo(producto) {
        if (producto.nuevo === true) return true;

        if (producto.fechaCreacion) {
            const catorceDiasEnMs = 14 * 24 * 60 * 60 * 1000;
            return (Date.now() - producto.fechaCreacion) < catorceDiasEnMs;
        }

        return false;
    }

    function obtenerBadgesDestacadosHTML(producto, esAnuncio) {
        const badges = [];

        // Las tiendas destacadas ya no llevan cartel: sus tarjetas se ven en dorado.
        // Solo se rotula "Publicidad" a las que están ocupando un lugar de publicidad arriba del feed.
        if (esAnuncio) {
            badges.push('<span class="badgeDestacado tiendaDestacada">Publicidad</span>');
        }

        if (esProductoNuevo(producto)) {
            badges.push('<span class="badgeDestacado nuevo">Nuevo</span>');
        }

        if (producto.stock === 1) {
            badges.push('<span class="badgeDestacado ultimaUnidad">Última unidad</span>');
        }

        return badges.length ? `<div class="etiquetasDestacadas">${badges.join("")}</div>` : "";
    }

    // COMPONENTE / MOSTRAR PRODUCTOS

    function mostrarProductos(lista, idContenedor = "productos") {

        const contenedor = document.getElementById(idContenedor);

        // Solo el listado completo del Home lleva "Más vendidos / Tendencia"
        // y "Recomendados para vos" intercalados. Antes de limpiar la grilla
        // se devuelven al depósito para no perderlos.
        const esHomeCompleto = idContenedor === "productos" && lista === productos;

        // Las tiendas con plan "Tienda destacada" salen primero en el Home y en la búsqueda rápida.
        if (idContenedor === "productos") lista = priorizarDestacadosNivan(lista);
        const deposito = document.getElementById("depositoFeedsHome");
        const bloqueFeed = document.getElementById("feedNivan");
        const bloqueRecomendados = document.getElementById("recomendadosNivan");

        if (idContenedor === "productos" && deposito && bloqueFeed && bloqueRecomendados) {
            deposito.appendChild(bloqueFeed);
            deposito.appendChild(bloqueRecomendados);
        }

        contenedor.innerHTML = "";

        if (idContenedor === "productosBusqueda" && lista.length === 0) {
            contenedor.innerHTML = `<p class="sinResultadosBuscador">${
                hayFiltrosBuscadorActivos()
                    ? "No hay publicaciones con esos filtros."
                    : "No encontramos publicaciones."
            }</p>`;
            return;
        }

        let feedInsertado = false;
        let recomendadosInsertados = false;

        for (const [indiceTarjeta, producto] of lista.entries()) {

            const tarjeta = document.createElement("article");

            tarjeta.classList.add("producto");

            // Todas las publicaciones de una tienda con plan "Tienda destacada" salen en dorado animado.
            if (tiendaDestacadaNivan(producto.vendedorId)) tarjeta.classList.add("productoDorado");

            const esAnuncioArriba = idsAnunciosMarketplaceNivan.has(producto.id)
                && (idContenedor === "productos" || (idContenedor === "productosBusqueda" && ordenActual === "relevancia"));

            // Tocando cualquier parte de la tarjeta se abre la publicación.
            // Los botones/enlaces internos usan stopPropagation para
            // que hagan su propia acción sin abrir el producto también.
            tarjeta.style.cursor = "pointer";
            tarjeta.onclick = function() {
                abrirProducto(producto.id);
            };

            tarjeta.innerHTML = `
<button type="button"
    class="favoritoProductoBtn ${favoritos.includes(producto.id) ? 'activo' : ''}"
    onclick="event.stopPropagation(); toggleFavorito(${producto.id})"
>
    ${favoritos.includes(producto.id) ? '♥' : '♡'}
</button>
<button type="button"
    class="compartirProductoBtn"
    onclick="event.stopPropagation(); compartirProducto(${producto.id})"
>
    <img src="https://i.imgur.com/0lomIQh.png" alt="Compartir">
</button>
                <div class="imagenProductoWrap">
                    <img
        src="${escaparHTMLNivan(urlImagenNivan(producto.imagen))}"${atributosImagenNivan()}
        alt="${escaparHTMLNivan(producto.nombre)}"
    >
                    ${obtenerBadgesDestacadosHTML(producto, esAnuncioArriba)}
                </div>

                <div class="productoInfo">

                    <h3>
    ${escaparHTMLNivan(producto.nombre)}
</h3>

                    ${producto.marca ? `<p class="marcaProducto">${escaparHTMLNivan(producto.marca)}</p>` : ""}

                    <p class="precio">
                        ${simboloMonedaNivan(producto.pais)}${producto.precio.toLocaleString("es-AR")}
                    </p>

                    <p class="vendedor vendedorClickeable" onclick="event.stopPropagation(); abrirPerfilVendedorDesdeProducto(${producto.id})">
                        Vendido por ${obtenerNombreVendedorProducto(producto)}
                    </p>

                    ${obtenerEtiquetaVendedorHTML(producto)}

                    <div class="filaBotonesProducto">
                        <button type="button" class="botonComprarRapidoNivan" onclick="event.stopPropagation(); comprarAhoraNivan(${producto.id})">
                            Comprar
                        </button>
                        <button type="button" onclick="event.stopPropagation(); agregarAlCarrito(${producto.id})">
                            Agregar al carrito
                        </button>
                    </div>

                </div>
            `;

            contenedor.appendChild(tarjeta);

            if (esHomeCompleto && bloqueFeed && bloqueRecomendados) {
                // 3 publicaciones por fila: el feed va después de 2 filas
                // y los recomendados después de 4 filas.
                if (indiceTarjeta === 5) {
                    contenedor.appendChild(bloqueFeed);
                    feedInsertado = true;
                }
                if (indiceTarjeta === 11) {
                    contenedor.appendChild(bloqueRecomendados);
                    recomendadosInsertados = true;
                }
            }
        }

        // Si hay menos publicaciones que las necesarias, quedan al final.
        if (esHomeCompleto && bloqueFeed && bloqueRecomendados) {
            if (!feedInsertado) contenedor.appendChild(bloqueFeed);
            if (!recomendadosInsertados) contenedor.appendChild(bloqueRecomendados);

            renderizarFeedNivan();
            renderizarRecomendadosNivan();
        }
    }

// ORDENAR RESULTADOS

function ordenarProductos(lista, criterio) {
    // Todos los resultados del buscador pasan por acá, así que los
    // filtros de precio, talle y color se aplican siempre.
    const copia = lista.filter(pasaFiltrosBuscador);

    if (criterio === "relevancia") return priorizarDestacadosNivan(copia);

    if (criterio === "precio_asc") {
        copia.sort(function(a, b) { return a.precio - b.precio; });
    } else if (criterio === "precio_desc") {
        copia.sort(function(a, b) { return b.precio - a.precio; });
    } else if (criterio === "nuevos") {
        copia.sort(function(a, b) { return b.id - a.id; });
    }

    return copia;
}

function cambiarOrden(criterio) {
    ordenActual = criterio;
    mostrarProductos(ordenarProductos(resultadosBuscadorActuales, ordenActual), "productosBusqueda");
}

// FILTRAR POR CATEGORÍA

function filtrarCategoria(categoria, boton) {

    const botones =
        document.querySelectorAll(".categoriaBtn");

    botones.forEach(function(btn) {
        btn.classList.remove("activo");
    });

    boton.classList.add("activo");

    if (categoria !== "Todo") registrarBusquedaNivan(categoria.toLowerCase());

    if (categoria === "Todo") {

        resultadosBuscadorActuales = productos;

    } else {

        resultadosBuscadorActuales =
            productos.filter(function(producto) {

                return producto.categoria === categoria;

            });
    }

    mostrarProductos(ordenarProductos(resultadosBuscadorActuales, ordenActual), "productosBusqueda");
  }

  // Se llama al tocar una etiqueta/hashtag (ej. desde el detalle de una
  // publicación): cierra el detalle, va a "Buscador y categorías" y
  // muestra todas las publicaciones que tengan ese mismo hashtag.
  function buscarPorEtiqueta(etiqueta) {
      if (typeof cerrarProducto === "function") {
          cerrarProducto();
      }

      const etiquetaNormalizada = "#" + String(etiqueta).replace(/^#+/, "").toLowerCase();

      registrarBusquedaNivan(etiquetaNormalizada);

      irAPagina("paginaBuscador");

      // Al buscar por hashtag no queda ninguna categoría tildada: se
      // activa "Todo" y se filtra por el hashtag en el campo de texto.
      document.querySelectorAll(".categoriaBtn").forEach(function(btn) {
          btn.classList.remove("activo");
      });
      const botonTodo = document.querySelector(".categoriaBtn");
      if (botonTodo) botonTodo.classList.add("activo");

      const buscador = document.getElementById("buscador");
      if (buscador) buscador.value = etiquetaNormalizada;

      resultadosBuscadorActuales = productos.filter(function(producto) {
          const etiquetasProducto = Array.isArray(producto.etiquetas)
              ? producto.etiquetas.map(function(e) { return e.toLowerCase(); })
              : [];
          return etiquetasProducto.includes(etiquetaNormalizada);
      });

      mostrarProductos(ordenarProductos(resultadosBuscadorActuales, ordenActual), "productosBusqueda");
  }

  
