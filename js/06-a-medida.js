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


function obtenerPresupuestoMinimo() {

    const tipoPrenda =
        document.getElementById(
            "tipoPrendaMedida"
        ).value;


    let minimo =
        presupuestosMinimos[tipoPrenda] || 25000;


    // QUIERO QUE ME DISEÑEN ALGO
    // Tiene un presupuesto mínimo más elevado

    if (tipoSolicitudMedida === "disenador") {

        minimo = minimo + 25000;

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

        const numeroSolicitud =
            Math.floor(
                100000 +
                Math.random() * 900000
            );


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

    📧 Enviaremos una confirmación a:

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

    });
