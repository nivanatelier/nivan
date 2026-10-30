// ==============================
// HERRAMIENTAS PREMIUM (panel del vendedor)
// Planes mensuales de publicidad para tiendas. Cada plan incluye al anterior:
//   Vidriera         → 1 prenda anunciada en el feed de Perfiles (entre las publicaciones de la gente)
//   Vidriera 3D      → lo anterior + 1 publicidad 3D en el feed de Perfiles (todavía sin configuración)
//   Tienda destacada → lo anterior + 1 prenda anunciada en el Marketplace (una de las 3 publicidades
//                      del inicio del feed, que se renuevan al reiniciarse), todas tus publicaciones
//                      en dorado animado y estadísticas
// Cada plan se contrata mensual o anual (el anual tiene descuento) y vence el mismo día y a la misma
// hora en que se contrató.
// Con un plan activo no se ofrecen los otros: solo se renueva o se cancela.
// Todo se guarda en este dispositivo, como el resto de la app (clave "nivanPremium").
// ==============================
const DESCUENTO_ANUAL_NIVAN = 0.2;      // 20% menos que pagar 12 meses sueltos
const ANUNCIOS_MARKETPLACE_NIVAN = 3;   // publicidades que salen al inicio del Marketplace
const PREMIUM_MS_DIA_NIVAN = 24 * 60 * 60 * 1000;

const PLANES_PREMIUM_NIVAN = [
    {
        id: "vidriera",
        nivel: 1,
        icono: "🪟",
        nombre: "Vidriera",
        precio: { AR: 9900, UY: 290 },
        resumen: "Tu prenda a la vista de toda la comunidad, todo el mes.",
        incluye: [
            "1 prenda tuya anunciada en el feed de los perfiles durante todo el mes, entre las publicaciones de la gente",
            "Sale en la tira de publicidad que se desliza entre las publicaciones",
            "Podés sacar la prenda anunciada y poner otra de tus publicaciones cuando quieras, sin costo"
        ]
    },
    {
        id: "vidriera3d",
        nivel: 2,
        icono: "🧍",
        nombre: "Vidriera 3D",
        precio: { AR: 19900, UY: 580 },
        recomendado: true,
        resumen: "Publicidad con modelos 3D y tus prendas en 3D + Plan publicidad vidriera.",
        incluye: [
           "1 publicidad 3D, hacés un personaje 3D y lo publicitás con las prendas que vendés, entre el feed de perfiles en grande",
           "1 publicidad en el feed de perfiles",
           "Podés cambiar tus publicidades cuando quieras",
        ],
        porque: [
           "Llama más la atención: un personaje 3D destaca entre tantas fotos planas.",
            "Compite con menos anuncios: hay 3 espacios 3D por bloque, contra 5 miniaturas en la tira de la Vidriera.",
        ]
    },
    {
        id: "destacada",
        nivel: 3,
        icono: "⭐",
        nombre: "Tienda destacada",
        precio: { AR: 34900, UY: 990 },
        mejor: true,
        resumen:  "Publicidad en dorado en el marketplace + Publicidad carrusel de anuncios + Plan publicidad 3D + Plan publicidad vidriera + Estadisticas .",
  
        incluye: [
          "Todas tus publicaciones destacan en dorado y destacás",
          "Tu tienda tiene más visibilidad en los feed de marketplace",
           "1 Publicidad en marketplace, cambiándola cuántas veces quieras",
           "1 publicidad Vidriera 3D",
           "1 publicidad Vidriera",
           "Podés cambiar tus publicidades cuando quieras",
                ],
            
        porque: [
            "Es la única que te pone en el Marketplace, donde la gente va a comprar; las otras publicitan entre las publicaciones que sube la gente.",
            "Tenés 4 anuncios a la vez (Vidriera + 3D + marketplace + carrusel) y cambiás cada uno por una.",
            "De esta manera tus publicidades se muestran por toda la app",
            "Trae todo lo de las demás opciones premium"
        ]
    }
];

// Espacios de anuncio. "proximamente": todavía no se puede elegir nada ahí.
const ESPACIOS_PREMIUM_NIVAN = {
    feed: { titulo: "Anuncio en el feed de Perfiles", icono: "🪟", nivel: 1 },
    d3: { titulo: "Publicidad 3D", icono: "🧍", nivel: 2, proximamente: true },
    home: { titulo: "Anuncio en el Marketplace", icono: "🛍️", nivel: 3 }
};

// ---- Datos ----
let cachePremiumNivan = null;

function leerPremiumNivan() {
    if (!cachePremiumNivan) cachePremiumNivan = leerJSONNivan("nivanPremium", {}) || {};
    return cachePremiumNivan;
}

function guardarPremiumNivan(datos) {
    cachePremiumNivan = datos;
    guardarJSONNivan("nivanPremium", datos);
}

window.addEventListener("storage", function(e) {
    if (e.key === "nivanPremium") cachePremiumNivan = null;
});

function planPremiumNivan(idPlan) {
    return PLANES_PREMIUM_NIVAN.find(function(p) { return p.id === idPlan; }) || null;
}

function precioPlanPremiumNivan(plan) {
    return plan.precio[paisNivan() || "AR"] || plan.precio.AR;
}

function textoPrecioPremiumNivan(monto) {
    return simboloMonedaNivan() + Number(monto).toLocaleString("es-AR");
}

function precioAnualPlanPremiumNivan(plan) {
    const anual = precioPlanPremiumNivan(plan) * 12 * (1 - DESCUENTO_ANUAL_NIVAN);
    return Math.round(anual / 10) * 10;
}

function precioPeriodoPremiumNivan(plan, periodo) {
    return periodo === "anual" ? precioAnualPlanPremiumNivan(plan) : precioPlanPremiumNivan(plan);
}

