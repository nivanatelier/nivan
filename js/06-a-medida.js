// ==============================
// NIVAN A MEDIDA
// ==============================
  
function toggleSeccionMedida() {

    const seccion =
        document.getElementById("aMedida");

    seccion.classList.toggle("abierta");

    if (
        seccion.classList.contains("abierta")
    ) {

        seccion.scrollIntoView({
            behavior: "smooth"
        });

    }
}
  function abrirMedida(tipo = "") {
    const formulario = document.getElementById("formularioMedida");

    // Ocultamos el banner de "inspiración" cada vez que se abre el
    // formulario; pedirAMedidaDesdeProducto() lo vuelve a mostrar
    // después de llamar a esta función, cuando corresponde.
    const bannerInspiracion = document.getElementById("bannerInspiracionReventa");
    if (bannerInspiracion) bannerInspiracion.style.display = "none";

    // Si tocás nuevamente la misma opción, se cierra.
    if (formulario.style.display === "block" && tipoSolicitudMedida === tipo) {
        formulario.style.display = "none";
        tipoSolicitudMedida = "";
        return;
    }

    tipoSolicitudMedida = tipo;
    formulario.style.display = "block";
    prepararEnvioMedidaNivan();


    // OCULTAR TODAS LAS OPCIONES

    document
        .getElementById("campoDisenoExistente")
        .style.display = "none";

    document
        .getElementById("campoFotoReferencia")
        .style.display = "none";

    document
        .getElementById("campoDescripcionIdea")
        .style.display = "none";


    // ELEGIR DISEÑO

    if (tipo === "diseno") {

        document
            .getElementById(
                "tituloFormularioMedida"
            )
            .textContent =
            "Elegí tu diseño";

        document
            .getElementById(
                "campoDisenoExistente"
            )
            .style.display = "block";
    }


    // SUBIR IDEA

    if (tipo === "idea") {

        document
            .getElementById(
                "tituloFormularioMedida"
            )
            .textContent =
            "Subí tu idea";

        document
            .getElementById(
                "campoFotoReferencia"
            )
            .style.display = "block";

        document
            .getElementById(
                "campoDescripcionIdea"
            )
            .style.display = "block";
    }


    // PEDIR DISEÑADOR

    if (tipo === "disenador") {

        document
            .getElementById(
                "tituloFormularioMedida"
            )
            .textContent =
            "Contanos qué imaginás";

        document
            .getElementById(
                "campoDescripcionIdea"
            )
            .style.display = "block";
    }


    formulario.scrollIntoView({
        behavior: "smooth"
    });
}

// Se dispara desde una publicación de un revendedor: la tomamos
// como inspiración y armamos la solicitud a medida precargada.
function pedirAMedidaDesdeProducto(id) {
    const producto = productos.find(function(p) {
        return p.id === id;
    });

    if (!producto) return;

    cerrarProducto();
    irAPagina("paginaHome");

    abrirMedida("idea");

    const banner = document.getElementById("bannerInspiracionReventa");
    if (banner) banner.style.display = "block";

    const descripcion = document.getElementById("descripcionIdea");
    if (descripcion) {
        descripcion.value =
            "Inspirado en: " + producto.nombre + " (vendido por " + obtenerNombreVendedorProducto(producto) + ").";
    }
}

// ==============================
// PRESUPUESTO MÍNIMO A MEDIDA
// ==============================

const presupuestosMinimos = {

    "Vestido": 55000,

    "Remera": 25000,

    "Blusa": 28000,

    "Pantalón": 40000,

    "Falda": 30000,

    "Campera": 70000,

    "Otro": 30000

};


// Uruguay: mismos criterios, en pesos uruguayos (el tope de precio por prenda allá es UYU 7.000,
// así que los mínimos de Argentina no se podrían ni escribir).
const presupuestosMinimosUY = {
    "Vestido": 1500, "Remera": 700, "Blusa": 800, "Pantalón": 1100, "Falda": 850, "Campera": 2000, "Otro": 800
};

function obtenerPresupuestoMinimo() {

    const tipoPrenda =
        document.getElementById(
            "tipoPrendaMedida"
        ).value;


    const esUY = typeof paisActualMedidaNivan === "function" && paisActualMedidaNivan() === "UY";

    let minimo = esUY
        ? (presupuestosMinimosUY[tipoPrenda] || 700)
        : (presupuestosMinimos[tipoPrenda] || 25000);


    // QUIERO QUE ME DISEÑEN ALGO
    // Tiene un presupuesto mínimo más elevado

    if (tipoSolicitudMedida === "disenador") {

        minimo = minimo + (esUY ? 700 : 25000);

    }


    return minimo;

}


// CUANDO CAMBIA EL TIPO DE PRENDA

