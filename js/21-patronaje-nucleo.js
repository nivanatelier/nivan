// ==============================
// PATRONAJE · NÚCLEO (geometría, medidas y generadores de patrones)
// ==============================
// Todo en centímetros. Sin dependencias: no usa nada del resto de la app,
// así que también corre fuera del navegador (para probarlo).
// Sistema de coordenadas: x hacia la derecha, y hacia ABAJO (como la pantalla).

(function (root) {
    'use strict';

    const PN = root.PatNivan = root.PatNivan || {};

    // ------------------------------
    // Utilidades
    // ------------------------------
    function uid() {
        return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    function clon(o) { return JSON.parse(JSON.stringify(o)); }
    function redondear(n, paso) { paso = paso || 0.1; return Math.round(n / paso) * paso; }
    function r1(n) { return Math.round(n * 10) / 10; }
    function num(v, def) { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : def; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function P(x, y, s) { return { x: x, y: y, s: !!s }; }

    PN.uid = uid; PN.clon = clon; PN.num = num; PN.dist = dist; PN.r1 = r1; PN.clamp = clamp;

    // ------------------------------
    // Medidas del cuerpo
    // ------------------------------
    PN.GRUPOS_MEDIDAS = [
        { id: "torso", titulo: "Torso" },
        { id: "brazo", titulo: "Brazo" },
        { id: "piernas", titulo: "Cintura para abajo" }
    ];

    PN.MEDIDAS = [
        { k: "altura", g: "torso", t: "Altura total", def: 165, ayuda: "De la cabeza a los pies, sin zapatos y parada derecha." },
        { k: "busto", g: "torso", t: "Contorno de busto / pecho", def: 88, ayuda: "Alrededor de la parte más llena del pecho, con la cinta pareja y sin apretar." },
        { k: "cintura", g: "torso", t: "Contorno de cintura", def: 70, ayuda: "Alrededor de la parte más angosta del torso (arriba del ombligo)." },
        { k: "cadera", g: "torso", t: "Contorno de cadera", def: 96, ayuda: "Alrededor de la parte más ancha de la cadera, unos 20 cm bajo la cintura." },
        { k: "talleEspalda", g: "torso", t: "Talle de espalda", def: 40, ayuda: "Del hueso saliente de la nuca (7ª vértebra) hasta la cintura, por la columna." },
        { k: "anchoHombros", g: "torso", t: "Ancho de espalda", def: 36.5, ayuda: "La distancia horizontal de un extremo al otro a la altura de las axilas o los omóplatos." },
        { k: "largoHombro", g: "torso", t: "Hombro (largo)", def: 12.5, ayuda: "Solo el tramo del hombro: desde el huesito de la punta del hombro hasta donde empieza el cuello (la base del cuello, al costado). Se mide de un solo lado." },
        { k: "cuello", g: "torso", t: "Contorno de cuello", def: 35, ayuda: "Alrededor de la base del cuello." },
        { k: "altoCadera", g: "torso", t: "Altura de cadera", def: 20, ayuda: "De la cintura hasta la línea de cadera, de costado." },
        { k: "largoManga", g: "brazo", t: "Largo de manga", def: 60 },
        { k: "contornoBrazo", g: "brazo", t: "Contorno de brazo (bíceps)", def: 28, ayuda: "Alrededor de la parte más gruesa del brazo." },
        { k: "contornoMuneca", g: "brazo", t: "Contorno de muñeca", def: 16, ayuda: "Alrededor del hueso de la muñeca." },
        { k: "tiro", g: "piernas", t: "Tiro delantero (altura)", def: 26 },
        { k: "tiroTrasero", g: "piernas", t: "Tiro trasero (altura)", def: 28.5 },
        { k: "largoFalda", g: "piernas", t: "Largo de falda", def: 60, ayuda: "De la cintura hasta donde querés que termine la falda." },
        { k: "largoPantalon", g: "piernas", t: "Largo de pantalón (costado)", def: 100, ayuda: "De la cintura al tobillo (o donde termine), por el costado." },
        { k: "contornoMuslo", g: "piernas", t: "Contorno de muslo", def: 56, ayuda: "Alrededor de la parte más ancha del muslo (dato de control)." },
        { k: "contornoRodilla", g: "piernas", t: "Contorno de rodilla", def: 38, ayuda: "Alrededor de la rodilla (dato de control)." },
        { k: "bocaPantalon", g: "piernas", t: "Botamanga (contorno del bajo)", def: 44, ayuda: "Es la botamanga: la parte más baja de la pierna, donde termina el pantalón (el bajo). Es el contorno completo que querés ahí, de UNA pierna. Ej.: 36–40 pitillo/ajustado · 44–48 recto · 52 o más ancho/campana." }
    ];

    PN.TALLES = {
        mujer: {
            XS: { altura: 160, busto: 80, cintura: 62, cadera: 88 },
            S: { altura: 162, busto: 84, cintura: 66, cadera: 92 },
            M: { altura: 165, busto: 88, cintura: 70, cadera: 96 },
            L: { altura: 168, busto: 94, cintura: 76, cadera: 102 },
            XL: { altura: 170, busto: 100, cintura: 82, cadera: 108 },
            XXL: { altura: 172, busto: 106, cintura: 88, cadera: 114 }
        },
        hombre: {
            S: { altura: 172, busto: 92, cintura: 78, cadera: 95 },
            M: { altura: 175, busto: 98, cintura: 84, cadera: 100 },
            L: { altura: 178, busto: 104, cintura: 90, cadera: 106 },
            XL: { altura: 180, busto: 110, cintura: 98, cadera: 112 },
            XXL: { altura: 182, busto: 116, cintura: 106, cadera: 118 }
        }
    };

    function medioCm(n) { return Math.round(n * 2) / 2; }

    // Calcula las medidas que se pueden estimar a partir de altura, busto, cintura y cadera.
    // El género solo ajusta proporciones del cuerpo para estimar; el molde base se arma igual para todos
    // (altoCadera y bocaPantalon no dependen del género).
    PN.derivar = function (m, sexo) {
        const h = sexo === "hombre";
        const o = Object.assign({}, m);
        o.talleEspalda = medioCm(o.altura * (h ? 0.26 : 0.245));
        o.anchoHombros = medioCm(o.busto * (h ? 0.43 : 0.415));
        o.largoHombro = medioCm(o.busto * (h ? 0.145 : 0.14));
        o.cuello = medioCm(o.busto * (h ? 0.39 : 0.4));
        o.altoCadera = 20.5;
        o.largoManga = medioCm(o.altura * 0.365);
        o.contornoBrazo = medioCm(o.busto * (h ? 0.3 : 0.31));
        o.contornoMuneca = medioCm(o.busto * 0.18);
        o.tiro = medioCm(o.altura * 0.16);
        o.tiroTrasero = medioCm(o.tiro + 2.5);
        o.largoFalda = medioCm(o.altura * 0.36);
        o.largoPantalon = medioCm(o.altura * 0.61);
        o.bocaPantalon = 46;
        o.contornoMuslo = medioCm(o.cadera * 0.58);
        o.contornoRodilla = medioCm(o.cadera * 0.4);
        return o;
    };

    PN.medidasPorDefecto = function () {
        const o = {};
        PN.MEDIDAS.forEach(function (x) { o[x.k] = x.def; });
        return o;
    };

    // Devuelve todas las medidas: las que faltan (o quedaron vacías) se estiman a partir de
    // altura, busto, cintura y cadera. Así un campo vacío nunca rompe el patrón.
    PN.completarMedidas = function (m, sexo) {
        const def = PN.medidasPorDefecto();
        const ok = function (v) { return v != null && v !== "" && isFinite(+v); };
        const base = {};
        ["altura", "busto", "cintura", "cadera"].forEach(function (k) { base[k] = ok(m && m[k]) ? +m[k] : def[k]; });
        const d = PN.derivar(base, sexo === "hombre" ? "hombre" : "mujer");
        const out = {};
        PN.MEDIDAS.forEach(function (x) { out[x.k] = ok(m && m[x.k]) ? +m[x.k] : d[x.k]; });
        return out;
    };

    // ------------------------------
    // Forma: curvas suaves (Catmull-Rom → Bézier) y aplanado
    // ------------------------------
    // Un "path" tiene puntos {x,y,s}. Si s es true el punto es "suave" y las curvas
    // pasan redondeadas por él; si no, es una esquina.
    function aplanar(s, nSeg) {
        nSeg = nSeg || 12;
        const Pt = s.pts, n = Pt.length;
        const cerrada = !!s.closed && n > 2;
        const pts = [], edge = [], vi = [];
        if (n === 0) return { pts: pts, edge: edge, vi: vi, closed: cerrada };

        const tang = function (i) {
            const a = cerrada ? Pt[(i - 1 + n) % n] : Pt[Math.max(0, i - 1)];
            const b = cerrada ? Pt[(i + 1) % n] : Pt[Math.min(n - 1, i + 1)];
            return { x: (b.x - a.x) / 2, y: (b.y - a.y) / 2 };
        };

        const segs = cerrada ? n : n - 1;
        for (let k = 0; k < segs; k++) {
            const p0 = Pt[k], p3 = Pt[(k + 1) % n];
            pts.push({ x: p0.x, y: p0.y }); edge.push(k); vi.push(k);
            if (!p0.s && !p3.s) continue;
            let c1, c2;
            if (p0.s) { const t = tang(k); c1 = { x: p0.x + t.x / 3, y: p0.y + t.y / 3 }; }
            else c1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
            if (p3.s) { const t2 = tang((k + 1) % n); c2 = { x: p3.x - t2.x / 3, y: p3.y - t2.y / 3 }; }
            else c2 = { x: p3.x - (p3.x - p0.x) / 3, y: p3.y - (p3.y - p0.y) / 3 };
            for (let j = 1; j < nSeg; j++) {
                const t = j / nSeg, u = 1 - t;
                const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
                pts.push({ x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y });
                edge.push(k); vi.push(-1);
            }
        }
        if (!cerrada) { pts.push({ x: Pt[n - 1].x, y: Pt[n - 1].y }); vi.push(n - 1); }
        return { pts: pts, edge: edge, vi: vi, closed: cerrada };
    }
    PN.aplanar = aplanar;

    function largoPoli(pts, cerrada) {
        let L = 0;
        for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
        if (cerrada && pts.length > 2) L += dist(pts[pts.length - 1], pts[0]);
        return L;
    }
    PN.largoPoli = largoPoli;

    function areaFirmada(pts) {
        let a = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            a += p.x * q.y - q.x * p.y;
        }
        return a / 2;
    }
    PN.area = function (pts) { return Math.abs(areaFirmada(pts)); };

    function centroide(pts) {
        const A = areaFirmada(pts);
        if (Math.abs(A) < 1e-6) {
            let sx = 0, sy = 0;
            pts.forEach(function (p) { sx += p.x; sy += p.y; });
            return { x: sx / pts.length, y: sy / pts.length };
        }
        let cx = 0, cy = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            const f = p.x * q.y - q.x * p.y;
            cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
        }
        return { x: cx / (6 * A), y: cy / (6 * A) };
    }
    PN.centroide = centroide;

    // Largo de los lados originales desde el índice a hasta b (incluidos).
    PN.largoLados = function (s, desde, hasta) {
        const f = aplanar(s);
        let L = 0;
        for (let i = 0; i < f.pts.length; i++) {
            if (f.edge[i] === undefined) continue;
            if (f.edge[i] >= desde && f.edge[i] <= hasta) {
                const q = f.pts[(i + 1) % f.pts.length];
                L += dist(f.pts[i], q);
            }
        }
        return L;
    };

    PN.largoLado = function (s, k) { return PN.largoLados(s, k, k); };

    PN.puntoEnPoligono = function (p, pts) {
        let dentro = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i], b = pts[j];
            if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) dentro = !dentro;
        }
        return dentro;
    };

    // Proyección de p sobre el segmento a-b: {x,y,t,d}
    function proyectar(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        let t = l2 < 1e-12 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
        t = clamp(t, 0, 1);
        const x = a.x + t * dx, y = a.y + t * dy;
        return { x: x, y: y, t: t, d: Math.hypot(p.x - x, p.y - y) };
    }
    PN.proyectar = proyectar;

    // Punto más cercano sobre el contorno de un path.
    PN.cercanoEnContorno = function (s, p) {
        const f = aplanar(s);
        const n = f.pts.length;
        const tope = f.closed ? n : n - 1;
        let mejor = null;
        for (let i = 0; i < tope; i++) {
            const a = f.pts[i], b = f.pts[(i + 1) % n];
            const q = proyectar(p, a, b);
            if (!mejor || q.d < mejor.d) {
                mejor = { x: q.x, y: q.y, d: q.d, seg: i, edge: f.edge[i], ax: a.x, ay: a.y, bx: b.x, by: b.y };
            }
        }
        return mejor;
    };

    // ------------------------------
    // Margen de costura (contorno desplazado hacia afuera)
    // ------------------------------
    function margenDeLado(s, e) {
        if (s.fold && s.fold.indexOf(e) >= 0) return 0;
        if (s.saE && s.saE[e] != null) return s.saE[e];
        return s.sa == null ? 1 : s.sa;
    }
    PN.margenDeLado = margenDeLado;

    PN.contornoConMargen = function (s) {
        if (!s.closed || s.pts.length < 3) return null;
        const f = aplanar(s, 10);
        // Sin puntos repetidos
        const pts = [], ed = [];
        for (let i = 0; i < f.pts.length; i++) {
            const p = f.pts[i];
            if (pts.length && dist(pts[pts.length - 1], p) < 1e-6) continue;
            pts.push(p); ed.push(f.edge[i]);
        }
        if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-6) { pts.pop(); ed.pop(); }
        const n = pts.length;
        if (n < 3) return null;
        const sg = areaFirmada(pts) > 0 ? 1 : -1;
        const d = [], nx = [], ny = [];
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
            nx.push(sg > 0 ? dy / L : -dy / L);
            ny.push(sg > 0 ? -dx / L : dx / L);
            d.push(margenDeLado(s, ed[i]));
        }
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = (i - 1 + n) % n, b = i;
            const p = pts[i];
            const da = d[a], db = d[b];
            const dot = nx[a] * nx[b] + ny[a] * ny[b];
            let q = null;
            const det = nx[a] * ny[b] - ny[a] * nx[b];
            if (Math.abs(det) < 1e-4) {
                if (dot > 0) q = { x: p.x + (nx[a] * da + nx[b] * db) / 2, y: p.y + (ny[a] * da + ny[b] * db) / 2 };
            } else {
                // Intersección de las dos rectas desplazadas
                const ca = nx[a] * p.x + ny[a] * p.y + da;
                const cb = nx[b] * p.x + ny[b] * p.y + db;
                const x = (ca * ny[b] - cb * ny[a]) / det;
                const y = (nx[a] * cb - nx[b] * ca) / det;
                const lim = 4 * Math.max(da, db, 0.5);
                if (Math.hypot(x - p.x, y - p.y) <= lim) q = { x: x, y: y };
            }
            if (q) out.push(q);
            else {
                out.push({ x: p.x + nx[a] * da, y: p.y + ny[a] * da });
                out.push({ x: p.x + nx[b] * db, y: p.y + ny[b] * db });
            }
        }
        return out;
    };

    // ------------------------------
    // Cajas y transformaciones
    // ------------------------------
    PN.cajaDeShape = function (s, op) {
        op = op || {};
        let pts = [];
        if (s.t === "path") {
            pts = aplanar(s, 8).pts;
            if (op.sa && s.pieza && s.closed) {
                const c = PN.contornoConMargen(s);
                if (c) pts = pts.concat(c);
            }
        } else if (s.t === "text") {
            const w = String(s.text || "").length * (s.size || 1) * 0.55;
            pts = [s.p, { x: s.p.x + w, y: s.p.y + (s.size || 1) }];
        } else if (s.t === "dim") {
            pts = [s.a, s.b];
            const o = s.off || 0;
            const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy) || 1;
            pts.push({ x: s.a.x + (dy / L) * o, y: s.a.y - (dx / L) * o });
            pts.push({ x: s.b.x + (dy / L) * o, y: s.b.y - (dx / L) * o });
        }
        if (!pts.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        pts.forEach(function (p) {
            if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
            if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        });
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
    };

    PN.cajaDeTodo = function (shapes, op) {
        let c = null;
        shapes.forEach(function (s) {
            const b = PN.cajaDeShape(s, op);
            if (!c) c = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
            else {
                c.x0 = Math.min(c.x0, b.x0); c.y0 = Math.min(c.y0, b.y0);
                c.x1 = Math.max(c.x1, b.x1); c.y1 = Math.max(c.y1, b.y1);
            }
        });
        return c;
    };

    function mapShape(s, f) {
        const o = clon(s);
        const m = function (p) {
            if (!p) return;
            const q = f({ x: p.x, y: p.y });
            p.x = q.x; p.y = q.y;
        };
        if (o.pts) o.pts.forEach(m);
        (o.darts || []).forEach(function (d) { m(d.a); m(d.b); m(d.t); });
        (o.notches || []).forEach(m);
        (o.lineas || []).forEach(function (l) { m(l.a); m(l.b); });
        (o.marcas || []).forEach(function (q) { m(q.p); });
        if (o.grain) { m(o.grain.a); m(o.grain.b); }
        if (o.lab) m(o.lab);
        if (o.p) m(o.p);
        if (o.a) m(o.a);
        if (o.b) m(o.b);
        return o;
    }
    PN.mapShape = mapShape;

    PN.trasladar = function (s, dx, dy) {
        return mapShape(s, function (p) { return { x: p.x + dx, y: p.y + dy }; });
    };

    PN.rotar = function (s, grados, centro) {
        const c = centro || (function () { const b = PN.cajaDeShape(s); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; })();
        const a = grados * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
        return mapShape(s, function (p) {
            const x = p.x - c.x, y = p.y - c.y;
            return { x: c.x + x * co - y * si, y: c.y + x * si + y * co };
        });
    };

    PN.escalar = function (s, f, centro) {
        const c = centro || (function () { const b = PN.cajaDeShape(s); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; })();
        const o = mapShape(s, function (p) { return { x: c.x + (p.x - c.x) * f, y: c.y + (p.y - c.y) * f }; });
        if (o.t === "text") o.size = (o.size || 1) * f;
        return o;
    };

    PN.espejar = function (s, eje) {
        const b = PN.cajaDeShape(s);
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const o = mapShape(s, function (p) { return eje === "x" ? { x: 2 * cx - p.x, y: p.y } : { x: p.x, y: 2 * cy - p.y }; });
        if (o.pts) {
            const n = o.pts.length;
            o.pts.reverse();
            if (o.dims && o.dims.length) {
                o.dims.forEach(function (d) {
                    [d.a, d.b].forEach(function (e) {
                        if (e.i != null) e.i = n - 1 - e.i;
                        else if (e.r) { e.r = [n - 1 - e.r[0], n - 1 - e.r[1]]; e.w = -e.w; }
                    });
                });
            }
            const re = function (k) { return o.closed ? (((n - 2 - k) % n) + n) % n : n - 2 - k; };
            if (o.fold) o.fold = o.fold.map(re);
            if (o.saE) {
                const ne = {};
                Object.keys(o.saE).forEach(function (k) { ne[re(+k)] = o.saE[k]; });
                o.saE = ne;
            }
        }
        return o;
    };

    // ---- Pinzas: ancho y cierre ----
    // Una pinza son cm "de más" en el borde de la pieza. Si cambia su ancho, el borde cambia lo mismo
    // (la cintura terminada queda igual); si se quita, esos cm salen del borde y la pieza se achica.
    PN.anchoPinza = function (d) { return Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y); };

    // Lado de la pieza sobre el que está apoyada la pinza (-1 si no está sobre ninguno).
    function ladoDePinza(s, d) {
        if (!s.pts || s.pts.length < 2) return -1;
        const n = s.pts.length, tope = s.closed ? n : n - 1;
        let mejor = -1, mejorD = Infinity;
        for (let e = 0; e < tope; e++) {
            const p0 = s.pts[e], p1 = s.pts[(e + 1) % n];
            const da = PN.proyectar(d.a, p0, p1).d, db = PN.proyectar(d.b, p0, p1).d;
            if (Math.max(da, db) <= 1.5 && da + db < mejorD) { mejorD = da + db; mejor = e; }
        }
        return mejor;
    }

    // Vértices "suaves" que siguen a i0 (en el sentido paso = 1 o -1) hasta un vértice firme (ancla).
    // Cada uno recibe un peso w (1 cerca de i0, 0 en el ancla) según su avance sobre la recta i0 → ancla.
    // Un vértice con una marca (piquete) cuenta como ancla: ahí no se mueve nada (ej. la cadera).
    function cadenaSuave(s, i0, paso) {
        const n = s.pts.length, res = [];
        if (n < 3) return res;
        const marcado = function (p) { return (s.notches || []).some(function (q) { return Math.hypot(q.x - p.x, q.y - p.y) < 0.05; }); };
        const ks = [];
        let k = i0, ancla = -1;
        for (let m = 0; m < n - 1; m++) {
            k = ((k + paso) % n + n) % n;
            if (!s.closed && ((paso > 0 && k === 0) || (paso < 0 && k === n - 1))) break;
            if (!s.pts[k].s || marcado(s.pts[k])) { ancla = k; break; }
            ks.push(k);
        }
        if (ancla < 0 || !ks.length) return res;
        const p0 = s.pts[i0], pa = s.pts[ancla];
        const vx = pa.x - p0.x, vy = pa.y - p0.y, L2 = vx * vx + vy * vy;
        if (L2 < 1e-9) return res;
        ks.forEach(function (j) {
            const q = s.pts[j];
            const t = ((q.x - p0.x) * vx + (q.y - p0.y) * vy) / L2;
            const w = Math.max(0, Math.min(1, 1 - t));
            res.push({ k: j, w: w * w });    // cae más rápido que lineal: la curva conserva su forma de cadera
        });
        return res;
    }

    // Cambia el ancho de la pinza i (ancho <= 0.05 la quita). Devuelve false si no existe.
    // La pata "lejana" (la que mira al costado, según d.lado) y todo lo que está más allá se corre
    // esa diferencia; el extremo del lado se mueve sobre la misma línea, así el resto del molde no se deforma.
    PN.ajustarPinza = function (s, i, ancho) {
        const d = s.darts && s.darts[i];
        if (!d) return false;
        const w0 = PN.anchoPinza(d);
        const quitar = !(ancho > 0.05);
        const w1 = quitar ? 0 : ancho;
        const delta = w1 - w0;
        const e = ladoDePinza(s, d);
        if (e < 0) {
            // No está sobre un borde: solo cambia la pinza, sin tocar la pieza.
            if (quitar) { s.darts.splice(i, 1); return true; }
            const ux = w0 > 1e-6 ? (d.b.x - d.a.x) / w0 : 1, uy = w0 > 1e-6 ? (d.b.y - d.a.y) / w0 : 0;
            const cx = (d.a.x + d.b.x) / 2, cy = (d.a.y + d.b.y) / 2;
            d.a.x = cx - ux * w1 / 2; d.a.y = cy - uy * w1 / 2;
            d.b.x = cx + ux * w1 / 2; d.b.y = cy + uy * w1 / 2;
            return true;
        }
        const n = s.pts.length;
        const p0 = s.pts[e], p1 = s.pts[(e + 1) % n];
        const L = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const ux = (p1.x - p0.x) / L, uy = (p1.y - p0.y) / L;
        const tt = function (p) { return (p.x - p0.x) * ux + (p.y - p0.y) * uy; };
        const lejos = d.lado === "a" ? d.a : d.b, cerca = d.lado === "a" ? d.b : d.a;
        const dir = tt(lejos) >= tt(cerca) ? 1 : -1;         // hacia qué extremo del lado mira la pata lejana
        const vx = ux * dir, vy = uy * dir;
        const tc = (tt(d.a) + tt(d.b)) / 2;
        const mover = function (p, k) { p.x += vx * k; p.y += vy * k; };
        // Otras pinzas del mismo lado que están más allá: se corren junto con el extremo.
        s.darts.forEach(function (o, j) {
            if (j === i) return;
            if (ladoDePinza(s, o) !== e) return;
            if (dir * ((tt(o.a) + tt(o.b)) / 2 - tc) > 0) { mover(o.a, delta); mover(o.b, delta); mover(o.t, delta); }
        });
        const iExt = dir > 0 ? (e + 1) % n : e;
        // La curva que sigue al extremo (puntos suaves hasta la cadera, o hasta el próximo vértice firme)
        // acompaña el corrimiento con menos fuerza cuanto más lejos del extremo: así el costado no se quiebra.
        const cadena = cadenaSuave(s, iExt, dir > 0 ? 1 : -1);
        mover(s.pts[iExt], delta);                              // el extremo del lado se corre
        cadena.forEach(function (c) { mover(s.pts[c.k], delta * c.w); });
        if (quitar) s.darts.splice(i, 1);
        else { mover(lejos, delta); mover(d.t, delta / 2); }
        return true;
    };

    // Pinzas que acompañan al molde cuando se deforma: se guarda dónde está cada pinza respecto de su lado
    // (posición proporcional a lo largo del lado, ancho y profundidad en cm) y después se vuelve a ubicar.
    PN.anclarPinzas = function (s) {
        if (!s.darts || !s.darts.length || !s.pts || s.pts.length < 2) return null;
        const n = s.pts.length;
        return s.darts.map(function (d) {
            const e = ladoDePinza(s, d);
            if (e < 0) return null;
            const p0 = s.pts[e], p1 = s.pts[(e + 1) % n];
            const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            if (L < 1e-9) return null;
            const ux = (p1.x - p0.x) / L, uy = (p1.y - p0.y) / L, nx = -uy, ny = ux;
            const al = function (p) { return (p.x - p0.x) * ux + (p.y - p0.y) * uy; };
            const hh = function (p) { return (p.x - p0.x) * nx + (p.y - p0.y) * ny; };
            return { e: e, tc: (al(d.a) + al(d.b)) / 2 / L, w: al(d.b) - al(d.a), ha: hh(d.a), hb: hh(d.b), tt: al(d.t) / L, ht: hh(d.t) };
        });
    };
    PN.reanclarPinzas = function (s, bd) {
        if (!bd || !s.darts) return;
        const n = s.pts.length;
        s.darts.forEach(function (d, i) {
            const b = bd[i];
            if (!b || b.e >= n) return;
            const p0 = s.pts[b.e], p1 = s.pts[(b.e + 1) % n];
            const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            if (L < 1e-9) return;
            const ux = (p1.x - p0.x) / L, uy = (p1.y - p0.y) / L, nx = -uy, ny = ux;
            const en = function (a, h) { return { x: p0.x + ux * a + nx * h, y: p0.y + uy * a + ny * h }; };
            const c = b.tc * L;
            const a = en(c - b.w / 2, b.ha), bb = en(c + b.w / 2, b.hb), t = en(b.tt * L, b.ht);
            d.a.x = a.x; d.a.y = a.y; d.b.x = bb.x; d.b.y = bb.y; d.t.x = t.x; d.t.y = t.y;
        });
    };

    // Agrega un punto en el lado k (en la posición pt) y reacomoda índices de lados.
    PN.insertarVertice = function (s, k, pt) {
        const n = s.pts.length;
        const a = s.pts[k], b = s.pts[(k + 1) % n];
        s.pts.splice(k + 1, 0, { x: pt.x, y: pt.y, s: !!(a.s || b.s) });
        remapDims(s, function (i) { return i > k ? i + 1 : i; });
        const sube = function (e) { return e > k ? e + 1 : e; };
        const nuevoFold = [];
        (s.fold || []).forEach(function (e) { nuevoFold.push(sube(e)); if (e === k) nuevoFold.push(k + 1); });
        s.fold = nuevoFold;
        const ne = {};
        Object.keys(s.saE || {}).forEach(function (e) {
            const v = s.saE[e]; e = +e;
            ne[sube(e)] = v;
            if (e === k) ne[k + 1] = v;
        });
        s.saE = ne;
        return s;
    };

    PN.borrarVertice = function (s, i) {
        const n = s.pts.length;
        const cerrada = !!s.closed;
        const minimo = cerrada ? 3 : 2;
        if (n <= minimo) return false;
        s.pts.splice(i, 1);
        remapDims(s, function (x) { return x === i ? -1 : (x > i ? x - 1 : x); });
        // El lado anterior absorbe al lado i; los siguientes bajan uno.
        const mapE = function (e) {
            if (cerrada) {
                const a = (i - 1 + n) % n;
                if (e === a) return a > i ? a - 1 : a;
                if (e === i) return -1;
                return e > i ? e - 1 : e;
            }
            if (i === 0) return e === 0 ? -1 : e - 1;
            if (i === n - 1) return e === n - 2 ? -1 : e;
            if (e === i - 1) return e;
            if (e === i) return -1;
            return e > i ? e - 1 : e;
        };
        const nf = [];
        (s.fold || []).forEach(function (e) { const v = mapE(e); if (v >= 0 && nf.indexOf(v) < 0) nf.push(v); });
        s.fold = nf;
        const ne = {};
        Object.keys(s.saE || {}).forEach(function (e) { const v = mapE(+e); if (v >= 0) ne[v] = s.saE[e]; });
        s.saE = ne;
        return true;
    };

    // Simplificación de trazos a mano alzada (Ramer–Douglas–Peucker)
    PN.simplificar = function (pts, eps) {
        if (pts.length < 3) return pts.slice();
        const keep = new Array(pts.length).fill(false);
        keep[0] = keep[pts.length - 1] = true;
        const pila = [[0, pts.length - 1]];
        while (pila.length) {
            const par = pila.pop(), i0 = par[0], i1 = par[1];
            let dmax = 0, idx = -1;
            for (let i = i0 + 1; i < i1; i++) {
                const d = proyectar(pts[i], pts[i0], pts[i1]).d;
                if (d > dmax) { dmax = d; idx = i; }
            }
            if (dmax > eps && idx >= 0) { keep[idx] = true; pila.push([i0, idx]); pila.push([idx, i1]); }
        }
        return pts.filter(function (_, i) { return keep[i]; });
    };

    // Acomoda las piezas cerradas en filas ("estantes") dentro de un ancho dado.
    PN.acomodar = function (shapes, anchoMax, sep) {
        sep = sep == null ? 4 : sep;
        const items = [];
        const otros = [];
        shapes.forEach(function (s) {
            if (s.t === "path" && s.closed && s.pieza) items.push({ s: s, b: PN.cajaDeShape(s, { sa: true }) });
            else otros.push(s);
        });
        items.sort(function (a, b) { return (b.b.y1 - b.b.y0) - (a.b.y1 - a.b.y0); });
        let x = 0, y = 0, altoFila = 0;
        const res = [];
        items.forEach(function (it) {
            const w = it.b.x1 - it.b.x0, h = it.b.y1 - it.b.y0;
            if (x > 0 && x + w > anchoMax) { x = 0; y += altoFila + sep; altoFila = 0; }
            res.push(PN.trasladar(it.s, x - it.b.x0, y - it.b.y0));
            x += w + sep;
            altoFila = Math.max(altoFila, h);
        });
        return otros.concat(res);
    };

    // ------------------------------
    // Resumen de piezas y consumo de tela
    // ------------------------------
    PN.resumenPiezas = function (shapes, anchoTela) {
        const piezas = [];
        shapes.forEach(function (s) {
            if (s.t !== "path" || !s.closed || !s.pieza) return;
            const cont = PN.contornoConMargen(s) || aplanar(s).pts;
            const b = PN.cajaDeShape(s, { sa: true });
            let w = b.x1 - b.x0, h = b.y1 - b.y0;
            let area = PN.area(cont);
            const doblez = (s.fold || []).length > 0;
            if (doblez) {
                // El doblez duplica la pieza en la dirección perpendicular al lado plegado.
                const f = aplanar(s);
                const e = s.fold[0];
                let a0 = null, a1 = null;
                for (let i = 0; i < f.pts.length; i++) if (f.edge[i] === e) { a0 = f.pts[i]; a1 = f.pts[(i + 1) % f.pts.length]; break; }
                if (a0 && Math.abs(a1.y - a0.y) >= Math.abs(a1.x - a0.x)) w *= 2; else h *= 2;
                area *= 2;
            }
            piezas.push({
                id: s.id, nombre: s.name || "Pieza", cant: Math.max(1, s.qty || 1), doblez: doblez,
                w: w, h: h, area: area, sa: s.sa == null ? 1 : s.sa
            });
        });

        const W = anchoTela || 140;
        let areaTot = 0;
        piezas.forEach(function (p) { areaTot += p.area * p.cant; });
        const consumoArea = areaTot / W;

        // Estimación por filas con cajas rectangulares (cota superior)
        const cajas = [];
        let noEntra = [];
        piezas.forEach(function (p) {
            for (let i = 0; i < p.cant; i++) {
                let w = p.w, h = p.h;
                if (w > W && h <= W) { const t = w; w = h; h = t; }
                if (w > W) { if (noEntra.indexOf(p.nombre) < 0) noEntra.push(p.nombre); }
                cajas.push({ w: w, h: h });
            }
        });
        cajas.sort(function (a, b) { return b.h - a.h; });
        let x = 0, y = 0, fila = 0;
        cajas.forEach(function (c) {
            if (x > 0 && x + c.w > W) { x = 0; y += fila; fila = 0; }
            x += c.w + 1; fila = Math.max(fila, c.h + 1);
        });
        const consumoFilas = y + fila;

        return {
            piezas: piezas, areaTotal: areaTot, anchoTela: W,
            consumoMin: consumoArea * 1.12, consumoMax: Math.max(consumoFilas, consumoArea * 1.12),
            noEntra: noEntra
        };
    };

    // ------------------------------
    // Medidas con nombre (se ven con el botón "Medidas" del editor)
    // ------------------------------
    // Cada extremo de una medida es un vértice {i} o un punto expresado respecto de dos vértices {r:[i,j],u,w}.
    // Así la medida acompaña al molde cuando se mueve, se rota, se escala o se deforma.
    PN.refPunto = function (pts, i, j, X, Y) {
        const a = pts[i], b = pts[j];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = (dx * dx + dy * dy) || 1;
        const vx = X - a.x, vy = Y - a.y;
        return { r: [i, j], u: (vx * dx + vy * dy) / L2, w: (-vx * dy + vy * dx) / L2 };
    };
    PN.extremoDim = function (s, e) {
        if (!e || !s.pts) return null;
        if (e.i != null) { const p = s.pts[e.i]; return p ? { x: p.x, y: p.y } : null; }
        if (e.r) {
            const a = s.pts[e.r[0]], b = s.pts[e.r[1]];
            if (!a || !b) return null;
            const dx = b.x - a.x, dy = b.y - a.y;
            return { x: a.x + e.u * dx - e.w * dy, y: a.y + e.u * dy + e.w * dx };
        }
        return null;
    };
    function ref(pts, i, j) { return function (x, y) { return PN.refPunto(pts, i, j, x, y); }; }
    function dm(t, a, b, o) {
        o = o || {};
        return { t: t, a: a, b: b, fuera: !!o.fuera, off: o.off || 0, nota: o.nota || "", pos: o.pos == null ? 0.5 : o.pos, siempre: !!o.siempre, dentro: !!o.dentro };
    }
    function cmTxt(n) { return String(Math.round(n * 10) / 10).replace(".", ","); }
    function remapDims(s, f) {
        if (!s.dims || !s.dims.length) return;
        s.dims = s.dims.filter(function (d) {
            let ok = true;
            [d.a, d.b].forEach(function (e) {
                if (e.i != null) { const v = f(e.i); if (v < 0) ok = false; else e.i = v; }
                else if (e.r) { const v0 = f(e.r[0]), v1 = f(e.r[1]); if (v0 < 0 || v1 < 0) ok = false; else e.r = [v0, v1]; }
            });
            return ok;
        });
    }

    // ------------------------------
    // Generadores de patrones
    // ------------------------------
    function pieza(nombre, pts, o) {
        o = o || {};
        return {
            id: uid(), t: "path", pts: pts, closed: true, pieza: true,
            name: nombre, qty: o.qty || 1, sa: o.sa == null ? 1 : o.sa, saE: o.saE || {},
            fold: o.fold || [], darts: o.darts || [], notches: o.notches || [],
            grain: o.grain || null, lineas: o.lineas || [], marcas: o.marcas || [], lab: null, dims: o.dims || []
        };
    }

    function rectangulo(nombre, w, h, o) {
        o = o || {};
        const r = clamp(o.radio || 0, 0, Math.min(w, h) / 2 - 0.01);
        let pts;
        if (r > 0.05) {
            pts = [];
            const esq = [
                [r, r, Math.PI, 1.5 * Math.PI], [w - r, r, 1.5 * Math.PI, 2 * Math.PI],
                [w - r, h - r, 0, 0.5 * Math.PI], [r, h - r, 0.5 * Math.PI, Math.PI]
            ];
            esq.forEach(function (c) {
                for (let k = 0; k <= 4; k++) {
                    const a = c[2] + (c[3] - c[2]) * k / 4;
                    pts.push(P(c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), k > 0 && k < 4));
                }
            });
        } else pts = [P(0, 0), P(w, 0), P(w, h), P(0, h)];
        const rf = r > 0.05 ? ref(pts, 0, 5) : ref(pts, 0, 1);
        const dr = o.dimsRect || [{ t: "Ancho", x1: 0, y1: 0, x2: w, y2: 0, fuera: true }, { t: "Alto", x1: 0, y1: 0, x2: 0, y2: h, fuera: true }];
        return pieza(nombre, pts, Object.assign({
            grain: { a: { x: w / 2, y: h * 0.25 }, b: { x: w / 2, y: h * 0.75 } },
            dims: dr.map(function (d) { return dm(d.t, rf(d.x1, d.y1), rf(d.x2, d.y2), { fuera: d.fuera, nota: d.nota }); })
        }, o));
    }

    function pretina(nombre, largo, ancho, sa) {
        return rectangulo(nombre, largo, ancho * 2, {
            sa: sa, qty: 1,
            dimsRect: [
                { t: "Largo", x1: 0, y1: 0, x2: largo, y2: 0, fuera: true, nota: "cintura con holgura + 4 cm de cruce" },
                { t: "Ancho", x1: 0, y1: 0, x2: 0, y2: ancho * 2, fuera: true, nota: "terminada: " + cmTxt(ancho) + " cm" }
            ],
            grain: { a: { x: largo * 0.25, y: ancho }, b: { x: largo * 0.75, y: ancho } },
            lineas: [{ a: { x: 0, y: ancho }, b: { x: largo, y: ancho }, dash: true }]
        });
    }

    function cintura(m, o) { return m.cintura + (o.holgCintura || 0); }

    // Pinzas de cintura: n = 0 (sin pinzas), 1 o 2. "total" es lo que se absorbe entre todas.
    // x0..x1 es el tramo de cintura donde se reparten; wy(x) da la altura de la cintura en x.
    // "lado" ("a" o "b") dice de qué pata hacia afuera está el costado: si se quita la pinza, esos cm se sacan de ese extremo.
    // "fijo" = true respeta la cantidad de pinzas pedida aunque queden finitas (cuando los cm los eligió la usuaria).
    function listaPinzas(n, total, x0, x1, wy, dl, lado, fijo) {
        n = Math.round(n);
        if (!(n > 0) || !(total > 0.3)) return [];
        const w = total / n, res = [];
        for (let i = 0; i < n; i++) {
            const c = x0 + (x1 - x0) * (i + 1) / (n + 1);
            res.push({ a: { x: c - w / 2, y: wy(c - w / 2) }, b: { x: c + w / 2, y: wy(c + w / 2) }, t: { x: c, y: wy(c) + dl * (n > 1 ? 0.85 : 1) }, lado: lado || "b" });
        }
        return res;
    }
    // Cotas de pinza: todas las pinzas de la pieza son iguales, así que se acota la primera (ancho en la cintura y largo).
    function dimsPinza(darts, rf) {
        if (!darts || !darts.length) return [];
        const d = darts[0], n = darts.length;
        const cx = (d.a.x + d.b.x) / 2, cy = (d.a.y + d.b.y) / 2;
        return [
            dm("Ancho de pinza", rf(d.a.x, d.a.y), rf(d.b.x, d.b.y), { fuera: true, dentro: true, off: 16, siempre: true, nota: n > 1 ? n + " pinzas iguales" : "" }),
            dm("Largo de pinza", rf(cx, cy), rf(d.t.x, d.t.y), { fuera: true, off: 70, siempre: true, pos: 0.8 })
        ];
    }
    function nPinzas(v) { return v == null || isNaN(+v) ? 1 : +v; }

    // --- Falda recta ---
    function genFaldaRecta(m, o) {
        const L = o.largo;
        const ah = Math.min(m.altoCadera, L - 6);
        const Hq = (m.cadera + o.holgCadera) / 4, Wq = (m.cintura + o.holgCintura) / 4;
        const r = Math.max(0, Hq - Wq);
        const res = [];

        function lado(frente) {
            const nP = nPinzas(frente ? o.pinzasDel : o.pinzasTra);
            // Sin pinzas: lo que absorbía la pinza pasa al costado, así la cintura sigue midiendo lo mismo.
            let dart = nP > 0 ? Math.min(r * (frente ? 0.55 : 0.65), Math.max(0, r - 0.5)) : 0;
            const pw = +(frente ? o.pinzaDelCm : o.pinzaTraCm) || 0;      // cm de CADA pinza (0 = automático)
            if (nP > 0 && pw > 0) {
                // Respeta los cm que escribiste en CADA pinza (solo se limita para que las pinzas no se pisen entre sí).
                dart = Math.min(pw, 0.9 * Wq / (1 + 0.1 * nP)) * nP;
                if (dart <= 0.3) dart = 0;
            }
            const side = r - dart;
            const xs = Hq - side;
            const yS = frente ? -0.8 : -1.2;
            const dc = xs * 0.5;
            const yw = function (x) { return yS * x / xs; };
            const dw = dart, dl = frente ? 9 : 12;
            const pts = [P(0, 0), P(xs, yS), P(Hq, ah, true), P(Hq, L), P(0, L)];
            const saE = {}; saE[3] = o.dobladillo;
            const o2 = {
                sa: o.margen, saE: saE,
                darts: listaPinzas(nP, dw, 0, xs, yw, dl, "b", pw > 0),
                notches: [{ x: Hq, y: ah }],
                grain: { a: { x: Hq * 0.5, y: ah + 3 }, b: { x: Hq * 0.5, y: L - 8 } }
            };
            const rfF = ref(pts, 2, 3);
            o2.dims = [
                dm("Largo de falda", { i: 0 }, { i: 4 }, { fuera: true, off: 30 }),
                dm("Altura de cadera", { i: 0 }, rfF(0, ah), { fuera: true, off: 14, nota: "desde la cintura" }),
                dm("Cintura", { i: 0 }, { i: 1 }, { fuera: true, nota: "¼ de " + cmTxt(m.cintura + o.holgCintura) + (dw > 0.05 ? " + pinza" : "") }),
                dm("Cadera", { i: 2 }, rfF(0, ah), { nota: "¼ de " + cmTxt(m.cadera + o.holgCadera) }),
                dm("Bajo", { i: 4 }, { i: 3 }, { fuera: true })
            ];
            o2.dims = o2.dims.concat(dimsPinza(o2.darts, rfF));
            if (frente) { o2.fold = [4]; o2.qty = 1; }
            else {
                o2.qty = 2; saE[4] = Math.max(o.margen, 1.5);
                if (o.abertura > 0) {
                    o2.dims.push(dm("Abertura (alto)", rfF(3, L - o.abertura), rfF(3, L), { fuera: true, off: 14 }));
                    o2.lineas = [{ a: { x: 0, y: L - o.abertura }, b: { x: 3, y: L - o.abertura } }, { a: { x: 3, y: L - o.abertura }, b: { x: 3, y: L } }];
                }
            }
            return pieza(frente ? "Falda Del." : "Falda Esp.", pts, o2);
        }
        res.push(lado(true), lado(false));
        if (o.pretinaAncho > 0) res.push(pretina("Pretina", cintura(m, o) + 4, o.pretinaAncho, o.margen));
        return res;
    }

    // --- Falda circular / evasé ---
    function genFaldaCircular(m, o) {
        const f = o.fraccion;
        const thetaTot = f * 2 * Math.PI;
        const r = (m.cintura + o.holgCintura) / thetaTot;
        const R = r + o.largo;
        const n = Math.max(1, Math.round(o.piezas));
        const th = thetaTot / n;
        const pasos = Math.max(6, Math.ceil(th / (Math.PI / 14)));
        const res = [];
        for (let k = 0; k < n; k++) {
            const pts = [];
            const a0 = Math.PI / 2 + th / 2, a1 = Math.PI / 2 - th / 2;
            for (let i = 0; i <= pasos; i++) {
                const a = a0 + (a1 - a0) * i / pasos;
                pts.push(P(r * Math.cos(a), r * Math.sin(a), i > 0 && i < pasos));
            }
            for (let i = 0; i <= pasos; i++) {
                const a = a1 + (a0 - a1) * i / pasos;
                pts.push(P(R * Math.cos(a), R * Math.sin(a), i > 0 && i < pasos));
            }
            // Lados: 0..pasos-1 cintura · pasos lado derecho · pasos+1..2*pasos dobladillo · 2*pasos+1 lado izquierdo
            const saE = {};
            for (let i = pasos + 1; i <= 2 * pasos; i++) saE[i] = o.dobladillo;
            saE[pasos] = Math.max(o.margen, 1.5);
            saE[2 * pasos + 1] = Math.max(o.margen, 1.5);
            const nombre = n === 1 ? "Falda circular" : "Falda circular · gajo " + (k + 1);
            const rfC = ref(pts, 0, Math.max(1, Math.floor(pasos / 2)));
            res.push(pieza(nombre, pts, {
                sa: o.margen, saE: saE, qty: 1,
                dims: [
                    dm("Largo de falda", { i: pasos }, { i: pasos + 1 }, { fuera: true }),
                    dm("Radio de cintura", rfC(0, 0), rfC(0, r), { nota: "cintura " + cmTxt(m.cintura + o.holgCintura) })
                ],
                notches: [{ x: 0, y: r }, { x: 0, y: R }],
                grain: { a: { x: 0, y: r + o.largo * 0.2 }, b: { x: 0, y: r + o.largo * 0.8 } }
            }));
        }
        if (o.pretinaAncho > 0) res.push(pretina("Pretina", cintura(m, o) + 4, o.pretinaAncho, o.margen));
        return res;
    }

    // --- Remera / blusa base (con mangas opcionales) ---
    function escote(tipo, nw, dN) {
        const pts = [];
        if (tipo === "v" && dN > 0) {
            pts.push(P(0, dN), P(nw, 0));
        } else {
            const nn = 7;
            for (let k = 0; k < nn; k++) {
                const a = (k / (nn - 1)) * Math.PI / 2;
                pts.push(P(nw * Math.sin(a), dN * Math.cos(a), k > 0 && k < nn - 1));
            }
        }
        return pts;
    }

    // Sisa: curva Bézier de la punta del hombro (H) a la axila (D). Sale casi vertical hacia adentro y llega
    // horizontal a la axila (así forma la "U" y se une bien con la costura lateral). Se muestrea en NA tramos.
    const NA = 8;
    PN.NA_SISA = NA;
    function curvaSisa(Sx, yH, xD, yD, aOff, kY, xm) {
        const x0 = Sx, y0 = yH, x1 = Sx - aOff, y1 = yH + kY, x3 = xD, y3 = yD;
        let xb = (xm - 0.125 * x0 - 0.375 * x1 - 0.125 * x3) / 0.375;
        xb = clamp(xb, xD - 10, xD - 2.5);
        const out = [];
        for (let k = 1; k < NA; k++) {
            const t = k / NA, u = 1 - t;
            const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
            out.push(P(a * x0 + b * x1 + c * xb + d * x3, a * y0 + b * y1 + c * y3 + d * y3, true));
        }
        return out;
    }
    function poliSisa(pz, nn) {
        const f = aplanar(pz, 12);
        const i0 = f.vi.indexOf(nn), i1 = f.vi.indexOf(nn + NA);
        return f.pts.slice(i0, i1 + 1);
    }
    function puntoEnPoli(pts, fr) {
        let L = 0;
        for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
        const obj = fr * L;
        let acc = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const l = dist(pts[i], pts[i + 1]);
            if (acc + l >= obj) { const t = l ? (obj - acc) / l : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
            acc += l;
        }
        return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    }
    // Dónde van los piquetes de la sisa (fracción del largo desde el hombro): 1 en el delantero, 2 en la espalda
    PN.PIQ_SISA_DEL = [0.65];
    PN.PIQ_SISA_ESP = [0.55, 0.68];

    function genRemera(m, o) {
        const B = m.busto + o.holgBusto, B4 = B / 4;
        const AD = m.busto / 6 + 7.5;               // profundidad de sisa desde la línea del hombro (cuello)
        const tipo = o.escote;
        const nw = tipo === "bote" ? m.cuello / 5 + 4.5 : m.cuello / 5 + 1.5;
        const dF = tipo === "v" ? nw * 1.9 : (tipo === "bote" ? 4.5 : nw * 0.95);
        const dB = tipo === "bote" ? 2 : 2.5;
        const largoH = m.largoHombro > 0 ? m.largoHombro : m.busto * 0.14;      // largo del hombro (cuello → punta)
        const Sx = nw + Math.max(4, Math.sqrt(Math.max(largoH * largoH - 4.7 * 4.7, 0)));
        const anchoEsp = m.anchoHombros > 0 ? m.anchoHombros : m.busto * 0.415;  // ancho de espalda (sobaco a sobaco)
        const drop = 4.7;
        const Lg = o.largo;
        const hold = o.entallado;
        const Wq = (m.cintura + o.holgCintura) / 4, Hq = (m.cadera + o.holgCadera) / 4;
        const yCint = Math.min(m.talleEspalda, Lg - 4);
        const out = [];

        // Sisa (igual en delantero y espalda). El ancho de espalda ubica la curva, pero el LARGO de la sisa (y por
        // lo tanto el tamaño de la manga) no depende de él: se compensa para que mida siempre lo mismo.
        const kYs = 0.34 * (AD - drop);
        const largoSisaCon = function (aOff, xmm) {
            const pp = [P(Sx, drop)].concat(curvaSisa(Sx, drop, B4, AD, aOff, kYs, xmm), [P(B4, AD)]);
            return PN.largoPoli(aplanar({ pts: pp, closed: false }, 12).pts, false);
        };
        const xmSisa = clamp(anchoEsp / 2 + 1.0, Sx - 3.0, Sx - 0.5);                       // el ancho de espalda ubica la curva
        const Lref = largoSisaCon(1.6, Sx - 1.5);                                         // largo de sisa de referencia
        const baseInt = curvaSisa(Sx, drop, B4, AD, 1.6, kYs, xmSisa);
        const cdx = B4 - Sx, cdy = AD - drop, cdl = Math.hypot(cdx, cdy), cux = cdx / cdl, cuy = cdy / cdl, cnx = -cuy, cny = cux;
        // Se "abre" o "cierra" la curva respecto de su cuerda (factor lam) hasta que mida lo mismo que la de referencia.
        const sisaConLam = function (lam) {
            return baseInt.map(function (p) {
                const dx = p.x - Sx, dy = p.y - drop, aa = dx * cux + dy * cuy, cc = dx * cnx + dy * cny;
                return P(Sx + aa * cux + lam * cc * cnx, drop + aa * cuy + lam * cc * cny, true);
            });
        };
        let lamS = 1;
        {
            let lo = 0.1, hi = 4;
            for (let it = 0; it < 50; it++) {
                lamS = (lo + hi) / 2;
                const pp = [P(Sx, drop)].concat(sisaConLam(lamS), [P(B4, AD)]);
                if (PN.largoPoli(aplanar({ pts: pp, closed: false }, 12).pts, false) < Lref) lo = lamS; else hi = lamS;
            }
        }
        const sisaFija = sisaConLam(lamS);

        function torso(frente) {
            const dN = frente ? dF : dB;
            const pts = escote(tipo, nw, dN);
            const nn = pts.length;                                // último = punto cuello-hombro
            pts.push(P(Sx, drop));                                // nn: punta del hombro (esquina)
                        sisaFija.forEach(function (p) { pts.push(P(p.x, p.y, true)); });      // la sisa es IGUAL en el delantero y en la espalda
            pts.push(P(B4, AD));                                  // nn+NA: axila (esquina)
            const iU = pts.length - 1;
            let xh = B4;
            if (hold) {
                const t = clamp((Lg - m.talleEspalda) / Math.max(1, m.altoCadera), 0, 1);
                xh = Math.max(Wq + 0.5, Wq + (Hq - Wq) * t);
            }
            // Pinza de busto (solo delantero): abre en el costado, bajo la axila, y apunta al busto (termina antes de llegarle).
            // El costado de abajo baja lo que mide la pinza: al coserla el bajo queda parejo y el costado igual al de la espalda.
            const wB = (frente && +o.pinzaBusto > 0) ? (+o.pinzaBustoCm > 0 ? +o.pinzaBustoCm : clamp(Math.round((m.busto - 76) / 5 * 2) / 2, 1.5, 6)) : 0;
            const darts = [];
            if (wB > 0) {
                const yD = AD + 4;
                const xs = hold ? B4 + (Wq - B4) * (yD - AD) / Math.max(1, yCint - AD) : B4;
                const xA = Math.max(8, m.busto / 9 + 2.5);
                pts.push(P(xs, yD));
                pts.push(P(xs, yD + wB));
                darts.push({ a: { x: xs, y: yD }, b: { x: xs, y: yD + wB }, t: { x: xA, y: yD - 0.5 }, lado: "b" });
            }
            if (hold) pts.push(P(Wq, yCint + wB, true));
            pts.push(P(xh, Lg + wB));
            pts.push(P(0, Lg));
            const n = pts.length;
            const saE = {};
            saE[n - 2] = o.dobladillo;                            // dobladillo (lado hem)
            const pz = pieza(frente ? "Remera Del." : "Remera Esp.", pts, {
                sa: o.margen, saE: saE, fold: [n - 1], qty: 1, darts: darts,
                grain: { a: { x: B4 * 0.45, y: AD + 3 }, b: { x: B4 * 0.45, y: Lg - 4 } }
            });
            const arm = poliSisa(pz, nn);
            pz.notches = (frente ? PN.PIQ_SISA_DEL : PN.PIQ_SISA_ESP).map(function (f) { return puntoEnPoli(arm, f); });
            const rfT = ref(pts, n - 1, n - 2);
            pz.dims = [
                dm("Largo total", rfT(0, 0), { i: n - 1 }, { fuera: true, off: 30 }),
                dm("Busto", rfT(0, AD), { i: iU }, { nota: "¼ de " + cmTxt(B) }),
                dm("Profundidad de sisa", rfT(B4, 0), { i: iU }, { fuera: true, nota: "busto ÷ 6 + 7,5" }),
                dm("Hombro", { i: nn - 1 }, { i: nn }, { fuera: true, nota: "hombro " + cmTxt(largoH) }),
                dm("Ancho de escote", rfT(0, 0), { i: nn - 1 }, { fuera: true, nota: "cuello " + cmTxt(m.cuello) }),
                dm("Profundidad de escote", rfT(0, 0), { i: 0 }, { fuera: true })
            ];
            if (hold) {
                pz.dims.push(dm("Talle de espalda", { i: 0 }, rfT(0, yCint), { fuera: true, off: 16, nota: "nuca a cintura" }));
                pz.dims.push(dm("Cintura", rfT(0, yCint + wB), { i: iU + 1 + (wB > 0 ? 2 : 0) }, { nota: "¼ de " + cmTxt(m.cintura + o.holgCintura) }));
            }
            if (!frente) {
                const yM = pts[nn + NA / 2].y;
                pz.dims.push(dm("Ancho de espalda", rfT(0, yM), rfT(anchoEsp / 2, yM), { nota: "ancho de espalda " + cmTxt(anchoEsp) + " ÷ 2" }));
            }
            if (wB > 0) pz.dims = pz.dims.concat(dimsPinza(pz.darts, rfT));
            pz.dims.push(dm("Bajo", { i: n - 1 }, { i: n - 2 }, { fuera: true, nota: hold ? "entre cintura y cadera" : "igual al busto" }));
            return { pz: pz, nn: nn, arm: arm };
        }

        const fr = torso(true), es = torso(false);
        out.push(fr.pz, es.pz);

        // Mangas: se sacan de la sisa, como en el patronaje a mano (la sisa del delantero es igual a la de la espalda):
        //  1) la mitad de arriba de la copa es la misma línea de la sisa;
        //  2) lo que resta de sisa se copia "al revés" (espejado sobre su cuerda);  3) se suaviza el empalme;
        //  4) el eje de la manga sigue la línea del hombro (el largo se mide desde la punta del hombro);
        //  5) el lado de la espalda es el espejo del delantero con una "pancita" de 1 cm hacia afuera (mismo largo).
        // Izquierda = delantero (Del.), derecha = espalda (Esp.).
        if (o.manga !== "ninguna") {
            const larga = o.manga === "larga", tres = o.manga === "tres";
            let Lm = o.largoManga > 0 ? o.largoManga : (larga ? m.largoManga : (tres ? m.largoManga * 0.75 : 22));
            const tipoCopa = "media";
            const NS = 12;                                                           // puntos por mitad de copa
            const A = fr.arm, S = A[0], U = A[A.length - 1], Nn = fr.pz.pts[fr.nn - 1];
            // Inclinación del eje: la del hombro; alta = más vertical, baja = más plana. Si el brazo no entra
            // (ancho de bíceps < brazo + holgura mínima) se baja el eje lo justo.
            const thS = Math.atan2(S.y - Nn.y, S.x - Nn.x);
            const vx = U.x - S.x, vy = U.y - S.y, vl = Math.hypot(vx, vy), psi = Math.atan2(vy, vx);
            const incl = (tipoCopa === "alta" ? 5 : (tipoCopa === "baja" ? -6 : 0)) * Math.PI / 180;
            const easeMin = tipoCopa === "alta" ? 2 : (tipoCopa === "baja" ? 4.5 : 3);
            const thMax = psi - Math.asin(Math.min(1, (m.contornoBrazo + easeMin) / (2 * vl)));
            const th = Math.min(thS + incl, thMax), cs = Math.cos(th), sn = Math.sin(th);
            const aSl = function (q) { const x = q.x - S.x, y = q.y - S.y; return { x: x * sn - y * cs, y: x * cs + y * sn }; };
            const raw = A.map(aSl);
            const acum = function (pl) { const c = [0]; for (let i = 1; i < pl.length; i++) c.push(c[i - 1] + dist(pl[i - 1], pl[i])); return c; };
            const ca = acum(raw), half = ca[ca.length - 1] / 2;
            const upper = [], lower = [];
            let M = null;
            for (let i = 0; i < raw.length; i++) {
                if (ca[i] < half) upper.push(raw[i]);
                else {
                    if (!M) { const j = i - 1, t = (half - ca[j]) / ((ca[i] - ca[j]) || 1); M = { x: raw[j].x + (raw[i].x - raw[j].x) * t, y: raw[j].y + (raw[i].y - raw[j].y) * t }; upper.push(M); lower.push(M); }
                    if (dist(raw[i], M) > 1e-6) lower.push(raw[i]);
                }
            }
            const Ue0 = raw[raw.length - 1];
            const ux = Ue0.x - M.x, uy = Ue0.y - M.y, ul = Math.hypot(ux, uy) || 1, unx = ux / ul, uny = uy / ul;
            const refl = function (q) { const dx = q.x - M.x, dy = q.y - M.y, pr = dx * unx + dy * uny; return { x: M.x + 2 * pr * unx - dx, y: M.y + 2 * pr * uny - dy }; };
            const cur = upper.concat(lower.slice(1).map(refl));
            const iMm = upper.length - 1, ven = Math.max(3, Math.round(cur.length * 0.4));
            for (let it = 0; it < 300; it++) {                                      // suavizar el empalme
                const cp = cur.map(function (p) { return { x: p.x, y: p.y }; });
                for (let i = Math.max(1, iMm - ven); i <= Math.min(cur.length - 2, iMm + ven); i++) {
                    const w = 0.5 * (1 - Math.abs(i - iMm) / (ven + 1));
                    cur[i] = { x: cp[i].x * (1 - w) + (cp[i - 1].x + cp[i + 1].x) / 2 * w, y: cp[i].y * (1 - w) + (cp[i - 1].y + cp[i + 1].y) / 2 * w };
                }
            }
            // al suavizar la curva se acorta un poco: se reescala para que mida lo mismo que la sisa
            const fAj = ca[ca.length - 1] / (acum(cur)[cur.length - 1] || 1);
            for (let i = 0; i < cur.length; i++) cur[i] = { x: cur[i].x * fAj, y: cur[i].y * fAj };
            const cc = acum(cur), Lc = cc[cc.length - 1];
            const en = function (s) {
                let j = 1; while (j < cc.length - 1 && cc[j] < s) j++;
                const t = (s - cc[j - 1]) / ((cc[j] - cc[j - 1]) || 1);
                return { x: cur[j - 1].x + (cur[j].x - cur[j - 1].x) * t, y: cur[j - 1].y + (cur[j].y - cur[j - 1].y) * t };
            };
            const hF = [];
            for (let k = 0; k <= NS; k++) hF.push(k === 0 ? { x: 0, y: 0 } : (k === NS ? { x: cur[cur.length - 1].x, y: cur[cur.length - 1].y } : en(Lc * k / NS)));
            // Ajuste fino: la copa muestreada (la que se dibuja) tiene que medir EXACTO lo mismo que la sisa en cada lado.
            const Larm = ca[ca.length - 1];
            for (let it = 0; it < 6; it++) {
                const lf = PN.largoPoli(aplanar({ pts: hF.map(function (q, k) { return P(q.x, q.y, k > 0 && k < NS); }), closed: false }, 12).pts, false);
                const f = Larm / (lf || 1);
                if (Math.abs(f - 1) < 1e-5) break;
                for (let k = 1; k <= NS; k++) hF[k] = { x: hF[k].x * f, y: hF[k].y * f };
            }
            // Espalda: es el delantero espejado pero con otra forma: lleva una "pancita" de 1 cm hacia afuera (más llena
            // hacia la axila). La pancita alarga un poco la curva, así que la base se achica lo justo para que la copa
            // siga midiendo EXACTO lo mismo que la sisa. Se hace sobre la curva densa (línea pareja, sin temblores).
            const PAN = 1;                                                           // pancita de la espalda (cm)
            const dens0 = aplanar({ pts: hF.map(function (q, k) { return P(q.x, q.y, k > 0 && k < NS); }), closed: false }, 12).pts.map(function (q) { return { x: -q.x, y: q.y }; });
            const cd = acum(dens0), Ld = cd[cd.length - 1] || 1, vt = 4;
            const nrm = dens0.map(function (q, i) {
                const a = dens0[Math.max(0, i - vt)], c = dens0[Math.min(dens0.length - 1, i + vt)];
                const tl = Math.hypot(c.x - a.x, c.y - a.y) || 1;
                return { x: (c.y - a.y) / tl, y: -(c.x - a.x) / tl };               // normal hacia afuera de la manga
            });
            const sn2 = function (u) { return u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 2) : 0; };
            const armarB = function (f) {
                const dB = dens0.map(function (q, i) {
                    const h = PAN * sn2((cd[i] / Ld - 0.3) / 0.7);
                    return { x: q.x * f + nrm[i].x * h, y: q.y * f + nrm[i].y * h };
                });
                for (let it = 0; it < 120; it++) {                                   // alisar (sin temblores)
                    for (let i = 1; i < dB.length - 1; i++) dB[i] = { x: dB[i].x * 0.5 + (dB[i - 1].x + dB[i + 1].x) * 0.25, y: dB[i].y * 0.5 + (dB[i - 1].y + dB[i + 1].y) * 0.25 };
                }
                const cb = acum(dB), Lb2 = cb[cb.length - 1];
                const enB = function (sl) {
                    let j = 1; while (j < cb.length - 1 && cb[j] < sl) j++;
                    const t = (sl - cb[j - 1]) / ((cb[j] - cb[j - 1]) || 1);
                    return { x: dB[j - 1].x + (dB[j].x - dB[j - 1].x) * t, y: dB[j - 1].y + (dB[j].y - dB[j - 1].y) * t };
                };
                const hb = [];
                for (let k = 0; k <= NS; k++) hb.push(k === 0 ? { x: 0, y: 0 } : (k === NS ? { x: dB[dB.length - 1].x, y: dB[dB.length - 1].y } : enB(Lb2 * k / NS)));
                return hb;
            };
            const largoB = function (hb) { return PN.largoPoli(aplanar({ pts: hb.map(function (q, k) { return P(q.x, q.y, k > 0 && k < NS); }), closed: false }, 12).pts, false); };
            let fLo = 0.9, fHi = 1.02, fB = 1;
            for (let it = 0; it < 40; it++) {
                fB = (fLo + fHi) / 2;
                if (largoB(armarB(fB)) < Larm) fLo = fB; else fHi = fB;
            }
            const hB = armarB(fB);
            const Ue = hF[NS], UeB = hB[NS], W = Math.abs(Ue.x) + Math.abs(UeB.x), Hc = Ue.y;
            Lm = Math.max(Lm, Hc + 3);
            const full = hF.slice().reverse().concat(hB.slice(1));
            const nC = full.length, mid = (nC - 1) / 2;
            const pts = full.map(function (p, i) { return P(p.x, p.y, i > 0 && i < nC - 1); });
            const hemW = larga ? Math.min(W - 2, m.contornoMuneca + 8) : (tres ? W - 6 : W - 2.5);
            pts.push(P(hemW / 2, Lm), P(-hemW / 2, Lm));
            const saE = {};
            saE[nC] = o.dobladillo;
            const rfM = ref(pts, nC + 1, nC);
            const polF = aplanar({ pts: hF.map(function (p, k) { return P(p.x, p.y, k > 0 && k < NS); }), closed: false }, 12).pts;
            const polB = aplanar({ pts: hB.map(function (p, k) { return P(p.x, p.y, k > 0 && k < NS); }), closed: false }, 12).pts;
            const piq = [{ x: 0, y: 0 }];
            PN.PIQ_SISA_DEL.forEach(function (f) { piq.push(puntoEnPoli(polF, f)); });
            PN.PIQ_SISA_ESP.forEach(function (f) { piq.push(puntoEnPoli(polB, f)); });
            const yRot = Hc * 0.55;
            const mz = pieza("Manga", pts, {
                sa: o.margen, saE: saE, qty: 2,
                dims: [
                    dm("Largo de manga", { i: mid }, rfM(0, Lm), { pos: 0.22 }),
                    dm("Altura de copa", { i: mid }, rfM(0, Hc), { fuera: true, off: 26, nota: "sale de tu sisa" }),
                    dm("Contorno de brazo", { i: 0 }, { i: nC - 1 }, { nota: "brazo " + cmTxt(m.contornoBrazo) + " + " + cmTxt(W - m.contornoBrazo) }),
                    dm("Puño / bajo", { i: nC + 1 }, { i: nC }, { fuera: true, nota: larga ? "muñeca " + cmTxt(m.contornoMuneca) + " + holgura" : "" })
                ],
                notches: piq,
                grain: { a: { x: 0, y: Hc + 3 }, b: { x: 0, y: Lm - 4 } },
                lineas: [{ a: { x: Ue.x, y: Ue.y }, b: { x: UeB.x, y: UeB.y }, dash: true }, { a: { x: 0, y: 0 }, b: { x: 0, y: Lm }, dash: true }]
            });
            mz.marcas = [{ p: { x: -W / 4, y: yRot }, t: "Del." }, { p: { x: W / 4, y: yRot }, t: "Esp." }];
            out.push(mz);
        }

        if (o.tiraCuello) {
            const largoEscote = (PN.largoLados(fr.pz, 0, fr.nn - 2) + PN.largoLados(es.pz, 0, es.nn - 2)) * 2;
            out.push(rectangulo("Tira de cuello", largoEscote * 0.85, 5, { sa: o.margen, qty: 1 }));
        }
        return out;
    }

    // --- Pantalón básico ---
    function genPantalon(m, o) {
        const H = m.cadera + o.holgCadera, Hq = H / 4, Wq = (m.cintura + o.holgCintura) / 4;
        const tiro = o.tiro, L = o.largo;
        // Ajustes de silueta: volumen de glúteos (-1 menor, 0 estándar, 1 mayor) y de abdomen (0 estándar, 1 moderado, 2 marcado)
        const glu = 0, abd = 0;
        const tiroT = (o.tiroTrasero > 0 ? o.tiroTrasero : tiro + 2.5) + glu * 1;   // tiro trasero (altura); más volumen = más altura atrás
        const exT = clamp(tiroT - tiro, 0, 6);                                 // cuánto sube la cintura atrás respecto del delantero
        const inclBase = (o.inclTra != null && o.inclTra !== "" && isFinite(+o.inclTra)) ? clamp(+o.inclTra, 0, 8) : 0;
        const inclT = clamp(inclBase + glu * 0.75, 0, 8);                      // inclinación del centro de espalda (costura trasera); 0 = recto
        const abdAncho = [0, 0.8, 1.6][abd], abdAlto = [0, 1, 2][abd];         // abdomen: ancho y altura extra en el centro delantero
        const ah = Math.min(m.altoCadera, tiro - 5);
        const r = Math.max(0, Hq - Wq);
        const res = [];
        let spFrente = null;     // dónde arranca la cintura en el costado del delantero (el trasero lo copia)

        function lado(frente) {
            const Wp = Hq + (frente ? -1 : 1);
            const WpTop = Wp + (frente ? abdAncho : 0);                   // x del centro en la cintura (el abdomen lo corre hacia afuera)
            const net = Wq + (frente ? -0.5 : 0.5);
            const nP = nPinzas(frente ? o.pinzasDel : o.pinzasTra);
            // Pinza "automática": lo que absorbería si hubiera pinzas. Si no hay pinzas, ese ancho se reparte entre costado y centro.
            const pw = +(frente ? o.pinzaDelCm : o.pinzaTraCm) || 0;      // cm de CADA pinza (0 = automático)
            // Punto alto del centro (delantero: con abdomen; trasero: con la inclinación). El borde de cintura se mide sobre esa línea.
            const topX = frente ? WpTop : Wp + inclT, topY = frente ? -abdAlto : -exT;
            const dyC = topY;
            const largoBorde = function (d) { return Math.sqrt(Math.max(0, Math.pow(net + d, 2) - dyC * dyC)); };   // dx horizontal para que el borde mida net + d
            let dartAuto;
            if (frente || spFrente == null) dartAuto = clamp(r * (frente ? 0.5 : 0.7), 0, Math.max(0, r - 0.5));
            else {
                // Trasero: el costado de cintura a cadera tiene que tener la misma forma que el delantero (solo sobresale ~1 cm).
                // La inclinación del centro trasero agrega ancho arriba y lo absorbe la pinza, no el costado.
                dartAuto = clamp(Math.sqrt(Math.pow(topX - (spFrente + 1), 2) + dyC * dyC) - net, 0, 14);
            }
            // Con pinzas automáticas el costado queda en su curva de diseño (el trasero sobresale ~1 cm del delantero).
            const topX0 = frente ? Wp : topX;                              // (el volumen de abdomen no mueve el costado)
            let dart = 0;
            if (nP > 0) {
                if (pw > 0) dart = Math.min(pw * nP, Math.max(0, Math.sqrt(Math.pow(topX - 0.3, 2) + dyC * dyC) - net));
                else dart = frente ? dartAuto : Math.min(dartAuto, nP * 7);
                if (dart <= 0.3) dart = 0;
            }
            // Lo que la pinza no absorbe lo absorbe el COSTADO (se mete más hacia adentro en la cintura).
            // Los centros (delantero y trasero) quedan RECTOS: no se inclinan salvo que vos lo pidas (inclinación trasera / abdomen).
            const sp = Math.max(0.3, topX0 - largoBorde(dart));
            const topXc = Math.min(topX, sp + largoBorde(dart));
            if (frente) spFrente = sp;
            const ext = frente ? H / 16 : (H / 9) * (1 + 0.12 * glu);   // glúteos: más o menos curva de entrepierna atrás
            const xc = (Wp + ext) / 2;
            const hw = (o.boca / 2 + (frente ? -1 : 1)) / 2;
            const yS = 0;                                                // cintura en el costado: igual en ambos, así los costados miden casi lo mismo
            const pts = [];
            pts.push(P(sp, yS));                                         // 0 cintura costado
            if (frente) pts.push(P(topXc, -abdAlto));                    // 1 cintura centro delantero (con abdomen: más alto y más ancho)
            else pts.push(P(topXc, -exT));                                 // 1 cintura centro trasero (más alto: tiro trasero)
            // (la cintura de la pieza mide cintura neta + pinzas aunque cambie la inclinación o el abdomen)
            pts.push(P(Wp, tiro - (frente ? 8 : 9)));                    // 2 inicio curva de tiro
            pts.push(P(Wp + ext * 0.2, tiro - 3.3, true));               // 3
            pts.push(P(Wp + ext * 0.58, tiro - 0.9, true));              // 4
            pts.push(P(Wp + ext, tiro));                                 // 5 punto de tiro
            pts.push(P(xc + hw, L));                                     // 6 bajo interior
            pts.push(P(xc - hw, L));                                     // 7 bajo exterior
            pts.push(P(0, ah));                                          // 8 cadera (el costado baja derecho desde acá)
            // Curva de cadera: del punto de cintura (0) a la cadera (8) es una curva suave que sale en diagonal de la cintura
            // y se vuelve vertical justo en la línea de cadera. Se guía con puntos intermedios (9, 10 y 11, de la cadera hacia la cintura).
            (function () {
                const b0 = { x: sp, y: 0 }, b1 = { x: sp * 0.45, y: ah * 0.35 }, b2 = { x: 0, y: ah * 0.55 }, b3 = { x: 0, y: ah };
                [0.78, 0.5, 0.2].forEach(function (t) {
                    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
                    pts.push(P(a * b0.x + b * b1.x + c * b2.x + d * b3.x, a * b0.y + b * b1.y + c * b2.y + d * b3.y, true));
                });
            })();
            // lados: 0 cintura, 1 centro, 2-4 curva de tiro, 5 entrepierna, 6 bajo, 7 costado inferior, 8-11 curva de cadera
            const saE = {}; saE[6] = o.dobladillo;
            const dc = sp + (Wp - sp) * 0.5;
            const wy = function (x) { return yS + (pts[1].y - yS) * (x - sp) / (pts[1].x - sp); };
            const dl = frente ? 8 : 11;
            const yRodilla = tiro + (L - tiro) * 0.5;
            const tt = (yRodilla - tiro) / (L - tiro);
            const inx = pts[5].x + (pts[6].x - pts[5].x) * tt;
            const outx = 0 + (pts[7].x - 0) * ((yRodilla - ah) / (L - ah));
            const rfP = ref(pts, 8, 7);
            const dartsL = listaPinzas(nP, dart, sp, pts[1].x, wy, dl, "a", pw > 0);
            return pieza(frente ? "Pantalón Del." : "Pantalón Esp.", pts, {
                sa: o.margen, saE: saE, qty: 2,
                dims: [
                    dm("Largo de pantalón (costado)", rfP(0, 0), rfP(0, L), { fuera: true, off: 30, nota: "largo " + cmTxt(L) }),
                    dm("Cintura", { i: 0 }, { i: 1 }, { fuera: true, nota: "¼ de " + cmTxt(m.cintura + o.holgCintura) + (dart > 0.05 ? " + pinza" : "") }),
                    dm("Altura de cadera", rfP(0, 0), rfP(0, ah), { fuera: true, off: 14, nota: "desde la cintura" }),
                    dm("Cadera", { i: 8 }, rfP(Wp, ah), { nota: "¼ de " + cmTxt(m.cadera + o.holgCadera) }),
                    dm(frente ? "Tiro delantero" : "Tiro trasero", rfP(Wp, topY), rfP(Wp, tiro), { nota: "cintura a entrepierna" }),
                    dm("Ancho de tiro", rfP(Wp, tiro), { i: 5 }, { fuera: true, off: 14, nota: "curva de entrepierna" }),
                    dm("Entrepierna (largo interior)", { i: 5 }, { i: 6 }, { fuera: true, off: 16, nota: "del tiro al bajo" }),
                    dm("Botamanga", { i: 7 }, { i: 6 }, { fuera: true, nota: "botamanga " + cmTxt(o.boca) + " total ÷ 2 " + (frente ? "− 1" : "+ 1") + " cm" })
                ].concat(dimsPinza(dartsL, rfP)),

                darts: dartsL,
                notches: [{ x: 0, y: ah }, { x: inx, y: yRodilla }, { x: outx, y: yRodilla }],
                grain: { a: { x: xc, y: tiro + 4 }, b: { x: xc, y: L - 8 } },
                lineas: [{ a: { x: 0, y: tiro }, b: { x: pts[5].x, y: tiro }, dash: true }]
            });
        }
        res.push(lado(true), lado(false));
        if (o.pretinaAncho > 0) res.push(pretina("Pretina", cintura(m, o) + 4, o.pretinaAncho, o.margen));
        return res;
    }

    function genRectangulo(m, o) {
        return [rectangulo(o.nombre || "Pieza", o.ancho, o.alto, { sa: o.margen, qty: o.cant, radio: o.radio })];
    }

    const OP_SI_NO = null;
    PN.GENERADORES = [
        {
            id: "falda_recta", icono: "👗", nombre: "Falda recta",
            desc: "Delantero al doblez + trasero con pinzas, pretina y abertura opcional.",
            gen: genFaldaRecta,
            params: [
                { k: "largo", t: "Largo de falda", tipo: "num", def: function (m) { return m.largoFalda; }, min: 15, max: 140 },
                { k: "holgCintura", t: "Holgura en cintura", tipo: "num", def: 2, min: 0, max: 10 },
                { k: "holgCadera", t: "Holgura en cadera", tipo: "num", def: 4, min: 0, max: 20 },
                { k: "pinzasDel", t: "Pinzas delanteras", tipo: "sel", def: 1, op: [[0, "Sin pinzas"], [1, "1 pinza"], [2, "2 pinzas"]] },
                { k: "pinzasTra", t: "Pinzas traseras", tipo: "sel", def: 1, op: [[0, "Sin pinzas"], [1, "1 pinza"], [2, "2 pinzas"]] },
                { k: "pinzaDelCm", t: "Ancho de cada pinza delantera (cm, 0 = automático)", tipo: "num", def: 0, min: 0, max: 8, solo: function (v) { return +v.pinzasDel > 0; } },
                { k: "pinzaTraCm", t: "Ancho de cada pinza trasera (cm, 0 = automático)", tipo: "num", def: 0, min: 0, max: 8, solo: function (v) { return +v.pinzasTra > 0; } },
                { k: "abertura", t: "Abertura trasera (0 = sin)", tipo: "num", def: 15, min: 0, max: 60 },
                { k: "pretinaAncho", t: "Ancho de pretina terminada (0 = sin)", tipo: "num", def: 0, min: 0, max: 10 },
                { k: "margen", t: "Margen de costura", tipo: "num", def: 1, min: 0, max: 5 },
                { k: "dobladillo", t: "Dobladillo", tipo: "num", def: 3, min: 0, max: 10 }
            ]
        },
        {
            id: "falda_circular", icono: "💃", nombre: "Falda circular / vuelo",
            desc: "Falda de vuelo: círculo completo, media, 1/4, 3/4… calculada con tu cintura.",
            gen: genFaldaCircular,
            params: [
                { k: "largo", t: "Largo de falda", tipo: "num", def: function (m) { return Math.min(m.largoFalda, 70); }, min: 10, max: 120 },
                { k: "fraccion", t: "Cuánto círculo", tipo: "sel", def: 0.5, op: [[0.25, "1/4 de círculo"], [0.5, "Media circular"], [0.75, "3/4 de círculo"], [1, "Círculo completo"]] },
                { k: "piezas", t: "En cuántos gajos cortarla", tipo: "sel", def: 2, op: [[1, "1 pieza"], [2, "2 piezas"], [4, "4 piezas"]] },
                { k: "holgCintura", t: "Holgura en cintura", tipo: "num", def: 1, min: 0, max: 8 },
                { k: "pretinaAncho", t: "Ancho de pretina terminada (0 = sin)", tipo: "num", def: 3, min: 0, max: 10 },
                { k: "margen", t: "Margen de costura", tipo: "num", def: 1, min: 0, max: 5 },
                { k: "dobladillo", t: "Dobladillo", tipo: "num", def: 1, min: 0, max: 6 }
            ]
        },
        {
            id: "remera", icono: "👚", nombre: "Remera / blusa base",
            desc: "Delantero y espalda al doblez, con mangas calculadas para calzar en la sisa.",
            gen: genRemera,
            params: [
                { k: "largo", t: "Largo total de la prenda", tipo: "num", def: function (m) { return m.talleEspalda + 24; }, min: 25, max: 120 },
                { k: "escote", t: "Escote", tipo: "sel", def: "redondo", op: [["redondo", "Redondo"], ["v", "En V"], ["bote", "Bote"]] },
                { k: "holgBusto", t: "Holgura en busto", tipo: "num", def: 8, min: 0, max: 40, ayuda: "4–6 ajustada · 8–12 holgada · 16+ oversize." },
                { k: "entallado", t: "Entallar en cintura", tipo: "bool", def: false },
                { k: "holgCintura", t: "Holgura en cintura (si entalla)", tipo: "num", def: 6, min: 0, max: 30, solo: function (v) { return !!v.entallado; } },
                { k: "holgCadera", t: "Holgura en cadera (si entalla)", tipo: "num", def: 6, min: 0, max: 30, solo: function (v) { return !!v.entallado; } },
                { k: "pinzaBusto", t: "Pinza de busto (delantero)", tipo: "sel", def: 0, op: [[0, "Sin pinza"], [1, "Con pinza en el costado"]] },
                { k: "pinzaBustoCm", t: "Ancho de la pinza de busto (cm, 0 = automático)", tipo: "num", def: 0, min: 0, max: 8, solo: function (v) { return +v.pinzaBusto > 0; } },
                { k: "manga", t: "Manga", tipo: "sel", def: "corta", op: [["ninguna", "Sin manga"], ["corta", "Corta"], ["tres", "3/4"], ["larga", "Larga"]] },
                { k: "largoManga", t: "Largo de manga", tipo: "num", def: 22, min: 8, max: 80, dep: "manga", solo: function (v) { return v.manga !== "ninguna"; },
                  auto: function (m, v) { return v.manga === "larga" ? Math.round(m.largoManga * 2) / 2 : (v.manga === "tres" ? Math.round(m.largoManga * 0.75 * 2) / 2 : 22); } },
                { k: "tiraCuello", t: "Incluir tira de cuello", tipo: "bool", def: true },
                { k: "margen", t: "Margen de costura", tipo: "num", def: 1, min: 0, max: 5 },
                { k: "dobladillo", t: "Dobladillo", tipo: "num", def: 2.5, min: 0, max: 8 }
            ]
        },
        {
            id: "pantalon", icono: "👖", nombre: "Pantalón básico",
            desc: "Delantero y trasero con tiro y pretina, calculado con cintura, cadera y tiro. Arranca sin pinzas: se las agregás si querés.",
            gen: genPantalon,
            params: [
                { k: "largo", t: "Largo (costado)", tipo: "num", def: function (m) { return m.largoPantalon; }, min: 30, max: 130 },
                { k: "tiro", t: "Tiro delantero (altura)", tipo: "num", def: function (m) { return m.tiro; }, min: 18, max: 40 },
                { k: "tiroTrasero", t: "Tiro trasero (altura)", tipo: "num", def: function (m) { return m.tiroTrasero > 0 ? m.tiroTrasero : m.tiro + 2.5; }, min: 18, max: 46 },
                { k: "inclTra", t: "Inclinación del centro trasero (cm, 0 = recto)", tipo: "num", def: 0, min: 0, max: 8, ayuda: "Cuánto se abre hacia atrás la costura central trasera en la cintura. Viene en 0 (recta); si querés más calce atrás, probá entre 2 y 4 cm, que es lo habitual en pantalón ajustado." },
                { k: "boca", t: "Botamanga (contorno del bajo de UNA pierna)", tipo: "num", def: function (m) { return m.bocaPantalon; }, min: 20, max: 90, ayuda: "La botamanga es la parte más baja: donde termina el pantalón. Ej.: 36–40 pitillo · 44–48 recto · 52+ ancho." },
                { k: "holgCintura", t: "Holgura en cintura", tipo: "num", def: 2, min: 0, max: 10 },
                { k: "holgCadera", t: "Holgura en cadera", tipo: "num", def: 6, min: 0, max: 24 },
                { k: "pinzasDel", t: "Pinzas delanteras", tipo: "sel", def: 0, op: [[0, "Sin pinzas"], [1, "1 pinza"], [2, "2 pinzas"]] },
                { k: "pinzasTra", t: "Pinzas traseras", tipo: "sel", def: 0, op: [[0, "Sin pinzas"], [1, "1 pinza"], [2, "2 pinzas"]] },
                { k: "pinzaDelCm", t: "Ancho de cada pinza delantera (cm, 0 = automático)", tipo: "num", def: 0, min: 0, max: 8, solo: function (v) { return +v.pinzasDel > 0; } },
                { k: "pinzaTraCm", t: "Ancho de cada pinza trasera (cm, 0 = automático)", tipo: "num", def: 0, min: 0, max: 8, solo: function (v) { return +v.pinzasTra > 0; } },
                { k: "pretinaAncho", t: "Ancho de pretina terminada (0 = sin)", tipo: "num", def: 3.5, min: 0, max: 10 },
                { k: "margen", t: "Margen de costura", tipo: "num", def: 1.2, min: 0, max: 5 },
                { k: "dobladillo", t: "Dobladillo", tipo: "num", def: 4, min: 0, max: 10 }
            ]
        },
        {
            id: "rectangulo", icono: "▭", nombre: "Pieza rectangular",
            desc: "Bolsillos, tiras, volantes, cinturones, carteras: cualquier rectángulo con medidas exactas.",
            gen: genRectangulo,
            params: [
                { k: "nombre", t: "Nombre de la pieza", tipo: "txt", def: "Bolsillo" },
                { k: "ancho", t: "Ancho", tipo: "num", def: 15, min: 1, max: 300 },
                { k: "alto", t: "Alto", tipo: "num", def: 18, min: 1, max: 300 },
                { k: "radio", t: "Esquinas redondeadas (radio)", tipo: "num", def: 0, min: 0, max: 20 },
                { k: "cant", t: "Cantidad a cortar", tipo: "num", def: 2, min: 1, max: 99 },
                { k: "margen", t: "Margen de costura", tipo: "num", def: 1, min: 0, max: 5 }
            ]
        }
    ];

    PN.paramsPorDefecto = function (gen, m) {
        m = PN.completarMedidas(m);
        const o = {};
        gen.params.forEach(function (p) { o[p.k] = typeof p.def === "function" ? p.def(m) : p.def; });
        return o;
    };

    // Genera las piezas y las ubica en fila a partir de (x0, y0).
    PN.generar = function (idGen, medidas, params, x0, y0) {
        const gen = PN.GENERADORES.filter(function (g) { return g.id === idGen; })[0];
        if (!gen) return [];
        medidas = PN.completarMedidas(medidas);
        const piezas = gen.gen(medidas, params);
        let x = x0 || 0;
        const y = y0 || 0;
        return piezas.map(function (p) {
            const b = PN.cajaDeShape(p, { sa: true });
            const q = PN.trasladar(p, x - b.x0, y - b.y0);
            x += (b.x1 - b.x0) + 6;
            return q;
        });
    };

    // ------------------------------
    // Capas (como en Ibis Paint): cada forma pertenece a una capa; las capas se dibujan de
    // abajo hacia arriba en el orden del arreglo p.capas.
    // ------------------------------
    PN.nuevaCapa = function (nombre) {
        return { id: uid(), nombre: nombre || "Capa", visible: true, bloqueada: false, opacidad: 100 };
    };

    PN.asegurarCapas = function (p) {
        if (!Array.isArray(p.shapes)) p.shapes = [];
        if (!Array.isArray(p.capas) || !p.capas.length) p.capas = [PN.nuevaCapa("Capa 1")];
        const ids = {};
        p.capas.forEach(function (c, i) {
            if (!c.id) c.id = uid();
            if (!c.nombre) c.nombre = "Capa " + (i + 1);
            if (c.visible === undefined) c.visible = true;
            if (c.bloqueada === undefined) c.bloqueada = false;
            if (typeof c.opacidad !== "number" || !isFinite(c.opacidad)) c.opacidad = 100;
            ids[c.id] = true;
        });
        if (!ids[p.capaActiva]) p.capaActiva = p.capas[p.capas.length - 1].id;
        p.shapes.forEach(function (s) { if (!s.capa || !ids[s.capa]) s.capa = p.capas[0].id; });
        return p;
    };

    // Formas en orden de dibujo (capa de abajo primero; dentro de cada capa, el orden en que se crearon).
    PN.formasOrdenadas = function (p, soloVisibles) {
        PN.asegurarCapas(p);
        const idx = {}, vis = {};
        p.capas.forEach(function (c, i) { idx[c.id] = i; vis[c.id] = c.visible !== false; });
        return p.shapes.map(function (s, i) { return { s: s, i: i }; })
            .filter(function (o) { return !soloVisibles || vis[o.s.capa]; })
            .sort(function (a, b) { return (idx[a.s.capa] - idx[b.s.capa]) || (a.i - b.i); })
            .map(function (o) { return o.s; });
    };

    PN.nuevoProyecto = function (nombre) {
        return PN.asegurarCapas({
            id: uid(), nombre: nombre || "Patrón sin título", creado: Date.now(), mod: Date.now(),
            medidas: PN.medidasPorDefecto(),
            perfil: { sexo: "mujer", talle: "M", modelo: "" },
            tela: { ancho: 140 }, notas: "", shapes: [],
            vista: { ox: 30, oy: 30, z: 8 }
        });
    };

    PN.nuevoPath = function (pts, cerrado) {
        return {
            id: uid(), t: "path", pts: pts, closed: !!cerrado, pieza: false,
            name: "", qty: 1, sa: 1, saE: {}, fold: [], darts: [], notches: [], grain: null, lineas: [], lab: null
        };
    };

    if (typeof module !== "undefined" && module.exports) module.exports = PN;
})(typeof window !== "undefined" ? window : globalThis);