function mesesPeriodoPremiumNivan(periodo) {
    return periodo === "anual" ? 12 : 1;
}

// Suma meses de calendario conservando el día y la hora exactos (si el mes no tiene ese día, usa el último).
function sumarMesesNivan(ts, meses) {
    const f = new Date(ts);
    const dia = f.getDate();
    f.setDate(1);
    f.setMonth(f.getMonth() + meses);
    const ultimo = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
    f.setDate(Math.min(dia, ultimo));
    return f.getTime();
}

// Suscripción vigente de una tienda (o null si no tiene o ya venció).
function suscripcionPremiumNivan(idVendedor) {
    const s = leerPremiumNivan()[idVendedor];
    return s && s.vence > Date.now() && planPremiumNivan(s.plan) ? s : null;
}

function nivelPremiumNivan(idVendedor) {
    const s = suscripcionPremiumNivan(idVendedor);
    return s ? planPremiumNivan(s.plan).nivel : 0;
}

function tiendaDestacadaNivan(idVendedor) {
    return !!idVendedor && nivelPremiumNivan(idVendedor) >= 3;
}

// Prendas activas de la tienda del usuario (en el país actual), la más nueva al final.
function misPrendasAnunciablesNivan() {
    if (!usuarioActual) return [];
    return productos.filter(function(p) { return p.vendedorId === usuarioActual.id; });
}

// Orden estable que rota cada día, para que todos los anunciantes tengan su turno.
function rotarPorDiaNivan(lista) {
    if (lista.length < 2) return lista;
    const k = Math.floor(Date.now() / PREMIUM_MS_DIA_NIVAN) % lista.length;
    return lista.slice(k).concat(lista.slice(0, k));
}

// ---- Estadísticas de anuncios (vistas y toques) ----
function registrarEventoAnuncioNivan(idVendedor, tipo, campo) {
    if (usuarioActual && usuarioActual.id === idVendedor) return;
    const premium = leerPremiumNivan();
    const s = premium[idVendedor];
    if (!s) return;
    s.stats = s.stats || {};
    const e = s.stats[tipo] = s.stats[tipo] || { vistas: 0, toques: 0 };
    e[campo]++;
    guardarPremiumNivan(premium);
}

function tocarAnuncioNivan(idVendedor, tipo, idProducto) {
    registrarEventoAnuncioNivan(idVendedor, tipo, "toques");
    abrirProducto(idProducto);
}