document
    .getElementById("tipoPrendaMedida")
    .addEventListener("change", function() {

        const tipoPrenda = this.value;

        const caja =
            document.getElementById(
                "presupuestoMinimo"
            );

        const texto =
            document.getElementById(
                "textoPresupuestoMinimo"
            );

        const detalle =
            document.getElementById(
                "detallePresupuestoMinimo"
            );


        if (tipoPrenda === "") {

            caja.style.display = "none";

            return;

        }


        const minimo =
            obtenerPresupuestoMinimo();


        caja.style.display = "block";


        texto.textContent =
            "Presupuesto mínimo: " + simboloMonedaNivan() +
            minimo.toLocaleString("es-AR");


        detalle.textContent =
            "Ingresá un presupuesto igual o superior al mínimo indicado. El precio final puede variar según los materiales y la complejidad.";

    });


// VALIDAR MIENTRAS ESCRIBE

document
    .getElementById("presupuestoMedida")
    .addEventListener("input", function() {

        const presupuesto =
            Number(this.value);


        const minimo =
            obtenerPresupuestoMinimo();


        const mensaje =
            document.getElementById(
                "mensajeErrorPresupuesto"
            );


        if (
            this.value !== "" &&
            presupuesto < minimo
        ) {

            this.classList.add(
                "inputError"
            );


            mensaje.textContent =
                "El presupuesto mínimo es " + simboloMonedaNivan() +
                minimo.toLocaleString("es-AR");


            mensaje.style.display =
                "block";

        } else {

            this.classList.remove(
                "inputError"
            );


            mensaje.style.display =
                "none";

        }

    });

// ENVIAR SOLICITUD

document
    .getElementById("enviarSolicitudMedida")
    .addEventListener("click", function() {

        if (!usuarioActual) {
            alert("Iniciá sesión o creá tu cuenta para enviar la solicitud.");
            abrirCuenta();
            return;
        }


        const tipoPrenda =
            document
                .getElementById(
                    "tipoPrendaMedida"
                )
                .value;
      const presupuesto =
    Number(
        document
            .getElementById(
                "presupuestoMedida"
            )
            .value
    );

const minimo =
    obtenerPresupuestoMinimo();

const inputPresupuesto =
    document.getElementById(
        "presupuestoMedida"
    );

const mensajePresupuesto =
    document.getElementById(
        "mensajeErrorPresupuesto"
    );

        const altura =
            document
                .getElementById(
                    "alturaMedida"
                )
                .value;

      
      const emailMedida =
    document
        .getElementById(
            "emailMedida"
        )
        .value.trim();


       if (
    tipoPrenda === "" ||
    altura === "" ||
    emailMedida === ""
) {

    alert(
        "Completá el tipo de prenda, tu altura y tu correo electrónico."
    );

    return;
       }

      const envioMedida = leerEnvioMedidaNivan();
      if (!envioMedida) {
          alert("Completá tu nombre, dirección, ciudad, " + (paisActualMedidaNivan() === "UY" ? "departamento" : "provincia") + " y código postal para poder enviarte la prenda.");
          return;
      }

      if (!esEmailValidoNivan(emailMedida)) {
          alert(MENSAJE_EMAIL_INVALIDO_NIVAN);
          document.getElementById("emailMedida").focus();
          return;
      }

      if (
    presupuesto < minimo ||
    document.getElementById(
        "presupuestoMedida"
    ).value === ""
) {

    inputPresupuesto.classList.add(
        "inputError"
    );

    mensajePresupuesto.textContent =
        "⚠️ El presupuesto ingresado es menor al mínimo permitido para esta prenda. El mínimo es " + simboloMonedaNivan() +
        minimo.toLocaleString("es-AR");

    mensajePresupuesto.style.display =
        "block";

    inputPresupuesto.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    inputPresupuesto.focus();

    return;
      }

        // Se junta todo lo que se completó en el formulario y se manda al servidor, que lo envía por mail a Nivan.
        const campos = [];
        document.querySelectorAll("#formularioMedida input, #formularioMedida select, #formularioMedida textarea").forEach(function (el) {
            if (!el.id || el.type === "file" || el.type === "button" || el.type === "hidden") return;
            if (el.offsetParent === null) return;   // campos que no se están mostrando
            if (el.closest("#bloqueEnvioMedida")) return;   // la dirección viaja aparte, en "envio"
            let valor = el.type === "checkbox" ? (el.checked ? "Sí" : "") : String(el.value || "").trim();
            if (el.tagName === "SELECT" && el.selectedIndex >= 0 && el.value) valor = el.options[el.selectedIndex].text.trim();
            if (!valor) return;
            const rotulo = document.querySelector('#formularioMedida label[for="' + el.id + '"]');
            campos.push({ etiqueta: rotulo ? rotulo.textContent.replace(/\s+/g, " ").trim() : el.id, valor: valor });
        });
        const banner = document.getElementById("bannerInspiracionReventa");
        if (banner && banner.style.display !== "none") campos.push({ etiqueta: "Origen", valor: "Pedido inspirado en una publicación de otra tienda" });

        const numeroSolicitud =
            Math.floor(
                100000 +
                Math.random() * 900000
            );

        const botonEnviar = document.getElementById("enviarSolicitudMedida");
        if (botonEnviar.disabled) return;
        botonEnviar.disabled = true;
        // La foto de referencia (si la subió) se manda junto con el pedido y llega adjunta en el mail.
        leerFotoReferenciaMedidaNivan().then(function (foto) {
            if (foto === false) {
                botonEnviar.disabled = false;
                alert("No pudimos leer la foto de referencia. Probá con otra imagen o quitala para enviar la solicitud.");
                return null;
            }
            const datos = { email: emailMedida, numero: numeroSolicitud, pais: paisActualMedidaNivan(), envio: envioMedida, campos: campos };
            if (foto) datos.foto = foto;
            return apiNivan("/api/medida", datos).then(function (r) {
                botonEnviar.disabled = false;
                if (!r.ok) { alert(r.error || "No pudimos enviar tu solicitud. Probá de nuevo."); return; }
                mostrarResultadoSolicitudMedida(numeroSolicitud, emailMedida);
            });
        });
    });

