// ==============================
// NIVAN · Ver publicaciones del otro país + "Se busca"
// ==============================
// 1. "Ver otro país": cualquier persona puede MIRAR las publicaciones del otro país (Argentina ↔ Uruguay).
//    Es solo para mirar: no hay carrito, ni comprar, ni chat. Las compras son dentro de tu país.
// 2. Si le gusta algo, la persona toca "¿Alguien vende algo así en mi país?" y deja un pedido.
// 3. "Se busca": el tablero de pedidos de tu país. Cada cosa aparece una sola vez con cuánta gente la busca,
//    para que quienes venden vean qué falta y se animen a publicarlo.
// Todo se guarda en el servidor (rutas /api/busquedas). Esta pantalla no toca el catálogo ni el carrito de la app.
(function () {
    "use strict";

    const estilo = document.createElement("style");
    estilo.textContent = `
.overlayOtroPaisNivan { display:none; position:fixed; inset:0; z-index:10003; background:#101010; color:#fff; flex-direction:column; }
.overlayOtroPaisNivan.abierto { display:flex; }
.opCabecera { display:flex; align-items:center; gap:10px; padding:12px 14px; padding-top:calc(12px + env(safe-area-inset-top, 0px)); background:#181818; border-bottom:1px solid #2a2a2a; }
.opVolver { background:#2a2a2a; color:#fff; border:0; border-radius:8px; padding:8px 12px; font-size:15px; cursor:pointer; }
.opTitulo { font-weight:600; font-size:16px; flex:1; }
.opCuerpo { flex:1; overflow-y:auto; padding:14px; padding-bottom:calc(24px + env(safe-area-inset-bottom, 0px)); }
.opAviso { background:#1d2a33; border-radius:10px; padding:10px 12px; font-size:13px; color:#cfe6f5; margin-bottom:12px; line-height:1.4; }
.opBuscar { width:100%; box-sizing:border-box; padding:11px; border-radius:10px; border:1px solid #333; background:#1a1a1a; color:#fff; font-size:15px; margin-bottom:12px; }
.opGrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.opCard { background:#1a1a1a; border-radius:10px; overflow:hidden; cursor:pointer; border:0; color:#fff; text-align:left; padding:0; }
.opCardImg, .opCardSin { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; background:#262626; }
.opCardSin { display:flex; align-items:center; justify-content:center; font-size:34px; }
.opCardInfo { padding:8px 9px 10px; }
.opCardNombre { font-size:14px; line-height:1.25; word-break:break-word; }
.opCardPrecio { font-weight:700; margin-top:3px; }
.opCardMeta { color:#999; font-size:12px; margin-top:2px; }
.opMedios { display:flex; gap:8px; overflow-x:auto; scroll-snap-type:x mandatory; margin-bottom:12px; }
.opMedios img, .opMedios video { height:300px; max-width:88%; border-radius:10px; scroll-snap-align:start; flex:0 0 auto; background:#262626; object-fit:cover; }
.opDetNombre { font-size:20px; font-weight:700; word-break:break-word; }
.opDetPrecio { font-size:18px; margin:4px 0 8px; }
.opDetTexto { color:#ddd; font-size:14px; line-height:1.45; white-space:pre-wrap; word-break:break-word; margin:8px 0; }
.opMeta { color:#aaa; font-size:13px; margin:2px 0; }
.opBoton { display:block; width:100%; box-sizing:border-box; padding:13px; border-radius:10px; border:0; font-size:15px; font-weight:600; cursor:pointer; margin-top:10px; background:#fff; color:#000; }
.opBoton.sec { background:#2a2a2a; color:#fff; font-weight:500; }
.opBoton:disabled { opacity:.55; cursor:default; }
.opTexto { width:100%; box-sizing:border-box; min-height:90px; padding:11px; border-radius:10px; border:1px solid #333; background:#1a1a1a; color:#fff; font-size:15px; resize:vertical; margin-top:8px; }
.opError { color:#ff8a80; font-size:13px; min-height:18px; margin-top:6px; }
.opVacio { text-align:center; color:#aaa; padding:30px 10px; line-height:1.5; }
.opBusca { background:#1a1a1a; border-radius:12px; padding:12px; margin-bottom:12px; display:flex; gap:12px; flex-wrap:wrap; }
.opBusca .opCardImg, .opBusca .opCardSin { width:84px; height:84px; aspect-ratio:auto; border-radius:8px; flex:0 0 auto; }
.opBuscaInfo { flex:1; min-width:150px; }
.opCantidad { display:inline-block; background:#4a2a14; color:#ffb74d; border-radius:20px; padding:3px 10px; font-size:13px; margin:6px 0; }
.opNota { color:#ccc; font-size:13px; margin-top:3px; word-break:break-word; }
.opAcciones { width:100%; display:flex; gap:8px; flex-wrap:wrap; }
.opAcciones .opBoton { flex:1; min-width:140px; margin-top:0; padding:10px; font-size:14px; }
.opHecho { text-align:center; padding:26px 8px; }
.opHecho .grande { font-size:42px; }
`;
    document.head.appendChild(estilo);

    let overlay = null, titulo = null, cuerpo = null;
    let vista = null, otroPais = null, lista = null, errorCarga = "", filtro = "", visibles = 40, itemActual = null;

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }
    function miPais() { return (typeof paisNivan === "function" && paisNivan()) || "AR"; }
    function elOtro() { return miPais() === "AR" ? "UY" : "AR"; }
    function nombrePais(p) { const d = datosPaisNivan(p); return (d.bandera ? d.bandera + " " : "") + d.nombre; }
    function srcSeguro(u) {
        u = String(u || "");
        const ok = (u.indexOf("/") === 0 && u.indexOf("//") !== 0) || u.indexOf("https://") === 0;
        return ok ? urlImagenNivan(u) : "";
    }
    function imagenPrincipal(p) {
        if (p.imagen) return p.imagen;
        const m = Array.isArray(p.medios) ? p.medios.find(function (x) { return x && x.tipo === "imagen" && x.src; }) : null;
        return m ? m.src : "";
    }
    function imagenOMarco(src, claseImg, claseSin) {
        const s = srcSeguro(src);
        if (!s) return el("div", claseSin, "🧵");
        const img = el("img", claseImg);
        img.src = s; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        img.onerror = function () { img.replaceWith(el("div", claseSin, "🧵")); };
        return img;
    }
    function precio(p) { return simboloMonedaNivan(p.pais || otroPais) + formatearDineroNivan(p.precio); }

    function asegurar() {
        if (overlay) return;
        overlay = el("div", "overlayOtroPaisNivan");
        const cab = el("div", "opCabecera");
        const volver = el("button", "opVolver", "←");
        volver.type = "button";
        volver.onclick = atras;
        titulo = el("div", "opTitulo");
        cab.append(volver, titulo);
        cuerpo = el("div", "opCuerpo");
        overlay.append(cab, cuerpo);
        document.body.appendChild(overlay);
    }
    function abrir() { overlay.classList.add("abierto"); cuerpo.scrollTop = 0; }
    function cerrar() { if (overlay) overlay.classList.remove("abierto"); vista = null; }
    function atras() {
        if (vista === "detalle") return pintarLista();
        if (vista === "pedido") return pintarDetalle(itemActual);
        if (vista === "hecho") return pintarLista();
        cerrar();
    }
    function limpiar(t) { titulo.textContent = t; cuerpo.innerHTML = ""; cuerpo.scrollTop = 0; }

    // =========================================================
    // 1) VER EL OTRO PAÍS (solo mirar)
    // =========================================================
    window.abrirOtroPaisNivan = function () {
        asegurar();
        otroPais = elOtro(); lista = null; errorCarga = ""; filtro = ""; visibles = 40;
        abrir();
        pintarLista();
        cargarOtro();
    };

    async function cargarOtro() {
        const pais = otroPais;
        const r = await apiNivan("/api/publicaciones?pais=" + pais);
        if (otroPais !== pais) return;
        if (!r.ok || !Array.isArray(r.publicaciones)) {
            errorCarga = r.error || "No se pudieron cargar las publicaciones. Probá de nuevo.";
        } else {
            lista = r.publicaciones.filter(function (p) { return p && p.activo !== false && p.pais === pais; });
            errorCarga = "";
        }
        if (vista === "lista") pintarLista();
    }

    function pintarLista() {
        vista = "lista";
        limpiar("🌎 " + nombrePais(otroPais));
        cuerpo.appendChild(el("div", "opAviso", "👀 Solo para mirar. Las compras son dentro de tu país (" + nombrePais(miPais()) + "). Si ves algo que te gustaría que se venda acá, podés pedirlo."));

        const buscador = el("input", "opBuscar");
        buscador.type = "search"; buscador.placeholder = "Buscar en " + datosPaisNivan(otroPais).nombre + "..."; buscador.value = filtro;
        const grid = el("div");
        buscador.oninput = function () { filtro = buscador.value; visibles = 40; pintarGrid(grid); };
        cuerpo.append(buscador, grid);
        pintarGrid(grid);
    }

    function pintarGrid(grid) {
        grid.innerHTML = "";
        if (errorCarga) { grid.appendChild(el("div", "opVacio", errorCarga)); return; }
        if (!lista) { grid.appendChild(el("div", "opVacio", "Cargando…")); return; }
        const t = filtro.trim().toLowerCase();
        const filtradas = lista.filter(function (p) {
            return !t || String(p.nombre || "").toLowerCase().indexOf(t) >= 0 || String(p.categoria || "").toLowerCase().indexOf(t) >= 0 || String(p.marca || "").toLowerCase().indexOf(t) >= 0;
        });
        if (!filtradas.length) {
            grid.appendChild(el("div", "opVacio", t ? "No encontramos nada con esa búsqueda." : "Todavía no hay publicaciones en " + datosPaisNivan(otroPais).nombre + "."));
            return;
        }
        const g = el("div", "opGrid");
        filtradas.slice(0, visibles).forEach(function (p) {
            const card = el("button", "opCard");
            card.type = "button";
            card.appendChild(imagenOMarco(imagenPrincipal(p), "opCardImg", "opCardSin"));
            const info = el("div", "opCardInfo");
            info.append(el("div", "opCardNombre", p.nombre || "Sin nombre"), el("div", "opCardPrecio", precio(p)));
            if (p.categoria) info.appendChild(el("div", "opCardMeta", p.categoria));
            card.appendChild(info);
            card.onclick = function () { pintarDetalle(p); };
            g.appendChild(card);
        });
        grid.appendChild(g);
        if (filtradas.length > visibles) {
            const mas = el("button", "opBoton sec", "Ver más");
            mas.type = "button";
            mas.onclick = function () { visibles += 40; pintarGrid(grid); };
            grid.appendChild(mas);
        }
    }

    function pintarDetalle(p) {
        itemActual = p; vista = "detalle";
        limpiar(p.nombre || "Publicación");
        const medios = (Array.isArray(p.medios) ? p.medios : []).filter(function (m) { return m && srcSeguro(m.src); });
        if (medios.length) {
            const fila = el("div", "opMedios");
            medios.forEach(function (m) {
                if (m.tipo === "video") {
                    const v = el("video"); v.src = srcSeguro(m.src); v.controls = true; v.preload = "metadata"; v.playsInline = true; fila.appendChild(v);
                } else {
                    const i = el("img"); i.src = srcSeguro(m.src); i.alt = ""; i.loading = "lazy"; fila.appendChild(i);
                }
            });
            cuerpo.appendChild(fila);
        } else {
            cuerpo.appendChild(imagenOMarco(imagenPrincipal(p), "opCardImg", "opCardSin"));
        }
        cuerpo.append(el("div", "opDetNombre", p.nombre || ""), el("div", "opDetPrecio", precio(p)));
        if (p.categoria) cuerpo.appendChild(el("div", "opMeta", "Categoría: " + p.categoria));
        if (p.marca) cuerpo.appendChild(el("div", "opMeta", "Marca: " + p.marca));
        if (p.vendedor) cuerpo.appendChild(el("div", "opMeta", "Vende: " + p.vendedor + " · " + nombrePais(p.pais || otroPais)));
        if (Array.isArray(p.talles) && p.talles.length && typeof p.talles[0] === "string") cuerpo.appendChild(el("div", "opMeta", "Talles: " + p.talles.join(", ")));
        if (p.descripcion) cuerpo.appendChild(el("div", "opDetTexto", String(p.descripcion).slice(0, 600)));

        cuerpo.appendChild(el("div", "opAviso", "👀 Solo para mirar: no se puede comprar desde " + datosPaisNivan(miPais()).nombre + "."));
        const pedir = el("button", "opBoton", "🔎 ¿Alguien vende algo así en " + datosPaisNivan(miPais()).nombre + "?");
        pedir.type = "button";
        pedir.onclick = function () { pintarPedido(p); };
        cuerpo.appendChild(pedir);
    }

    function pintarPedido(p) {
        itemActual = p; vista = "pedido";
        limpiar("Pedir en " + datosPaisNivan(miPais()).nombre);
        cuerpo.appendChild(el("div", "opAviso", "Tu pedido le aparece a quienes venden en " + datosPaisNivan(miPais()).nombre + ", junto con cuánta gente busca lo mismo. Sin compromiso: es para que se animen a vender algo así."));
        const fila = el("div", "opBusca");
        fila.appendChild(imagenOMarco(imagenPrincipal(p), "opCardImg", "opCardSin"));
        const info = el("div", "opBuscaInfo");
        info.append(el("div", "opCardNombre", p.nombre || ""), el("div", "opCardMeta", "Visto en " + nombrePais(p.pais || otroPais)));
        fila.appendChild(info);
        cuerpo.appendChild(fila);

        const nota = el("textarea", "opTexto");
        nota.maxLength = 200; nota.placeholder = "Opcional: talle, color, cuánto pagarías...";
        const error = el("div", "opError", "");
        const enviar = el("button", "opBoton", "Publicar mi pedido");
        enviar.type = "button";
        enviar.onclick = async function () {
            if (!usuarioActual) { alert("Iniciá sesión o creá tu cuenta para hacer un pedido."); abrirCuenta(); return; }
            enviar.disabled = true; error.textContent = "";
            const r = await apiNivan("/api/busquedas/crear", { publicacionId: String(p.id), pais: miPais(), nota: nota.value.trim() });
            enviar.disabled = false;
            if (!r.ok) { error.textContent = r.error || "No se pudo enviar el pedido. Probá de nuevo."; return; }
            pintarHecho();
        };
        const cancelar = el("button", "opBoton sec", "Cancelar");
        cancelar.type = "button";
        cancelar.onclick = function () { pintarDetalle(p); };
        cuerpo.append(nota, error, enviar, cancelar);
    }

    function pintarHecho() {
        vista = "hecho";
        limpiar("Pedido enviado");
        const caja = el("div", "opHecho");
        caja.append(el("div", "grande", "✅"), el("p", "", "Listo. Tu pedido ya lo ven quienes venden en " + datosPaisNivan(miPais()).nombre + "."));
        cuerpo.appendChild(caja);
        const ver = el("button", "opBoton", "Ver \"Se busca\" en " + datosPaisNivan(miPais()).nombre);
        ver.type = "button";
        ver.onclick = function () { window.abrirSeBuscaNivan(); };
        const seguir = el("button", "opBoton sec", "Seguir mirando");
        seguir.type = "button";
        seguir.onclick = pintarLista;
        cuerpo.append(ver, seguir);
    }

    // =========================================================
    // 2) "SE BUSCA" EN MI PAÍS
    // =========================================================
    window.abrirSeBuscaNivan = function () {
        asegurar();
        abrir();
        pintarBusca(null, "");
        cargarBusca();
    };

    async function cargarBusca() {
        const r = await apiNivan("/api/busquedas?pais=" + miPais());
        if (vista !== "busca") return;
        if (!r.ok || !Array.isArray(r.grupos)) return pintarBusca(null, r.error || "No se pudo cargar. Probá de nuevo.");
        pintarBusca(r.grupos, "");
    }

    function pintarBusca(grupos, error) {
        vista = "busca";
        limpiar("🔎 Se busca en " + nombrePais(miPais()));
        cuerpo.appendChild(el("div", "opAviso", "Esto es lo que la gente de " + datosPaisNivan(miPais()).nombre + " pidió que alguien venda. Si vendés algo así, publicalo: ya hay quien lo busca."));
        if (error) { cuerpo.appendChild(el("div", "opVacio", error)); return; }
        if (!grupos) { cuerpo.appendChild(el("div", "opVacio", "Cargando…")); return; }
        if (!grupos.length) {
            cuerpo.appendChild(el("div", "opVacio", "Todavía no hay pedidos. Mirá las publicaciones del otro país y pedí lo que te gustaría que se venda acá."));
            const ir = el("button", "opBoton", "🌎 Ver " + datosPaisNivan(elOtro()).nombre);
            ir.type = "button";
            ir.onclick = function () { window.abrirOtroPaisNivan(); };
            cuerpo.appendChild(ir);
            return;
        }
        grupos.forEach(function (g) {
            const caja = el("div", "opBusca");
            caja.appendChild(imagenOMarco(g.imagen, "opCardImg", "opCardSin"));
            const info = el("div", "opBuscaInfo");
            info.appendChild(el("div", "opCardNombre", g.nombre || "Sin nombre"));
            if (g.categoria) info.appendChild(el("div", "opCardMeta", g.categoria));
            info.appendChild(el("div", "opCantidad", "👥 " + g.cantidad + (g.cantidad === 1 ? " persona lo busca" : " personas lo buscan")));
            info.appendChild(el("div", "opCardMeta", "Visto en " + nombrePais(g.refPais)));
            (g.notas || []).forEach(function (n) { info.appendChild(el("div", "opNota", "“" + n.nota + "” — " + n.nombre)); });
            caja.appendChild(info);

            const acciones = el("div", "opAcciones");
            const publicar = el("button", "opBoton", "🧾 Publicar algo así");
            publicar.type = "button";
            publicar.onclick = function () {
                if (!usuarioActual) { alert("Iniciá sesión o creá tu cuenta primero."); abrirCuenta(); return; }
                cerrar();
                abrirCrearPublicacion();
            };
            acciones.appendChild(publicar);

            if (g.mia) {
                const quitar = el("button", "opBoton sec", "Ya no lo busco");
                quitar.type = "button";
                quitar.onclick = async function () {
                    quitar.disabled = true;
                    const r = await apiNivan("/api/busquedas/cerrar", { id: g.miaId });
                    if (!r.ok) { alert(r.error || "No se pudo."); quitar.disabled = false; return; }
                    cargarBusca();
                };
                acciones.appendChild(quitar);
            } else {
                const yo = el("button", "opBoton sec", "➕ Yo también lo busco");
                yo.type = "button";
                yo.onclick = async function () {
                    if (!usuarioActual) { alert("Iniciá sesión o creá tu cuenta para sumarte."); abrirCuenta(); return; }
                    yo.disabled = true;
                    const r = await apiNivan("/api/busquedas/crear", { publicacionId: String(g.refId), pais: miPais() });
                    if (!r.ok) { alert(r.error || "No se pudo."); yo.disabled = false; return; }
                    cargarBusca();
                };
                acciones.appendChild(yo);
            }
            caja.appendChild(acciones);
            cuerpo.appendChild(caja);
        });
    }
})();