// Cuenta una vista cuando el anuncio del feed queda realmente a la vista (una vez por anuncio dibujado).
(function activarConteoVistasAnunciosNivan() {
    if (typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(function(registros) {
        registros.forEach(function(r) {
            if (!r.isIntersecting) return;
            observador.unobserve(r.target);
            const partes = String(r.target.dataset.anuncio || "").split("|");
            if (partes.length === 2) registrarEventoAnuncioNivan(partes[0], partes[1], "vistas");
        });
    }, { threshold: 0.5 });

    setInterval(function() {
        if (document.hidden) return;
        document.querySelectorAll("[data-anuncio]:not([data-observado])").forEach(function(el) {
            el.dataset.observado = "1";
            observador.observe(el);
        });
    }, 2000);
})();

// ---- Anuncios activos que se muestran en la app ----
// tipo: "feed" | "d3" | "home". Solo salen si la tienda tiene el plan vigente y la
// prenda anunciada sigue activa en este país.
function anunciosPremiumActivosNivan(tipo) {
    // Los espacios "proximamente" (Vidriera 3D) todavía no muestran ninguna publicación.
    if (ESPACIOS_PREMIUM_NIVAN[tipo].proximamente) return [];

    const premium = leerPremiumNivan();
    const nivelMin = ESPACIOS_PREMIUM_NIVAN[tipo].nivel;
    const salida = [];

    Object.keys(premium).sort().forEach(function(idVendedor) {
        if (nivelPremiumNivan(idVendedor) < nivelMin) return;

        const anuncio = premium[idVendedor].anuncios && premium[idVendedor].anuncios[tipo];
        if (!anuncio) return;

        const prenda = productos.find(function(p) { return p.id === anuncio.productoId && p.vendedorId === idVendedor; });
        if (!prenda) return;

        const id = escaparHTMLNivan(idVendedor);
        salida.push({
            id: prenda.id,
            clave: idVendedor + "|" + tipo,
            inicio: premium[idVendedor].inicio || 0,
            nombre: prenda.nombre,
            precio: textoPrecioPremiumNivan(prenda.precio),
            imagen: urlImagenNivan(prenda.imagen),
            alClick: "tocarAnuncioNivan('" + id + "', '" + tipo + "', " + prenda.id + ")"
        });
    });

    // El carrusel del Home del Marketplace va por antigüedad de contratación: las más recientes primero.
    if (tipo === "home") {
        return salida.sort(function(a, b) { return (b.inicio || 0) - (a.inicio || 0); });
    }

    return rotarPorDiaNivan(salida);
}

// Hasta "maximo" anuncios por bloque del feed; si hay más anunciantes, cada bloque muestra otros.
function anunciosPremiumPorBloqueNivan(tipo, bloque, maximo) {
    const todos = anunciosPremiumActivosNivan(tipo);
    if (todos.length <= maximo) return todos;
    const inicio = (bloque * maximo) % todos.length;
    const salida = [];
    for (let i = 0; i < maximo; i++) salida.push(todos[(inicio + i) % todos.length]);
    return salida;
}

// Prenda que una tienda destacada anuncia en el Marketplace (o null).
function idPrendaAnunciadaMarketplaceNivan(idVendedor) {
    if (!tiendaDestacadaNivan(idVendedor)) return null;
    const a = leerPremiumNivan()[idVendedor].anuncios;
    return a && a.home ? a.home.productoId : null;
}

// Ids de las publicidades que están dentro del feed en el último orden calculado (para rotularlas "Publicidad").
let idsAnunciosMarketplaceNivan = new Set();
// Cada cuántas publicaciones normales vuelve a aparecer un grupo de publicidades más antiguas al ir bajando.
const SEPARACION_ANUNCIOS_MARKETPLACE_NIVAN = 12;

// Las publicidades de tiendas destacadas se ordenan por antigüedad de contratación:
// arriba de todo salen las 3 más recientes y, a medida que se baja, van apareciendo grupos de 3
// cada vez más antiguos. El resto de las publicaciones conserva su orden.
// Se usa en el Home, en categorías y en los resultados de búsqueda.
function priorizarDestacadosNivan(lista) {
    idsAnunciosMarketplaceNivan = new Set();

    const premium = leerPremiumNivan();
    const candidatas = [];
    Object.keys(premium).sort().forEach(function(idVendedor) {
        const idPrenda = idPrendaAnunciadaMarketplaceNivan(idVendedor);
        if (idPrenda === null || idPrenda === undefined) return;
        const prenda = lista.find(function(p) { return p.id === idPrenda && p.vendedorId === idVendedor; });
        if (prenda) candidatas.push({ prenda: prenda, inicio: premium[idVendedor].inicio || 0 });
    });
    if (!candidatas.length) return lista;

    // Más recientes primero.
    candidatas.sort(function(a, b) { return b.inicio - a.inicio; });
    const anuncios = candidatas.map(function(c) { return c.prenda; });
    anuncios.forEach(function(p) { idsAnunciosMarketplaceNivan.add(p.id); });

    const resto = lista.filter(function(p) { return !idsAnunciosMarketplaceNivan.has(p.id); });

    const salida = anuncios.slice(0, ANUNCIOS_MARKETPLACE_NIVAN);
    let pos = 0;
    for (let i = ANUNCIOS_MARKETPLACE_NIVAN; i < anuncios.length; i += ANUNCIOS_MARKETPLACE_NIVAN) {
        salida.push.apply(salida, resto.slice(pos, pos + SEPARACION_ANUNCIOS_MARKETPLACE_NIVAN));
        pos += SEPARACION_ANUNCIOS_MARKETPLACE_NIVAN;
        salida.push.apply(salida, anuncios.slice(i, i + ANUNCIOS_MARKETPLACE_NIVAN));
    }
    salida.push.apply(salida, resto.slice(pos));
    return salida;
}

// ==============================
// PANTALLA "HERRAMIENTAS PREMIUM"
// ==============================
let vistaPremiumNivan = { modo: "principal", tipo: null };

function asegurarPantallaPremiumNivan() {
    let pantalla = document.getElementById("pantallaPremiumNivan");
    if (!pantalla) {
        pantalla = document.createElement("div");
        pantalla.className = "pantallaCompleta";
        pantalla.id = "pantallaPremiumNivan";
        pantalla.innerHTML = `<div class="tituloPantallaCompleta">
                <button type="button" class="volverAtras" onclick="cerrarPantallaCompleta('pantallaPremiumNivan')">← Volver</button>
                <h2>⭐ Herramientas premium</h2>
                <p>Mostrá tu tienda a más gente con publicidad dentro de NIVAN.</p>
            </div>
            <div class="contenidoPremiumNivan" id="contenidoPremiumNivan"></div>`;
        document.body.appendChild(pantalla);
    }
    return document.getElementById("contenidoPremiumNivan");
}

function abrirHerramientasPremiumNivan() {
    if (!usuarioActual) {
        alert("Iniciá sesión o creá tu cuenta primero.");
        abrirCuenta();
        return;
    }
    if (!usuarioTieneTiendaNivan(usuarioActual.id)) {
        alert("Para usar las herramientas premium primero necesitás tu tienda: creala en Panel de Vendedor → Mi tienda.");
        return;
    }
    vistaPremiumNivan = { modo: "principal", tipo: null };
    renderizarHerramientasPremiumNivan();
    abrirPantallaCompleta("pantallaPremiumNivan");
}

function renderizarHerramientasPremiumNivan() {
    const cont = asegurarPantallaPremiumNivan();
    if (vistaPremiumNivan.modo === "elegir") cont.innerHTML = htmlElegirPrendaPremiumNivan(vistaPremiumNivan.tipo);
    else if (vistaPremiumNivan.modo === "mejorar" && suscripcionPremiumNivan(usuarioActual.id)) cont.innerHTML = htmlMejorarPlanPremiumNivan();
    else {
        vistaPremiumNivan = { modo: "principal", tipo: null };
        cont.innerHTML = htmlPrincipalPremiumNivan();
    }

    // En "Mejorar plan" se arranca parado en el plan que ya tenés.
    if (vistaPremiumNivan.modo === "mejorar") {
        requestAnimationFrame(function() {
            const tira = cont.querySelector(".planesPremiumNivan");
            const actual = cont.querySelector(".planPremiumNivan.actualPremiumNivan");
            if (!tira || !actual) return;
            tira.scrollLeft = actual.offsetLeft - (tira.clientWidth - actual.offsetWidth) / 2;
            actualizarPuntosPlanesPremiumNivan(tira);
        });
    }
}

function fechaPremiumNivan(ts) {
    return new Date(ts).toLocaleDateString("es-AR");
}

// Fecha y hora exactas de vencimiento (misma hora en que se contrató).
function fechaHoraPremiumNivan(ts) {
    const f = new Date(ts);
    return f.toLocaleDateString("es-AR") + " a las " + f.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function diasRestantesPremiumNivan(s) {
    return Math.max(0, Math.ceil((s.vence - Date.now()) / PREMIUM_MS_DIA_NIVAN));
}

function htmlEstadoPremiumNivan(s) {
    const plan = planPremiumNivan(s.plan);
    const dias = diasRestantesPremiumNivan(s);
    const hayMejor = PLANES_PREMIUM_NIVAN.some(function(p) { return p.nivel > plan.nivel; });
    const periodo = s.periodo === "anual" ? "anual" : "mensual";
    const pctAnual = Math.round(DESCUENTO_ANUAL_NIVAN * 100);

    // Con el plan pagado, el cuadro brilla igual que el plan: dorado (Tienda destacada) o plateado (Vidriera 3D).
    const metal = plan.id === "destacada" ? " metalOroNivan" : (plan.id === "vidriera3d" ? " metalPlataNivan" : "");

    return `<div class="estadoPremiumNivan${metal}">
        <p class="etiquetaPlanActivoNivan">Plan activo</p>
        <h3>${plan.icono} ${escaparHTMLNivan(plan.nombre)}</h3>
        <p class="datoPremiumNivan">Plan ${periodo} · vence el ${fechaHoraPremiumNivan(s.vence)} · ${dias === 1 ? "queda 1 día" : "quedan " + dias + " días"}</p>
        ${hayMejor ? `<button type="button" class="botonPremiumNivan" onclick="abrirMejorarPlanPremiumNivan()">⬆️ Mejorar plan</button>` : ""}
        <button type="button" class="botonPremiumNivan secundario" onclick="renovarPlanPremiumNivan('mensual')">🔄 Renovar 1 mes más · ${textoPrecioPremiumNivan(precioPeriodoPremiumNivan(plan, "mensual"))}</button>
        <button type="button" class="botonPremiumNivan secundario" onclick="renovarPlanPremiumNivan('anual')">🔄 Renovar 1 año más · ${textoPrecioPremiumNivan(precioPeriodoPremiumNivan(plan, "anual"))} (${pctAnual}% menos)</button>
        <p class="notaPremiumNivan" style="margin-bottom:0;">Si renovás antes de que venza, el tiempo nuevo se suma al que te queda: no perdés nada.</p>
    </div>`;
}


function htmlEspacioPremiumNivan(tipo, s) {
    const esp = ESPACIOS_PREMIUM_NIVAN[tipo];

    if (esp.proximamente) {
        return `<div class="espacioPremiumNivan">
            <div class="fotoVaciaPremiumNivan"></div>
            <div class="infoEspacioPremiumNivan">
                <strong>${esp.icono} ${esp.titulo}</strong>
                <p class="datoPremiumNivan">Próximamente.</p>
            </div>
        </div>`;
    }

    const anuncio = s.anuncios && s.anuncios[tipo];
    const prenda = anuncio ? productos.find(function(p) { return p.id === anuncio.productoId && p.vendedorId === usuarioActual.id; }) : null;

    const foto = prenda
        ? `<img src="${escaparHTMLNivan(urlImagenNivan(prenda.imagen))}"${atributosImagenNivan()} alt="">`
        : `<div class="fotoVaciaPremiumNivan">+</div>`;

    return `<div class="espacioPremiumNivan">
        ${foto}
        <div class="infoEspacioPremiumNivan">
            <strong>${esp.icono} ${esp.titulo}</strong>
            <p class="datoPremiumNivan">${prenda ? escaparHTMLNivan(prenda.nombre) : "Todavía no elegiste qué publicación anunciar."}</p>
            <div class="botonesPremiumNivan">
                <button type="button" class="botonPremiumNivan chico" onclick="abrirElegirPrendaPremiumNivan('${tipo}')">${prenda ? "🔁 Cambiar publicación" : "Elegir publicación"}</button>
                ${prenda ? `<button type="button" class="botonPremiumNivan secundario chico" onclick="quitarPrendaAnuncioNivan('${tipo}')">Sacar</button>` : ""}
            </div>
        </div>
    </div>`;
}

function htmlEstadisticasPremiumNivan(s) {
    const filas = Object.keys(ESPACIOS_PREMIUM_NIVAN).filter(function(tipo) {
        return !ESPACIOS_PREMIUM_NIVAN[tipo].proximamente;
    }).map(function(tipo) {
        const e = (s.stats && s.stats[tipo]) || { vistas: 0, toques: 0 };
        const tasa = e.vistas ? Math.round((e.toques / e.vistas) * 1000) / 10 : 0;
        return `<tr><td>${ESPACIOS_PREMIUM_NIVAN[tipo].icono} ${ESPACIOS_PREMIUM_NIVAN[tipo].titulo}</td><td>${e.vistas}</td><td>${e.toques}</td><td>${tasa}%</td></tr>`;
    }).join("");

    return `<h3 class="tituloSeccionPremiumNivan">Estadísticas de tus anuncios</h3>
        <table class="tablaPremiumNivan">
            <thead><tr><th>Anuncio</th><th>Vistas</th><th>Toques</th><th>% de toques</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>`;
}

// Orden en que se ven los planes: primero Tienda destacada, segundo Vidriera 3D.
const ORDEN_PLANES_VISTA_NIVAN = ["destacada", "vidriera3d", "vidriera"];

function planesEnOrdenVistaNivan() {
    return PLANES_PREMIUM_NIVAN.slice().sort(function(a, b) {
        return ORDEN_PLANES_VISTA_NIVAN.indexOf(a.id) - ORDEN_PLANES_VISTA_NIVAN.indexOf(b.id);
    });
}

// actual: la suscripción vigente (para "Mejorar plan") o null (para contratar).
function htmlTarjetaPlanPremiumNivan(plan, indice, actual) {
    const esActual = !!actual && actual.plan === plan.id;
    let cinta = plan.mejor ? "👑 La mejor opción" : (plan.recomendado ? "★ Recomendado" : "");
    if (esActual) cinta = "✓ Tu plan actual";

    let precioHtml;
    let botones;

    if (actual) {
        const periodo = actual.periodo === "anual" ? "anual" : "mensual";
        const precio = precioPeriodoPremiumNivan(plan, periodo);
        precioHtml = `${textoPrecioPremiumNivan(precio)} <span>/ ${periodo === "anual" ? "año" : "mes"}</span>`;

        if (esActual) {
            botones = `<button type="button" class="botonPremiumNivan" disabled>Es tu plan actual</button>`;
        } else {
            const dif = precio - precioPeriodoPremiumNivan(planPremiumNivan(actual.plan), periodo);
            botones = `<button type="button" class="botonPremiumNivan" onclick="mejorarPlanPremiumNivan('${plan.id}')">Mejorar a este plan · pagás ${textoPrecioPremiumNivan(dif)}</button>
                <p class="ahorroAnualPremiumNivan">Pagás solo lo que falta: la diferencia con tu plan actual. Tu plan sigue venciendo el mismo día y a la misma hora.</p>`;
        }
    } else {
        const anual = precioAnualPlanPremiumNivan(plan);
        const sinDescuento = precioPlanPremiumNivan(plan) * 12;
        const porcentaje = Math.round(DESCUENTO_ANUAL_NIVAN * 100);
        precioHtml = `${textoPrecioPremiumNivan(precioPlanPremiumNivan(plan))} <span>/ mes</span>`;
        botones = `<button type="button" class="botonPremiumNivan" onclick="elegirPlanPremiumNivan('${plan.id}', 'mensual')">Contratar este plan mensual</button>
            <button type="button" class="botonPremiumNivan anual" onclick="elegirPlanPremiumNivan('${plan.id}', 'anual')">Contratar plan anual · ${textoPrecioPremiumNivan(anual)} / año</button>
            <p class="ahorroAnualPremiumNivan">${porcentaje}% de descuento: ahorrás ${textoPrecioPremiumNivan(sinDescuento - anual)} frente a pagar 12 meses</p>`;
    }

    const metal = plan.mejor ? " metalOroNivan" : (plan.recomendado ? " metalPlataNivan" : "");

    return `<div class="planPremiumNivan${plan.mejor ? " mejor" : (plan.recomendado ? " recomendado" : "")}${metal}${cinta ? " conCintaNivan" : ""}${indice === 0 ? " enfocado" : ""}${esActual ? " actualPremiumNivan" : ""}">
        ${cinta ? `<span class="cintaRecomendadoNivan">${cinta}</span>` : ""}
        <h3>${plan.icono} ${escaparHTMLNivan(plan.nombre)}</h3>
        <p class="precioPlanPremiumNivan">${precioHtml}</p>
        <p class="datoPremiumNivan">${escaparHTMLNivan(plan.resumen)}</p>
        <ul class="listaPlanPremiumNivan">${plan.incluye.map(function(t) { return `<li>${escaparHTMLNivan(t)}</li>`; }).join("")}</ul>
        ${plan.porque ? `<div class="porquePremiumNivan">
            <strong>${plan.recomendado ? "¿Por qué está recomendada?" : "¿Por qué es mejor?"}</strong>
            <ul>${plan.porque.map(function(t) { return `<li>${escaparHTMLNivan(t)}</li>`; }).join("")}</ul>
        </div>` : ""}
        ${botones}
    </div>`;
}

// Los planes se deslizan hacia los costados; los puntitos marcan cuál se está viendo.
// Se calcula como mucho una vez por cuadro y solo se toca el DOM cuando cambia el plan visible.
let cuadroPuntosPlanesNivan = 0;
function actualizarPuntosPlanesPremiumNivan(tira) {
    if (cuadroPuntosPlanesNivan) return;
    cuadroPuntosPlanesNivan = requestAnimationFrame(function() {
        cuadroPuntosPlanesNivan = 0;
        const tarjeta = tira.firstElementChild;
        if (!tarjeta) return;
        const indice = Math.round(tira.scrollLeft / (tarjeta.offsetWidth + 12));
        if (tira.dataset.indiceVisto === String(indice)) return;
        tira.dataset.indiceVisto = String(indice);

        document.querySelectorAll("#puntosPlanesPremiumNivan span").forEach(function(punto, i) {
            punto.classList.toggle("activo", i === indice);
        });
        // El plan que se está viendo se agranda un poco.
        Array.prototype.forEach.call(tira.children, function(plan, i) {
            plan.classList.toggle("enfocado", i === indice);
        });
    });
}

function htmlTiraPlanesPremiumNivan(planes, actual) {
    return `<div class="planesPremiumNivan" onscroll="actualizarPuntosPlanesPremiumNivan(this)">
            ${planes.map(function(p, i) { return htmlTarjetaPlanPremiumNivan(p, i, actual); }).join("")}
        </div>
        <div class="puntosPlanesPremiumNivan" id="puntosPlanesPremiumNivan">
            ${planes.map(function(p, i) { return `<span${i === 0 ? ' class="activo"' : ""}></span>`; }).join("")}
        </div>`;
}

function htmlPrincipalPremiumNivan() {
    const actual = suscripcionPremiumNivan(usuarioActual.id);

    if (!actual) {
        return `
            <p class="notaPremiumNivan">Elegí plan mensual o anual (el anual tiene ${Math.round(DESCUENTO_ANUAL_NIVAN * 100)}% de descuento). Los planes más completos incluyen todo lo de los más simples. Deslizá para ver todos.</p>
            ${htmlTiraPlanesPremiumNivan(planesEnOrdenVistaNivan(), null)}
        `;
    }

    const plan = planPremiumNivan(actual.plan);
    const espacios = Object.keys(ESPACIOS_PREMIUM_NIVAN).filter(function(tipo) {
        return ESPACIOS_PREMIUM_NIVAN[tipo].nivel <= plan.nivel;
    }).map(function(tipo) { return htmlEspacioPremiumNivan(tipo, actual); }).join("");

    return `
        ${htmlEstadoPremiumNivan(actual)}
        <h3 class="tituloSeccionPremiumNivan">Mis anuncios</h3>
        <p class="notaPremiumNivan">En cada espacio podés anunciar una sola publicación. Podés sacarla y poner otra de tus publicaciones cuando quieras.</p>
        ${espacios}
        ${plan.nivel >= 3 ? htmlEstadisticasPremiumNivan(actual) : ""}
        <button type="button" class="botonCancelarPremiumNivan" onclick="cancelarPlanPremiumNivan()">Cancelar plan premium</button>
    `;
}

// ---- Mejorar plan ----
function abrirMejorarPlanPremiumNivan() {
    if (!suscripcionPremiumNivan(usuarioActual.id)) return;
    vistaPremiumNivan = { modo: "mejorar", tipo: null };
    renderizarHerramientasPremiumNivan();
    document.getElementById("pantallaPremiumNivan").scrollTop = 0;
}

// Se ve el plan que ya tenés y los más completos; pagás solo la diferencia.
function htmlMejorarPlanPremiumNivan() {
    const actual = suscripcionPremiumNivan(usuarioActual.id);
    const planActual = planPremiumNivan(actual.plan);
    const planes = planesEnOrdenVistaNivan().filter(function(p) { return p.nivel >= planActual.nivel; });

    return `
        <button type="button" class="botonPremiumNivan secundario chico" onclick="volverPremiumNivan()">← Volver a herramientas premium</button>
        <h3 class="tituloSeccionPremiumNivan">⬆️ Mejorar plan</h3>
        <p class="notaPremiumNivan">Pagás solo lo que falta para el plan nuevo. Tu fecha y hora de vencimiento no cambian y tus anuncios se mantienen. Deslizá para ver las opciones.</p>
        ${htmlTiraPlanesPremiumNivan(planes, actual)}
    `;
}

function mejorarPlanPremiumNivan(idPlan) {
    const actual = suscripcionPremiumNivan(usuarioActual.id);
    const nuevo = planPremiumNivan(idPlan);
    if (!actual || !nuevo) return;
    const viejo = planPremiumNivan(actual.plan);
    if (nuevo.nivel <= viejo.nivel) return;

    const periodo = actual.periodo === "anual" ? "anual" : "mensual";
    const dif = precioPeriodoPremiumNivan(nuevo, periodo) - precioPeriodoPremiumNivan(viejo, periodo);

    confirmarPremiumNivan(`Vas a mejorar tu plan de ${viejo.nombre} a ${nuevo.nombre} pagando solo la diferencia: ${textoPrecioPremiumNivan(dif)}. Tu plan sigue venciendo el ${fechaHoraPremiumNivan(actual.vence)}. ¿Confirmás?`, function() {
        if (!cobrarPremiumNivan(dif)) {
            alert("No se pudo procesar el pago. Probá de nuevo.");
            return;
        }
        actualizarSuscripcionPremiumNivan(function(s) {
            s.pagado = pagadoPremiumNivan(s) + dif;
            s.plan = nuevo.id;
        });
        mostrarToastNivan("¡Plan mejorado!");
        volverPremiumNivan();
    }, "Mejorar", true);
}

// ---- Elegir la publicación de un anuncio ----
function abrirElegirPrendaPremiumNivan(tipo) {
    vistaPremiumNivan = { modo: "elegir", tipo: tipo };
    renderizarHerramientasPremiumNivan();
    document.getElementById("pantallaPremiumNivan").scrollTop = 0;
}

function volverPremiumNivan() {
    vistaPremiumNivan = { modo: "principal", tipo: null };
    renderizarHerramientasPremiumNivan();
}

function htmlElegirPrendaPremiumNivan(tipo) {
    const s = suscripcionPremiumNivan(usuarioActual.id);
    const esp = ESPACIOS_PREMIUM_NIVAN[tipo];
    const actualId = s && s.anuncios && s.anuncios[tipo] ? s.anuncios[tipo].productoId : null;
    const mias = misPrendasAnunciablesNivan().slice().reverse();

    return `
        <button type="button" class="botonPremiumNivan secundario chico" onclick="volverPremiumNivan()">← Volver a herramientas premium</button>
        <h3 class="tituloSeccionPremiumNivan">${esp.icono} ${esp.titulo}</h3>
        <p class="notaPremiumNivan">Elegí qué publicación querés anunciar. Solo podés anunciar publicaciones activas de tu tienda.</p>
        ${mias.length ? mias.map(function(p) {
            const esActual = p.id === actualId;
            return `<div class="espacioPremiumNivan">
                <img src="${escaparHTMLNivan(urlImagenNivan(p.imagen))}"${atributosImagenNivan()} alt="">
                <div class="infoEspacioPremiumNivan">
                    <strong>${escaparHTMLNivan(p.nombre)}</strong>
                    <p class="datoPremiumNivan">${textoPrecioPremiumNivan(p.precio)}</p>
                    <button type="button" class="botonPremiumNivan chico" ${esActual ? "disabled" : `onclick="asignarPrendaAnuncioNivan('${tipo}', ${p.id})"`}>${esActual ? "Anunciada ahora" : "Anunciar esta publicación"}</button>
                </div>
            </div>`;
        }).join("") : `<p class="vacioPublicacionesPerfilLateral">No tenés publicaciones activas para anunciar.</p>`}
    `;
}

// Cambia algo de la suscripción vigente del usuario y refresca todo lo que muestra anuncios.
function actualizarSuscripcionPremiumNivan(cambio) {
    const premium = leerPremiumNivan();
    const s = premium[usuarioActual.id];
    if (!s || s.vence <= Date.now()) return null;
    cambio(s);
    guardarPremiumNivan(premium);
    refrescarAnunciosPremiumNivan();
    return s;
}

function refrescarAnunciosPremiumNivan() {
    renderizarCarruselAnunciosNivan();

    // El orden del Home y del buscador depende de quién tiene "Tienda destacada".
    const rapido = document.getElementById("buscadorRapido");
    if (!rapido || !rapido.value.trim()) mostrarProductos(productos);
    cambiarOrden(ordenActual);

    if (document.getElementById("feedPersonalNivan")) renderizarFeedPersonalNivan();
}

function asignarPrendaAnuncioNivan(tipo, idProducto) {
    if (ESPACIOS_PREMIUM_NIVAN[tipo].proximamente) return;
    const ok = actualizarSuscripcionPremiumNivan(function(s) {
        s.anuncios = s.anuncios || {};
        s.anuncios[tipo] = { productoId: idProducto };
        s.usado = true;     // ya usó el servicio: si cancela, no hay reembolso
    });
    if (!ok) return;
    mostrarToastNivan("Anuncio actualizado.");
    volverPremiumNivan();
}

function quitarPrendaAnuncioNivan(tipo) {
    const ok = actualizarSuscripcionPremiumNivan(function(s) {
        if (s.anuncios) delete s.anuncios[tipo];
    });
    if (ok) renderizarHerramientasPremiumNivan();
}

// ---- Confirmación de pago con Términos y Condiciones ----
// Igual que mostrarConfirmacionNivan, pero antes de pagar muestra las condiciones del servicio y exige
// aceptar los Términos (cláusula 16). El botón de confirmar queda apagado hasta tildar la casilla.
function asegurarConfirmacionPremiumNivan() {
    let ov = document.getElementById("overlayPremiumTycNivan");
    if (!ov) {
        ov = document.createElement("div");
        ov.className = "overlayPremiumTycNivan";
        ov.id = "overlayPremiumTycNivan";
        document.body.appendChild(ov);
    }
    return ov;
}

function cerrarConfirmacionPremiumNivan() {
    const ov = document.getElementById("overlayPremiumTycNivan");
    if (ov) ov.classList.remove("abierto");
}

function confirmarPremiumNivan(mensaje, alConfirmar, textoAceptar) {
    const ov = asegurarConfirmacionPremiumNivan();
    const esc = typeof escaparLegalNivan === "function" ? escaparLegalNivan : function(t) { return String(t); };
    const msg = String(mensaje).replace(/\s*¿Confirmás\?\s*$/, "");

    function vistaResumen() {
        ov.innerHTML = `<div class="cajaPremiumTycNivan">
            <p class="mensajePremiumTycNivan">${esc(msg)}</p>
            <ul class="condicionesPremiumTycNivan">
                <li>El pago es único por el período elegido y <b>no se renueva solo</b>: para seguir con el plan tenés que renovarlo vos.</li>
                <li>Si cancelás el plan y <b>todavía no usaste el servicio</b>, te reembolsamos lo pagado. Si ya lo usaste (elegiste una publicación para anunciar o se mostró), <b>no hay reembolso</b>.</li>
                <li>Pagar no garantiza ventas, visitas ni ingresos.</li>
            </ul>
            <label class="aceptarPremiumTycNivan">
                <input type="checkbox" id="checkTycPremiumNivan">
                <span>Leí y acepto los <a href="#" id="linkTycPremiumNivan">Términos y Condiciones</a> (cláusula 16: servicios premium).</span>
            </label>
            <div class="botonesConfirmacionNivan">
                <button type="button" class="botonConfirmacionCancelar" id="cancelarTycPremiumNivan">Cancelar</button>
                <button type="button" class="botonConfirmacionAceptar positivo" id="aceptarTycPremiumNivan" disabled>${esc(textoAceptar || "Confirmar")}</button>
            </div>
        </div>`;
        const check = document.getElementById("checkTycPremiumNivan");
        const aceptar = document.getElementById("aceptarTycPremiumNivan");
        check.addEventListener("change", function() { aceptar.disabled = !check.checked; });
        document.getElementById("cancelarTycPremiumNivan").addEventListener("click", cerrarConfirmacionPremiumNivan);
        document.getElementById("linkTycPremiumNivan").addEventListener("click", function(e) {
            e.preventDefault();
            const tildada = check.checked;
            vistaTerminos(tildada);
        });
        aceptar.addEventListener("click", function() {
            if (!check.checked) return;
            cerrarConfirmacionPremiumNivan();
            alConfirmar();
        });
        ov.classList.add("abierto");
    }

    // Los términos se leen acá mismo (así no quedan tapados por este cartel) y se vuelve al resumen.
    function vistaTerminos(tildada) {
        ov.innerHTML = `<div class="cajaPremiumTycNivan terminos">
            <button type="button" class="botonPremiumNivan secundario chico" id="volverTycPremiumNivan">← Volver al pago</button>
            <div class="textoLegalNivan textoTycPremiumNivan">${typeof htmlLegalNivan === "function" ? htmlLegalNivan("terminos") : ""}</div>
        </div>`;
        document.getElementById("volverTycPremiumNivan").addEventListener("click", function() {
            vistaResumen();
            if (tildada) {
                const c = document.getElementById("checkTycPremiumNivan");
                c.checked = true;
                document.getElementById("aceptarTycPremiumNivan").disabled = false;
            }
        });
        const caja = ov.querySelector(".cajaPremiumTycNivan");
        if (caja) caja.scrollTop = 0;
    }

    vistaResumen();
}

// ---- Contratar, renovar y cancelar ----
// Único punto de cobro: cuando exista la pasarela de pago real se conecta acá.
function cobrarPremiumNivan(monto) {
    return true;
}

function elegirPlanPremiumNivan(idPlan, periodo) {
    const plan = planPremiumNivan(idPlan);
    if (!plan || suscripcionPremiumNivan(usuarioActual.id)) return;

    periodo = periodo === "anual" ? "anual" : "mensual";
    const meses = mesesPeriodoPremiumNivan(periodo);
    const precio = precioPeriodoPremiumNivan(plan, periodo);
    const venceEn = sumarMesesNivan(Date.now(), meses);

    confirmarPremiumNivan(`Vas a contratar ${plan.nombre} (plan ${periodo}) por ${textoPrecioPremiumNivan(precio)}. Vence el ${fechaHoraPremiumNivan(venceEn)}. ¿Confirmás?`, function() {
        if (!cobrarPremiumNivan(precio)) {
            alert("No se pudo procesar el pago. Probá de nuevo.");
            return;
        }

        // Vence el mismo día y a la misma hora en que se contrata.
        const ahora = Date.now();
        const premium = leerPremiumNivan();
        premium[usuarioActual.id] = {
            plan: plan.id,
            periodo: periodo,
            inicio: ahora,
            vence: sumarMesesNivan(ahora, meses),
            pais: paisNivan() || "AR",
            anuncios: {},
            stats: {},
            pagado: precio
        };
        guardarPremiumNivan(premium);
        refrescarAnunciosPremiumNivan();
        mostrarToastNivan("¡Plan activado!");
        volverPremiumNivan();
    }, "Confirmar", true);
}

// Renovar suma tiempo al que ya tenés (si lo hacés antes de que venza no perdés nada).
function renovarPlanPremiumNivan(periodo) {
    const actual = suscripcionPremiumNivan(usuarioActual.id);
    if (!actual) return;
    periodo = periodo === "anual" ? "anual" : "mensual";
    const plan = planPremiumNivan(actual.plan);
    const meses = mesesPeriodoPremiumNivan(periodo);
    const precio = precioPeriodoPremiumNivan(plan, periodo);
    const nuevoVence = sumarMesesNivan(actual.vence, meses);

    confirmarPremiumNivan(`Vas a sumar ${periodo === "anual" ? "1 año" : "1 mes"} a tu plan ${plan.nombre} por ${textoPrecioPremiumNivan(precio)}. Conservás todo lo que ya tenés y pasa a vencer el ${fechaHoraPremiumNivan(nuevoVence)}. ¿Confirmás?`, function() {
        if (!cobrarPremiumNivan(precio)) {
            alert("No se pudo procesar el pago. Probá de nuevo.");
            return;
        }
        actualizarSuscripcionPremiumNivan(function(s) {
            s.vence = sumarMesesNivan(s.vence, meses);
            s.pagado = pagadoPremiumNivan(s) + precio;
            if (periodo === "anual") s.periodo = "anual";
        });
        mostrarToastNivan("Plan renovado.");
        renderizarHerramientasPremiumNivan();
    }, "Confirmar", true);
}

// ¿Ya usó el servicio? Sí si alguna vez eligió una publicación para anunciar o si sus anuncios ya se mostraron.
function planUsadoPremiumNivan(s) {
    if (!s) return false;
    if (s.usado || (s.anuncios && Object.keys(s.anuncios).length)) return true;
    return Object.keys(s.stats || {}).some(function(t) {
        const e = s.stats[t] || {};
        return (e.vistas || 0) > 0 || (e.toques || 0) > 0;
    });
}

// Total pagado por la suscripción (contratación + renovaciones + mejoras). En planes viejos sin ese dato se estima.
function pagadoPremiumNivan(s) {
    if (s && typeof s.pagado === "number") return s.pagado;
    const plan = s ? planPremiumNivan(s.plan) : null;
    return plan ? precioPeriodoPremiumNivan(plan, s.periodo === "anual" ? "anual" : "mensual") : 0;
}

// Único punto de reembolso: cuando exista la pasarela de pago real se conecta acá.
function reembolsarPremiumNivan(monto) {
    return true;
}

function cancelarPlanPremiumNivan() {
    const actual = suscripcionPremiumNivan(usuarioActual.id);
    if (!actual) return;

    const sinUso = !planUsadoPremiumNivan(actual);
    const monto = pagadoPremiumNivan(actual);
    const mensaje = sinUso
        ? `¿Querés cancelar tu plan premium? Como todavía no lo usaste, te reembolsamos ${textoPrecioPremiumNivan(monto)}.`
        : "¿Querés cancelar tu plan premium? Ya usaste el servicio, así que no hay reembolso: perdés los días que te quedan y tus anuncios dejan de mostrarse.";

    mostrarConfirmacionNivan(mensaje, function() {
        if (sinUso && monto > 0 && !reembolsarPremiumNivan(monto)) {
            alert("No se pudo procesar el reembolso. Probá de nuevo.");
            return;
        }
        const premium = leerPremiumNivan();
        delete premium[usuarioActual.id];
        guardarPremiumNivan(premium);
        refrescarAnunciosPremiumNivan();
        mostrarToastNivan(sinUso ? "Plan cancelado y reembolsado." : "Plan cancelado.");
        volverPremiumNivan();
    }, "Cancelar plan");
}

// Cuando un plan llega a su hora de vencimiento se sacan sus anuncios sin esperar a que se recargue la app.
(function vigilarVencimientosPremiumNivan() {
    const avisados = {};
    setInterval(function() {
        if (document.hidden) return;
        const ahora = Date.now();
        const premium = leerPremiumNivan();
        let vencio = false;
        Object.keys(premium).forEach(function(id) {
            const clave = id + "|" + premium[id].vence;
            if (premium[id].vence <= ahora && !avisados[clave]) {
                avisados[clave] = true;
                vencio = true;
            }
        });
        if (!vencio) return;
        refrescarAnunciosPremiumNivan();
        const pantalla = document.getElementById("pantallaPremiumNivan");
        if (pantalla && pantalla.classList.contains("abierta") && usuarioActual) renderizarHerramientasPremiumNivan();
    }, 30000);
})();
