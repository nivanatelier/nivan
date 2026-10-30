// ==============================
// PATRONAJE · PANTALLA (Herramientas avanzadas)
// ==============================
// Proyectos, medidas, patrones paramétricos, editor de dibujo táctil y exportación a PDF.
// Todo se guarda en el dispositivo (localStorage), por usuario.

(function () {
    'use strict';

    const PN = window.PatNivan;
    const K = 72 / 2.54;

    // ------------------------------
    // Utilidades
    // ------------------------------
    function esc(t) {
        if (typeof escaparHTMLNivan === "function") return escaparHTMLNivan(t);
        return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    }
    function aviso(t, ms) {
        if (typeof mostrarToastNivan === "function") mostrarToastNivan(t, ms || 2600);
        else alert(t);
    }
    function nf(n, d) {
        d = d == null ? 1 : d;
        return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString().replace(".", ",");
    }
    function claveProyectos() { return "nivanPatronajes_" + (usuarioActual ? usuarioActual.id : "anon"); }
    function clavePerfiles() { return "nivanMedidasPerfiles_" + (usuarioActual ? usuarioActual.id : "anon"); }
    function leer(k, def) { return typeof leerJSONNivan === "function" ? leerJSONNivan(k, def) : def; }
    function escribir(k, v) { return typeof guardarJSONNivan === "function" ? guardarJSONNivan(k, v) : false; }
    function $(id) { return document.getElementById(id); }
    // Un solo oyente por clave y contenedor (antes se acumulaban al volver a entrar a cada pestaña,
    // y los viejos seguían escribiendo en proyectos ya cerrados).
    function oyente(cu, clave, tipo, fn) {
        cu._oy = cu._oy || {};
        if (cu._oy[clave]) cu.removeEventListener(cu._oy[clave].t, cu._oy[clave].f);
        cu._oy[clave] = { t: tipo, f: fn };
        cu.addEventListener(tipo, fn);
    }
    function limpiarOyentes(cu) {
        Object.keys(cu._oy || {}).forEach(function (k) { cu.removeEventListener(cu._oy[k].t, cu._oy[k].f); });
        cu._oy = {};
    }
    // Completa lo que falte en un proyecto (copias de seguridad viejas o incompletas).
    function normalizarProyecto(p) {
        if (!p.medidas) p.medidas = PN.medidasPorDefecto();
        if (!p.perfil) p.perfil = { sexo: "mujer", talle: "M", modelo: "" };
        if (!p.tela || !(p.tela.ancho > 0)) p.tela = { ancho: 140 };
        if (typeof p.notas !== "string") p.notas = "";
        if (!Array.isArray(p.gens)) p.gens = [];
        if (!p.vista) p.vista = { ox: 30, oy: 30, z: 8 };
        PN.asegurarCapas(p);
        if ((p.migDims || 0) < 2) { p.migDims = 2; try { migrarPiezas(p); } catch (e) { } }
        return p;
    }
    // Proyectos hechos antes: les pone los nombres nuevos y las medidas con nombre (si el molde sigue igual que el original).
    const NOMBRES_VIEJOS = { "Falda · delantero": "Falda Del.", "Falda · trasero": "Falda Esp.", "Remera · delantero": "Remera Del.", "Remera · espalda": "Remera Esp.", "Pantalón · delantero": "Pantalón Del.", "Pantalón · trasero": "Pantalón Esp." };
    function migrarPiezas(p) {
        const cache = {};
        (p.shapes || []).forEach(function (s) {
            if (s.t !== "path" || !s.pts) return;
            const nom = NOMBRES_VIEJOS[s.name] || s.name;
            if (s.gen && p.gens && p.gens.length) {
                const gen = PN.GENERADORES.filter(function (g) { return g.id === s.gen; })[0];
                if (gen) {
                    let mejor = null;
                    const bs = PN.cajaDeShape(s);
                    p.gens.forEach(function (g, gi) {
                        if (g.id !== s.gen) return;
                        if (!cache[gi]) { try { cache[gi] = gen.gen(PN.completarMedidas(g.medidas), g.params); } catch (e) { cache[gi] = []; } }
                        cache[gi].forEach(function (q) {
                            if (q.name !== nom || q.pts.length !== s.pts.length) return;
                            const bq = PN.cajaDeShape(q);
                            const dw = Math.abs((bs.x1 - bs.x0) - (bq.x1 - bq.x0)), dh = Math.abs((bs.y1 - bs.y0) - (bq.y1 - bq.y0));
                            const tol = Math.max(1.5, 0.08 * Math.max(bq.x1 - bq.x0, bq.y1 - bq.y0));
                            if (dw <= tol && dh <= tol && (!mejor || dw + dh < mejor.sc)) mejor = { q: q, sc: dw + dh };
                        });
                    });
                    if (mejor) s.dims = PN.clon(mejor.q.dims || []);
                }
            }
            if (NOMBRES_VIEJOS[s.name]) s.name = nom;
        });
    }
    function medidasProy() { return PN.completarMedidas(ST.proy.medidas, ST.proy.perfil && ST.proy.perfil.sexo); }

    // ------------------------------
    // Estado
    // ------------------------------
    const ST = {
        lista: [], proy: null, tab: "proyectos",
        gen: null, genP: null, pdfOp: null, pdfRes: null,
        undo: [], redo: [], tmrGuardar: null
    };
    let ED = null; // estado del editor (solo vive con la pestaña Dibujo abierta)

    function cargarLista() {
        const d = leer(claveProyectos(), { lista: [], ultimo: null });
        ST.lista = ((d && d.lista) || []).map(normalizarProyecto);
        ST.ultimo = d ? d.ultimo : null;
    }
    function guardarYa() {
        clearTimeout(ST.tmrGuardar);
        if (ST.proy) ST.proy.mod = Date.now();
        const ok = escribir(claveProyectos(), { lista: ST.lista, ultimo: ST.proy ? ST.proy.id : null });
        if (ok === false && !ST.avisoGuardado) {
            ST.avisoGuardado = true;
            aviso("No se pudo guardar: el dispositivo se quedó sin espacio. Descargá un respaldo desde Proyectos.", 5000);
            setTimeout(function () { ST.avisoGuardado = false; }, 20000);
        }
    }
    function guardar() {
        clearTimeout(ST.tmrGuardar);
        ST.tmrGuardar = setTimeout(guardarYa, 500);
    }

    // ------------------------------
    // Pantalla
    // ------------------------------
    const TABS = [
        ["proyectos", "📁", "Proyectos"], ["medidas", "📏", "Medidas"], ["patrones", "👗", "Patrones"],
        ["dibujo", "✏️", "Dibujo"], ["pdf", "📄", "PDF"]
    ];

    function asegurarPantalla() {
        let p = $("pantallaPatronajeNivan");
        if (!p) {
            p = document.createElement("div");
            p.className = "pantallaCompleta pantallaPatronajeNivan";
            p.id = "pantallaPatronajeNivan";
            p.innerHTML = '<div class="patCabecera">' +
                '<button type="button" class="volverAtras" onclick="PatNivanUI.cerrar()">← Volver</button>' +
                '<div class="patTituloCab"><h2>Herramientas avanzadas <span class="patPildoraBeta">BETA</span></h2><p id="patSubtitulo">Diseño de patronaje</p></div>' +
                '</div>' +
                '<div class="patAvisoBeta" id="patAvisoBeta">' +
                    '<div class="patAvisoBetaIcono">🚀</div>' +
                    '<div class="patAvisoBetaTexto">' +
                        '<strong>Estamos en fase beta · 100% gratis</strong>' +
                        '<span>Estas herramientas se están probando y son totalmente gratuitas. Si encontrás algún error, <a href="#" class="patEnlaceReportar" onclick="event.preventDefault(); abrirReportarErrorNivan();">reportalo</a> y nos ayudás a mejorarlas.</span>' +
                    '</div>' +
                '</div>' +
                '<div class="patTabs" id="patTabs">' + TABS.map(function (t) {
                    return '<button type="button" data-tab="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] + '</button>';
                }).join("") + '</div>' +
                '<div class="patCuerpo" id="patCuerpo"></div>';
            document.body.appendChild(p);
            $("patTabs").addEventListener("click", function (e) {
                const b = e.target.closest("button[data-tab]");
                if (b) cambiarTab(b.getAttribute("data-tab"));
            });
            document.addEventListener("keydown", teclado);
        }
        return p;
    }

    function pantallaAbierta() {
        const p = $("pantallaPatronajeNivan");
        return p && p.classList.contains("abierta");
    }

    function abrir() {
        if (typeof usuarioActual === "undefined" || !usuarioActual) {
            alert("Iniciá sesión o creá tu cuenta primero.");
            if (typeof abrirCuenta === "function") abrirCuenta();
            return;
        }
        asegurarPantalla();
        cargarLista();
        ST.proy = null;
        if (ST.ultimo) {
            const u = ST.lista.filter(function (x) { return x.id === ST.ultimo; })[0];
            if (u) abrirProyecto(u.id, true);
        }
        ST.tab = ST.proy ? "dibujo" : "proyectos";
        abrirPantallaCompleta("pantallaPatronajeNivan");
        $("pantallaPatronajeNivan").classList.add("sobreBarraNivan");
        cambiarTab(ST.tab);
    }

    function cerrar() {
        salirDelEditor();
        guardarYa();
        cerrarPantallaCompleta("pantallaPatronajeNivan");
    }

    function cambiarTab(t) {
        if (t !== "proyectos" && !ST.proy) {
            aviso("Primero creá o abrí un proyecto.");
            t = "proyectos";
        }
        if (ST.tab === "dibujo" && t !== "dibujo") salirDelEditor();
        ST.tab = t;
        document.querySelectorAll("#patTabs button").forEach(function (b) {
            b.classList.toggle("activo", b.getAttribute("data-tab") === t);
        });
        $("patSubtitulo").textContent = ST.proy ? ST.proy.nombre : "Diseño de patronaje";
        const cu = $("patCuerpo");
        limpiarOyentes(cu);
        cu.className = "patCuerpo" + (t === "dibujo" ? " sinRelleno" : "");
        const avisoBeta = $("patAvisoBeta");
        if (avisoBeta) avisoBeta.style.display = (t === "proyectos") ? "" : "none";   // el cartel beta solo va en Proyectos
        cu.scrollTop = 0;
        if (t === "proyectos") vistaProyectos(cu);
        else if (t === "medidas") vistaMedidas(cu);
        else if (t === "patrones") vistaPatrones(cu);
        else if (t === "dibujo") vistaDibujo(cu);
        else if (t === "pdf") vistaPdf(cu);
    }

    // ------------------------------
    // Proyectos
    // ------------------------------
    function abrirProyecto(id, silencioso) {
        const p = ST.lista.filter(function (x) { return x.id === id; })[0];
        if (!p) return;
        ST.proy = p;
        ST.undo = []; ST.redo = [];
        ST.gen = null; ST.pdfRes = null;
        normalizarProyecto(p);
        if (!silencioso) {
            guardarYa();
            cambiarTab("dibujo");
        }
    }

    function nuevoProyecto(nombre) {
        const p = PN.nuevoProyecto(nombre || ("Patrón " + (ST.lista.length + 1)));
        ST.lista.unshift(p);
        ST.proy = p; ST.undo = []; ST.redo = [];
        guardarYa();
        return p;
    }

    function vistaProyectos(cu) {
        const filas = ST.lista.map(function (p) {
            const n = (p.shapes || []).filter(function (s) { return s.t === "path" && s.pieza; }).length;
            const f = new Date(p.mod || Date.now());
            return '<div class="patTarjeta" data-id="' + esc(p.id) + '">' +
                '<canvas class="patMini" width="150" height="110" data-mini="' + esc(p.id) + '"></canvas>' +
                '<div class="patTarjetaInfo"><strong>' + esc(p.nombre) + '</strong>' +
                '<span>' + n + ' pieza' + (n === 1 ? "" : "s") + ' · ' + f.toLocaleDateString() + '</span>' +
                '<div class="patBotonesFila">' +
                '<button type="button" data-a="abrir">Abrir</button>' +
                '<button type="button" data-a="renombrar">Nombre</button>' +
                '<button type="button" data-a="duplicar">Duplicar</button>' +
                '<button type="button" data-a="exportar">Respaldo</button>' +
                '<button type="button" class="peligro" data-a="borrar">Borrar</button>' +
                '</div></div></div>';
        }).join("");

        cu.innerHTML = '<div class="patIntro">' +
            '<p>Diseñá tus moldes con medidas reales: cargá las medidas, generá un patrón base o dibujalo a mano, y descargá el PDF para imprimirlo a escala real.</p>' +
            '</div>' +
            '<div class="patBotonesFila grande">' +
            '<button type="button" class="principal" id="patNuevo">＋ Nuevo proyecto</button>' +
            '<button type="button" id="patImportar">⬆ Importar respaldo</button>' +
            '<input type="file" id="patArchivoImp" accept=".json,application/json" style="display:none">' +
            '</div>' +
            (filas ? '<div class="patLista">' + filas + '</div>' : '<p class="patVacio">Todavía no tenés proyectos. Creá el primero.</p>') +
            '<p class="patNotaPie">Tus proyectos se guardan en este dispositivo. Usá "Respaldo" para guardar una copia en un archivo.</p>';

        cu.querySelectorAll("canvas[data-mini]").forEach(function (c) {
            const p = ST.lista.filter(function (x) { return x.id === c.getAttribute("data-mini"); })[0];
            if (p) dibujarMiniatura(c, PN.formasOrdenadas(p, true));
        });

        $("patNuevo").onclick = function () {
            const nombre = prompt("Nombre del proyecto:", "Patrón " + (ST.lista.length + 1));
            if (nombre === null) return;
            nuevoProyecto(nombre.trim() || undefined);
            cambiarTab("medidas");
        };
        $("patImportar").onclick = function () { $("patArchivoImp").click(); };
        $("patArchivoImp").onchange = function () {
            const f = this.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = function () {
                try {
                    const d = JSON.parse(r.result);
                    if (!d || !Array.isArray(d.shapes)) throw new Error("x");
                    d.id = PN.uid(); d.mod = Date.now();
                    d.nombre = (d.nombre || "Importado") + " (importado)";
                    normalizarProyecto(d);
                    ST.lista.unshift(d); guardarYa();
                    aviso("Proyecto importado.");
                    vistaProyectos(cu);
                } catch (e) { alert("El archivo no es un respaldo de patrón válido."); }
            };
            r.readAsText(f);
        };
        cu.querySelector(".patLista") && cu.querySelector(".patLista").addEventListener("click", function (e) {
            const b = e.target.closest("button[data-a]");
            const t = e.target.closest(".patTarjeta");
            if (!t) return;
            const id = t.getAttribute("data-id");
            const p = ST.lista.filter(function (x) { return x.id === id; })[0];
            if (!p) return;
            const a = b ? b.getAttribute("data-a") : "abrir";
            if (a === "abrir") abrirProyecto(id);
            else if (a === "renombrar") {
                const n = prompt("Nuevo nombre:", p.nombre);
                if (n && n.trim()) { p.nombre = n.trim(); guardarYa(); vistaProyectos(cu); }
            } else if (a === "duplicar") {
                const c = PN.clon(p); c.id = PN.uid(); c.nombre = p.nombre + " (copia)"; c.mod = Date.now();
                ST.lista.unshift(c); guardarYa(); vistaProyectos(cu);
            } else if (a === "exportar") {
                descargarArchivo(new Blob([JSON.stringify(p)], { type: "application/json" }), nombreArchivo(p.nombre) + ".json");
            } else if (a === "borrar") {
                if (!confirm('¿Borrar "' + p.nombre + '"? No se puede deshacer.')) return;
                ST.lista = ST.lista.filter(function (x) { return x.id !== id; });
                if (ST.proy && ST.proy.id === id) ST.proy = null;
                guardarYa(); vistaProyectos(cu);
            }
        });
    }

    function nombreArchivo(n) {
        return String(n || "patron").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "patron";
    }

    function descargarArchivo(blob, nombre) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = nombre;
        document.body.appendChild(a);
        try { a.click(); } catch (e) { window.open(url, "_blank"); }
        setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 30000);
    }

    // ------------------------------
    // Medidas
    // ------------------------------
    function vistaMedidas(cu) {
        const p = ST.proy;
        const per = p.perfil || (p.perfil = { sexo: "mujer", talle: "M", modelo: "" });
        const talles = Object.keys(PN.TALLES[per.sexo] || PN.TALLES.mujer);
        const perfiles = leer(clavePerfiles(), []);

        let html = '<div class="patBloque"><h3>Para quién es</h3>' +
            '<label class="patCampo">Nombre de la clienta / modelo (opcional)<input type="text" id="patModelo" value="' + esc(per.modelo) + '" maxlength="60" placeholder="Ej: María Pérez"></label>' +
            '<div class="patDosCol">' +
            '<label class="patCampo">Tipo de cuerpo<select id="patSexo"><option value="mujer"' + (per.sexo === "mujer" ? " selected" : "") + '>Mujer</option><option value="hombre"' + (per.sexo === "hombre" ? " selected" : "") + '>Hombre</option></select></label>' +
            '<label class="patCampo">Talle estándar<select id="patTalle">' + talles.map(function (t) { return '<option' + (per.talle === t ? " selected" : "") + '>' + t + '</option>'; }).join("") + '</select></label>' +
            '</div>' +
            '<div class="patBotonesFila"><button type="button" id="patAplicarTalle" class="principal">Aplicar talle estándar</button>' +
            '<button type="button" id="patDerivar">Completar medidas que faltan</button></div>' +
            '<p class="patAyuda">El tipo de cuerpo solo se usa para estimar las medidas: el molde se arma igual para todos. El talle estándar carga altura, busto, cintura y cadera, y estima el resto. Después podés corregir cada medida con la cinta métrica.</p></div>';

        PN.GRUPOS_MEDIDAS.forEach(function (g) {
            html += '<div class="patBloque"><h3>' + g.titulo + '</h3><div class="patGrillaMedidas">';
            PN.MEDIDAS.filter(function (m) { return m.g === g.id; }).forEach(function (m) {
                const v = p.medidas[m.k];
                html += '<label class="patMedida"><span class="patMedidaNombre">' + m.t + '</span>' +
                    '<span class="patMedidaInput"><input type="number" inputmode="decimal" step="0.5" min="0" data-m="' + m.k + '" value="' + (v == null ? "" : v) + '"><em>cm</em></span>' +
                    '<small>' + esc(m.ayuda) + '</small></label>';
            });
            html += '</div></div>';
        });

        html += '<div class="patBloque"><h3>Perfiles guardados</h3>' +
            '<p class="patAyuda">Guardá las medidas de una clienta para reutilizarlas en otros proyectos.</p>' +
            '<div class="patBotonesFila"><input type="text" id="patNombrePerfil" placeholder="Nombre del perfil" maxlength="40">' +
            '<button type="button" id="patGuardarPerfil">Guardar medidas actuales</button></div>' +
            '<div id="patPerfiles">' + perfiles.map(function (pf, i) {
                return '<div class="patFilaPerfil"><span>' + esc(pf.nombre) + '</span>' +
                    '<button type="button" data-pf="cargar" data-i="' + i + '">Cargar</button>' +
                    '<button type="button" class="peligro" data-pf="borrar" data-i="' + i + '">✕</button></div>';
            }).join("") + '</div></div>' +
            '<div class="patBotonesFila grande"><button type="button" class="principal" id="patIrPatrones">Siguiente: elegir patrón →</button></div>';

        cu.innerHTML = html;

        oyente(cu, "medidas", "change", function (e) {
            const t = e.target;
            if (t.hasAttribute("data-m")) {
                const v = PN.num(t.value, null);
                if (v === null || v < 0) { delete p.medidas[t.getAttribute("data-m")]; }
                else p.medidas[t.getAttribute("data-m")] = v;
                guardar();
            } else if (t.id === "patModelo") { per.modelo = t.value.trim(); guardar(); }
            else if (t.id === "patTalle") { per.talle = t.value; guardar(); }
            else if (t.id === "patSexo") {
                per.sexo = t.value;
                per.talle = "M";
                guardar(); vistaMedidas(cu);
            }
        });
        $("patAplicarTalle").onclick = function () {
            const base = (PN.TALLES[per.sexo] || {})[per.talle];
            if (!base) return;
            const m = PN.derivar(Object.assign({}, p.medidas, base), per.sexo);
            Object.keys(m).forEach(function (k) { p.medidas[k] = m[k]; });
            guardarYa(); vistaMedidas(cu); aviso("Talle " + per.talle + " aplicado.");
        };
        $("patDerivar").onclick = function () {
            const m = p.medidas;
            if (!(m.altura && m.busto && m.cintura && m.cadera)) { alert("Cargá al menos altura, busto, cintura y cadera."); return; }
            const d = PN.derivar(m, per.sexo);
            PN.MEDIDAS.forEach(function (x) { if (m[x.k] == null || m[x.k] === "") m[x.k] = d[x.k]; });
            guardarYa(); vistaMedidas(cu); aviso("Completé las medidas que faltaban.");
        };
        $("patGuardarPerfil").onclick = function () {
            const n = $("patNombrePerfil").value.trim();
            if (!n) { alert("Escribí un nombre para el perfil."); return; }
            const lista = leer(clavePerfiles(), []);
            lista.push({ nombre: n, medidas: PN.clon(p.medidas), sexo: per.sexo, talle: per.talle });
            escribir(clavePerfiles(), lista); vistaMedidas(cu); aviso("Perfil guardado.");
        };
        $("patPerfiles").onclick = function (e) {
            const b = e.target.closest("button[data-pf]");
            if (!b) return;
            const lista = leer(clavePerfiles(), []);
            const i = +b.getAttribute("data-i");
            if (b.getAttribute("data-pf") === "borrar") { lista.splice(i, 1); escribir(clavePerfiles(), lista); }
            else if (lista[i]) {
                p.medidas = Object.assign({}, p.medidas, lista[i].medidas);
                per.sexo = lista[i].sexo || per.sexo; per.talle = lista[i].talle || per.talle;
                if (!per.modelo) per.modelo = lista[i].nombre;
                guardarYa(); aviso("Perfil cargado.");
            }
            vistaMedidas(cu);
        };
        $("patIrPatrones").onclick = function () { cambiarTab("patrones"); };
    }

    // ------------------------------
    // Patrones paramétricos
    // ------------------------------
    function vistaPatrones(cu) {
        if (!ST.gen) {
            cu.innerHTML = '<div class="patIntro"><p>Elegí una base. Se calcula con las medidas del proyecto y después la podés ajustar a mano en el editor.</p></div>' +
                '<div class="patGeneradores">' + PN.GENERADORES.map(function (g) {
                    return '<button type="button" class="patGen" data-g="' + g.id + '"><span class="patGenIcono">' + g.icono + '</span>' +
                        '<strong>' + g.nombre + '</strong><small>' + g.desc + '</small></button>';
                }).join("") + '</div>';
            cu.querySelector(".patGeneradores").addEventListener("click", function (e) {
                const b = e.target.closest("button[data-g]");
                if (!b) return;
                ST.gen = b.getAttribute("data-g");
                const g = PN.GENERADORES.filter(function (x) { return x.id === ST.gen; })[0];
                ST.genP = PN.paramsPorDefecto(g, medidasProy());
                vistaPatrones(cu);
            });
            return;
        }
        const g = PN.GENERADORES.filter(function (x) { return x.id === ST.gen; })[0];
        const par = ST.genP;
        let html = '<button type="button" class="volverAtras patVolverGen" id="patVolverGen">← Otros patrones</button>' +
            '<h3 class="patTituloGen">' + g.icono + ' ' + g.nombre + '</h3><canvas id="patPrevCanvas" class="patPrev"></canvas>' +
            '<p class="patAyuda" id="patPrevInfo"></p><div class="patBloque"><h3>Parámetros</h3>';
        g.params.forEach(function (pp) {
            html += '<label class="patCampo">' + pp.t;
            if (pp.tipo === "num") html += '<input type="number" inputmode="decimal" step="0.5" min="' + pp.min + '" max="' + pp.max + '" data-p="' + pp.k + '" value="' + par[pp.k] + '">';
            else if (pp.tipo === "txt") html += '<input type="text" data-p="' + pp.k + '" value="' + esc(par[pp.k]) + '" maxlength="40">';
            else if (pp.tipo === "sel") html += '<select data-p="' + pp.k + '">' + pp.op.map(function (o) { return '<option value="' + o[0] + '"' + (String(par[pp.k]) === String(o[0]) ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>';
            else if (pp.tipo === "bool") html += '<span class="patCheck"><input type="checkbox" data-p="' + pp.k + '"' + (par[pp.k] ? " checked" : "") + '> Sí</span>';
            if (pp.ayuda) html += '<small>' + esc(pp.ayuda) + '</small>';
            html += '</label>';
        });
        html += '</div>' +
            '<label class="patCheck patBloque"><input type="checkbox" id="patReemplazar"> Borrar lo que ya hay en el lienzo antes de agregar</label>' +
            '<div class="patBotonesFila grande"><button type="button" class="principal" id="patAgregar">Agregar al lienzo y editar →</button></div>';
        cu.innerHTML = html;

        const generar = function () {
            const params = {};
            g.params.forEach(function (pp) {
                const el = cu.querySelector('[data-p="' + pp.k + '"]');
                if (!el) return;
                let v;
                if (pp.tipo === "num") { v = PN.num(el.value, pp.def && typeof pp.def !== "function" ? pp.def : 0); v = PN.clamp(v, pp.min, pp.max); }
                else if (pp.tipo === "bool") v = el.checked;
                else if (pp.tipo === "sel") { v = el.value; if (!isNaN(parseFloat(v)) && typeof pp.op[0][0] === "number") v = parseFloat(v); }
                else v = el.value;
                params[pp.k] = v;
            });
            ST.genP = params;
            let piezas = [];
            try { piezas = PN.generar(g.id, medidasProy(), params, 0, 0); } catch (e) { piezas = []; }
            return piezas;
        };
        const preview = function () {
            const c = $("patPrevCanvas");
            if (!c) return;
            const piezas = generar();
            const w = c.clientWidth || 320, h = 260, dpr = window.devicePixelRatio || 1;
            c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
            const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
            const bb = PN.cajaDeTodo(piezas, { sa: true });
            if (!bb) { ctx.fillStyle = "#12131a"; ctx.fillRect(0, 0, w, h); return; }
            const z = Math.min((w - 20) / (bb.x1 - bb.x0), (h - 20) / (bb.y1 - bb.y0));
            const v = { z: z, ox: (w - (bb.x1 - bb.x0) * z) / 2 - bb.x0 * z, oy: (h - (bb.y1 - bb.y0) * z) / 2 - bb.y0 * z };
            renderEscena(ctx, w, h, v, piezas, { grid: false, showSA: true, etiquetas: true });
            const r = PN.resumenPiezas(piezas, ST.proy.tela.ancho);
            $("patPrevInfo").textContent = piezas.length + " pieza" + (piezas.length === 1 ? "" : "s") + " · tamaño total " +
                nf(bb.x1 - bb.x0, 0) + " × " + nf(bb.y1 - bb.y0, 0) + " cm · tela de " + r.anchoTela + " cm: aprox. " + nf(r.consumoMin / 100, 1) + " a " + nf(r.consumoMax / 100, 1) + " m";
        };
        const leerValores = function () {
            const v = {};
            g.params.forEach(function (pp) {
                const el = cu.querySelector('[data-p="' + pp.k + '"]');
                if (el) v[pp.k] = pp.tipo === "bool" ? el.checked : el.value;
            });
            return v;
        };
        // Campos que solo se muestran si corresponde (p. ej. sin manga no hay largo de manga)
        const actualizarCampos = function () {
            const v = leerValores();
            g.params.forEach(function (pp) {
                if (typeof pp.solo !== "function") return;
                const el = cu.querySelector('[data-p="' + pp.k + '"]');
                const lab = el && el.closest("label");
                if (lab) lab.style.display = pp.solo(v) ? "" : "none";
            });
        };
        // Campos que se completan solos cuando cambia otro (p. ej. largo de manga según el tipo de manga)
        oyente(cu, "patAuto", "change", function (e) {
            const k = e.target.getAttribute && e.target.getAttribute("data-p");
            if (!k || !cu.querySelector("#patPrevCanvas")) return;
            const v = leerValores();
            g.params.forEach(function (pp) {
                if (pp.dep !== k || typeof pp.auto !== "function") return;
                const el = cu.querySelector('[data-p="' + pp.k + '"]');
                const nv = pp.auto(ST.proy.medidas, v);
                if (el && nv != null) el.value = nv;
            });
            actualizarCampos();
        });
        actualizarCampos();
        preview();
        oyente(cu, "patInput", "input", function (e) { if (e.target.hasAttribute("data-p")) preview(); });
        oyente(cu, "patPrev", "change", function (e) { if (e.target.hasAttribute("data-p")) preview(); });
        $("patVolverGen").onclick = function () { ST.gen = null; vistaPatrones(cu); };
        $("patAgregar").onclick = function () {
            const reemplazar = $("patReemplazar").checked;
            const piezas = generar();
            if (!piezas.length) { alert("No se pudo generar con esos valores."); return; }
            snapshot();
            if (reemplazar) { ST.proy.shapes = []; ST.proy.gens = []; ST.proy.capas = []; }
            PN.asegurarCapas(ST.proy);
            const bb = PN.cajaDeTodo(ST.proy.shapes, { sa: true });
            const x0 = bb ? bb.x1 + 10 : 0, y0 = bb ? bb.y0 : 0;
            const nuevas = PN.generar(g.id, medidasProy(), ST.genP, x0, y0);
            // Cada patrón generado va en su propia capa (arriba de todo), así se puede ocultar o bloquear.
            let capaNueva;
            if (ST.proy.capas.length === 1 && !ST.proy.shapes.length) {
                capaNueva = ST.proy.capas[0];       // proyecto vacío: se aprovecha la capa inicial en vez de dejarla sobrando
                capaNueva.nombre = g.nombre;
            } else {
                capaNueva = PN.nuevaCapa(g.nombre);
                ST.proy.capas.push(capaNueva);
            }
            ST.proy.capaActiva = capaNueva.id;
            nuevas.forEach(function (s) { s.gen = g.id; s.capa = capaNueva.id; ST.proy.shapes.push(s); });
            (ST.proy.gens = ST.proy.gens || []).push({ id: g.id, params: PN.clon(ST.genP), medidas: medidasProy() });
            ST.proy.vista = null;
            guardarYa();
            cambiarTab("dibujo");
            ajustarVista();
            aviso("Patrón agregado. Tocá una pieza para editarla.");
        };
    }

    // ------------------------------
    // Historial (deshacer / rehacer)
    // ------------------------------
    // El historial guarda formas Y capas, así los cambios de capas también se deshacen.
    function estadoActual() { return JSON.stringify({ s: ST.proy.shapes, c: ST.proy.capas, a: ST.proy.capaActiva }); }
    function aplicarEstado(txt) {
        const o = JSON.parse(txt);
        ST.proy.shapes = o.s; ST.proy.capas = o.c; ST.proy.capaActiva = o.a;
        PN.asegurarCapas(ST.proy);
    }
    function snapshot() {
        if (!ST.proy) return;
        ST.undo.push(estadoActual());
        if (ST.undo.length > 80) ST.undo.shift();
        ST.redo = [];
    }
    function deshacer() {
        if (!ST.undo.length) return;
        ST.redo.push(estadoActual());
        aplicarEstado(ST.undo.pop());
        tras();
    }
    function rehacer() {
        if (!ST.redo.length) return;
        ST.undo.push(estadoActual());
        aplicarEstado(ST.redo.pop());
        tras();
    }
    function tras() {
        if (ED) {
            if (!buscar(ED.sel)) { ED.sel = null; ED.selV = -1; ED.selE = -1; }
            limpiarSeleccionInaccesible();
            normalizarGrupo(); ED.area = null;
            ED.pend = null;
            renderPropsYFlot(); dibujar();
        }
        guardar();
    }

    // ------------------------------
    // Renderizado de escenas (editor, previews y miniaturas)
    // ------------------------------
    const COL = {
        fondo: "#12131a", linea: "#e8edf1", relleno: "rgba(137,166,184,0.10)", costura: "#d4af37",
        sel: "#6fdc8c", vinc: "#38bdf8", acento: "#89A6B8", pinza: "#6aa8ff", hilo: "#9fe0b0", cota: "#7fb7ff", nota: "#ff8f8f", medida: "#ffd84a"
    };

    function dibujarGrilla(ctx, W, H, v) {
        const z = v.z;
        const pasos = [0.5, 1, 2, 5, 10, 20, 50, 100];
        const mayores = { 0.5: 5, 1: 10, 2: 10, 5: 50, 10: 50, 20: 100, 50: 100, 100: 500 };
        let menor = 100;
        for (let i = 0; i < pasos.length; i++) { if (pasos[i] * z >= 9) { menor = pasos[i]; break; } }
        const mayor = mayores[menor];
        const x0 = -v.ox / z, x1 = (W - v.ox) / z, y0 = -v.oy / z, y1 = (H - v.oy) / z;
        ctx.lineWidth = 1;
        const lineas = function (paso, alfa) {
            ctx.strokeStyle = "rgba(160,190,210," + alfa + ")";
            ctx.beginPath();
            for (let x = Math.floor(x0 / paso) * paso; x <= x1; x += paso) { const px = Math.round(x * z + v.ox) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
            for (let y = Math.floor(y0 / paso) * paso; y <= y1; y += paso) { const py = Math.round(y * z + v.oy) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
            ctx.stroke();
        };
        lineas(menor, 0.07);
        lineas(mayor, 0.16);
        // Ejes
        ctx.strokeStyle = "rgba(111,220,140,0.45)";
        ctx.beginPath();
        const ax = Math.round(v.ox) + 0.5, ay = Math.round(v.oy) + 0.5;
        ctx.moveTo(ax, 0); ctx.lineTo(ax, H); ctx.moveTo(0, ay); ctx.lineTo(W, ay);
        ctx.stroke();
        // Números en los bordes
        ctx.fillStyle = "rgba(190,210,225,0.65)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        for (let x = Math.ceil(x0 / mayor) * mayor; x <= x1; x += mayor) ctx.fillText(String(Math.round(x * 10) / 10), Math.round(x * z + v.ox) + 3, 2);
        ctx.textBaseline = "bottom";
        for (let y = Math.ceil(y0 / mayor) * mayor; y <= y1; y += mayor) { if (Math.abs(y) < 1e-9) continue; ctx.fillText(String(Math.round(y * 10) / 10), 3, Math.round(y * z + v.oy) - 2); }
        ctx.fillStyle = "rgba(190,210,225,0.45)";
        ctx.textAlign = "right"; ctx.textBaseline = "bottom";
        ctx.fillText("cm", W - 4, H - 3);
    }

    function trazarPoli(ctx, pts, S, cerrada) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const q = S(pts[i].x, pts[i].y);
            if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        }
        if (cerrada) ctx.closePath();
    }

    function flecha(ctx, a, b, color, ancho, doble) {
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = ancho || 1.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const hl = Math.min(9, L * 0.3), hw = hl * 0.38;
        const punta = function (p, s) {
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(p[0] + s * ux * hl - uy * hw, p[1] + s * uy * hl + ux * hw);
            ctx.lineTo(p[0] + s * ux * hl + uy * hw, p[1] + s * uy * hl - ux * hw);
            ctx.closePath(); ctx.fill();
        };
        punta(b, -1);
        if (doble) punta(a, 1);
    }

    function etiquetaTexto(ctx, txt, x, y, color, fondo) {
        ctx.font = "11px sans-serif";
        const w = ctx.measureText(txt).width;
        ctx.fillStyle = fondo || "rgba(18,19,26,0.85)";
        ctx.fillRect(x - w / 2 - 3, y - 8, w + 6, 16);
        ctx.fillStyle = color || "#fff";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(txt, x, y);
    }

    function renderEscena(ctx, W, H, v, shapes, o) {
        o = o || {};
        ctx.save();
        ctx.fillStyle = o.fondo || COL.fondo; ctx.fillRect(0, 0, W, H);
        if (o.grid !== false) dibujarGrilla(ctx, W, H, v);
        const S = function (x, y) { return [x * v.z + v.ox, y * v.z + v.oy]; };
        shapes.forEach(function (s) {
            const sel = o.sel === s.id;
            ctx.globalAlpha = (o.alfa && o.alfa[s.id] != null) ? o.alfa[s.id] : 1;
            if (s.t === "path") dibujarPathCanvas(ctx, s, S, v, o, sel);
            else if (s.t === "text") {
                const q = S(s.p.x, s.p.y);
                ctx.fillStyle = sel ? COL.sel : "#fff";
                ctx.font = Math.max(8, (s.size || 1) * v.z) + "px sans-serif";
                ctx.textAlign = "left"; ctx.textBaseline = "top";
                ctx.fillText(s.text || "", q[0], q[1]);
                if (sel) {
                    const w = ctx.measureText(s.text || "").width;
                    ctx.strokeStyle = COL.sel; ctx.setLineDash([4, 3]); ctx.strokeRect(q[0] - 3, q[1] - 3, w + 6, Math.max(8, (s.size || 1) * v.z) + 6); ctx.setLineDash([]);
                }
            } else if (s.t === "dim") dibujarCotaCanvas(ctx, s, S, sel, o.handles && sel);
        });
        ctx.restore();
    }

    function dibujarPathCanvas(ctx, s, S, v, o, sel) {
        const fl = PN.aplanar(s, 14);
        const cerr = fl.closed;
        const pieza = s.pieza && cerr;

        if (pieza && o.showSA !== false) {
            const c = PN.contornoConMargen(s);
            if (c) {
                trazarPoli(ctx, c, S, true);
                ctx.strokeStyle = COL.costura; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
            }
        }
        trazarPoli(ctx, fl.pts, S, cerr);
        if (pieza) { ctx.fillStyle = COL.relleno; ctx.fill(); }
        const esSocia = !sel && o.socia && o.socia[s.id];
        const enG = !sel && o.enGrupo && o.enGrupo[s.id];
        ctx.strokeStyle = sel ? COL.sel : (enG ? "#ffd666" : (esSocia ? COL.vinc : COL.linea)); ctx.lineWidth = sel ? 2.4 : ((esSocia || enG) ? 2.2 : 1.7); ctx.lineJoin = "round"; ctx.stroke();

        // Lado seleccionado
        if (sel && o.selE >= 0) {
            ctx.strokeStyle = COL.costura; ctx.lineWidth = 4; ctx.beginPath();
            let abierto = false;
            for (let i = 0; i < fl.pts.length; i++) {
                if (fl.edge[i] !== o.selE) continue;
                const a = S(fl.pts[i].x, fl.pts[i].y), b = fl.pts[i + 1] ? S(fl.pts[i + 1].x, fl.pts[i + 1].y) : S(fl.pts[0].x, fl.pts[0].y);
                ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); abierto = true;
            }
            if (abierto) ctx.stroke();
        }

        if (pieza) {
            // Doblez
            (s.fold || []).forEach(function (e) {
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath();
                for (let i = 0; i < fl.pts.length; i++) {
                    if (fl.edge[i] !== e) continue;
                    const a = S(fl.pts[i].x, fl.pts[i].y), nx = fl.pts[(i + 1) % fl.pts.length], b = S(nx.x, nx.y);
                    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                }
                ctx.stroke();
            });
            // Pinzas
            (s.darts || []).forEach(function (d) {
                const a = S(d.a.x, d.a.y), t = S(d.t.x, d.t.y), b = S(d.b.x, d.b.y);
                ctx.strokeStyle = COL.pinza; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(t[0], t[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
            });
            // Líneas internas
            (s.lineas || []).forEach(function (l) {
                const a = S(l.a.x, l.a.y), b = S(l.b.x, l.b.y);
                ctx.strokeStyle = "rgba(200,210,220,0.55)"; ctx.lineWidth = 1; ctx.setLineDash(l.dash ? [5, 4] : []);
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
            });
            // Rótulos (Del. / Esp.)
            (s.marcas || []).forEach(function (q) {
                const a = S(q.p.x, q.p.y);
                ctx.fillStyle = COL.medida; ctx.font = "bold " + Math.max(11, Math.min(18, v.z * 1.6)) + "px sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(q.t, a[0], a[1]);
            });
            // Piquetes
            const area = (function () { let a = 0; for (let i = 0; i < fl.pts.length; i++) { const p = fl.pts[i], q = fl.pts[(i + 1) % fl.pts.length]; a += p.x * q.y - q.x * p.y; } return a; })();
            (s.notches || []).forEach(function (n) {
                const c = PN.cercanoEnContorno(s, n);
                if (!c) return;
                const dx = c.bx - c.ax, dy = c.by - c.ay, L = Math.hypot(dx, dy) || 1;
                const sg = area > 0 ? 1 : -1;
                const nx = sg > 0 ? dy / L : -dy / L, ny = sg > 0 ? -dx / L : dx / L;
                const a = S(c.x, c.y);
                ctx.strokeStyle = COL.nota; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + nx * 8, a[1] + ny * 8); ctx.stroke();
            });
            // Hilo
            if (s.grain) flecha(ctx, S(s.grain.a.x, s.grain.a.y), S(s.grain.b.x, s.grain.b.y), COL.hilo, 1.4, true);
            // Rótulo (el nombre de la pieza se ve siempre)
            const caja = PN.cajaDeShape(s);
            if (o.etiquetas !== false) {
                const grande = (caja.x1 - caja.x0) * v.z > 58 && (caja.y1 - caja.y0) * v.z > 34;
                const cen = s.lab || PN.centroide(fl.pts), q = S(cen.x, cen.y);
                const l1 = s.name || "Pieza";
                const l2 = "×" + (s.qty || 1) + ((s.fold && s.fold.length) ? " al doblez" : "");
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.font = "bold 11px sans-serif";
                const w = Math.max(24, Math.min(ctx.measureText(l1).width, Math.max(24, (caja.x1 - caja.x0) * v.z * 0.9)));
                ctx.fillStyle = "rgba(18,19,26,0.78)";
                if (grande) {
                    ctx.fillRect(q[0] - w / 2 - 3, q[1] - 16, w + 6, 30);
                    ctx.fillStyle = "#fff"; ctx.fillText(l1, q[0], q[1] - 7, w);
                    ctx.font = "10px sans-serif"; ctx.fillStyle = "#b9c7d3"; ctx.fillText(l2, q[0], q[1] + 7, w);
                } else {
                    ctx.fillRect(q[0] - w / 2 - 3, q[1] - 9, w + 6, 18);
                    ctx.fillStyle = "#fff"; ctx.fillText(l1, q[0], q[1], w);
                }
            }
        }

        if (o.verMedidas) dibujarMedidasPath(ctx, S, s, fl);

        // Cuadraditos de puntos para la herramienta Seleccionar (todos) o puntos del grupo (resaltados)
        if ((o.ptsVis && o.ptsVis[s.id]) || (o.grupoPts && o.grupoPts[s.id])) {
            const gp = o.grupoPts && o.grupoPts[s.id];
            const ver = !!(o.ptsVis && o.ptsVis[s.id]);
            s.pts.forEach(function (p, i) {
                const en = !!(gp && gp[i]);
                if (!ver && !en) return;
                const q = S(p.x, p.y), r = en ? 6 : 4.5;
                ctx.fillStyle = en ? "#ffd666" : "#12131a";
                ctx.strokeStyle = en ? "#fff" : COL.acento; ctx.lineWidth = 1.6;
                ctx.beginPath();
                if (p.s) ctx.arc(q[0], q[1], r, 0, 6.2832); else ctx.rect(q[0] - r, q[1] - r, 2 * r, 2 * r);
                ctx.fill(); ctx.stroke();
            });
        }
        // Manijas de puntos
        if (sel && o.handles) {
            s.pts.forEach(function (p, i) {
                const q = S(p.x, p.y);
                const act = o.selV === i;
                ctx.fillStyle = act ? COL.costura : "#12131a";
                ctx.strokeStyle = act ? "#fff" : COL.sel; ctx.lineWidth = 2;
                ctx.beginPath();
                if (p.s) ctx.arc(q[0], q[1], 6, 0, 6.2832); else ctx.rect(q[0] - 5.5, q[1] - 5.5, 11, 11);
                ctx.fill(); ctx.stroke();
            });
        }
    }

    // Medidas en pantalla: con nombre en los moldes generados; en lo demás, solo los cm.
    function trazarMedida(ctx, S, A, B, nombre, nota, o) {
        o = o || {};
        const a = S(A.x, A.y), b = S(B.x, B.y);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), cm = Math.hypot(B.x - A.x, B.y - A.y);
        if (L < 4 || cm < 0.05) return;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        let nx = -uy, ny = ux, off = 0;
        if (o.fuera) {
            off = o.off || 16;
            if (o.cen) {
                const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
                const haciaCentro = (o.cen[0] - mx) * nx + (o.cen[1] - my) * ny > 0;
                if (o.dentro ? !haciaCentro : haciaCentro) { nx = -nx; ny = -ny; }
            }
        }
        const a2 = [a[0] + nx * off, a[1] + ny * off], b2 = [b[0] + nx * off, b[1] + ny * off];
        ctx.save();
        ctx.strokeStyle = COL.medida; ctx.lineWidth = 1.2; ctx.setLineDash([]);
        ctx.beginPath();
        if (off) { ctx.moveTo(a[0], a[1]); ctx.lineTo(a2[0], a2[1]); ctx.moveTo(b[0], b[1]); ctx.lineTo(b2[0], b2[1]); }
        ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]);
        [a2, b2].forEach(function (p) { ctx.moveTo(p[0] - nx * 5, p[1] - ny * 5); ctx.lineTo(p[0] + nx * 5, p[1] + ny * 5); });
        ctx.stroke();
        if (L >= 24 || o.siempre) {
            const pos = o.pos == null ? 0.5 : o.pos;
            const mx = a2[0] + (b2[0] - a2[0]) * pos, my = a2[1] + (b2[1] - a2[1]) * pos;
            let ang = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]);
            if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI;
            const txt = (nombre ? nombre + ": " : "") + nf(cm, 1) + " cm";
            ctx.translate(mx, my); ctx.rotate(ang);
            ctx.font = "bold 10.5px sans-serif";
            const w1 = ctx.measureText(txt).width;
            let w2 = 0;
            if (nota) { ctx.font = "9.5px sans-serif"; w2 = ctx.measureText(nota).width; }
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.font = "bold 10.5px sans-serif"; ctx.fillStyle = COL.medida; ctx.fillText(txt, 0, nota ? -6 : 0);
            if (nota) { ctx.font = "9.5px sans-serif"; ctx.fillStyle = COL.medida; ctx.fillText(nota, 0, 7); }
        }
        ctx.restore();
    }

    function dibujarMedidasPath(ctx, S, s, fl) {
        if (s.dims && s.dims.length) {
            const c = PN.centroide(fl.pts), cen = S(c.x, c.y);
            s.dims.forEach(function (d) {
                const A = PN.extremoDim(s, d.a), B = PN.extremoDim(s, d.b);
                if (A && B) trazarMedida(ctx, S, A, B, d.t, d.nota, { fuera: d.fuera, off: d.off, pos: d.pos, cen: cen, siempre: d.siempre, dentro: d.dentro });
            });
        } else if (s.closed) {
            const b = PN.cajaDeShape(s), cc = S((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
            trazarMedida(ctx, S, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 }, "", "", { fuera: true, cen: cc });
            trazarMedida(ctx, S, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, "", "", { fuera: true, cen: cc });
        } else if (fl.pts.length >= 2) {
            const tot = PN.largoPoli(fl.pts, false);
            let acc = 0, p = fl.pts[0];
            for (let i = 0; i < fl.pts.length - 1; i++) {
                const l = PN.dist(fl.pts[i], fl.pts[i + 1]);
                if (acc + l >= tot / 2) { const t = l ? (tot / 2 - acc) / l : 0; p = { x: fl.pts[i].x + (fl.pts[i + 1].x - fl.pts[i].x) * t, y: fl.pts[i].y + (fl.pts[i + 1].y - fl.pts[i].y) * t }; break; }
                acc += l;
            }
            const q = S(p.x, p.y);
            etiquetaTexto(ctx, nf(tot, 1) + " cm", q[0], q[1] - 12, COL.medida);
        }
    }

    function dibujarCotaCanvas(ctx, s, S, sel, handles) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy);
        if (L < 1e-6) return;
        const off = s.off || 0, nx = dy / L, ny = -dx / L;
        const a0 = S(s.a.x, s.a.y), b0 = S(s.b.x, s.b.y);
        const a = S(s.a.x + nx * off, s.a.y + ny * off), b = S(s.b.x + nx * off, s.b.y + ny * off);
        const col = sel ? COL.sel : COL.cota;
        if (Math.abs(off) > 0.01) {
            ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
            ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a[0], a[1]); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        flecha(ctx, a, b, col, 1.3, true);
        etiquetaTexto(ctx, nf(L, 1) + " cm", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, col);
        if (handles) {
            [a0, b0].forEach(function (q) {
                ctx.fillStyle = "#12131a"; ctx.strokeStyle = COL.sel; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 6.2832); ctx.fill(); ctx.stroke();
            });
        }
    }

    function dibujarMiniatura(canvas, shapes) {
        const w = canvas.width, h = canvas.height, ctx = canvas.getContext("2d");
        const bb = PN.cajaDeTodo(shapes, { sa: false });
        if (!bb) {
            ctx.fillStyle = COL.fondo; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#566"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Vacío", w / 2, h / 2);
            return;
        }
        const bw = Math.max(1, bb.x1 - bb.x0), bh = Math.max(1, bb.y1 - bb.y0);
        const z = Math.min((w - 14) / bw, (h - 14) / bh);
        const v = { z: z, ox: (w - bw * z) / 2 - bb.x0 * z, oy: (h - bh * z) / 2 - bb.y0 * z };
        renderEscena(ctx, w, h, v, shapes, { grid: false, showSA: false, etiquetas: false });
    }

    // ------------------------------
    // Capas (panel tipo Ibis Paint)
    // ------------------------------
    // Las capas se dibujan de abajo hacia arriba. La capa "elegida" es donde se dibuja y se pega.
    // Una capa oculta no se ve ni se imprime; una bloqueada se ve pero no se puede tocar.
    const CREAN_FORMAS = { linea: 1, poli: 1, curva: 1, lapiz: 1, rect: 1, circ: 1, cota: 1, texto: 1 };

    function capaPorId(id) { return ST.proy.capas.filter(function (c) { return c.id === id; })[0] || null; }
    function capaActiva() {
        PN.asegurarCapas(ST.proy);
        return capaPorId(ST.proy.capaActiva) || ST.proy.capas[ST.proy.capas.length - 1];
    }
    function capaEditable() { const c = capaActiva(); return c.visible !== false && !c.bloqueada; }
    function formasVisibles() { return PN.formasOrdenadas(ST.proy, true); }
    function formasInteractivas() {
        const vis = formasVisibles(), ok = {};
        ST.proy.capas.forEach(function (c) { ok[c.id] = c.visible !== false && !c.bloqueada; });
        return vis.filter(function (s) { return ok[s.capa]; });
    }
    function mapaAlfa() {
        const op = {}, m = {};
        ST.proy.capas.forEach(function (c) { op[c.id] = (c.opacidad == null ? 100 : c.opacidad) / 100; });
        ST.proy.shapes.forEach(function (s) { if (op[s.capa] !== undefined && op[s.capa] < 1) m[s.id] = op[s.capa]; });
        return m;
    }
    function activarCapaDe(id) {
        const s = buscar(id);
        if (!s || !s.capa || ST.proy.capaActiva === s.capa) return;
        ST.proy.capaActiva = s.capa;
        refrescarCapas();
    }
    // Si una capa se oculta o se bloquea, lo que estaba seleccionado en ella se suelta.
    function limpiarSeleccionInaccesible() {
        if (!ED) return;
        const ok = {};
        formasInteractivas().forEach(function (s) { ok[s.id] = true; });
        if (ED.sel && !ok[ED.sel]) { ED.sel = null; ED.selV = -1; ED.selE = -1; }
        if (ED.vincular && !ok[ED.vincular]) ED.vincular = null;
        if (ED.grupo) {
            ED.grupo.items = ED.grupo.items.filter(function (it) { return ok[it.id]; });
            if (!ED.grupo.items.length) ED.grupo = null;
        }
    }
    function idsSeleccion() {
        if (ED.grupo) return ED.grupo.items.map(function (it) { return it.id; });
        return ED.sel ? [ED.sel] : [];
    }

    function alternarPanelCapas(abrir) {
        const el = $("patCapas"), b = $("patBtnCapa");
        if (!el || !b) return;
        const ab = abrir === undefined ? !el.classList.contains("abierto") : abrir;
        el.classList.toggle("abierto", ab);
        b.classList.toggle("activo", ab);
        if (ab) { ajustarPanelCapas(); renderCapas(); }
    }
    function ajustarPanelCapas() {
        const el = $("patCapas");
        if (!el || !ED || !el.classList.contains("abierto")) return;
        const arriba = $("patCuerpo").getBoundingClientRect().top;
        const abajo = ED.caja.getBoundingClientRect().bottom;
        el.style.maxHeight = Math.max(180, Math.min(abajo - arriba - 78, 560)) + "px";
    }
    function refrescarCapas() {
        if (!ED || ED.capasPend) return;
        const el = $("patCapas");
        if (!el || !el.classList.contains("abierto")) return;
        ED.capasPend = true;
        requestAnimationFrame(function () { if (!ED) return; ED.capasPend = false; renderCapas(); });
    }

    function dibujarMiniCapa(cv, id) {
        const ctx = cv.getContext("2d"), w = cv.width, h = cv.height;
        const todas = PN.formasOrdenadas(ST.proy, false);
        const bb = PN.cajaDeTodo(todas, { sa: false });
        ctx.fillStyle = COL.fondo; ctx.fillRect(0, 0, w, h);
        if (!bb) return;
        const propias = todas.filter(function (x) { return x.capa === id; });
        const bw = Math.max(1, bb.x1 - bb.x0), bh = Math.max(1, bb.y1 - bb.y0);
        const z = Math.min((w - 8) / bw, (h - 8) / bh);
        const v = { z: z, ox: (w - bw * z) / 2 - bb.x0 * z, oy: (h - bh * z) / 2 - bb.y0 * z };
        renderEscena(ctx, w, h, v, propias, { grid: false, showSA: false, etiquetas: false });
    }

    function renderCapas() {
        const el = $("patCapas");
        if (!el || !ED || !el.classList.contains("abierto")) return;
        const P = ST.proy;
        PN.asegurarCapas(P);
        const act = capaActiva();
        const cuenta = {};
        P.shapes.forEach(function (x) { cuenta[x.capa] = (cuenta[x.capa] || 0) + 1; });
        const i = P.capas.indexOf(act);
        const haySuperior = i < P.capas.length - 1, hayInferior = i > 0, unica = P.capas.length <= 1;
        const dis = function (c) { return c ? " disabled" : ""; };
        let h = '<div class="patCapasCab"><strong>Capas</strong><span>' + P.capas.length + '</span>' +
            '<button type="button" class="principal" data-c="nueva">＋ Nueva</button><button type="button" data-c="cerrar" title="Cerrar">✕</button></div>';
        h += '<div class="patCapasLista">';
        P.capas.slice().reverse().forEach(function (c) {
            const n = cuenta[c.id] || 0;
            h += '<div class="patCapaFila' + (c.id === act.id ? " activa" : "") + (c.visible === false ? " oculta" : "") + '" data-c="elegir" data-id="' + esc(c.id) + '">' +
                '<canvas class="patCapaMini" width="88" height="68" data-cm="' + esc(c.id) + '"></canvas>' +
                '<span class="patCapaTxt"><b>' + esc(c.nombre) + '</b><small>' + n + (n === 1 ? " objeto" : " objetos") + ' · ' + Math.round(c.opacidad) + '%</small></span>' +
                '<button type="button" class="patCapaIc' + (c.visible === false ? " apagado" : "") + '" data-c="ojo" title="Mostrar u ocultar">' + (c.visible === false ? "🚫" : "👁") + '</button>' +
                '<button type="button" class="patCapaIc' + (c.bloqueada ? "" : " apagado") + '" data-c="candado" title="Bloquear o desbloquear">' + (c.bloqueada ? "🔒" : "🔓") + '</button></div>';
        });
        h += '</div><div class="patCapasOpc"><b>Capa elegida: ' + esc(act.nombre) + '</b>' +
            '<label class="patCampo">Nombre<input type="text" data-cf="nombre" value="' + esc(act.nombre) + '" maxlength="30"></label>' +
            '<label class="patCampo"><span>Opacidad: <b id="patOpacVal">' + Math.round(act.opacidad) + '</b>%</span><input type="range" min="0" max="100" step="1" data-cf="opac" value="' + Math.round(act.opacidad) + '"></label>' +
            '<div class="patCapasBtns">' +
            '<button type="button" data-c="subir"' + dis(!haySuperior) + '>▲ Subir</button>' +
            '<button type="button" data-c="bajar"' + dis(!hayInferior) + '>▼ Bajar</button>' +
            '<button type="button" data-c="dup">⧉ Duplicar</button>' +
            '<button type="button" data-c="unir"' + dis(!hayInferior) + '>⤓ Unir con la de abajo</button>' +
            '<button type="button" data-c="mover">↘ Mover selección acá</button>' +
            '<button type="button" data-c="selTodo">⬚ Seleccionar todo</button>' +
            '<button type="button" data-c="solo">◐ Solo esta capa</button>' +
            '<button type="button" data-c="mostrar">👁 Mostrar todas</button>' +
            '<button type="button" data-c="vaciar">🧹 Vaciar capa</button>' +
            '<button type="button" class="peligro" data-c="borrar"' + dis(unica) + '>🗑 Eliminar capa</button></div>' +
            '<p class="patCapasNota">Lo que dibujes, pegues o generes va a la capa elegida. Las capas ocultas no se imprimen en el PDF; las bloqueadas se ven pero no se pueden tocar.</p></div>';
        el.innerHTML = h;
        el.querySelectorAll("canvas[data-cm]").forEach(function (cv) { dibujarMiniCapa(cv, cv.getAttribute("data-cm")); });
    }

    function nombreCapaLibre() {
        let n = ST.proy.capas.length + 1;
        while (ST.proy.capas.some(function (c) { return c.nombre === "Capa " + n; })) n++;
        return "Capa " + n;
    }

    function terminarCambioCapas() {
        limpiarSeleccionInaccesible();
        guardar(); renderPropsYFlot(); dibujar();
    }

    function clickCapas(e) {
        const b = e.target.closest("[data-c]");
        if (!b || !ED || b.disabled) return;
        const fila = e.target.closest(".patCapaFila");
        accionCapa(b.getAttribute("data-c"), fila ? fila.getAttribute("data-id") : null);
    }

    function accionCapa(a, id) {
        const P = ST.proy;
        if (a === "cerrar") { alternarPanelCapas(false); return; }
        if (a === "elegir") {
            if (id && capaPorId(id) && P.capaActiva !== id) { P.capaActiva = id; guardar(); renderCapas(); }
            return;
        }
        const act = capaActiva();
        const i = P.capas.indexOf(act);
        if (a === "ojo" || a === "candado") {
            const c = capaPorId(id);
            if (!c) return;
            snapshot();
            if (a === "ojo") c.visible = (c.visible === false); else c.bloqueada = !c.bloqueada;
        } else if (a === "nueva") {
            snapshot();
            const nueva = PN.nuevaCapa(nombreCapaLibre());
            P.capas.splice(i + 1, 0, nueva);
            P.capaActiva = nueva.id;
        } else if (a === "subir" || a === "bajar") {
            const j = a === "subir" ? i + 1 : i - 1;
            if (j < 0 || j >= P.capas.length) return;
            snapshot();
            const t = P.capas[i]; P.capas[i] = P.capas[j]; P.capas[j] = t;
        } else if (a === "dup") {
            snapshot();
            const nueva = PN.nuevaCapa(act.nombre + " copia");
            nueva.visible = act.visible; nueva.opacidad = act.opacidad;
            const grupos = {};
            P.shapes.filter(function (x) { return x.capa === act.id; }).forEach(function (x) {
                const c2 = PN.clon(x);
                c2.id = PN.uid(); c2.capa = nueva.id;
                if (c2.vinc) { grupos[c2.vinc] = grupos[c2.vinc] || PN.uid(); c2.vinc = grupos[c2.vinc]; }
                P.shapes.push(c2);
            });
            P.capas.splice(i + 1, 0, nueva);
            P.capaActiva = nueva.id;
        } else if (a === "unir") {
            if (i <= 0) return;
            snapshot();
            const debajo = P.capas[i - 1];
            P.shapes.forEach(function (x) { if (x.capa === act.id) x.capa = debajo.id; });
            P.capas.splice(i, 1);
            P.capaActiva = debajo.id;
        } else if (a === "mover") {
            const ids = idsSeleccion();
            if (!ids.length) { aviso("Elegí primero un objeto (o un grupo) en el lienzo."); return; }
            snapshot();
            P.shapes.forEach(function (x) { if (ids.indexOf(x.id) >= 0) x.capa = act.id; });
            aviso("Movido a «" + act.nombre + "».");
        } else if (a === "selTodo") {
            if (act.visible === false || act.bloqueada) { aviso("La capa está oculta o bloqueada."); return; }
            const fs = P.shapes.filter(function (x) { return x.capa === act.id; });
            if (!fs.length) { aviso("La capa está vacía."); return; }
            if (ED.tool !== "sel" || ED.selMode) elegirHerramienta("sel");
            ED.sel = null; ED.selV = -1; ED.selE = -1; ED.area = null;
            ED.grupo = { items: fs.map(itemEntero) };
            renderPropsYFlot(); dibujar();
            return;
        } else if (a === "solo") {
            const otras = P.capas.filter(function (c) { return c.id !== act.id; });
            const yaSolo = act.visible !== false && otras.every(function (c) { return c.visible === false; });
            snapshot();
            if (yaSolo) otras.forEach(function (c) { c.visible = true; });
            else { otras.forEach(function (c) { c.visible = false; }); act.visible = true; }
        } else if (a === "mostrar") {
            snapshot();
            P.capas.forEach(function (c) { c.visible = true; });
        } else if (a === "vaciar") {
            const n = P.shapes.filter(function (x) { return x.capa === act.id; }).length;
            if (!n) { aviso("La capa ya está vacía."); return; }
            if (act.bloqueada) { aviso("Desbloqueá la capa para vaciarla."); return; }
            if (!confirm("¿Vaciar «" + act.nombre + "»? Se borran sus " + n + " objetos. Podés deshacerlo con ↶.")) return;
            snapshot();
            P.shapes = P.shapes.filter(function (x) { return x.capa !== act.id; });
        } else if (a === "borrar") {
            if (P.capas.length <= 1) { aviso("Tiene que quedar al menos una capa."); return; }
            const n = P.shapes.filter(function (x) { return x.capa === act.id; }).length;
            if (n && !confirm("¿Eliminar «" + act.nombre + "» con sus " + n + " objetos? Podés deshacerlo con ↶.")) return;
            snapshot();
            P.shapes = P.shapes.filter(function (x) { return x.capa !== act.id; });
            P.capas.splice(i, 1);
            P.capaActiva = P.capas[Math.min(i, P.capas.length - 1)].id;
        } else return;
        terminarCambioCapas();
    }

    function inputCapas(e) {
        const t = e.target;
        if (!ED || !t.getAttribute || t.getAttribute("data-cf") !== "opac") return;
        const act = capaActiva();
        if (!ED.opacSnap) { snapshot(); ED.opacSnap = true; }
        act.opacidad = PN.clamp(parseInt(t.value, 10) || 0, 0, 100);
        const v = $("patOpacVal");
        if (v) v.textContent = act.opacidad;
        dibujar(); guardar();
    }

    function cambioCapas(e) {
        const t = e.target, f = t.getAttribute && t.getAttribute("data-cf");
        if (!f || !ED) return;
        const act = capaActiva();
        if (f === "nombre") {
            const v = t.value.trim().slice(0, 30);
            if (!v || v === act.nombre) { t.value = act.nombre; return; }
            snapshot();
            act.nombre = v;
            guardar(); renderPropsYFlot(); renderCapas();
        } else if (f === "opac") {
            ED.opacSnap = false;
            guardar(); renderCapas();
        }
    }

    // ------------------------------
    // Editor de dibujo
    // ------------------------------
    const HERRAMIENTAS = [
        ["mano", "✋", "Mano", "Arrastrá para desplazar el lienzo. Con dos dedos: pellizcá para hacer zoom."],
        ["sel", "↖", "Mover", "Tocá un molde para elegirlo: ves su recuadro (esquinas para agrandar o achicar) y todos sus puntos para deformarlo. Arrastralo para moverlo. El botón circular de abajo lo gira."],
        ["linea", "╱", "Línea", "Tocá el punto inicial y luego el final (o arrastrá). Después podés escribir el largo exacto."],
        ["poli", "⬠", "Pieza", "Tocá cada esquina. Para cerrar tocá el primer punto o usá ✓ Cerrar."],
        ["curva", "∿", "Curva", "Tocá puntos: la línea pasa redondeada por todos. Cerrá con ✓ Cerrar."],
        ["lapiz", "✎", "Lápiz", "Dibujá libremente con el dedo; se suaviza solo."],
        ["rect", "▭", "Rect.", "Tocá una esquina y la opuesta (o arrastrá). Después ajustá medidas."],
        ["circ", "◯", "Círculo", "Tocá el centro y luego un punto del borde (radio)."],
        ["cota", "↔", "Cota", "Tocá dos puntos: queda dibujada la medida entre ellos."],
        ["medir", "📏", "Medir", "Tocá dos puntos para ver la distancia (no se guarda)."],
        ["pinza", "▽", "Pinza", "Tocá sobre una pieza: pata 1, pata 2 y la punta de la pinza."],
        ["piquete", "⌃", "Piquete", "Tocá el borde de una pieza para marcar un piquete de unión."],
        ["hilo", "↕", "Hilo", "Arrastrá dentro de una pieza para marcar la dirección del hilo."],
        ["texto", "T", "Texto", "Tocá donde querés escribir y completá el texto abajo."]
    ];

    function vistaDibujo(cu) {
        if (ED) salirDelEditor();   // evita observadores duplicados si se vuelve a entrar sin salir
        cu.innerHTML =
            '<div class="patBarraHerr" id="patHerr">' + HERRAMIENTAS.map(function (h) {
                return '<button type="button" data-h="' + h[0] + '"><span>' + h[1] + '</span>' + h[2] + '</button>';
            }).join("") + '</div>' +
            '<div class="patBarraOpc" id="patOpc">' +
            '<button type="button" data-o="undo" title="Deshacer">↶</button><button type="button" data-o="redo" title="Rehacer">↷</button>' +
            '<button type="button" data-o="zmenos">−</button><button type="button" data-o="zmas">＋</button><button type="button" data-o="ajustar" title="Ver todo">⛶</button>' +
            '<button type="button" class="chip" data-o="medidas">📏 Medidas</button>' +
            '<button type="button" class="chip" data-o="costura">Costura</button>' +
            '<button type="button" data-o="acomodar">Acomodar</button>' +
            '<button type="button" data-o="limpiar" class="peligro">Vaciar</button>' +
            '</div>' +
            '<div class="patLienzoCaja" id="patCaja"><canvas id="patCanvas"></canvas>' +
            '<div class="patHint" id="patHint"></div><div class="patModos" id="patModos"><button type="button" id="patBtnPuntos">▫ Puntos</button><button type="button" id="patBtnSelec">⬚ Seleccionar</button></div><div class="patFlot" id="patFlot"></div>' +
            '<button type="button" class="patBtnCapa" id="patBtnCapa">▤ Capa</button>' +
            '<div class="patCapas" id="patCapas"></div></div>' +
            '<div class="patProps" id="patProps"></div>';

        ED = {
            canvas: $("patCanvas"), caja: $("patCaja"), tool: "sel", sel: null, selV: -1, selE: -1,
            ortho: false, showSA: true, pend: null, drag: null,
            ptrs: new Map(), multi: false, gesto: null, down: null, medida: null, cursor: null, hover: null, dirty: false, grupo: null, area: null, pegados: 0, selMode: false, modoPuntos: false
        };
        ED.ctx = ED.canvas.getContext("2d");
        if (!ST.proy.vista) ST.proy.vista = { ox: 30, oy: 30, z: 8 };

        const cv = ED.canvas;
        cv.addEventListener("pointerdown", pdown);
        cv.addEventListener("pointermove", pmove);
        cv.addEventListener("pointerup", pup);
        cv.addEventListener("pointercancel", pup);
        cv.addEventListener("wheel", function (e) {
            e.preventDefault();
            const r = cv.getBoundingClientRect();
            zoomEn(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }, { passive: false });

        $("patHerr").addEventListener("click", function (e) {
            const b = e.target.closest("button[data-h]");
            if (b) elegirHerramienta(b.getAttribute("data-h"));
        });
        $("patOpc").addEventListener("click", function (e) {
            const b = e.target.closest("button[data-o]");
            if (b) opcion(b.getAttribute("data-o"), b);
        });
        $("patFlot").addEventListener("click", function (e) {
            const b = e.target.closest("button[data-f]");
            if (b) accionFlotante(b.getAttribute("data-f"));
        });
        const pr = $("patProps");
        pr.addEventListener("click", clickProps);
        pr.addEventListener("change", cambioProps);
        $("patBtnCapa").addEventListener("click", function () { alternarPanelCapas(); });
        $("patBtnSelec").addEventListener("click", function () { modoSelec(!ED.selMode); });
        $("patBtnPuntos").addEventListener("click", function () { modoPuntos(!ED.modoPuntos); });
        $("patCapas").addEventListener("click", clickCapas);
        $("patCapas").addEventListener("input", inputCapas);
        $("patCapas").addEventListener("change", cambioCapas);

        if (window.ResizeObserver) {
            ED.ro = new ResizeObserver(function () { ajustarCanvas(); });
            ED.ro.observe(ED.caja);
        }
        window.addEventListener("resize", ajustarCanvas);
        ED.onResize = ajustarCanvas;

        elegirHerramienta("sel");
        marcarOpciones();
        ajustarCanvas();
        if (!ST.proy.shapes.length) { ED.hintFijo = "Lienzo vacío: dibujá con las herramientas o generá un patrón en la pestaña Patrones."; }
        renderPropsYFlot();
        requestAnimationFrame(function () { if (ED && ST.proy.shapes.length && vistaFueraDePantalla()) ajustarVista(); });
    }

    function vistaFueraDePantalla() {
        const bb = PN.cajaDeTodo(formasVisibles(), { sa: true });
        if (!bb) return false;
        const v = ST.proy.vista, W = ED.w, H = ED.h;
        const x0 = bb.x0 * v.z + v.ox, x1 = bb.x1 * v.z + v.ox, y0 = bb.y0 * v.z + v.oy, y1 = bb.y1 * v.z + v.oy;
        return x1 < 0 || x0 > W || y1 < 0 || y0 > H;
    }

    function salirDelEditor() {
        if (!ED) return;
        if (ED.ro) ED.ro.disconnect();
        window.removeEventListener("resize", ED.onResize);
        ED = null;
        guardarYa();
    }

    function ajustarCanvas() {
        if (!ED || !ED.canvas.isConnected) return;
        const w = ED.caja.clientWidth, h = ED.caja.clientHeight;
        if (!w || !h) return;
        const dpr = window.devicePixelRatio || 1;
        ED.w = w; ED.h = h; ED.dpr = dpr;
        ED.canvas.width = Math.round(w * dpr); ED.canvas.height = Math.round(h * dpr);
        ED.canvas.style.width = w + "px"; ED.canvas.style.height = h + "px";
        ajustarPanelCapas();
        dibujar();
    }

    function dibujar() {
        if (!ED) return;
        if (ED.dirty) return;
        ED.dirty = true;
        requestAnimationFrame(function () {
            if (!ED) return;
            ED.dirty = false;
            const ctx = ED.ctx, v = ST.proy.vista;
            ctx.setTransform(ED.dpr, 0, 0, ED.dpr, 0, 0);
            const mg = mapasGrupo(false);
            renderEscena(ctx, ED.w, ED.h, v, formasVisibles(), {
                sel: ED.sel, selV: ED.selV, selE: ED.selE, handles: ED.tool === "sel" && !ED.selMode,
                socia: idsSocias(elegida()), showSA: ED.showSA, enGrupo: mg.enG, grupoPts: mg.gp, alfa: mapaAlfa(), verMedidas: !!ST.verMedidas
            });
            dibujarOverlay(ctx, v);
            actualizarHint();
        });
    }

    function actualizarHint() {
        const el = $("patHint");
        if (!el || !ED) return;
        const h = HERRAMIENTAS.filter(function (x) { return x[0] === ED.tool; })[0];
        let t = ED.hintFijo || (h ? h[3] : "");
        if (!ED.hintFijo && ED.tool === "sel") {
            if (ED.selMode) t = "Seleccionar: arrastrá para marcar un área de un molde y usá Copiar, Cortar o Pegar.";
            else if (ED.modoPuntos) t = "Puntos activado: tocá cualquier línea de un molde para ponerle un punto (podés arrastrarlo enseguida). Desactivá «Puntos» para volver a mover.";
        }
        if (ED.cursor) t = "x " + nf(ED.cursor.x, 1) + " · y " + nf(ED.cursor.y, 1) + " cm   |   " + t;
        el.textContent = t;
    }

    // --- Conversión de coordenadas ---
    function aMundo(px, py) { const v = ST.proy.vista; return { x: (px - v.ox) / v.z, y: (py - v.oy) / v.z }; }
    function aPantalla(x, y) { const v = ST.proy.vista; return [x * v.z + v.ox, y * v.z + v.oy]; }

    function zoomEn(px, py, f) {
        const v = ST.proy.vista;
        const z2 = PN.clamp(v.z * f, 0.5, 150);
        const w = aMundo(px, py);
        v.z = z2; v.ox = px - w.x * z2; v.oy = py - w.y * z2;
        dibujar(); guardar();
    }

    function ajustarVista() {
        if (!ED) return;
        const bb = PN.cajaDeTodo(formasVisibles(), { sa: true });
        const v = ST.proy.vista || (ST.proy.vista = {});
        if (!bb) { v.z = 8; v.ox = 30; v.oy = 30; dibujar(); return; }
        const w = Math.max(5, bb.x1 - bb.x0), h = Math.max(5, bb.y1 - bb.y0);
        v.z = PN.clamp(Math.min((ED.w - 40) / w, (ED.h - 40) / h), 0.5, 40);
        v.ox = (ED.w - w * v.z) / 2 - bb.x0 * v.z;
        v.oy = (ED.h - h * v.z) / 2 - bb.y0 * v.z;
        dibujar(); guardar();
    }

    // --- Búsqueda y selección ---
    function buscar(id) {
        if (!id || !ST.proy) return null;
        for (let i = 0; i < ST.proy.shapes.length; i++) if (ST.proy.shapes[i].id === id) return ST.proy.shapes[i];
        return null;
    }
    function indice(id) {
        for (let i = 0; i < ST.proy.shapes.length; i++) if (ST.proy.shapes[i].id === id) return i;
        return -1;
    }
    function elegida() { return ED ? buscar(ED.sel) : null; }

    function seleccionar(id) {
        ED.sel = id; ED.selV = -1; ED.selE = -1;
        renderPropsYFlot(); dibujar();
    }

    // ------------------------------
    // Piezas vinculadas (ej. delantero y trasero): lo que se modifica en una se aplica también en la otra.
    // Se corresponden punto a punto (mismo número de punto), por eso solo se vinculan piezas con la misma cantidad de puntos.
    // ------------------------------
    function socias(s) {
        if (!s || !s.vinc || !s.pts) return [];
        return ST.proy.shapes.filter(function (o) { return o !== s && o.t === "path" && o.vinc === s.vinc && o.pts && o.pts.length === s.pts.length; });
    }
    function idsSocias(s) {
        const r = {};
        socias(s).forEach(function (o) { r[o.id] = true; });
        return r;
    }
    function desvincular(s) {
        if (!s) return;
        const g = s.vinc;
        delete s.vinc;
        if (!g) return;
        const resto = ST.proy.shapes.filter(function (o) { return o.vinc === g; });
        if (resto.length < 2) resto.forEach(function (o) { delete o.vinc; });
    }
    function vincular(a, b) {
        if (!a || !b || a === b) return false;
        const ok = function (x) { return x.t === "path" && x.closed && x.pieza; };
        if (!ok(a) || !ok(b)) { aviso("Solo se pueden vincular piezas de patrón cerradas."); return false; }
        if (a.pts.length !== b.pts.length) { aviso("Esas piezas tienen distinta cantidad de puntos: no se pueden vincular."); return false; }
        desvincular(a); desvincular(b);
        const g = PN.uid();
        a.vinc = g; b.vinc = g;
        return true;
    }
    // Largo / ángulo de un lado (recto, entre dos puntos) fijados a un valor.
    function largoLado(s, e) {
        const n = s.pts.length, p0 = s.pts[e], p1 = s.pts[(e + 1) % n];
        return Math.hypot(p1.x - p0.x, p1.y - p0.y);
    }
    function anguloLado(s, e) {
        const n = s.pts.length, p0 = s.pts[e], p1 = s.pts[(e + 1) % n];
        return -Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
    }
    function fijarLargoLado(s, e, largo) {
        const n = s.pts.length, i1 = (e + 1) % n, p0 = s.pts[e], p1 = s.pts[i1];
        const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (!(L > 1e-9) || !(largo > 0)) return;
        const ux = (p1.x - p0.x) / L, uy = (p1.y - p0.y) / L;
        const dx = p0.x + ux * largo - p1.x, dy = p0.y + uy * largo - p1.y;
        if (s.closed) { p1.x += dx; p1.y += dy; }
        else for (let k = i1; k < n; k++) { s.pts[k].x += dx; s.pts[k].y += dy; }
    }
    function fijarAnguloLado(s, e, grados) {
        const n = s.pts.length, i1 = (e + 1) % n, p0 = s.pts[e], p1 = s.pts[i1];
        const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const a = -grados * Math.PI / 180;
        const nx = p0.x + Math.cos(a) * L, ny = p0.y + Math.sin(a) * L;
        const dx = nx - p1.x, dy = ny - p1.y;
        if (s.closed) { p1.x = nx; p1.y = ny; }
        else for (let k = i1; k < n; k++) { s.pts[k].x += dx; s.pts[k].y += dy; }
    }

    function distSeg(p, a, b) { return PN.proyectar(p, a, b).d; }

    function pruebaGolpe(w) {
        const tol = 12 / ST.proy.vista.z;
        const sh = formasInteractivas();
        for (let i = sh.length - 1; i >= 0; i--) {
            const s = sh[i];
            if (s.t === "path") {
                const f = PN.aplanar(s, 10), n = f.pts.length, tope = f.closed ? n : n - 1;
                let mejor = Infinity, edge = -1;
                for (let k = 0; k < tope; k++) {
                    const d = distSeg(w, f.pts[k], f.pts[(k + 1) % n]);
                    if (d < mejor) { mejor = d; edge = f.edge[k]; }
                }
                if (mejor <= tol) return { id: s.id, edge: edge, onEdge: true };
                if (f.closed && (s.pieza) && PN.puntoEnPoligono(w, f.pts)) return { id: s.id, edge: -1, onEdge: false };
            } else if (s.t === "text") {
                const b = PN.cajaDeShape(s);
                if (w.x >= b.x0 - tol && w.x <= b.x1 + tol && w.y >= b.y0 - tol && w.y <= b.y1 + tol) return { id: s.id, edge: -1, onEdge: false };
            } else if (s.t === "dim") {
                const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1;
                const nx = (s.b.y - s.a.y) / L, ny = -(s.b.x - s.a.x) / L, off = s.off || 0;
                const a = { x: s.a.x + nx * off, y: s.a.y + ny * off }, b = { x: s.b.x + nx * off, y: s.b.y + ny * off };
                if (distSeg(w, a, b) <= tol || distSeg(w, s.a, s.b) <= tol) return { id: s.id, edge: -1, onEdge: true };
            }
        }
        return null;
    }

    function piezaCercana(w, maxPx) {
        let mejor = null;
        const tol = (maxPx || 40) / ST.proy.vista.z;
        formasInteractivas().forEach(function (s) {
            if (s.t !== "path" || !s.closed) return;
            const c = PN.cercanoEnContorno(s, w);
            const dentro = PN.puntoEnPoligono(w, PN.aplanar(s).pts);
            const d = dentro ? 0 : c.d;
            if (d <= tol && (!mejor || d < mejor.d)) mejor = { s: s, d: d, c: c };
        });
        return mejor;
    }

    // --- Posición del toque: libre. Con "45°" se alinea a múltiplos de 45° respecto del punto anterior ---
    function ajustar(w, ref) {
        if (ED.ortho && ref) {
            const dx = w.x - ref.x, dy = w.y - ref.y;
            const L = Math.hypot(dx, dy);
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
            return { x: ref.x + L * Math.cos(a), y: ref.y + L * Math.sin(a) };
        }
        return { x: w.x, y: w.y };
    }

    // --- Herramientas y opciones ---
    function elegirHerramienta(t) {
        if (!ED) return;
        cancelarPend();
        ED.tool = t; ED.medida = null; ED.hintFijo = null;
        if (!USA_GRUPO[t]) ED.grupo = null;
        ED.area = null; ED.selMode = false; ED.modoPuntos = false;
        document.querySelectorAll("#patHerr button").forEach(function (b) { b.classList.toggle("activo", b.getAttribute("data-h") === t); });
        marcarModos();
        renderPropsYFlot(); dibujar();
    }

    // Botones de Mover: «Puntos» (arriba al centro) y «Seleccionar» (arriba a la derecha).
    function marcarModos() {
        const caja = $("patCaja");
        if (!caja || !ED) return;
        caja.classList.toggle("conModos", ED.tool === "sel");
        const a = $("patBtnSelec"), b = $("patBtnPuntos");
        if (a) a.classList.toggle("activo", !!ED.selMode);
        if (b) b.classList.toggle("activo", !!ED.modoPuntos);
    }

    function modoSelec(on) {
        if (!ED || ED.tool !== "sel") return;
        cancelarPend();
        ED.selMode = !!on; ED.area = null;
        if (ED.selMode) { ED.modoPuntos = false; ED.sel = null; ED.selV = -1; ED.selE = -1; ED.grupo = null; ED.vincular = null; ED.hintFijo = null; }
        marcarModos(); renderPropsYFlot(); dibujar();
    }

    function modoPuntos(on) {
        if (!ED || ED.tool !== "sel") return;
        cancelarPend();
        ED.modoPuntos = !!on;
        if (ED.modoPuntos) { ED.selMode = false; ED.area = null; }
        marcarModos(); renderPropsYFlot(); dibujar();
    }

    function cancelarPend() { if (ED) { ED.pend = null; ED.drag = null; ED.vincular = null; } renderFlot(); dibujar(); }

    function marcarOpciones() {
        document.querySelectorAll("#patOpc .chip").forEach(function (b) {
            const k = b.getAttribute("data-o");
            b.classList.toggle("activo", (k === "medidas" && ST.verMedidas) || (k === "costura" && ED.showSA));
        });
    }

    function opcion(o) {
        if (!ED) return;
        const cx = ED.w / 2, cy = ED.h / 2;
        if (o === "undo") deshacer();
        else if (o === "redo") rehacer();
        else if (o === "zmenos") zoomEn(cx, cy, 1 / 1.3);
        else if (o === "zmas") zoomEn(cx, cy, 1.3);
        else if (o === "ajustar") ajustarVista();
        else if (o === "medidas") { ST.verMedidas = !ST.verMedidas; marcarOpciones(); dibujar(); }
        else if (o === "costura") { ED.showSA = !ED.showSA; marcarOpciones(); dibujar(); }
        else if (o === "acomodar") {
            const editables = {};
            formasInteractivas().forEach(function (s) { editables[s.id] = true; });
            const mov = ST.proy.shapes.filter(function (s) { return editables[s.id]; });
            const fijas = ST.proy.shapes.filter(function (s) { return !editables[s.id]; });
            if (!mov.some(function (s) { return s.t === "path" && s.pieza; })) { aviso("No hay piezas de patrón para acomodar en las capas visibles y desbloqueadas."); return; }
            snapshot();
            ST.proy.shapes = fijas.concat(PN.acomodar(mov, Math.max(60, ST.proy.tela.ancho || 140), 4));
            guardar(); ajustarVista(); renderPropsYFlot();
            aviso("Piezas acomodadas en filas sobre " + (ST.proy.tela.ancho || 140) + " cm de tela.");
        } else if (o === "limpiar") {
            const editables = {};
            formasInteractivas().forEach(function (s) { editables[s.id] = true; });
            if (!Object.keys(editables).length) { aviso("No hay nada para vaciar en las capas visibles y desbloqueadas."); return; }
            if (!confirm("¿Vaciar las capas visibles y desbloqueadas? Las ocultas y bloqueadas no se tocan. Podés deshacerlo con ↶.")) return;
            snapshot();
            ST.proy.shapes = ST.proy.shapes.filter(function (s) { return !editables[s.id]; });
            ED.sel = null; ED.selV = -1; ED.selE = -1; ED.grupo = null; ED.area = null;
            guardar(); renderPropsYFlot(); dibujar();
        }
    }

    function teclado(e) {
        if (!ED || !pantallaAbierta() || ST.tab !== "dibujo") return;
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); rehacer(); }
        else if ((e.ctrlKey || e.metaKey) && (ED.grupo || ED.area) && ["c", "x"].indexOf(e.key.toLowerCase()) >= 0) { e.preventDefault(); accionGrupo(e.key.toLowerCase() === "c" ? "gcopiar" : "gcortar"); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && ST.portapapeles && ST.portapapeles.length) { e.preventDefault(); pegarPortapapeles(); }
        else if (e.key === "Delete" || e.key === "Backspace") {
            if (ED.grupo) { e.preventDefault(); accionGrupo("gborrar"); }
            else if (ED.sel) { e.preventDefault(); borrarSeleccion(); }
        }
        else if (e.key === "Escape") { cancelarPend(); if (ED.grupo || ED.area || ED.selMode || ED.modoPuntos) { ED.grupo = null; ED.area = null; ED.selMode = false; ED.modoPuntos = false; marcarModos(); renderPropsYFlot(); dibujar(); } }
    }

    // --- Punteros ---
    function posEvento(e) {
        const r = ED.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function pdown(e) {
        if (!ED) return;
        e.preventDefault();
        try { ED.canvas.setPointerCapture(e.pointerId); } catch (x) { }
        const pt = posEvento(e);
        ED.ptrs.set(e.pointerId, pt);
        if (ED.ptrs.size === 2) {
            const a = Array.from(ED.ptrs.values());
            ED.gesto = {
                d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1,
                mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, v0: Object.assign({}, ST.proy.vista)
            };
            ED.multi = true; ED.drag = null;
            return;
        }
        if (ED.ptrs.size > 2 || ED.multi) return;
        ED.down = { pt: pt, mov: false };
        if (CREAN_FORMAS[ED.tool] && !capaEditable()) {
            const c = capaActiva();
            aviso("La capa «" + c.nombre + "» está " + (c.visible === false ? "oculta" : "bloqueada") + ". Elegí otra capa para dibujar.", 3000);
            ED.bloqueadoToque = true;
            return;
        }
        ED.bloqueadoToque = false;
        alPresionar(pt);
    }

    function pmove(e) {
        if (!ED) return;
        const pt = posEvento(e);
        if (ED.ptrs.has(e.pointerId)) ED.ptrs.set(e.pointerId, pt);
        if (ED.gesto && ED.ptrs.size >= 2) {
            const a = Array.from(ED.ptrs.values());
            const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
            const mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
            const g = ED.gesto, v = ST.proy.vista;
            const z = PN.clamp(g.v0.z * d / g.d0, 0.5, 150);
            const wx = (g.mx - g.v0.ox) / g.v0.z, wy = (g.my - g.v0.oy) / g.v0.z;
            v.z = z; v.ox = mx - wx * z; v.oy = my - wy * z;
            dibujar();
            return;
        }
        ED.cursor = aMundo(pt.x, pt.y);
        if (ED.multi) return;
        if (ED.down && Math.hypot(pt.x - ED.down.pt.x, pt.y - ED.down.pt.y) > 8) ED.down.mov = true;
        const apretado = ED.ptrs.has(e.pointerId);
        if (!apretado && e.pointerType !== "mouse") return;
        alMover(pt, apretado);
    }

    function pup(e) {
        if (!ED) return;
        const pt = posEvento(e);
        const estaba = ED.ptrs.has(e.pointerId);
        ED.ptrs.delete(e.pointerId);
        if (ED.ptrs.size < 2) ED.gesto = null;
        if (ED.ptrs.size === 0) {
            const multi = ED.multi;
            ED.multi = false;
            if (multi) { ED.down = null; ED.drag = null; guardar(); return; }
        }
        if (!estaba || ED.multi) return;
        if (ED.bloqueadoToque) { ED.bloqueadoToque = false; ED.down = null; return; }
        alSoltar(pt);
        ED.down = null;
    }

    function alPresionar(pt) {
        const w = aMundo(pt.x, pt.y), t = ED.tool, v = ST.proy.vista;
        if (t === "mano") { ED.drag = { k: "pan", ox: v.ox, oy: v.oy, pt: pt }; return; }
        if (t === "sel" && ED.selMode) { ED.drag = { k: "marco", w0: w, w1: w }; return; }
        if (t === "sel" && ED.grupo && !ED.vincular) {
            const g = golpeGrupo(pt);
            if (g) { iniciarDragGrupo(w, g); return; }
        }
        if (t === "sel" && ED.vincular) {
            const origen = buscar(ED.vincular);
            const h = pruebaGolpe(w);
            const otra = h ? buscar(h.id) : null;
            if (!origen) { ED.vincular = null; return; }
            if (!otra || otra === origen) { aviso("Tocá la otra pieza para vincularla (o cancelá)."); return; }
            snapshot();
            if (vincular(origen, otra)) {
                ED.vincular = null; ED.hintFijo = null;
                guardar(); aviso("Piezas vinculadas: lo que modifiques en una se aplica en la otra.", 3200);
            } else ST.undo.pop();
            renderPropsYFlot(); dibujar();
            return;
        }
        if (t === "sel") {
            const s = elegida();
            if (s && s.t === "path") {
                const ae = asaEspejo(s);
                if (Math.hypot(ae[0] - pt.x, ae[1] - pt.y) < 22) { espejarForma(s); return; }
                const ag = asaGiro(s);
                if (Math.hypot(ag[0] - pt.x, ag[1] - pt.y) < 26) {
                    const b0 = PN.cajaDeShape(s), c0 = { x: (b0.x0 + b0.x1) / 2, y: (b0.y0 + b0.y1) / 2 };
                    ED.drag = { k: "rotforma", orig: PN.clon(s), c: c0, a0: Math.atan2(w.y - c0.y, w.x - c0.x), deg: 0, empujado: false };
                    dibujar(); return;
                }
                for (let i = 0; i < s.pts.length; i++) {
                    const q = aPantalla(s.pts[i].x, s.pts[i].y);
                    if (Math.hypot(q[0] - pt.x, q[1] - pt.y) < 15) {
                        ED.selV = i; ED.selE = -1;
                        ED.drag = { k: "vtx", i: i, empujado: false };
                        renderProps(); dibujar(); return;
                    }
                }
            }
            if (s && (s.t === "path" || s.t === "text")) {
                const q = esquinasForma(s);
                for (let i = 0; i < 4; i++) {
                    if (Math.hypot(q[i][0] - pt.x, q[i][1] - pt.y) < 20) {
                        const b = PN.cajaDeShape(s);
                        const ce = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
                        const an = ce[(i + 2) % 4];
                        ED.drag = { k: "escforma", orig: PN.clon(s), anchor: an, d0: Math.max(0.01, Math.hypot(w.x - an.x, w.y - an.y)), socO: s.t === "path" ? socias(s).map(function (o) { return PN.clon(o); }) : [], empujado: false };
                        return;
                    }
                }
            }
            if (ED.modoPuntos && insertarPuntoEnLinea(w, pt)) return;
            if (s && s.t === "dim") {
                const qa = aPantalla(s.a.x, s.a.y), qb = aPantalla(s.b.x, s.b.y);
                if (Math.hypot(qa[0] - pt.x, qa[1] - pt.y) < 17) { ED.drag = { k: "dim", cual: "a", empujado: false }; return; }
                if (Math.hypot(qb[0] - pt.x, qb[1] - pt.y) < 17) { ED.drag = { k: "dim", cual: "b", empujado: false }; return; }
            }
            const h = pruebaGolpe(w);
            if (h) {
                if (ED.grupo) ED.grupo = null;
                activarCapaDe(h.id);
                if (h.id !== ED.sel) { ED.sel = h.id; ED.selV = -1; ED.selE = -1; }
                else if (h.onEdge && h.edge >= 0) { ED.selE = h.edge; ED.selV = -1; }
                ED.drag = { k: "move", orig: PN.clon(buscar(h.id)), w0: w, empujado: false };
                renderPropsYFlot(); dibujar();
            } else {
                if (ED.sel) { ED.sel = null; ED.selV = -1; ED.selE = -1; renderPropsYFlot(); }
                ED.drag = { k: "pan", ox: v.ox, oy: v.oy, pt: pt };
                dibujar();
            }
            return;
        }
        if (t === "linea" || t === "rect" || t === "circ" || t === "cota" || t === "medir" || t === "hilo") {
            if (ED.pend && ED.pend.esperando) {
                ED.pend.b = ajustar(w, ED.pend.a); ED.pend.cierre = true;
            } else {
                const a = t === "hilo" ? { x: w.x, y: w.y } : ajustar(w);
                ED.pend = { a: a, b: a, esperando: false, cierre: false };
                if (t === "medir") ED.medida = null;
            }
            renderFlot(); dibujar(); return;
        }
        if (t === "lapiz") { ED.pend = { pts: [w] }; return; }
        if (t === "poli" || t === "curva") {
            if (!ED.pend) ED.pend = { pts: [], suave: t === "curva" };
        }
    }

    function alMover(pt, apretado) {
        const w = aMundo(pt.x, pt.y), t = ED.tool;
        if (ED.drag && apretado) {
            const d = ED.drag, v = ST.proy.vista;
            if (d.k === "pan") { v.ox = d.ox + (pt.x - d.pt.x); v.oy = d.oy + (pt.y - d.pt.y); dibujar(); return; }
            if (d.k === "marco") { d.w1 = w; dibujar(); return; }
            if (d.k === "gmover" || d.k === "gescala") {
                if (!ED.down || !ED.down.mov) return;
                if (!d.empujado) { snapshot(); d.empujado = true; ED.area = null; }
                if (d.k === "gmover") {
                    const dx = w.x - d.w0.x, dy = w.y - d.w0.y;
                    aplicarGrupo(d.orig, function (p) { return { x: p.x + dx, y: p.y + dy }; }, 1);
                } else {
                    const k = PN.clamp(Math.hypot(w.x - d.anchor.x, w.y - d.anchor.y) / d.d0, 0.05, 30);
                    aplicarGrupo(d.orig, function (p) { return { x: d.anchor.x + (p.x - d.anchor.x) * k, y: d.anchor.y + (p.y - d.anchor.y) * k }; }, k);
                }
                dibujar(); return;
            }
            if (!ED.down || !ED.down.mov) return;
            const s = elegida();
            if (!d.empujado) { snapshot(); d.empujado = true; }
            if (d.k === "vtx" && s) {
                const idx = d.i;
                const ref = s.pts.length > 1 ? s.pts[(idx - 1 + s.pts.length) % s.pts.length] : null;
                const p = ajustar(w, ref);
                const mx = p.x - s.pts[idx].x, my = p.y - s.pts[idx].y;
                const todas = [s].concat(socias(s)), anc = todas.map(function (o) { return PN.anclarPinzas(o); });
                s.pts[idx].x = p.x; s.pts[idx].y = p.y;
                socias(s).forEach(function (o) { o.pts[idx].x += mx; o.pts[idx].y += my; });
                todas.forEach(function (o, k) { PN.reanclarPinzas(o, anc[k]); });
                renderProps();
            } else if (d.k === "rotforma" && s) {
                let deg = (Math.atan2(w.y - d.c.y, w.x - d.c.x) - d.a0) * 180 / Math.PI;
                deg = ((deg % 360) + 540) % 360 - 180;                  // entre -180° y 180°
                const cerca = Math.round(deg / 15) * 15;
                if (Math.abs(deg - cerca) < 3) deg = cerca;               // se "imanta" cada 15° para dejarlo derecho
                d.deg = deg;
                const n = PN.rotar(d.orig, deg, d.c);
                const i = indice(d.orig.id);
                if (i >= 0) ST.proy.shapes[i] = n;
            } else if (d.k === "escforma" && s) {
                const k = PN.clamp(Math.hypot(w.x - d.anchor.x, w.y - d.anchor.y) / d.d0, 0.05, 30);
                const n = PN.mapShape(d.orig, function (p) { return { x: d.anchor.x + (p.x - d.anchor.x) * k, y: d.anchor.y + (p.y - d.anchor.y) * k }; });
                if (n.t === "text") n.size = (d.orig.size || 1) * k;
                const i = indice(d.orig.id);
                if (i >= 0) ST.proy.shapes[i] = n;
                if (n.pts) d.socO.forEach(function (o) {
                    const j = indice(o.id);
                    if (j < 0 || o.pts.length !== n.pts.length) return;
                    const m = PN.clon(o);
                    m.pts.forEach(function (p, q) { p.x = o.pts[q].x + (n.pts[q].x - d.orig.pts[q].x); p.y = o.pts[q].y + (n.pts[q].y - d.orig.pts[q].y); });
                    PN.reanclarPinzas(m, PN.anclarPinzas(o));
                    ST.proy.shapes[j] = m;
                });
            } else if (d.k === "dim" && s) {
                const p = ajustar(w, d.cual === "a" ? s.b : s.a);
                s[d.cual] = { x: p.x, y: p.y };
            } else if (d.k === "move") {
                const dx = w.x - d.w0.x, dy = w.y - d.w0.y;
                const nuevo = PN.trasladar(d.orig, dx, dy);
                const i = indice(d.orig.id);
                if (i >= 0) ST.proy.shapes[i] = nuevo;
            }
            dibujar();
            return;
        }
        if (!ED.pend) { if (t === "poli" || t === "curva") dibujar(); return; }
        if (t === "lapiz") { ED.pend.pts.push(w); dibujar(); return; }
        if (ED.pend.a) { ED.pend.b = t === "hilo" ? { x: w.x, y: w.y } : ajustar(w, ED.pend.a); dibujar(); return; }
        if (ED.pend.pts) { ED.hover = ajustar(w, ED.pend.pts[ED.pend.pts.length - 1]); dibujar(); }
    }

    function alSoltar(pt) {
        const w = aMundo(pt.x, pt.y), t = ED.tool;
        const toque = !ED.down || !ED.down.mov;
        if (ED.drag) {
            const d = ED.drag;
            ED.drag = null;
            if (d.k === "marco") { d.w1 = w; finalizarMarco(d, toque); return; }
            if (d.k === "gmover" || d.k === "gescala") { if (d.empujado) guardar(); renderPropsYFlot(); dibujar(); return; }
            if (d.k !== "pan" && d.empujado) { guardar(); renderPropsYFlot(); }
            dibujar();
            return;
        }
        if (t === "linea" || t === "rect" || t === "circ" || t === "cota" || t === "medir" || t === "hilo") {
            const p = ED.pend;
            if (!p) return;
            if (p.cierre || !toque) terminarDosPuntos(t, p);
            else { p.esperando = true; ED.hintFijo = "Ahora tocá el segundo punto."; }
            dibujar();
            return;
        }
        if (t === "lapiz") {
            const p = ED.pend; ED.pend = null;
            if (p && p.pts.length > 2) {
                const eps = 2.2 / ST.proy.vista.z;
                const simp = PN.simplificar(p.pts, eps);
                if (simp.length >= 2) {
                    const s = PN.nuevoPath(simp.map(function (q) { return { x: q.x, y: q.y, s: true }; }), false);
                    simp[0] && (s.pts[0].s = false); s.pts[s.pts.length - 1].s = false;
                    agregarShape(s);
                }
            }
            dibujar();
            return;
        }
        if (!toque) return;
        if (t === "poli" || t === "curva") {
            if (!ED.pend) ED.pend = { pts: [], suave: t === "curva" };
            const pts = ED.pend.pts;
            if (pts.length >= 3) {
                const q = aPantalla(pts[0].x, pts[0].y);
                if (Math.hypot(q[0] - pt.x, q[1] - pt.y) < 18) { terminarPoli(true); return; }
            }
            const ref = pts.length ? pts[pts.length - 1] : null;
            pts.push(ajustar(w, ref));
            ED.hover = null;
            renderFlot(); dibujar();
        } else if (t === "texto") {
            const p = ajustar(w);
            const s = { id: PN.uid(), t: "text", p: { x: p.x, y: p.y }, text: "Texto", size: 1.2 };
            agregarShape(s);
            elegirHerramientaSinLimpiar("sel");
            setTimeout(function () { const el = document.querySelector('#patProps [data-f="text"]'); if (el) { el.focus(); el.select(); } }, 60);
        } else if (t === "piquete") {
            const c = piezaCercana(w, 26);
            if (!c || !c.c) { aviso("Tocá cerca del borde de una pieza."); return; }
            snapshot();
            c.s.notches = c.s.notches || [];
            c.s.notches.push({ x: c.c.x, y: c.c.y });
            guardar(); seleccionar(c.s.id); dibujar();
        } else if (t === "pinza") {
            if (!ED.pend) {
                const c = piezaCercana(w, 60);
                if (!c) { aviso("Empezá tocando dentro o cerca de una pieza."); return; }
                ED.pend = { pieza: c.s.id, pts: [] };
            }
            ED.pend.pts.push(ajustar(w));
            if (ED.pend.pts.length === 3) {
                const s = buscar(ED.pend.pieza), q = ED.pend.pts;
                if (s) {
                    snapshot();
                    s.darts = s.darts || [];
                    s.darts.push({ a: { x: q[0].x, y: q[0].y }, b: { x: q[1].x, y: q[1].y }, t: { x: q[2].x, y: q[2].y } });
                    guardar(); seleccionar(s.id);
                }
                ED.pend = null;
            }
            renderFlot(); dibujar();
        }
    }

    // ------------------------------
    // Grupo de selección (herramientas Cortar y Seleccionar, y Mover)
    // ------------------------------
    // ED.grupo = { items: [ { id, all, idx } ] }: "all" = molde entero; si no, solo los puntos "idx".
    var USA_GRUPO = { sel: 1 };

    function itemEntero(s) {
        return s.t === "path" ? { id: s.id, all: true, idx: s.pts.map(function (_, i) { return i; }) } : { id: s.id, all: true };
    }

    function normalizarGrupo() {
        if (!ED || !ED.grupo) return;
        const items = [];
        ED.grupo.items.forEach(function (it) {
            const s = buscar(it.id);
            if (!s) return;
            if (s.t === "path") {
                const idx = (it.idx || []).filter(function (i) { return i >= 0 && i < s.pts.length; });
                if (idx.length) items.push({ id: s.id, all: idx.length === s.pts.length, idx: idx });
            } else items.push({ id: s.id, all: true });
        });
        ED.grupo = items.length ? { items: items } : null;
    }

    function mapasGrupo(incluirTodos) {
        const r = { enG: {}, gp: {} };
        if (!ED || !ED.grupo || !USA_GRUPO[ED.tool]) return r;
        ED.grupo.items.forEach(function (it) {
            if (it.all) r.enG[it.id] = true;
            if (it.idx && (!it.all || incluirTodos)) {
                const m = {};
                it.idx.forEach(function (i) { m[i] = true; });
                r.gp[it.id] = m;
            }
        });
        return r;
    }

    function cajaGrupo() {
        if (!ED || !ED.grupo) return null;
        let c = null;
        ED.grupo.items.forEach(function (it) {
            const s = buscar(it.id);
            if (!s) return;
            let b;
            if (s.t === "path" && !it.all) {
                b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
                it.idx.forEach(function (i) {
                    const p = s.pts[i];
                    if (!p) return;
                    b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y);
                    b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
                });
            } else b = PN.cajaDeShape(s);
            if (!isFinite(b.x0)) return;
            c = c ? { x0: Math.min(c.x0, b.x0), y0: Math.min(c.y0, b.y0), x1: Math.max(c.x1, b.x1), y1: Math.max(c.y1, b.y1) } : { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
        });
        return c;
    }

    // Toque sobre el recuadro del grupo: esquina (para cambiar tamaño) o interior (para mover).
    function golpeGrupo(pt) {
        if (!ED.grupo || !USA_GRUPO[ED.tool]) return null;
        const c = cajaGrupo();
        if (!c) return null;
        const esq = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]];
        for (let i = 0; i < 4; i++) {
            const q = aPantalla(esq[i][0], esq[i][1]);
            if (Math.hypot(q[0] - pt.x, q[1] - pt.y) < 22) return { k: "esc", i: i };
        }
        const a = aPantalla(c.x0, c.y0), b = aPantalla(c.x1, c.y1), m = 10;
        if (pt.x >= Math.min(a[0], b[0]) - m && pt.x <= Math.max(a[0], b[0]) + m && pt.y >= Math.min(a[1], b[1]) - m && pt.y <= Math.max(a[1], b[1]) + m) return { k: "dentro" };
        return null;
    }

    function origGrupo() {
        const o = {};
        ED.grupo.items.forEach(function (it) { const s = buscar(it.id); if (s) o[it.id] = PN.clon(s); });
        return o;
    }

    function iniciarDragGrupo(w, g) {
        const orig = origGrupo();
        if (g.k === "dentro") { ED.drag = { k: "gmover", orig: orig, w0: w, empujado: false }; return; }
        const c = cajaGrupo();
        const esq = [{ x: c.x0, y: c.y0 }, { x: c.x1, y: c.y0 }, { x: c.x1, y: c.y1 }, { x: c.x0, y: c.y1 }];
        const an = esq[(g.i + 2) % 4], mov = esq[g.i];
        ED.drag = { k: "gescala", orig: orig, anchor: an, d0: Math.max(0.01, Math.hypot(mov.x - an.x, mov.y - an.y)), empujado: false };
    }

    // Aplica una transformación f(p) a todo el grupo, siempre a partir de las formas originales.
    function aplicarGrupo(orig, f, k) {
        ED.grupo.items.forEach(function (it) {
            const o = orig[it.id], i = indice(it.id);
            if (!o || i < 0) return;
            let n;
            if (o.t === "path" && !it.all) {
                n = PN.clon(o);
                it.idx.forEach(function (j) { const q = f({ x: o.pts[j].x, y: o.pts[j].y }); n.pts[j].x = q.x; n.pts[j].y = q.y; });
                PN.reanclarPinzas(n, PN.anclarPinzas(o));
            } else {
                n = PN.mapShape(o, f);
                if (n.t === "text") n.size = (o.size || 1) * k;
            }
            ST.proy.shapes[i] = n;
        });
    }

    function segTocaRect(a, b, r) {
        let t0 = 0, t1 = 1;
        const dx = b.x - a.x, dy = b.y - a.y;
        const p = [-dx, dx, -dy, dy], q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return false; }
            else {
                const t = q[i] / p[i];
                if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
                else { if (t < t0) return false; if (t < t1) t1 = t; }
            }
        }
        return true;
    }

    function pathTocaRect(s, r) {
        const f = PN.aplanar(s, 8), n = f.pts.length;
        for (let i = 0; i < n; i++) {
            const p = f.pts[i];
            if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) return true;
        }
        const tope = f.closed ? n : n - 1;
        for (let i = 0; i < tope; i++) if (segTocaRect(f.pts[i], f.pts[(i + 1) % n], r)) return true;
        if (f.closed && s.pieza && PN.puntoEnPoligono({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, f.pts)) return true;
        return false;
    }

    // Esquinas del recuadro del molde elegido (un poco hacia afuera para no tapar sus puntos), en pantalla.
    function esquinasForma(s) {
        const b = PN.cajaDeShape(s), m = 16;
        const a = aPantalla(b.x0, b.y0), c = aPantalla(b.x1, b.y1);
        const x0 = Math.min(a[0], c[0]) - m, x1 = Math.max(a[0], c[0]) + m, y0 = Math.min(a[1], c[1]) - m, y1 = Math.max(a[1], c[1]) + m;
        return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    }

    // Botón de giro: debajo del recuadro del molde elegido, en pantalla.
    function asaGiro(s) {
        const q = esquinasForma(s);
        return [(q[0][0] + q[1][0]) / 2, q[2][1] + 36];
    }

    // Botón de espejo: a la izquierda del botón de giro.
    function asaEspejo(s) {
        const g = asaGiro(s);
        return [g[0] - 46, g[1]];
    }
    function espejarForma(s) {
        const i = indice(s.id);
        if (i < 0) return;
        snapshot();
        const tenia = !!s.vinc;
        const nueva = PN.espejar(s, "x");
        ST.proy.shapes[i] = nueva;
        if (tenia) { desvincular(nueva); aviso("Se desvinculó de la otra pieza porque espejar cambia el orden de los puntos."); }
        guardar(); renderPropsYFlot(); dibujar();
    }

    // Modo «Puntos»: pone un punto justo donde se tocó la línea de un molde y lo deja listo para arrastrar.
    function insertarPuntoEnLinea(w, pt) {
        const tol = 16 / ST.proy.vista.z;
        let mejor = null;
        formasInteractivas().forEach(function (s) {
            if (s.t !== "path" || s.pts.length < 2) return;
            const c = PN.cercanoEnContorno(s, w);
            if (c && c.d <= tol && (!mejor || c.d < mejor.c.d)) mejor = { s: s, c: c };
        });
        if (!mejor) return false;
        const s = mejor.s, c = mejor.c;
        // si ya hay un punto ahí, no se agrega otro
        for (let i = 0; i < s.pts.length; i++) {
            const q = aPantalla(s.pts[i].x, s.pts[i].y);
            if (Math.hypot(q[0] - pt.x, q[1] - pt.y) < 14) return false;
        }
        snapshot();
        const k = c.edge, nn = s.pts.length;
        const q0 = s.pts[k], q1 = s.pts[(k + 1) % nn];
        const L2 = Math.pow(q1.x - q0.x, 2) + Math.pow(q1.y - q0.y, 2) || 1;
        const tp = PN.clamp(((c.x - q0.x) * (q1.x - q0.x) + (c.y - q0.y) * (q1.y - q0.y)) / L2, 0.02, 0.98);
        socias(s).forEach(function (o) {
            const a0 = o.pts[k], a1 = o.pts[(k + 1) % o.pts.length];
            PN.insertarVertice(o, k, { x: a0.x + (a1.x - a0.x) * tp, y: a0.y + (a1.y - a0.y) * tp });
        });
        PN.insertarVertice(s, k, { x: c.x, y: c.y });
        activarCapaDe(s.id);
        ED.grupo = null;
        ED.sel = s.id; ED.selV = k + 1; ED.selE = -1;
        ED.drag = { k: "vtx", i: k + 1, empujado: true };
        renderPropsYFlot(); dibujar();
        return true;
    }

    // «Seleccionar»: solo marca un área. Un toque suelta el área.
    function finalizarMarco(d, toque) {
        const r = { x0: Math.min(d.w0.x, d.w1.x), y0: Math.min(d.w0.y, d.w1.y), x1: Math.max(d.w0.x, d.w1.x), y1: Math.max(d.w0.y, d.w1.y) };
        ED.grupo = null;
        ED.area = (toque || r.x1 - r.x0 < 0.05 || r.y1 - r.y0 < 0.05) ? null : r;
        renderPropsYFlot(); dibujar();
    }

    // ------------------------------
    // Recorte por área (Seleccionar + Cortar/Copiar)
    // ------------------------------
    function areaF(pts) {
        let a = 0;
        for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
        return a / 2;
    }
    function limpiarPoli(pts) {
        const o = [];
        pts.forEach(function (p) { const l = o[o.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 1e-6) o.push({ x: p.x, y: p.y }); });
        if (o.length > 1 && Math.hypot(o[0].x - o[o.length - 1].x, o[0].y - o[o.length - 1].y) < 1e-6) o.pop();
        return o;
    }
    function poliDeShape(s) { return limpiarPoli(PN.aplanar(s, 14).pts); }
    function simplificarCerrado(pts, eps) {
        const n = pts.length;
        if (n < 6) return pts;
        let m = 0, md = 0;
        for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d > md) { md = d; m = i; } }
        const a = PN.simplificar(pts.slice(0, m + 1), eps), b = PN.simplificar(pts.slice(m).concat([pts[0]]), eps);
        return a.concat(b.slice(1, -1));
    }
    function tramoEnRect(a, b, r) {
        let t0 = 0, t1 = 1;
        const dx = b.x - a.x, dy = b.y - a.y;
        const p = [-dx, dx, -dy, dy], q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return null; }
            else {
                const t = q[i] / p[i];
                if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
                else { if (t < t0) return null; if (t < t1) t1 = t; }
            }
        }
        return t1 - t0 > 1e-9 ? [t0, t1] : null;
    }
    function uEnRect(p, r) {
        const W = r.x1 - r.x0, H = r.y1 - r.y0;
        const d = [Math.abs(p.y - r.y0), Math.abs(p.x - r.x1), Math.abs(p.y - r.y1), Math.abs(p.x - r.x0)];
        const k = d.indexOf(Math.min.apply(null, d));
        if (k === 0) return PN.clamp(p.x - r.x0, 0, W);
        if (k === 1) return W + PN.clamp(p.y - r.y0, 0, H);
        if (k === 2) return W + H + PN.clamp(r.x1 - p.x, 0, W);
        return 2 * W + H + PN.clamp(r.y1 - p.y, 0, H);
    }
    // Secuencia de vértices del molde con los puntos donde entra ("in") y sale ("out") del área.
    function secuenciaConRect(S, r) {
        const seq = [], n = S.length;
        for (let i = 0; i < n; i++) {
            const a = S[i], b = S[(i + 1) % n];
            seq.push({ k: "v", x: a.x, y: a.y });
            const t = tramoEnRect(a, b, r);
            if (!t) continue;
            [[t[0], "in", t[0] > 1e-9], [t[1], "out", t[1] < 1 - 1e-9]].forEach(function (e) {
                if (!e[2]) return;
                const p = { x: a.x + (b.x - a.x) * e[0], y: a.y + (b.y - a.y) * e[0] };
                seq.push({ k: e[1], x: p.x, y: p.y, u: uEnRect(p, r) });
            });
        }
        return seq;
    }
    // Recorrido tipo Weiler–Atherton. Parte de los nodos "startK"; al llegar a "stopK" sigue por el borde del área.
    function recorrerWA(seq, r, startK, stopK, dir) {
        const W = r.x1 - r.x0, H = r.y1 - r.y0, Per = 2 * (W + H);
        const esq = [[0, r.x0, r.y0], [W, r.x1, r.y0], [W + H, r.x1, r.y1], [2 * W + H, r.x0, r.y1]];
        const m = function (v) { v %= Per; return v < 0 ? v + Per : v; };
        const nodos = [];
        seq.forEach(function (e, i) { if (e.k !== "v") nodos.push(i); });
        const usado = {}, res = [];
        for (let ii = 0; ii < nodos.length; ii++) {
            const i0 = nodos[ii];
            if (seq[i0].k !== startK || usado[i0]) continue;
            const poly = [{ x: seq[i0].x, y: seq[i0].y }];
            usado[i0] = true;
            let idx = i0, guard = 0;
            for (;;) {
                if (++guard > seq.length * 3 + 20) return null;
                idx = (idx + 1) % seq.length;
                const e = seq[idx];
                if (e.k === "v") { poly.push({ x: e.x, y: e.y }); continue; }
                if (e.k === startK) return null;
                poly.push({ x: e.x, y: e.y });
                let mejor = -1, md = Infinity;
                nodos.forEach(function (j) {
                    if (seq[j].k !== startK) return;
                    const d = m(dir * (seq[j].u - e.u));
                    if (d > 1e-9 && d < md) { md = d; mejor = j; }
                });
                if (mejor < 0) return null;
                esq.map(function (c) { return { d: m(dir * (c[0] - e.u)), x: c[1], y: c[2] }; })
                    .filter(function (c) { return c.d > 1e-9 && c.d < md; })
                    .sort(function (a, b) { return a.d - b.d; })
                    .forEach(function (c) { poly.push({ x: c.x, y: c.y }); });
                if (mejor === i0) break;
                if (usado[mejor]) return null;
                usado[mejor] = true;
                poly.push({ x: seq[mejor].x, y: seq[mejor].y });
                idx = mejor;
            }
            res.push(poly);
        }
        return res;
    }
    function clipPlano(pts, f) {
        const out = [], n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n], da = f(a), db = f(b);
            if (da >= 0) out.push(a);
            if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
        }
        return out;
    }
    // Respaldo si el recorrido falla: intersección simple y resta en hasta 4 trozos.
    function respaldoRect(S, r) {
        let dent = clipPlano(clipPlano(clipPlano(clipPlano(S, function (p) { return p.x - r.x0; }), function (p) { return r.x1 - p.x; }), function (p) { return p.y - r.y0; }), function (p) { return r.y1 - p.y; });
        const mid = clipPlano(clipPlano(S, function (p) { return p.x - r.x0; }), function (p) { return r.x1 - p.x; });
        const fuera = [
            clipPlano(S, function (p) { return r.x0 - p.x; }), clipPlano(S, function (p) { return p.x - r.x1; }),
            clipPlano(mid, function (p) { return r.y0 - p.y; }), clipPlano(mid, function (p) { return p.y - r.y1; })
        ];
        return { dentro: [dent], fuera: fuera };
    }
    // Parte un molde (polígono S) con un área rectangular: lo que queda adentro y lo que queda afuera.
    function partirPoligono(S, r0) {
        const e = 1e-4;
        const r = { x0: r0.x0 - e, y0: r0.y0 - e, x1: r0.x1 + e, y1: r0.y1 + e };
        if (areaF(S) < 0) S = S.slice().reverse();
        const seq = secuenciaConRect(S, r);
        const nod = seq.filter(function (x) { return x.k !== "v"; });
        if (!nod.length) {
            if (S.some(function (p) { return p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1; })) return { dentro: [S], fuera: [] };
            const cen = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
            if (PN.puntoEnPoligono(cen, S)) return { dentro: [[{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]], fuera: [S], interior: true };
            return { dentro: [], fuera: [S] };
        }
        let res = null;
        const alterna = nod.length % 2 === 0 && nod.every(function (x, i) { return i === 0 || x.k !== nod[i - 1].k; }) && nod[0].k !== nod[nod.length - 1].k;
        if (alterna) {
            const d = recorrerWA(seq, r, "in", "out", 1), f = recorrerWA(seq, r, "out", "in", -1);
            if (d && f) res = { dentro: d, fuera: f };
        }
        return res || respaldoRect(S, r);
    }
    function nuevaDesdePoli(base, pts, nombre) {
        const p = simplificarCerrado(limpiarPoli(pts), 0.03);
        if (p.length < 3 || PN.area(p) < 0.05) return null;
        const s = PN.nuevoPath(p.map(function (q) { return { x: q.x, y: q.y, s: false }; }), true);
        s.pieza = !!base.pieza; s.name = nombre; s.qty = base.qty || 1; s.sa = base.sa == null ? 1 : base.sa; s.capa = base.capa;
        if (s.pieza && base.grain) {
            const bb = PN.cajaDeShape(s), c = PN.centroide(p), al = bb.y1 - bb.y0;
            s.grain = { a: { x: c.x, y: bb.y0 + al * 0.25 }, b: { x: c.x, y: bb.y1 - al * 0.25 } };
        }
        heredarDeBase(base, s);
        return s;
    }

    // Distancia de un punto al contorno de un polígono.
    function distAlContorno(pt, poly) {
        let md = Infinity;
        for (let i = 0; i < poly.length; i++) md = Math.min(md, PN.proyectar(pt, poly[i], poly[(i + 1) % poly.length]).d);
        return md;
    }
    function dentroTol(pt, poly, tol) { return PN.puntoEnPoligono(pt, poly) || distAlContorno(pt, poly) <= tol; }

    // Parte de un segmento A→B que queda dentro del polígono (el tramo continuo más largo), o null si no toca.
    function tramoDentro(A, B, poly) {
        const ts = [0, 1], n = poly.length;
        const dx = B.x - A.x, dy = B.y - A.y;
        for (let i = 0; i < n; i++) {
            const c = poly[i], d = poly[(i + 1) % n];
            const ex = d.x - c.x, ey = d.y - c.y, den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-12) continue;
            const t = ((c.x - A.x) * ey - (c.y - A.y) * ex) / den, u = ((c.x - A.x) * dy - (c.y - A.y) * dx) / den;
            if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
        }
        ts.sort(function (a, b) { return a - b; });
        let mejor = null, ini = null;
        for (let i = 0; i < ts.length - 1; i++) {
            const t0 = ts[i], t1 = ts[i + 1];
            if (t1 - t0 < 1e-9) continue;
            const tm = (t0 + t1) / 2;
            const ok = dentroTol({ x: A.x + dx * tm, y: A.y + dy * tm }, poly, 0.05);
            if (ok) { if (ini == null) ini = t0; if (!mejor || (t1 - ini) > (mejor[1] - mejor[0])) mejor = [ini, t1]; }
            else ini = null;
        }
        return mejor;
    }

    // Un punto del plano expresado como vértice {i} o como referencia a dos vértices {r,u,w} de la pieza nueva,
    // así la cota sigue al molde cuando se mueve o se deforma.
    function extremoNuevo(pts, P) {
        let i = 0, md = Infinity;
        pts.forEach(function (q, k) { const d = Math.hypot(q.x - P.x, q.y - P.y); if (d < md) { md = d; i = k; } });
        if (md < 0.05) return { i: i };
        let j = -1, mx = -1;
        pts.forEach(function (q, k) { if (k === i) return; const d = Math.hypot(q.x - pts[i].x, q.y - pts[i].y); if (d > mx) { mx = d; j = k; } });
        if (j < 0) return null;
        return PN.refPunto(pts, i, j, P.x, P.y);
    }

    // La parte recortada conserva lo que le corresponde del molde original: las cotas (con los cm nuevos),
    // las pinzas que quedaron enteras adentro y los piquetes.
    function heredarDeBase(base, nueva) {
        const poli = poliDeShape(nueva);
        if (poli.length < 3) return;
        if (base.dims && base.dims.length) {
            const dims = [], poliBase = poliDeShape(base);
            // Cota que en el molde original ya iba afuera del contorno (ej. altura de cadera, largo de costado):
            // se recorta según hasta dónde llega la pieza nueva en esa misma dirección.
            const tramoPorExtension = function (A, B) {
                const L = Math.hypot(B.x - A.x, B.y - A.y);
                if (L < 1e-9) return null;
                const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
                let lo = Infinity, hi = -Infinity;
                poli.forEach(function (q) { const v = (q.x - A.x) * ux + (q.y - A.y) * uy; if (v < lo) lo = v; if (v > hi) hi = v; });
                const t0 = Math.max(0, lo / L), t1 = Math.min(1, hi / L);
                return t1 - t0 > 1e-9 ? [t0, t1] : null;
            };
            base.dims.forEach(function (d) {
                const A = PN.extremoDim(base, d.a), B = PN.extremoDim(base, d.b);
                if (!A || !B) return;
                const L0 = Math.hypot(B.x - A.x, B.y - A.y);
                const t = tramoDentro(A, B, poliBase) ? tramoDentro(A, B, poli) : tramoPorExtension(A, B);
                if (!t) return;
                const A2 = { x: A.x + (B.x - A.x) * t[0], y: A.y + (B.y - A.y) * t[0] };
                const B2 = { x: A.x + (B.x - A.x) * t[1], y: A.y + (B.y - A.y) * t[1] };
                const L1 = Math.hypot(B2.x - A2.x, B2.y - A2.y);
                if (L1 < 0.3) return;
                const ea = extremoNuevo(nueva.pts, A2), eb = extremoNuevo(nueva.pts, B2);
                if (!ea || !eb) return;
                const c = PN.clon(d);
                c.a = ea; c.b = eb;
                if (Math.abs(L1 - L0) > 0.05) c.nota = "";     // el cm cambió: la nota del cálculo original ya no vale
                dims.push(c);
            });
            nueva.dims = dims;
        }
        if (base.darts && base.darts.length) {
            nueva.darts = base.darts.filter(function (d) {
                return [d.a, d.b, d.t].every(function (q) { return dentroTol(q, poli, 0.05); });
            }).map(function (d) { return PN.clon(d); });
        }
        if (base.notches && base.notches.length) {
            nueva.notches = base.notches.filter(function (q) { return dentroTol(q, poli, 0.05); }).map(function (q) { return { x: q.x, y: q.y }; });
        }
    }


    // ------------------------------
    // Unión de moldes en la misma capa
    // ------------------------------
    // Corta cada lado del polígono A donde lo cruzan los lados de B.
    function trocearPoli(A, B) {
        const out = [], n = A.length, m = B.length;
        for (let i = 0; i < n; i++) {
            const a = A[i], b = A[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y;
            const ts = [0, 1];
            for (let j = 0; j < m; j++) {
                const c = B[j], d = B[(j + 1) % m], ex = d.x - c.x, ey = d.y - c.y, den = dx * ey - dy * ex;
                if (Math.abs(den) < 1e-12) continue;
                const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den, u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
                if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
            }
            ts.sort(function (x, y) { return x - y; });
            for (let k = 0; k < ts.length - 1; k++) {
                if (ts[k + 1] - ts[k] < 1e-9) continue;
                out.push({ a: { x: a.x + dx * ts[k], y: a.y + dy * ts[k] }, b: { x: a.x + dx * ts[k + 1], y: a.y + dy * ts[k + 1] } });
            }
        }
        return out;
    }
    // Unión de dos polígonos simples. Devuelve el contorno exterior, o null si no se tocan.
    function unirPoligonos(A, B) {
        if (areaF(A) < 0) A = A.slice().reverse();
        if (areaF(B) < 0) B = B.slice().reverse();
        const EPS = 1e-6;
        const estado = function (pt, poly) {
            if (distAlContorno(pt, poly) < EPS) return "on";
            return PN.puntoEnPoligono(pt, poly) ? "in" : "out";
        };
        const dirDeBorde = function (pt, poly) {
            let md = Infinity, dir = null;
            for (let i = 0; i < poly.length; i++) {
                const c = poly[i], d = poly[(i + 1) % poly.length], q = PN.proyectar(pt, c, d);
                if (q.d < md) { md = q.d; dir = { x: d.x - c.x, y: d.y - c.y }; }
            }
            return dir;
        };
        const keep = [];
        trocearPoli(A, B).forEach(function (sg) {
            const mid = { x: (sg.a.x + sg.b.x) / 2, y: (sg.a.y + sg.b.y) / 2 }, e = estado(mid, B);
            if (e === "out") keep.push(sg);
            else if (e === "on") {
                const d = dirDeBorde(mid, B);
                if (d && d.x * (sg.b.x - sg.a.x) + d.y * (sg.b.y - sg.a.y) > 0) keep.push(sg);   // mismo sentido: se queda uno solo
            }
        });
        trocearPoli(B, A).forEach(function (sg) {
            const mid = { x: (sg.a.x + sg.b.x) / 2, y: (sg.a.y + sg.b.y) / 2 };
            if (estado(mid, A) === "out") keep.push(sg);
        });
        if (!keep.length) return null;
        const key = function (q) { return Math.round(q.x * 1e4) + "," + Math.round(q.y * 1e4); };
        const porInicio = {};
        keep.forEach(function (sg, i) { (porInicio[key(sg.a)] = porInicio[key(sg.a)] || []).push(i); });
        const usado = {}, lazos = [];
        for (let i = 0; i < keep.length; i++) {
            if (usado[i]) continue;
            const lazo = [];
            let cur = i, guard = 0, cerrado = false;
            while (cur != null && guard++ < keep.length + 2) {
                usado[cur] = true; lazo.push(keep[cur].a);
                const sig = (porInicio[key(keep[cur].b)] || []).filter(function (j) { return !usado[j]; });
                if (!sig.length) { cerrado = key(keep[cur].b) === key(keep[i].a); break; }
                cur = sig[0];
            }
            if (cerrado && lazo.length >= 3) lazos.push(lazo);
        }
        const ext = lazos.filter(function (l) { return areaF(l) > 1e-6; });
        return ext.length === 1 ? ext[0] : null;      // 0 o varios exteriores: no se tocan
    }

    // Si la forma recién dibujada se superpone con moldes de SU MISMA capa, se funden en una sola pieza.
    // Devuelve la forma resultante (o la misma si no hubo nada que unir).
    function fusionarEnCapa(nueva) {
        if (!nueva || nueva.t !== "path" || !nueva.closed || !nueva.pts || nueva.pts.length < 3) return nueva;
        const otros = ST.proy.shapes.filter(function (o) { return o !== nueva && o.t === "path" && o.closed && o.capa === nueva.capa; });
        if (!otros.length) return nueva;
        let poli = poliDeShape(nueva), base = null, unidas = [], perdioFold = false;
        otros.forEach(function (o) {
            const u = unirPoligonos(poliDeShape(o), poli);
            if (!u) return;
            poli = limpiarPoli(u);
            if (!base) base = o;
            unidas.push(o);
        });
        if (!base) return nueva;
        const res = nuevaDesdePoli(base, poli, base.name || (nueva.name || "Pieza"));
        if (!res) return nueva;
        res.id = base.id; res.gen = base.gen; res.pieza = !!(base.pieza || nueva.pieza);
        if (!res.name) res.name = nueva.name;
        if (unidas.some(function (o) { return o.fold && o.fold.length; })) perdioFold = true;
        const quitar = {}; unidas.forEach(function (o) { quitar[o.id] = true; }); quitar[nueva.id] = true;
        const pos = ST.proy.shapes.indexOf(base);
        const lista = [];
        ST.proy.shapes.forEach(function (o, k) {
            if (k === pos) lista.push(res);
            else if (!quitar[o.id]) lista.push(o);
        });
        ST.proy.shapes = lista;
        res._fus = perdioFold ? 2 : 1;
        return res;
    }

    // Calcula qué se copia y cómo queda cada molde, sin tocar nada todavía.
    function calcularCorte() {
        const r = { copias: [], cambios: {}, quitar: {}, nota: "" };
        const enteros = {};
        if (ED.grupo) ED.grupo.items.forEach(function (it) {
            const s = buscar(it.id);
            if (s && s.t === "path" && it.all) {
                enteros[s.id] = true; r.quitar[s.id] = true;
                const c = PN.clon(s); delete c.vinc; r.copias.push(c);
            }
        });
        const objetivos = [];
        if (ED.area) {
            formasInteractivas().forEach(function (s) {
                if (s.t === "path" && s.closed && !enteros[s.id] && pathTocaRect(s, ED.area)) objetivos.push({ s: s, r: ED.area });
            });
        } else if (ED.grupo) {
            ED.grupo.items.forEach(function (it) {
                const s = buscar(it.id);
                if (!s || s.t !== "path" || it.all || !s.closed) return;
                const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
                it.idx.forEach(function (i) { const p = s.pts[i]; b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); });
                if (b.x1 - b.x0 < 0.05 || b.y1 - b.y0 < 0.05) { r.nota = "Marcá un área (arrastrando) para poder cortar esa parte del molde."; return; }
                objetivos.push({ s: s, r: b });
            });
        }
        let perdio = false;
        objetivos.forEach(function (o) {
            const s = o.s, res = partirPoligono(poliDeShape(s), o.r);
            if (!res.dentro.length) return;
            const nom = s.name || "Pieza";
            if (!res.fuera.length) {
                const c = PN.clon(s); delete c.vinc; r.copias.push(c); r.quitar[s.id] = true; return;
            }
            let n = 0;
            res.dentro.forEach(function (pl) { const c = nuevaDesdePoli(s, pl, nom + " (recorte)"); if (c) { r.copias.push(c); n++; } });
            if (!n) return;
            if (res.interior) { r.nota = "El área quedó completamente adentro del molde: se copió, pero no se puede dejar un agujero."; return; }
            const resto = [];
            res.fuera.forEach(function (pl) { const c = nuevaDesdePoli(s, pl, resto.length ? nom + " (parte " + (resto.length + 1) + ")" : nom); if (c) resto.push(c); });
            r.cambios[s.id] = resto;
            if ((s.fold && s.fold.length) || (s.darts && s.darts.length && !resto.every(function (q) { return q.darts && q.darts.length; }))) perdio = true;
        });
        if (perdio && !r.nota) r.nota = "Listo. Las cotas se conservaron y se actualizaron. El doblez y las pinzas cortadas por el medio no se conservan.";
        return r;
    }

    function aplicarCorte(c) {
        const nuevas = [];
        ST.proy.shapes.forEach(function (s) {
            if (c.quitar[s.id]) return;
            if (c.cambios[s.id]) { c.cambios[s.id].forEach(function (n) { nuevas.push(n); }); return; }
            nuevas.push(s);
        });
        ST.proy.shapes = nuevas;
    }

    // --- Copiar / cortar / pegar: solo se copian moldes (nunca textos ni cotas) ---
    function copiarGrupo() {
        const c = calcularCorte();
        if (!c.copias.length) { aviso(c.nota || "No hay moldes en la selección. El texto y las cotas no se copian."); return false; }
        ST.portapapeles = c.copias; ED.pegados = 0;
        aviso(c.copias.length + (c.copias.length === 1 ? " molde copiado." : " moldes copiados."));
        return true;
    }

    // Cortar (copiar = true): se lleva el área marcada al portapapeles y la saca del molde.
    function cortarGrupo() {
        const c = calcularCorte();
        if (!c.copias.length) { aviso(c.nota || "No hay moldes en la selección. El texto y las cotas no se copian."); return false; }
        snapshot();
        ST.portapapeles = c.copias; ED.pegados = 0;
        aplicarCorte(c);
        ED.grupo = null; ED.area = null;
        aviso(c.nota || (c.copias.length + (c.copias.length === 1 ? " molde cortado." : " moldes cortados.") + " Usá Pegar para colocarlo."), 3800);
        return true;
    }

    function borrarGrupo() {
        snapshot();
        if (ED.area) {
            const c = calcularCorte();
            if (ED.grupo) ED.grupo.items.forEach(function (it) { const s = buscar(it.id); if (s && s.t !== "path") c.quitar[s.id] = true; });
            aplicarCorte(c);
        } else quitarDelGrupo(false);
        ED.grupo = null; ED.area = null;
    }

    function quitarDelGrupo(soloMoldes) {
        const borrar = {};
        ED.grupo.items.forEach(function (it) {
            const s = buscar(it.id);
            if (!s) return;
            if (s.t !== "path") { if (!soloMoldes) borrar[s.id] = true; return; }
            if (it.all) { borrar[s.id] = true; return; }
            let ok = true;
            it.idx.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { if (ok && !PN.borrarVertice(s, i)) ok = false; });
            if (!ok) borrar[s.id] = true;
        });
        ST.proy.shapes = ST.proy.shapes.filter(function (s) { return !borrar[s.id]; });
    }

    function pegarPortapapeles() {
        const cb = ST.portapapeles;
        if (!cb || !cb.length) { aviso("Todavía no copiaste ningún molde."); return; }
        snapshot();
        // Cada pegado va en su propia capa nueva (arriba de la activa), así no se funde con lo que ya hay.
        const capaPeg = PN.nuevaCapa(nombreCapaLibre());
        ST.proy.capas.splice(ST.proy.capas.indexOf(capaActiva()) + 1, 0, capaPeg);
        ST.proy.capaActiva = capaPeg.id;
        const copias = PN.clon(cb).map(function (s) { s.id = PN.uid(); s.capa = capaPeg.id; delete s.vinc; return s; });
        const bb = PN.cajaDeTodo(copias, { sa: false });
        const cen = aMundo(ED.w / 2, ED.h / 2);
        ED.pegados = (ED.pegados || 0) + 1;
        const off = (ED.pegados - 1) * 2;
        const dx = cen.x - (bb.x0 + bb.x1) / 2 + off, dy = cen.y - (bb.y0 + bb.y1) / 2 + off;
        const nuevas = copias.map(function (s) { return PN.trasladar(s, dx, dy); });
        nuevas.forEach(function (s) { ST.proy.shapes.push(s); });
        ED.grupo = { items: nuevas.map(itemEntero) };
        ED.area = null;
        ED.sel = null; ED.selV = -1; ED.selE = -1;
        elegirHerramienta("sel");
        guardar(); renderPropsYFlot(); dibujar();
        aviso("Pegado. Arrastralo para ubicarlo o usá las esquinas para cambiar su tamaño.");
    }

    function espejarGrupo(horizontal) {
        snapshot();
        const orig = origGrupo(), c = cajaGrupo();
        const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
        aplicarGrupo(orig, function (p) { return horizontal ? { x: 2 * cx - p.x, y: p.y } : { x: p.x, y: 2 * cy - p.y }; }, 1);
        ED.area = null;
    }

    function accionGrupo(a) {
        if (!ED) return;
        if (a === "gpegar") { pegarPortapapeles(); return; }
        if (a === "gdes") { ED.grupo = null; ED.area = null; renderPropsYFlot(); dibujar(); return; }
        if (!ED.grupo && !ED.area) return;
        if (a === "gcopiar") { copiarGrupo(); renderPropsYFlot(); return; }
        if (a === "gcortar") { if (!cortarGrupo()) return; }
        else if (a === "gborrar") borrarGrupo();
        else if (a === "gmx" || a === "gmy") { if (!ED.grupo) return; espejarGrupo(a === "gmx"); }
        guardar(); renderPropsYFlot(); dibujar();
    }

    function transformarGrupoNumerico(campo, el) {
        if (!ED.grupo) return;
        const v = PN.num(el.value, NaN);
        if (!isFinite(v) || (campo === "gesc" && v <= 0)) return;
        snapshot();
        const orig = origGrupo(), c = cajaGrupo();
        const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
        if (campo === "gesc") {
            const k = v / 100;
            aplicarGrupo(orig, function (p) { return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }; }, k);
        } else {
            const an = v * Math.PI / 180, co = Math.cos(an), si = Math.sin(an);
            aplicarGrupo(orig, function (p) { const x = p.x - cx, y = p.y - cy; return { x: cx + x * co - y * si, y: cy + x * si + y * co }; }, 1);
        }
        el.value = "";
        guardar(); renderPropsYFlot(); dibujar();
    }

    function htmlPanelGrupo() {
        const hayCb = !!(ST.portapapeles && ST.portapapeles.length);
        if (ED.selMode) {
            return '<div class="patPropsFila"><div class="patPropsInfo">' + (ED.area
                ? 'Área marcada: ' + nf(ED.area.x1 - ED.area.x0, 1) + ' × ' + nf(ED.area.y1 - ED.area.y0, 1) + ' cm'
                : 'Arrastrá en el lienzo para marcar un área.') + '</div></div>' +
                '<div class="patPropsFila botones">' +
                (ED.area ? '<button type="button" data-a="gcopiar" class="chico">Copiar</button><button type="button" data-a="gcortar" class="chico">✂ Cortar</button>' : '') +
                '<button type="button" data-a="gpegar" class="chico"' + (hayCb ? '' : ' disabled') + '>Pegar</button>' +
                (ED.area ? '<button type="button" data-a="gdes" class="chico">✕ Soltar área</button>' : '') + '</div>' +
                '<p class="patAyuda">«Cortar» y «Copiar» toman esa parte del molde y «Pegar» la coloca donde quieras. El texto y las cotas no se copian. Para volver a mover, tocá otra vez «Seleccionar».</p>';
        }
        const c = ED.grupo ? cajaGrupo() : null;
        let piezas = 0, puntos = 0, otros = 0;
        if (ED.grupo) ED.grupo.items.forEach(function (it) {
            const s = buscar(it.id);
            if (!s) return;
            if (s.t !== "path") otros++; else if (it.all) piezas++; else puntos += it.idx.length;
        });
        const partes = [];
        if (piezas) partes.push(piezas + (piezas === 1 ? " molde" : " moldes"));
        if (puntos) partes.push(puntos + (puntos === 1 ? " punto" : " puntos"));
        if (otros) partes.push(otros + (otros === 1 ? " texto/cota" : " textos/cotas"));
        return '<div class="patPropsFila"><div class="patPropsInfo">Selección: ' + partes.join(" · ") +
            (c ? ' · ' + nf(c.x1 - c.x0, 1) + ' × ' + nf(c.y1 - c.y0, 1) + ' cm' : '') + '</div></div>' +
            '<div class="patPropsFila botones">' +
            '<button type="button" data-a="gcopiar" class="chico">Copiar</button>' +
            '<button type="button" data-a="gpegar" class="chico"' + (hayCb ? '' : ' disabled') + '>Pegar</button>' +
            '<button type="button" data-a="gmx" class="chico">↔ Espejar</button>' +
            '<button type="button" data-a="gmy" class="chico">↕ Espejar</button>' +
            '<button type="button" data-a="gborrar" class="chico peligro">🗑 Borrar</button>' +
            '<button type="button" data-a="gdes" class="chico">✕ Soltar</button></div>' +
            '<div class="patPropsFila">' +
            '<label class="patCampo chico">Escala (%)<input type="number" inputmode="decimal" step="1" data-f="gesc" placeholder="100"></label>' +
            '<label class="patCampo chico">Rotar (°)<input type="number" inputmode="decimal" step="1" data-f="grot" placeholder="45"></label></div>' +
            '<p class="patAyuda">Arrastrá dentro del recuadro para mover el grupo. Las esquinas lo agrandan o achican manteniendo la proporción.</p>';
    }

    function dibujarGrupoOverlay(ctx, S) {
        const d = ED.drag;
        if (d && d.k === "marco" && d.w1) {
            const a = S(d.w0.x, d.w0.y), b = S(d.w1.x, d.w1.y);
            ctx.save();
            ctx.fillStyle = "rgba(111,220,140,0.10)"; ctx.strokeStyle = COL.sel; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
            ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
            ctx.restore();
        }
        if (ED.tool === "sel" && !ED.selMode && !ED.grupo && ED.sel) {
            const sh = buscar(ED.sel);
            if (sh && (sh.t === "path" || sh.t === "text")) {
                const q = esquinasForma(sh), m = 16;
                ctx.save();
                ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
                ctx.strokeRect(q[0][0] + m, q[0][1] + m, q[2][0] - q[0][0] - 2 * m, q[2][1] - q[0][1] - 2 * m);
                ctx.setLineDash([]);
                q.forEach(function (c) {
                    ctx.fillStyle = "#12131a"; ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.rect(c[0] - 7, c[1] - 7, 14, 14); ctx.fill(); ctx.stroke();
                });
                ctx.restore();
                const b = PN.cajaDeShape(sh);
                etiquetaTexto(ctx, nf(b.x1 - b.x0, 1) + " × " + nf(b.y1 - b.y0, 1) + " cm", (q[0][0] + q[1][0]) / 2, q[0][1] - 14, "#ffd666");
                if (sh.t === "path") {
                    // Botón de giro (flecha circular): arrastralo para girar el molde 360°
                    const ag = asaGiro(sh), girando = ED.drag && ED.drag.k === "rotforma";
                    ctx.save();
                    ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
                    ctx.beginPath(); ctx.moveTo((q[0][0] + q[1][0]) / 2, q[2][1]); ctx.lineTo(ag[0], ag[1] - 17); ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = girando ? "#ffd666" : "#12131a"; ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(ag[0], ag[1], 17, 0, 6.2832); ctx.fill(); ctx.stroke();
                    const col = girando ? "#12131a" : "#ffd666";
                    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = "round";
                    ctx.beginPath(); ctx.arc(ag[0], ag[1], 8, -0.6 * Math.PI, 1.25 * Math.PI); ctx.stroke();
                    const ea = -0.6 * Math.PI, ex = ag[0] + 8 * Math.cos(ea), ey = ag[1] + 8 * Math.sin(ea);
                    ctx.beginPath(); ctx.moveTo(ex + 6, ey - 1); ctx.lineTo(ex - 1, ey - 1); ctx.lineTo(ex + 1, ey + 6); ctx.closePath(); ctx.fill();
                    ctx.restore();
                    if (girando) etiquetaTexto(ctx, nf(ED.drag.deg, 0) + "°", ag[0], ag[1] + 32, "#ffd666");
                    // Botón de espejo: dos mitades enfrentadas con el eje al medio. Un toque espeja el molde (izquierda ↔ derecha).
                    const ae = asaEspejo(sh);
                    ctx.save();
                    ctx.fillStyle = "#12131a"; ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(ae[0], ae[1], 17, 0, 6.2832); ctx.fill(); ctx.stroke();
                    ctx.lineWidth = 2; ctx.lineJoin = "round";
                    ctx.fillStyle = "#ffd666";
                    ctx.beginPath(); ctx.moveTo(ae[0] - 3, ae[1] - 8); ctx.lineTo(ae[0] - 3, ae[1] + 8); ctx.lineTo(ae[0] - 11, ae[1] + 8); ctx.closePath(); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(ae[0] + 3, ae[1] - 8); ctx.lineTo(ae[0] + 3, ae[1] + 8); ctx.lineTo(ae[0] + 11, ae[1] + 8); ctx.closePath(); ctx.stroke();
                    ctx.setLineDash([2, 2]); ctx.lineWidth = 1.4;
                    ctx.beginPath(); ctx.moveTo(ae[0], ae[1] - 11); ctx.lineTo(ae[0], ae[1] + 11); ctx.stroke();
                    ctx.restore();
                }
            }
        }
        if (ED.area && ED.selMode) {
            const a = S(ED.area.x0, ED.area.y0), b = S(ED.area.x1, ED.area.y1);
            ctx.save();
            ctx.fillStyle = "rgba(111,220,140,0.10)"; ctx.strokeStyle = COL.sel; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
            ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
            ctx.restore();
        }
        if (!ED.grupo || !USA_GRUPO[ED.tool]) return;
        const c = cajaGrupo();
        if (!c) return;
        const a = S(c.x0, c.y0), b = S(c.x1, c.y1), pad = 5;
        const x0 = a[0] - pad, y0 = a[1] - pad, x1 = b[0] + pad, y1 = b[1] + pad;
        ctx.save();
        ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function (q) {
            ctx.fillStyle = "#12131a"; ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.rect(q[0] - 6, q[1] - 6, 12, 12); ctx.fill(); ctx.stroke();
        });
        ctx.restore();
        etiquetaTexto(ctx, nf(c.x1 - c.x0, 1) + " × " + nf(c.y1 - c.y0, 1) + " cm", (x0 + x1) / 2, y0 - 12, "#ffd666");
    }

    function elegirHerramientaSinLimpiar(t) { elegirHerramienta(t); }

    function terminarDosPuntos(t, p) {
        const a = p.a, b = p.b;
        ED.pend = null; ED.hintFijo = null;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 0.05) { renderFlot(); return; }
        if (t === "linea") agregarShape(PN.nuevoPath([{ x: a.x, y: a.y, s: false }, { x: b.x, y: b.y, s: false }], false));
        else if (t === "rect") {
            if (Math.abs(b.x - a.x) < 0.05 || Math.abs(b.y - a.y) < 0.05) return;
            const s = PN.nuevoPath([{ x: a.x, y: a.y, s: false }, { x: b.x, y: a.y, s: false }, { x: b.x, y: b.y, s: false }, { x: a.x, y: b.y, s: false }], true);
            s.pieza = true; s.name = "Pieza " + numeroPieza(); agregarShape(s);
        } else if (t === "circ") {
            const pts = [];
            for (let i = 0; i < 24; i++) { const an = i / 24 * Math.PI * 2; pts.push({ x: a.x + L * Math.cos(an), y: a.y + L * Math.sin(an), s: true }); }
            const s = PN.nuevoPath(pts, true); s.name = "Círculo"; agregarShape(s);
        } else if (t === "cota") agregarShape({ id: PN.uid(), t: "dim", a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, off: 2 });
        else if (t === "medir") ED.medida = { a: a, b: b };
        else if (t === "hilo") {
            const mitad = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const c = piezaCercana(mitad, 30) || piezaCercana(a, 30);
            if (!c) { aviso("Arrastrá dentro de una pieza."); return; }
            snapshot();
            c.s.grain = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
            guardar(); seleccionar(c.s.id);
        }
        renderFlot();
    }

    function numeroPieza() {
        return ST.proy.shapes.filter(function (s) { return s.t === "path" && s.pieza; }).length + 1;
    }

    function terminarPoli(cerrar) {
        const p = ED.pend;
        ED.pend = null; ED.hover = null;
        if (!p || p.pts.length < 2) { renderFlot(); dibujar(); return; }
        if (cerrar && p.pts.length < 3) { renderFlot(); return; }
        const pts = p.pts.map(function (q, i) {
            return { x: q.x, y: q.y, s: !!p.suave && (cerrar || (i > 0 && i < p.pts.length - 1)) };
        });
        const s = PN.nuevoPath(pts, !!cerrar);
        if (cerrar) { s.pieza = true; s.name = "Pieza " + numeroPieza(); }
        agregarShape(s);
        renderFlot();
    }

    function agregarShape(s) {
        snapshot();
        s.capa = capaActiva().id;
        ST.proy.shapes.push(s);
        const f = fusionarEnCapa(s);
        if (f !== s) {
            const av = f._fus; delete f._fus;
            aviso(av === 2 ? "Se unió con el molde de la capa. El doblez no se conserva." : "Se unió con el molde de la capa: lo que quedaba encima se borró.");
            s = f;
        }
        ED.sel = s.id; ED.selV = -1; ED.selE = -1;
        guardar(); renderPropsYFlot(); dibujar();
    }

    function borrarSeleccion() {
        const i = indice(ED.sel);
        if (i < 0) return;
        snapshot();
        ST.proy.shapes.splice(i, 1);
        ED.sel = null; ED.selV = -1; ED.selE = -1;
        guardar(); renderPropsYFlot(); dibujar();
    }

    // --- Barra flotante (herramientas de varios toques) ---
    function renderFlot() {
        const el = $("patFlot");
        if (!el || !ED) return;
        const p = ED.pend;
        let h = "";
        if ((ED.tool === "poli" || ED.tool === "curva") && p && p.pts) {
            h = '<button type="button" data-f="atras">↩ Quitar punto</button>' +
                (p.pts.length >= 3 ? '<button type="button" class="principal" data-f="cerrar">✓ Cerrar pieza</button>' : '') +
                (p.pts.length >= 2 ? '<button type="button" data-f="fin">Terminar abierta</button>' : '') +
                '<button type="button" class="peligro" data-f="cancelar">✕</button>';
        } else if (p && (p.a || (p.pts && ED.tool === "pinza"))) {
            h = '<button type="button" class="peligro" data-f="cancelar">✕ Cancelar</button>';
        } else if (ED.tool === "sel" && ED.selMode) {
            const hay = !!ED.area, hayCb = !!(ST.portapapeles && ST.portapapeles.length);
            h = (hay ? '<button type="button" data-f="gcopiar">Copiar</button><button type="button" data-f="gcortar">✂ Cortar</button>' : '') +
                '<button type="button" data-f="gpegar"' + (hayCb ? '' : ' disabled') + '>Pegar</button>';
        }
        el.innerHTML = h;
        el.style.display = h ? "flex" : "none";
    }

    function accionFlotante(a) {
        if (!ED) return;
        if (a === "cancelar") { ED.pend = null; ED.hintFijo = null; renderFlot(); dibujar(); }
        else if (a === "atras" && ED.pend && ED.pend.pts) { ED.pend.pts.pop(); if (!ED.pend.pts.length) ED.pend = null; renderFlot(); dibujar(); }
        else if (a === "cerrar") terminarPoli(true);
        else if (a === "fin") terminarPoli(false);
        else if (/^g(copiar|cortar|borrar|pegar|des|mx|my)$/.test(a)) accionGrupo(a);
    }

    // --- Capa de previsualización ---
    function dibujarOverlay(ctx, v) {
        const S = function (x, y) { return [x * v.z + v.ox, y * v.z + v.oy]; };
        const t = ED.tool, p = ED.pend;
        if (ED.medida) {
            const a = S(ED.medida.a.x, ED.medida.a.y), b = S(ED.medida.b.x, ED.medida.b.y);
            flecha(ctx, a, b, "#ffd666", 1.6, true);
            const L = Math.hypot(ED.medida.b.x - ED.medida.a.x, ED.medida.b.y - ED.medida.a.y);
            etiquetaTexto(ctx, nf(L, 2) + " cm", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 12, "#ffd666");
        }
        dibujarGrupoOverlay(ctx, S);
        if (!p) return;
        ctx.save();
        ctx.setLineDash([6, 4]); ctx.strokeStyle = COL.costura; ctx.lineWidth = 1.6; ctx.fillStyle = COL.costura;
        if (p.a) {
            const a = S(p.a.x, p.a.y), b = S(p.b.x, p.b.y);
            const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
            if (t === "rect") {
                ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
                etiquetaTexto(ctx, nf(Math.abs(p.b.x - p.a.x), 1) + " × " + nf(Math.abs(p.b.y - p.a.y), 1) + " cm", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, "#ffd666");
            } else if (t === "circ") {
                ctx.beginPath(); ctx.arc(a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
                etiquetaTexto(ctx, "radio " + nf(L, 1) + " cm", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 10, "#ffd666");
            } else {
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
                if (t !== "hilo") etiquetaTexto(ctx, nf(L, 1) + " cm", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 12, "#ffd666");
            }
            ctx.setLineDash([]); ctx.beginPath(); ctx.arc(a[0], a[1], 5, 0, 6.2832); ctx.fill();
        } else if (p.pts && (t === "poli" || t === "curva")) {
            const pts = p.pts.slice();
            if (ED.hover && pts.length) pts.push(ED.hover);
            if (pts.length) {
                const tmp = { pts: pts.map(function (q) { return { x: q.x, y: q.y, s: !!p.suave }; }), closed: false };
                const f = PN.aplanar(tmp, 12);
                trazarPoli(ctx, f.pts, S, false); ctx.stroke();
                ctx.setLineDash([]);
                p.pts.forEach(function (q, i) {
                    const s2 = S(q.x, q.y);
                    ctx.beginPath(); ctx.arc(s2[0], s2[1], i === 0 ? 7 : 4.5, 0, 6.2832);
                    ctx.fillStyle = i === 0 ? COL.sel : COL.costura; ctx.fill();
                });
                if (ED.hover && p.pts.length) {
                    const l = p.pts[p.pts.length - 1];
                    etiquetaTexto(ctx, nf(Math.hypot(ED.hover.x - l.x, ED.hover.y - l.y), 1) + " cm", (S(l.x, l.y)[0] + S(ED.hover.x, ED.hover.y)[0]) / 2, (S(l.x, l.y)[1] + S(ED.hover.x, ED.hover.y)[1]) / 2 - 12, "#ffd666");
                }
            }
        } else if (p.pts && t === "lapiz") {
            trazarPoli(ctx, p.pts, S, false); ctx.setLineDash([]); ctx.stroke();
        } else if (p.pts && t === "pinza") {
            ctx.setLineDash([]);
            p.pts.forEach(function (q) { const s2 = S(q.x, q.y); ctx.beginPath(); ctx.arc(s2[0], s2[1], 5, 0, 6.2832); ctx.fill(); });
        }
        ctx.restore();
    }

    // ------------------------------
    // Panel de propiedades
    // ------------------------------
    function renderPropsYFlot() { renderProps(); renderFlot(); refrescarCapas(); }

    function campoNum(f, etiqueta, valor, paso, extra) {
        return '<label class="patCampo chico">' + etiqueta + '<input type="number" inputmode="decimal" step="' + (paso || 0.1) + '" data-f="' + f + '" value="' + (Math.round(valor * 100) / 100) + '"' + (extra || "") + '></label>';
    }

    function renderProps() {
        const el = $("patProps");
        if (!el || !ED) return;
        const s = elegida();
        normalizarGrupo();
        el.classList.toggle("colapsado", !!ED.propsColapsado && !!s && !ED.grupo && !ED.selMode);
        if (ED.grupo || ED.selMode) { el.innerHTML = htmlPanelGrupo(); return; }
        if (!s) {
            const piezas = ST.proy.shapes.filter(function (x) { return x.t === "path" && x.pieza; }).length;
            el.innerHTML = '<div class="patPropsResumen">' +
                '<strong>' + ST.proy.shapes.length + ' objeto' + (ST.proy.shapes.length === 1 ? "" : "s") + ' · ' + piezas + ' pieza' + (piezas === 1 ? "" : "s") + '</strong>' +
                '<span>Tocá una forma para ver sus medidas y editarla. Dibujá una pieza cerrada y se le calcula el margen de costura.</span></div>';
            return;
        }
        let h = '<button type="button" class="patPropsToggle" data-a="colapsar">' + (ED.propsColapsado ? "▴ Mostrar propiedades" : "▾ Ocultar propiedades") + '</button><div class="patPropsFila">';
        if (s.t === "path") {
            const fl = PN.aplanar(s);
            const per = PN.largoPoli(fl.pts, fl.closed);
            const b = PN.cajaDeShape(s);
            let info = "Largo " + nf(per, 1) + " cm";
            if (fl.closed) info = "Perímetro " + nf(per, 1) + " cm · Área " + nf(PN.area(fl.pts), 0) + " cm²";
            info += " · " + nf(b.x1 - b.x0, 1) + " × " + nf(b.y1 - b.y0, 1) + " cm";
            h += '<div class="patPropsInfo">' + info + '</div></div>';

            h += '<div class="patPropsFila">' +
                '<label class="patCampo chico grande">Nombre<input type="text" data-f="name" value="' + esc(s.name || "") + '" maxlength="40" placeholder="Ej: Delantero"></label>';
            if (s.closed) h += '<label class="patCheck"><input type="checkbox" data-f="pieza"' + (s.pieza ? " checked" : "") + '> Es pieza de patrón</label>';
            h += '</div>';
            if (s.closed && s.pieza) {
                h += '<div class="patPropsFila">' + campoNum("qty", "Cantidad a cortar", s.qty || 1, 1, ' min="1" max="99"') +
                    campoNum("sa", "Margen costura (cm)", s.sa == null ? 1 : s.sa, 0.1, ' min="0" max="10"') + '</div>';
            }
            h += '<div class="patPropsFila"><label class="patCheck"><input type="checkbox" data-f="closed"' + (s.closed ? " checked" : "") + (s.pts.length < 3 ? " disabled" : "") + '> Línea cerrada</label></div>';

            // Lado seleccionado / línea simple
            const unica = s.pts.length === 2 && !s.closed;
            const e = unica ? 0 : ED.selE;
            if (e >= 0 && e < (s.closed ? s.pts.length : s.pts.length - 1)) {
                const p0 = s.pts[e], p1 = s.pts[(e + 1) % s.pts.length];
                const cuerda = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                const curvo = PN.largoLado(s, e);
                const ang = -Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
                h += '<div class="patPropsCaja"><b>Lado ' + (e + 1) + '</b>' +
                    campoNum("edgeLen", "Largo (cm)", cuerda, 0.1, ' min="0.1"') +
                    (Math.abs(curvo - cuerda) > 0.05 ? '<small>Largo siguiendo la curva: ' + nf(curvo, 1) + ' cm</small>' : '') +
                    campoNum("edgeAng", "Ángulo (°)", ang, 1);
                if (s.closed && s.pieza) {
                    const esDoblez = (s.fold || []).indexOf(e) >= 0;
                    h += campoNum("edgeSa", "Margen de este lado", PN.margenDeLado(s, e), 0.1, esDoblez ? " disabled" : ' min="0"') +
                        '<label class="patCheck"><input type="checkbox" data-f="edgeFold"' + (esDoblez ? " checked" : "") + '> Lado al doblez</label>';
                }
                h += '</div>';
            } else if (s.closed && s.pts.length > 2) {
                h += '<p class="patAyuda">Tocá un lado de la forma para ver su largo exacto y cambiarlo, o un punto para moverlo.</p>';
            }
            if (ED.selV >= 0 && ED.selV < s.pts.length) {
                const pv = s.pts[ED.selV];
                h += '<div class="patPropsCaja"><b>Punto ' + (ED.selV + 1) + '</b>' +
                    campoNum("vx", "X (cm)", pv.x, 0.1) + campoNum("vy", "Y (cm)", pv.y, 0.1) +
                    '<label class="patCheck"><input type="checkbox" data-f="vs"' + (pv.s ? " checked" : "") + '> Punto suave (curva)</label>' +
                    '<button type="button" data-a="delv" class="peligro chico">Quitar punto</button></div>';
            }
            if (s.closed && s.pieza) {
                const sc = socias(s);
                if (ED.vincular === s.id) {
                    h += '<div class="patPropsCaja"><b>🔗 Vincular piezas</b><small>Tocá en el lienzo la otra pieza que querés vincular con «' + esc(s.name || "esta pieza") + '».</small>' +
                        '<button type="button" data-a="vinccancel" class="chico">Cancelar</button></div>';
                } else if (sc.length) {
                    h += '<div class="patPropsCaja"><b>🔗 Vinculada con ' + sc.map(function (o) { return '«' + esc(o.name || "otra pieza") + '»'; }).join(", ") + '</b>' +
                        '<small>Lo que modifiques acá (puntos, largos de lado, ángulos, pinzas, márgenes, escala) se aplica también en la pieza vinculada, con el mismo cambio. Rotar o mover no se copia.</small>' +
                        '<button type="button" data-a="desvinc" class="chico peligro">Desvincular</button></div>';
                } else {
                    h += '<div class="patPropsFila botones"><button type="button" data-a="vinc" class="chico" title="Elegí otra pieza (ej. delantero y trasero) para que los cambios se apliquen en las dos">🔗 Vincular con otra pieza</button></div>';
                }
            }
            if (s.closed && s.pieza && s.darts && s.darts.length) {
                h += '<div class="patPropsCaja"><b>Pinzas</b>';
                s.darts.forEach(function (d, k) {
                    h += '<div class="patPropsFila">' +
                        campoNum("dartW", "Pinza " + (k + 1) + " · ancho (cm)", PN.anchoPinza(d), 0.1, ' min="0" data-i="' + k + '"') +
                        '<button type="button" data-a="dlado" data-i="' + k + '" class="chico" title="Cambia de qué extremo del lado se suman o se sacan los cm">⇄ Lado</button>' +
                        '<button type="button" data-a="qdart" data-i="' + k + '" class="chico peligro">Quitar</button></div>';
                });
                h += '<small>Al cambiar el ancho o quitar la pinza, esos cm se suman o se sacan del borde de la pieza. En 0 se quita.</small></div>';
            }
            if (s.closed && s.pieza) {
                h += '<div class="patPropsFila botones">' +
                    '<button type="button" data-a="hilo" class="chico">Hilo automático</button>' +
                    ((s.darts && s.darts.length) ? '<button type="button" data-a="qpinza" class="chico">Quitar pinzas (' + s.darts.length + ')</button>' : '') +
                    ((s.notches && s.notches.length) ? '<button type="button" data-a="qpiq" class="chico">Quitar piquetes (' + s.notches.length + ')</button>' : '') +
                    (s.grain ? '<button type="button" data-a="qhilo" class="chico">Quitar hilo</button>' : '') +
                    '</div>';
            }
        } else if (s.t === "text") {
            h += '<div class="patPropsInfo">Texto</div></div><div class="patPropsFila">' +
                '<label class="patCampo chico grande">Contenido<input type="text" data-f="text" value="' + esc(s.text || "") + '" maxlength="80"></label>' +
                campoNum("size", "Alto (cm)", s.size || 1, 0.1, ' min="0.3"') + '</div>';
        } else if (s.t === "dim") {
            const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
            h += '<div class="patPropsInfo">Cota: ' + nf(L, 2) + ' cm</div></div><div class="patPropsFila">' +
                campoNum("off", "Separación (cm)", s.off || 0, 0.5) + '</div>';
        }
        h += '<div class="patPropsFila"><label class="patCampo chico grande">Capa<select data-f="capa">' +
            ST.proy.capas.slice().reverse().map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.capa ? " selected" : "") + '>' + esc(c.nombre) + '</option>'; }).join("") +
            '</select></label></div>';
        h += '<div class="patPropsFila botones">' +
            '<button type="button" data-a="dup" class="chico">Duplicar</button>' +
            '<button type="button" data-a="mx" class="chico">↔ Espejar</button>' +
            '<button type="button" data-a="my" class="chico">↕ Espejar</button>' +
            '<button type="button" data-a="r90" class="chico">⟳ 90°</button>' +
            '<button type="button" data-a="front" class="chico">Al frente</button>' +
            '<button type="button" data-a="del" class="chico peligro">🗑 Borrar</button></div>';
        h += '<div class="patPropsFila">' +
            '<label class="patCampo chico">Rotar (°)<input type="number" inputmode="decimal" step="1" data-f="rot" placeholder="45"></label>' +
            '<label class="patCampo chico">Escala (%)<input type="number" inputmode="decimal" step="1" data-f="esc" placeholder="100"></label></div>';
        el.innerHTML = h;
    }

    function clickProps(e) {
        const b = e.target.closest("button[data-a]");
        if (!b || !ED) return;
        const a = b.getAttribute("data-a");
        if (a === "colapsar") { ED.propsColapsado = !ED.propsColapsado; renderProps(); ajustarCanvas(); return; }
        if (/^g(copiar|cortar|borrar|pegar|des|mx|my)$/.test(a)) { accionGrupo(a); return; }
        const s = elegida();
        if (!s) return;
        if (a === "vinc") {
            ED.vincular = s.id; ED.hintFijo = "Tocá la otra pieza (por ejemplo el delantero o el trasero) para vincularla con «" + (s.name || "esta pieza") + "».";
            aviso("Tocá la otra pieza en el lienzo para vincularla.", 3200);
            renderProps(); dibujar(); return;
        }
        if (a === "vinccancel") { ED.vincular = null; ED.hintFijo = null; renderProps(); dibujar(); return; }
        const i = indice(s.id);
        const reemplazar = function (n) { ST.proy.shapes[i] = n; };
        if (a === "del") { borrarSeleccion(); return; }
        snapshot();
        if (a === "desvinc") { desvincular(s); aviso("Piezas desvinculadas."); }
        else if (a === "dup") {
            const c = PN.trasladar(s, 2, 2); c.id = PN.uid(); delete c.vinc;
            if (c.name) c.name = c.name + " (copia)";
            ST.proy.shapes.push(c); ED.sel = c.id; ED.selV = -1; ED.selE = -1;
        } else if (a === "mx" || a === "my") {
            // Al espejar cambia el orden de los puntos: la pieza deja de corresponderse punto a punto con su socia.
            const tenia = !!s.vinc;
            const nueva = PN.espejar(s, a === "mx" ? "x" : "y");
            reemplazar(nueva);
            if (tenia) { desvincular(nueva); aviso("Se desvinculó de la otra pieza porque espejar cambia el orden de los puntos."); }
        }
        else if (a === "r90") reemplazar(PN.rotar(s, 90));
        else if (a === "front") { ST.proy.shapes.splice(i, 1); ST.proy.shapes.push(s); }
        else if (a === "hilo") {
            const bb = PN.cajaDeShape(s), c = PN.centroide(PN.aplanar(s).pts);
            const alto = bb.y1 - bb.y0;
            s.grain = { a: { x: c.x, y: bb.y0 + alto * 0.25 }, b: { x: c.x, y: bb.y1 - alto * 0.25 } };
        } else if (a === "qpinza") { socias(s).forEach(function (o) { while (o.darts && o.darts.length) PN.ajustarPinza(o, 0, 0); }); while (s.darts && s.darts.length) PN.ajustarPinza(s, 0, 0); }
        else if (a === "qdart") { const di = +b.getAttribute("data-i"); socias(s).forEach(function (o) { if (o.darts && o.darts[di]) PN.ajustarPinza(o, di, 0); }); PN.ajustarPinza(s, di, 0); }
        else if (a === "dlado") { const dd = s.darts && s.darts[+b.getAttribute("data-i")]; if (dd) dd.lado = dd.lado === "a" ? "b" : "a"; }
        else if (a === "qpiq") s.notches = [];
        else if (a === "qhilo") s.grain = null;
        else if (a === "delv") {
            const sc = socias(s);
            if (!PN.borrarVertice(s, ED.selV)) { ST.undo.pop(); aviso("No se puede quitar: faltan puntos."); return; }
            sc.forEach(function (o) { PN.borrarVertice(o, ED.selV); });
            ED.selV = -1;
        }
        guardar(); renderPropsYFlot(); dibujar();
    }

    function cambioProps(e) {
        const t = e.target;
        const f = t.getAttribute && t.getAttribute("data-f");
        if (!f || !ED) return;
        if (f === "gesc" || f === "grot") { transformarGrupoNumerico(f, t); return; }
        const s = elegida();
        if (!s) return;
        const num = PN.num(t.value, NaN);
        snapshot();
        let reemplazo = null;
        const n = s.pts ? s.pts.length : 0;
        const edgeIdx = (s.pts && s.pts.length === 2 && !s.closed) ? 0 : ED.selE;
        const sc = socias(s);   // piezas vinculadas: reciben el mismo cambio
        const anc = ["vx", "vy", "edgeLen", "edgeAng"].indexOf(f) >= 0 ? [s].concat(sc).map(function (o) { return { o: o, b: PN.anclarPinzas(o) }; }) : null;

        if (f === "name") s.name = t.value;
        else if (f === "pieza") { s.pieza = t.checked; if (s.pieza && !s.name) s.name = "Pieza " + numeroPieza(); }
        else if (f === "closed") { s.closed = t.checked && n >= 3; if (!s.closed) { s.pieza = false; s.fold = []; } }
        else if (f === "qty" && isFinite(num)) s.qty = Math.max(1, Math.round(num));
        else if (f === "sa" && isFinite(num)) { s.sa = Math.max(0, num); sc.forEach(function (o) { o.sa = s.sa; }); }
        else if (f === "text") s.text = t.value;
        else if (f === "size" && isFinite(num)) s.size = Math.max(0.3, num);
        else if (f === "off" && isFinite(num)) s.off = num;
        else if (f === "dartW" && isFinite(num) && num >= 0) {
            const di = +t.getAttribute("data-i"), d0 = s.darts && s.darts[di];
            const dw = d0 ? num - PN.anchoPinza(d0) : 0;
            PN.ajustarPinza(s, di, num);
            sc.forEach(function (o) { if (o.darts && o.darts[di]) PN.ajustarPinza(o, di, PN.anchoPinza(o.darts[di]) + dw); });
        }
        else if (f === "vx" && isFinite(num) && ED.selV >= 0) { const dd = num - s.pts[ED.selV].x; s.pts[ED.selV].x = num; sc.forEach(function (o) { o.pts[ED.selV].x += dd; }); }
        else if (f === "vy" && isFinite(num) && ED.selV >= 0) { const dd = num - s.pts[ED.selV].y; s.pts[ED.selV].y = num; sc.forEach(function (o) { o.pts[ED.selV].y += dd; }); }
        else if (f === "vs" && ED.selV >= 0) { s.pts[ED.selV].s = t.checked; sc.forEach(function (o) { o.pts[ED.selV].s = t.checked; }); }
        else if (f === "edgeLen" && isFinite(num) && num > 0 && edgeIdx >= 0) {
            const dL = num - largoLado(s, edgeIdx);
            fijarLargoLado(s, edgeIdx, num);
            sc.forEach(function (o) { fijarLargoLado(o, edgeIdx, Math.max(0.1, largoLado(o, edgeIdx) + dL)); });
        } else if (f === "edgeAng" && isFinite(num) && edgeIdx >= 0) {
            const dA = num - anguloLado(s, edgeIdx);
            fijarAnguloLado(s, edgeIdx, num);
            sc.forEach(function (o) { fijarAnguloLado(o, edgeIdx, anguloLado(o, edgeIdx) + dA); });
        } else if (f === "edgeSa" && isFinite(num) && edgeIdx >= 0) { s.saE = s.saE || {}; s.saE[edgeIdx] = Math.max(0, num); sc.forEach(function (o) { o.saE = o.saE || {}; o.saE[edgeIdx] = Math.max(0, num); }); }
        else if (f === "edgeFold" && edgeIdx >= 0) {
            s.fold = s.fold || [];
            const k = s.fold.indexOf(edgeIdx);
            if (t.checked && k < 0) s.fold.push(edgeIdx); else if (!t.checked && k >= 0) s.fold.splice(k, 1);
            sc.forEach(function (o) {
                o.fold = o.fold || [];
                const k2 = o.fold.indexOf(edgeIdx);
                if (t.checked && k2 < 0) o.fold.push(edgeIdx); else if (!t.checked && k2 >= 0) o.fold.splice(k2, 1);
            });
        } else if (f === "rot" && isFinite(num)) { reemplazo = PN.rotar(s, num); t.value = ""; }
        else if (f === "esc" && isFinite(num) && num > 0) {
            reemplazo = PN.escalar(s, num / 100); t.value = "";
            sc.forEach(function (o) { ST.proy.shapes[indice(o.id)] = PN.escalar(o, num / 100); });
        }
        else if (f === "capa") {
            const destino = capaPorId(t.value);
            if (!destino) { ST.undo.pop(); return; }
            s.capa = destino.id;
            ST.proy.capaActiva = destino.id;
            limpiarSeleccionInaccesible();
        }
        else { ST.undo.pop(); return; }

        if (anc) anc.forEach(function (a) { PN.reanclarPinzas(a.o, a.b); });
        if (reemplazo) ST.proy.shapes[indice(s.id)] = reemplazo;
        guardar(); renderPropsYFlot(); dibujar();
    }

    // ------------------------------
    // PDF
    // ------------------------------
    function vistaPdf(cu) {
        const p = ST.proy;
        if (!ST.pdfOp) {
            ST.pdfOp = PN.opcionesPdfPorDefecto();
            ST.pdfOp.autor = (usuarioActual && (usuarioActual.nombre || usuarioActual.usuario || usuarioActual.nombreTienda)) || "";
        }
        const o = ST.pdfOp;
        const vacio = !PN.formasOrdenadas(p, true).length;
        const sel = function (v, a) { return v === a ? " selected" : ""; };

        cu.innerHTML =
            '<div class="patIntro"><p>Descargá tu patrón en PDF: ficha con medidas y lista de piezas, vista general y hojas a <b>escala real 1:1</b> para imprimir y pegar.</p></div>' +
            (vacio ? '<p class="patVacio">No hay nada para exportar: generá un patrón o dibujá piezas en la pestaña Dibujo (y revisá que sus capas no estén ocultas).</p>' : '') +
            '<div class="patBloque"><h3>Qué incluir</h3>' +
            '<label class="patCheck"><input type="checkbox" data-po="ficha"' + (o.ficha ? " checked" : "") + '> Ficha técnica (medidas, piezas, consumo de tela)</label>' +
            '<label class="patCheck"><input type="checkbox" data-po="armado"' + (o.armado ? " checked" : "") + '> Armado ficha técnica (cómo trazar y armar cada molde)</label>' +
            '<label class="patCheck"><input type="checkbox" data-po="general"' + (o.general ? " checked" : "") + '> Vista general en una sola hoja</label>' +
            '<label class="patCheck"><input type="checkbox" data-po="escalaReal"' + (o.escalaReal ? " checked" : "") + '> Patrón a escala real (1:1) en hojas</label>' +
            '<label class="patCheck"><input type="checkbox" data-po="margen"' + (o.margen ? " checked" : "") + '> Mostrar margen de costura (línea de corte)</label>' +
            '<p class="patAyuda">Las capas ocultas no se incluyen en el PDF.</p></div>' +
            '<div class="patBloque"><h3>Papel</h3><div class="patDosCol">' +
            '<label class="patCampo">Tamaño<select data-po="papel"><option value="A4"' + sel(o.papel, "A4") + '>A4</option><option value="Carta"' + sel(o.papel, "Carta") + '>Carta (Letter)</option><option value="A3"' + sel(o.papel, "A3") + '>A3</option></select></label>' +
            '<label class="patCampo">Orientación<select data-po="orient"><option value="vertical"' + sel(o.orient, "vertical") + '>Vertical</option><option value="horizontal"' + sel(o.orient, "horizontal") + '>Horizontal</option></select></label></div>' +
            '<label class="patCampo">Superposición entre hojas (cm)<input type="number" step="0.5" min="0.5" max="3" data-po="superposicion" value="' + o.superposicion + '"></label>' +
            '<label class="patCheck"><input type="checkbox" data-po="acomodar"' + (o.acomodar ? " checked" : "") + '> Acomodar las piezas automáticamente para usar menos hojas (no modifica tu lienzo)</label></div>' +
            '<div class="patBloque"><h3>Datos de la ficha</h3>' +
            '<label class="patCampo">Título<input type="text" data-po="titulo" value="' + esc(o.titulo || p.nombre) + '" maxlength="60"></label>' +
            '<label class="patCampo">Tienda / autor<input type="text" data-po="autor" value="' + esc(o.autor) + '" maxlength="60"></label>' +
            '<label class="patCampo">Ancho de tela para el cálculo (cm)<input type="number" step="1" min="30" max="400" id="patTela" value="' + (p.tela.ancho || 140) + '"></label>' +
            '<label class="patCampo">Notas<textarea id="patNotas" rows="3" maxlength="600" placeholder="Tela recomendada, avíos, indicaciones de costura…">' + esc(p.notas || "") + '</textarea></label></div>' +
            '<div class="patBloque" id="patResumenPdf"></div>' +
            '<div class="patBotonesFila grande"><button type="button" class="principal" id="patGenerar"' + (vacio ? " disabled" : "") + '>📄 Generar PDF</button></div>' +
            '<div id="patResultado"></div>';

        const resumen = function () {
            const el = $("patResumenPdf");
            if (vacio) { el.innerHTML = ""; return; }
            let pl;
            try { pl = PN.planificarPdf(p, o); } catch (e) { pl = null; }
            if (!pl || pl.vacio) { el.innerHTML = ""; return; }
            const w = pl.bb.x1 - pl.bb.x0, h = pl.bb.y1 - pl.bb.y0;
            let extra = (o.ficha ? 1 : 0) + (o.armado ? 1 : 0) + (o.general ? 1 : 0);
            el.innerHTML = '<h3>Vista previa del armado</h3>' +
                '<p class="patAyuda">Tamaño total del patrón: <b>' + nf(w, 0) + ' × ' + nf(h, 0) + ' cm</b>. ' +
                (o.escalaReal ? 'A escala real son <b>' + pl.hojasReales + ' hoja' + (pl.hojasReales === 1 ? "" : "s") + '</b> (' + pl.cols + ' × ' + pl.rows + ' en cuadrícula). ' : '') +
                'PDF total: <b>' + (pl.hojasReales * (o.escalaReal ? 1 : 0) + extra) + '+ páginas</b>.</p>' +
                (o.escalaReal && pl.hojasReales > 40 ? '<p class="patAviso">⚠ Son muchas hojas. Probá "Acomodar las piezas automáticamente" o papel A3.</p>' : '') +
                '<canvas id="patMapa" class="patMapaHojas"></canvas>';
            const c = $("patMapa");
            const cw = Math.min(el.clientWidth || 300, 360);
            const cel = Math.min(26, (cw - 4) / pl.cols);
            c.width = Math.ceil(cel * pl.cols) + 2; c.height = Math.ceil(cel * pl.rows) + 2;
            c.style.width = c.width + "px"; c.style.height = c.height + "px";
            const ctx = c.getContext("2d");
            // miniatura de fondo
            const zz = Math.min((cel * pl.cols) / (pl.cw * pl.cols - pl.ov * (pl.cols - 1)), 10);
            pl.tiles.forEach(function (t) {
                const x = t.c * cel + 1, y = t.r * cel + 1;
                ctx.fillStyle = t.inc ? "rgba(137,166,184,0.35)" : "rgba(255,255,255,0.03)";
                ctx.fillRect(x, y, cel - 1, cel - 1);
                ctx.strokeStyle = t.inc ? "#89A6B8" : "#444"; ctx.strokeRect(x + 0.5, y + 0.5, cel - 2, cel - 2);
                if (t.inc && cel > 16) { ctx.fillStyle = "#fff"; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(PN.etiquetaHoja(t.r, t.c), x + cel / 2, y + cel / 2); }
            });
        };
        resumen();

        oyente(cu, "pdf", "change", function (e) {
            const t = e.target;
            if (t.id === "patTela") { p.tela.ancho = PN.clamp(PN.num(t.value, 140), 30, 400); guardar(); return; }
            if (t.id === "patNotas") { p.notas = t.value; guardar(); return; }
            const k = t.getAttribute && t.getAttribute("data-po");
            if (!k) return;
            if (t.type === "checkbox") o[k] = t.checked;
            else if (k === "superposicion") o[k] = PN.clamp(PN.num(t.value, 1), 0.5, 3);
            else o[k] = t.value;
            resumen();
        });

        $("patGenerar").onclick = function () {
            const btn = this;
            if (!(o.ficha || o.armado || o.general || o.escalaReal)) { alert("Elegí al menos una sección para incluir."); return; }
            guardarYa();
            btn.disabled = true; btn.textContent = "Generando…";
            setTimeout(function () {
                try {
                    const r = PN.generarPdf(p, Object.assign({}, o, { titulo: o.titulo || p.nombre }));
                    const blob = new Blob([r.bytes], { type: "application/pdf" });
                    const nombre = nombreArchivo(o.titulo || p.nombre) + ".pdf";
                    if (ST.pdfRes && ST.pdfRes.url) URL.revokeObjectURL(ST.pdfRes.url);
                    ST.pdfRes = { blob: blob, nombre: nombre, url: URL.createObjectURL(blob), hojas: r.hojas };
                    mostrarResultadoPdf();
                    descargarArchivo(blob, nombre);
                } catch (err) {
                    alert(err && err.message ? err.message : "No se pudo generar el PDF.");
                }
                btn.disabled = false; btn.textContent = "📄 Generar PDF";
            }, 60);
        };
        if (ST.pdfRes) mostrarResultadoPdf();
    }

    function mostrarResultadoPdf() {
        const el = $("patResultado");
        if (!el || !ST.pdfRes) return;
        const r = ST.pdfRes;
        const puedeCompartir = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([r.blob], r.nombre, { type: "application/pdf" })] }));
        el.innerHTML = '<div class="patResultado"><strong>✅ PDF listo</strong>' +
            '<span>' + r.hojas + ' página' + (r.hojas === 1 ? "" : "s") + ' · ' + Math.max(1, Math.round(r.blob.size / 1024)) + ' KB · ' + esc(r.nombre) + '</span>' +
            '<div class="patBotonesFila">' +
            '<button type="button" class="principal" id="patBajar">⬇ Descargar</button>' +
            '<button type="button" id="patVer">Abrir</button>' +
            (puedeCompartir ? '<button type="button" id="patComp">Compartir</button>' : '') +
            '</div><p class="patAyuda">Si no se descarga, probá <b>Abrir</b> o <b>Compartir</b>. Al imprimir elegí tamaño real: 100% (sin "ajustar a la página"). Verificá con el cuadrado de control de 10 cm.</p></div>';
        $("patBajar").onclick = function () { descargarArchivo(r.blob, r.nombre); };
        $("patVer").onclick = function () { const w = window.open(r.url, "_blank"); if (!w) location.href = r.url; };
        if (puedeCompartir) $("patComp").onclick = function () {
            navigator.share({ files: [new File([r.blob], r.nombre, { type: "application/pdf" })], title: r.nombre }).catch(function () { });
        };
    }

    // ------------------------------
    // API pública
    // ------------------------------
    window.PatNivanUI = { abrir: abrir, cerrar: cerrar };
    window.abrirHerramientasAvanzadasNivan = abrir;
})();