// Devuelve la foto de referencia como texto (data URL), null si no hay foto, o false si no se pudo leer.
function leerFotoReferenciaMedidaNivan() {
    const el = document.getElementById("fotoReferencia");
    const archivo = el && el.offsetParent !== null && el.files && el.files[0];
    if (!archivo) return Promise.resolve(null);
    return new Promise(function (ok) {
        const lector = new FileReader();
        lector.onload = function () { const t = String(lector.result || ""); ok(t.indexOf("data:image/") === 0 ? t : false); };
        lector.onerror = function () { ok(false); };
        lector.readAsDataURL(archivo);
    });
}

function mostrarResultadoSolicitudMedida(numeroSolicitud, emailMedida) {


        const resultado =
            document.getElementById(
                "resultadoMedida"
            );


        resultado.innerHTML = `

    <strong>
        ✨ ¡Solicitud enviada con éxito!
    </strong>

    <br><br>

    ¡Gracias por elegir NIVAN!

    <br><br>

    Tu número de solicitud es:

    <strong>
        #${numeroSolicitud}
    </strong>

    <br><br>

    📧 Te vamos a responder al correo:

    <strong>
        ${escaparHTMLNivan(emailMedida)}
    </strong>

    <br><br>

    Nuestro equipo revisará tu solicitud y
    nos pondremos en contacto con vos dentro
    de las próximas <strong>24 a 48 horas hábiles</strong>
    para continuar con tu pedido.

    <br><br>

    💬 Te contactaremos para confirmar los
    detalles, el diseño, los materiales,
    el presupuesto y los próximos pasos.

    <br><br>

    <strong>
        ✨ ¡Gracias por confiar en NIVAN!
    </strong>

`;


        resultado.style.display = "block";


        resultado.scrollIntoView({
            behavior: "smooth"
        });
}


// ==============================
// DATOS DE ENVÍO DE LA SOLICITUD A MEDIDA
// ==============================
// La dirección depende del país: de ahí sale la moneda y el medio de pago, así no hay que adivinarlos.
function paisActualMedidaNivan() {
    return (typeof paisNivan === "function" && paisNivan()) || "AR";
}

function prepararEnvioMedidaNivan() {
    const pais = paisActualMedidaNivan();
    const d = datosPaisNivan(pais);
    const nota = document.getElementById("paisEnvioMedida");
    if (nota) nota.textContent = d.bandera + " Envío a " + d.nombre + " · " + d.moneda;
    const etiqueta = document.getElementById("etiquetaRegionMedida");
    if (etiqueta) etiqueta.textContent = pais === "UY" ? "Departamento" : "Provincia";
    const nombre = document.getElementById("nombreMedida");
    if (nombre && !nombre.value && typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.nombre) nombre.value = usuarioActual.nombre;
    // Si tiene una dirección guardada (la predeterminada), la usamos de punto de partida.
    try {
        const dirs = typeof obtenerDireccionesNivan === "function" ? obtenerDireccionesNivan() : [];
        const d0 = dirs.find(function (x) { return x.predeterminada; }) || dirs[0];
        if (d0 && !document.getElementById("direccionMedida").value) {
            document.getElementById("direccionMedida").value = d0.direccion || "";
            document.getElementById("ciudadMedida").value = d0.ciudad || "";
            document.getElementById("codigoPostalMedida").value = d0.codigoPostal || "";
        }
    } catch (e) { /* sin direcciones guardadas */ }
}

// Devuelve los datos de envío, o null si falta alguno.
function leerEnvioMedidaNivan() {
    const v = function (id) { return String(document.getElementById(id).value || "").trim(); };
    const envio = { nombre: v("nombreMedida"), direccion: v("direccionMedida"), ciudad: v("ciudadMedida"), region: v("regionMedida"), codigoPostal: v("codigoPostalMedida") };
    return Object.keys(envio).every(function (k) { return envio[k]; }) ? envio : null;
}
