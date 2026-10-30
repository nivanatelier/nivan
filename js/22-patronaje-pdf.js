// ==============================
// PATRONAJE · PDF (sin librerías externas)
// ==============================
// Escribe el PDF a mano: vectores (líneas finas, no imágenes), tipografía Helvetica
// y hojas a ESCALA REAL 1:1 con marcas para pegarlas, además de la ficha técnica.

(function (root) {
    'use strict';

    const PN = root.PatNivan;
    const K = 72 / 2.54; // puntos por centímetro

    // ------------------------------
    // Texto: codificación y anchos (Helvetica)
    // ------------------------------
    const ANCHOS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
        667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
        278, 278, 278, 469, 556, 333,
        556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
        334, 260, 334, 584];

    const ESPECIALES = {
        "–": "\x96", "—": "\x97", "•": "\x95", "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94", "…": "\x85", "€": "\x80",
        "←": "<", "→": ">", "↑": "^", "↓": "v", "✂": "", "✓": "", "≈": "~", "∼": "~", "─": "-", "▢": ""
    };

    function winAnsi(str) {
        let o = "";
        str = String(str == null ? "" : str);
        for (let i = 0; i < str.length; i++) {
            const ch = str[i], c = str.charCodeAt(i);
            if (c >= 32 && c < 127) o += ch;
            else if (c >= 160 && c <= 255) o += ch;
            else if (ESPECIALES[ch] != null) o += ESPECIALES[ch];
            else if (c === 9 || c === 10) o += " ";
            else o += "?";
        }
        return o;
    }

    function esc(s) { return winAnsi(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }

    function anchoTexto(str, size, bold) {
        str = winAnsi(str);
        let w = 0;
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            if (c >= 32 && c < 127) w += ANCHOS[c - 32];
            else {
                const base = str[i].normalize("NFD")[0];
                const cc = base ? base.charCodeAt(0) : 0;
                w += (cc >= 32 && cc < 127) ? ANCHOS[cc - 32] : 556;
            }
        }
        return w * size / 1000 * (bold ? 1.07 : 1);
    }

    function recortar(str, size, bold, maxW) {
        if (anchoTexto(str, size, bold) <= maxW) return str;
        while (str.length > 1 && anchoTexto(str + "…", size, bold) > maxW) str = str.slice(0, -1);
        return str + "…";
    }

    function f(n) {
        const s = (Math.round(n * 100) / 100).toString();
        return s.indexOf("e") >= 0 ? "0" : s;
    }

    // ------------------------------
    // Escritor de PDF
    // ------------------------------
    function Pag(w, h) { this.w = w; this.h = h; this.o = []; }
    Pag.prototype.raw = function (s) { this.o.push(s); };
    Pag.prototype.q = function () { this.o.push("q"); };
    Pag.prototype.Q = function () { this.o.push("Q"); };
    Pag.prototype.trazo = function (r, g, b) { this.o.push(f(r) + " " + f(g) + " " + f(b) + " RG"); };
    Pag.prototype.relleno = function (r, g, b) { this.o.push(f(r) + " " + f(g) + " " + f(b) + " rg"); };
    Pag.prototype.grosor = function (w) { this.o.push(f(w) + " w"); };
    Pag.prototype.guiones = function (a, fase) {
        this.o.push(a && a.length ? "[" + a.map(f).join(" ") + "] " + f(fase || 0) + " d" : "[] 0 d");
    };
    Pag.prototype.linea = function (x1, y1, x2, y2) {
        this.o.push(f(x1) + " " + f(y1) + " m " + f(x2) + " " + f(y2) + " l S");
    };
    Pag.prototype.poli = function (pts, cerrar, modo) {
        if (!pts.length) return;
        let s = f(pts[0][0]) + " " + f(pts[0][1]) + " m";
        for (let i = 1; i < pts.length; i++) s += " " + f(pts[i][0]) + " " + f(pts[i][1]) + " l";
        if (cerrar) s += " h";
        s += " " + (modo || "S");
        this.o.push(s);
    };
    Pag.prototype.rect = function (x, y, w, h, modo) {
        this.o.push(f(x) + " " + f(y) + " " + f(w) + " " + f(h) + " re " + (modo || "S"));
    };
    Pag.prototype.clip = function (x, y, w, h) {
        this.o.push(f(x) + " " + f(y) + " " + f(w) + " " + f(h) + " re W n");
    };
    // alin: "l" izquierda, "c" centro, "r" derecha. rot en grados (antihorario).
    Pag.prototype.texto = function (x, y, str, size, op) {
        op = op || {};
        const w = anchoTexto(str, size, op.bold);
        let dx = 0;
        if (op.alin === "c") dx = -w / 2; else if (op.alin === "r") dx = -w;
        const a = (op.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
        const ox = x + dx * co, oy = y + dx * si;
        const c = op.color || [0, 0, 0];
        this.o.push("BT " + f(c[0]) + " " + f(c[1]) + " " + f(c[2]) + " rg /" + (op.bold ? "F2" : "F1") + " " + f(size) + " Tf " +
            f(co) + " " + f(si) + " " + f(-si) + " " + f(co) + " " + f(ox) + " " + f(oy) + " Tm (" + esc(str) + ") Tj ET");
    };

    function Pdf(titulo) { this.paginas = []; this.titulo = titulo || "Patrón"; }
    Pdf.prototype.pagina = function (w, h) { const p = new Pag(w, h); this.paginas.push(p); return p; };
    Pdf.prototype.generar = function () {
        const n = this.paginas.length;
        const objs = {};
        objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
        objs[2] = "<< /Type /Pages /Kids [" + this.paginas.map(function (_, i) { return (6 + 2 * i) + " 0 R"; }).join(" ") + "] /Count " + n + " >>";
        objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
        objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
        const d = new Date();
        const p2 = function (v) { return (v < 10 ? "0" : "") + v; };
        objs[5] = "<< /Title (" + esc(this.titulo) + ") /Creator (NIVAN) /Producer (NIVAN Patronaje) /CreationDate (D:" +
            d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + ") >>";
        this.paginas.forEach(function (pg, i) {
            const cont = pg.o.join("\n");
            objs[6 + 2 * i] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + f(pg.w) + " " + f(pg.h) +
                "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (7 + 2 * i) + " 0 R >>";
            objs[7 + 2 * i] = "<< /Length " + cont.length + " >>\nstream\n" + cont + "\nendstream";
        });
        const total = 5 + 2 * n;
        let out = "%PDF-1.4\n%âãÏÓ\n";
        const offs = [];
        for (let id = 1; id <= total; id++) {
            offs[id] = out.length;
            out += id + " 0 obj\n" + objs[id] + "\nendobj\n";
        }
        const xref = out.length;
        out += "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
        for (let id = 1; id <= total; id++) out += ("0000000000" + offs[id]).slice(-10) + " 00000 n \n";
        out += "trailer\n<< /Size " + (total + 1) + " /Root 1 0 R /Info 5 0 R >>\nstartxref\n" + xref + "\n%%EOF";
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
        return bytes;
    };

    PN.Pdf = Pdf;
    PN.anchoTexto = anchoTexto;

    // ------------------------------
    // Papel
    // ------------------------------
    const PAPELES = {
        A4: { n: "A4", w: 595.28, h: 841.89 },
        Carta: { n: "Carta", w: 612, h: 792 },
        A3: { n: "A3", w: 841.89, h: 1190.55 }
    };
    PN.PAPELES = PAPELES;

    // ------------------------------
    // Dibujo de las formas en una página
    // ------------------------------
    const NEGRO = [0, 0, 0], GRIS = [0.45, 0.45, 0.45], GRIS_CLARO = [0.75, 0.75, 0.75], AZUL = [0.1, 0.3, 0.7];

    function dibujarShapes(pg, shapes, map, k, op) {
        // k: puntos por cm en esta página (para tamaños de marcas); op.pt = escala de fuentes
        const fs = op.fs || 8;
        shapes.forEach(function (s) {
            if (s.t === "path") dibujarPath(pg, s, map, k, op, fs);
            else if (s.t === "text") {
                const x = map(s.p.x, s.p.y);
                const tam = Math.max(5, (s.size || 1) * k * 0.9);
                pg.texto(x[0], x[1] - tam * 0.8, s.text || "", tam, { bold: false });
            } else if (s.t === "dim") dibujarCota(pg, s, map, k, fs);
        });
    }

    function mapPts(pts, map) { return pts.map(function (p) { return map(p.x, p.y); }); }

    function dibujarPath(pg, s, map, k, op, fs) {
        const fl = PN.aplanar(s, 14);
        const pts = mapPts(fl.pts, map);
        const cerrada = fl.closed;
        const esPieza = s.pieza && cerrada;
        const tieneMargen = esPieza && op.margen && PN.contornoConMargen(s);

        if (tieneMargen) {
            const c = PN.contornoConMargen(s);
            pg.q(); pg.trazo(0, 0, 0); pg.grosor(1.1); pg.guiones([]);
            pg.poli(mapPts(c, map), true, "S");
            pg.Q();
            pg.q(); pg.trazo(0.25, 0.25, 0.25); pg.grosor(0.5); pg.guiones([3, 2.2]);
            pg.poli(pts, true, "S");
            pg.Q();
        } else {
            pg.q(); pg.trazo(0, 0, 0); pg.grosor(esPieza ? 1.1 : 0.9); pg.guiones([]);
            pg.poli(pts, cerrada, "S");
            pg.Q();
        }

        if (!esPieza) return;

        // Pinzas
        (s.darts || []).forEach(function (d) {
            const a = map(d.a.x, d.a.y), t = map(d.t.x, d.t.y), b = map(d.b.x, d.b.y);
            pg.q(); pg.trazo(AZUL[0], AZUL[1], AZUL[2]); pg.grosor(0.7); pg.guiones([]);
            pg.poli([a, t, b], false, "S");
            pg.Q();
            pg.texto(t[0], t[1] - 9, "pinza", 6, { alin: "c", color: AZUL });
        });

        // Líneas internas
        (s.lineas || []).forEach(function (l) {
            const a = map(l.a.x, l.a.y), b = map(l.b.x, l.b.y);
            pg.q(); pg.trazo(GRIS[0], GRIS[1], GRIS[2]); pg.grosor(0.5); pg.guiones(l.dash ? [4, 3] : []);
            pg.linea(a[0], a[1], b[0], b[1]);
            pg.Q();
        });

        // Rótulos (p. ej. Del. / Esp. en la manga)
        (s.marcas || []).forEach(function (q) {
            const a = map(q.p.x, q.p.y);
            pg.texto(a[0], a[1], q.t, 9, { alin: "c", bold: true });
        });

        // Piquetes (marcas de unión) hacia afuera
        const cont = PN.aplanar(s, 14);
        const sg = (function () { let a = 0; for (let i = 0; i < cont.pts.length; i++) { const p = cont.pts[i], q = cont.pts[(i + 1) % cont.pts.length]; a += p.x * q.y - q.x * p.y; } return a > 0 ? 1 : -1; })();
        (s.notches || []).forEach(function (n) {
            const c = PN.cercanoEnContorno(s, n);
            if (!c) return;
            const dx = c.bx - c.ax, dy = c.by - c.ay, L = Math.hypot(dx, dy) || 1;
            const nx = sg > 0 ? dy / L : -dy / L, ny = sg > 0 ? -dx / L : dx / L;
            const lg = Math.min(0.7, Math.max(0.3, (s.sa || 1) * 0.6));
            const a = map(c.x, c.y), b = map(c.x + nx * lg, c.y + ny * lg);
            pg.q(); pg.trazo(0, 0, 0); pg.grosor(1.2); pg.guiones([]);
            pg.linea(a[0], a[1], b[0], b[1]);
            pg.Q();
        });

        // Hilo (con flechas)
        if (s.grain) {
            const a = map(s.grain.a.x, s.grain.a.y), b = map(s.grain.b.x, s.grain.b.y);
            pg.q(); pg.trazo(0, 0, 0); pg.relleno(0, 0, 0); pg.grosor(0.8); pg.guiones([]);
            pg.linea(a[0], a[1], b[0], b[1]);
            const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
            const ux = dx / L, uy = dy / L, hl = Math.min(9, L * 0.2), hw = hl * 0.35;
            [[a, 1], [b, -1]].forEach(function (e) {
                const p = e[0], sgn = e[1];
                pg.poli([[p[0], p[1]], [p[0] + sgn * ux * hl - uy * hw, p[1] + sgn * uy * hl + ux * hw], [p[0] + sgn * ux * hl + uy * hw, p[1] + sgn * uy * hl - ux * hw]], true, "f");
            });
            pg.Q();
        }

        // Doblez
        (s.fold || []).forEach(function (e) {
            let a = null, b = null, acc = [];
            for (let i = 0; i < cont.pts.length; i++) if (cont.edge[i] === e) acc.push(cont.pts[i]);
            if (!acc.length) return;
            a = acc[0]; b = cont.pts[(cont.pts.indexOf(acc[acc.length - 1]) + 1) % cont.pts.length];
            const A = map(a.x, a.y), B = map(b.x, b.y);
            const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
            if (L < 30) return;
            let ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
            if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
            const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
            const ra = ang * Math.PI / 180;
            // un poco hacia adentro de la pieza
            const c = PN.centroide(cont.pts), C = map(c.x, c.y);
            let ox = -Math.sin(ra) * 8, oy = Math.cos(ra) * 8;
            if ((C[0] - mx) * ox + (C[1] - my) * oy < 0) { ox = -ox; oy = -oy; }
            pg.q(); pg.trazo(0, 0, 0); pg.grosor(2.2); pg.guiones([]);
            pg.linea(A[0], A[1], B[0], B[1]);
            pg.Q();
            pg.texto(mx + ox * 0.9, my + oy * 0.9 - 2, "AL DOBLEZ", Math.min(fs, 8), { alin: "c", rot: ang, bold: true });
        });

        // Rótulo
        const cent = s.lab || PN.centroide(cont.pts);
        const C = map(cent.x, cent.y);
        const caja = PN.cajaDeShape(s);
        if (!op.sinRotulo && (caja.x1 - caja.x0) * k > 40 && (caja.y1 - caja.y0) * k > 28) {
            const lineas = [];
            lineas.push({ t: s.name || "Pieza", b: true, s: fs + 1 });
            lineas.push({ t: "Cortar " + (s.qty || 1) + (s.fold && s.fold.length ? " al doblez" : (s.qty > 1 ? " (par/es)" : "")), b: false, s: fs });
            if (op.talle) lineas.push({ t: "Talle " + op.talle, b: false, s: fs - 1 });
            let wmax = 0, ht = 0;
            lineas.forEach(function (l) { wmax = Math.max(wmax, anchoTexto(l.t, l.s, l.b)); ht += l.s * 1.25; });
            const maxW = (caja.x1 - caja.x0) * k * 0.92;
            const x0 = C[0], y0 = C[1] + ht / 2 - 2;
            pg.q(); pg.relleno(1, 1, 1); pg.rect(x0 - Math.min(wmax, maxW) / 2 - 3, C[1] - ht / 2 - 2, Math.min(wmax, maxW) + 6, ht + 3, "f"); pg.Q();
            let yy = y0 - fs * 0.9;
            lineas.forEach(function (l) {
                pg.texto(x0, yy, recortar(l.t, l.s, l.b, maxW), l.s, { alin: "c", bold: l.b });
                yy -= l.s * 1.25;
            });
        }
    }

    function dibujarCota(pg, s, map, k, fs) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy);
        if (L < 1e-6) return;
        const off = s.off || 0;
        const nx = dy / L, ny = -dx / L;
        const a = { x: s.a.x + nx * off, y: s.a.y + ny * off }, b = { x: s.b.x + nx * off, y: s.b.y + ny * off };
        const A = map(a.x, a.y), B = map(b.x, b.y), A0 = map(s.a.x, s.a.y), B0 = map(s.b.x, s.b.y);
        pg.q(); pg.trazo(AZUL[0], AZUL[1], AZUL[2]); pg.relleno(AZUL[0], AZUL[1], AZUL[2]); pg.grosor(0.5); pg.guiones([]);
        if (Math.abs(off) > 0.01) { pg.linea(A0[0], A0[1], A[0], A[1]); pg.linea(B0[0], B0[1], B[0], B[1]); }
        pg.linea(A[0], A[1], B[0], B[1]);
        const ddx = B[0] - A[0], ddy = B[1] - A[1], LL = Math.hypot(ddx, ddy) || 1, ux = ddx / LL, uy = ddy / LL, hl = Math.min(7, LL * 0.25), hw = hl * 0.3;
        [[A, 1], [B, -1]].forEach(function (e) {
            const p = e[0], sg = e[1];
            pg.poli([[p[0], p[1]], [p[0] + sg * ux * hl - uy * hw, p[1] + sg * uy * hl + ux * hw], [p[0] + sg * ux * hl + uy * hw, p[1] + sg * uy * hl - ux * hw]], true, "f");
        });
        pg.Q();
        let ang = Math.atan2(ddy, ddx) * 180 / Math.PI;
        if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
        const ra = ang * Math.PI / 180;
        const mx = (A[0] + B[0]) / 2 - Math.sin(ra) * 3, my = (A[1] + B[1]) / 2 + Math.cos(ra) * 3;
        pg.texto(mx, my, (Math.round(L * 10) / 10).toString().replace(".", ",") + " cm", Math.min(fs, 8), { alin: "c", rot: ang, color: AZUL });
    }

    // ------------------------------
    // Plan: hojas, ventanas, etc.
    // ------------------------------
    function segmentosDeShape(s) {
        // Cajas de segmentos para saber si una hoja toca algo
        const cajas = [];
        if (s.t === "path") {
            const listas = [PN.aplanar(s, 8).pts];
            const c = s.pieza && s.closed ? PN.contornoConMargen(s) : null;
            if (c) listas.push(c);
            listas.forEach(function (pts, li) {
                const cerr = s.closed;
                const n = pts.length;
                const tope = cerr ? n : n - 1;
                for (let i = 0; i < tope; i++) {
                    const a = pts[i], b = pts[(i + 1) % n];
                    cajas.push([Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]);
                }
            });
            // Hilo, pinzas, líneas internas y rótulo también cuentan: si una hoja los contiene
            // aunque no pase ningún borde por ella, igual se imprime.
            if (s.pieza && s.closed) {
                const caja = function (a, b, m) { cajas.push([Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m]); };
                if (s.grain) caja(s.grain.a, s.grain.b, 0.5);
                (s.darts || []).forEach(function (d) { caja(d.a, d.b, 0.3); caja(d.a, d.t, 0.3); caja(d.b, d.t, 0.3); });
                (s.lineas || []).forEach(function (l) { caja(l.a, l.b, 0.2); });
                const cen = s.lab || PN.centroide(PN.aplanar(s, 8).pts);
                caja(cen, cen, 3);
            }
        } else {
            const b = PN.cajaDeShape(s);
            cajas.push([b.x0, b.y0, b.x1, b.y1]);
        }
        return cajas;
    }

    function hojaTocaAlgo(cajasTodas, x0, y0, x1, y1) {
        for (let i = 0; i < cajasTodas.length; i++) {
            const c = cajasTodas[i];
            if (c[2] >= x0 && c[0] <= x1 && c[3] >= y0 && c[1] <= y1) return true;
        }
        return false;
    }

    PN.opcionesPdfPorDefecto = function () {
        return {
            papel: "A4", orient: "vertical", superposicion: 1, ficha: true, armado: true, general: true, escalaReal: true,
            margen: true, acomodar: false, autor: "", titulo: ""
        };
    };

    PN.planificarPdf = function (proy, op) {
        const papel = PAPELES[op.papel] || PAPELES.A4;
        const horizontal = op.orient === "horizontal";
        const W = horizontal ? papel.h : papel.w, H = horizontal ? papel.w : papel.h;
        let shapes = PN.clon(PN.formasOrdenadas(proy, true));
        if (op.acomodar) shapes = PN.acomodar(shapes, Math.max(60, (proy.tela && proy.tela.ancho) || 140), 4);
        const bb = PN.cajaDeTodo(shapes, { sa: true });
        if (!bb) return { vacio: true, shapes: shapes };

        const M = 1.2 * K;               // margen de hoja
        const cw = (W - 2 * M) / K, ch = (H - 2 * M) / K;
        const ov = Math.max(0.3, Math.min(3, op.superposicion == null ? 1 : op.superposicion));
        const x0 = bb.x0 - 0.5, y0 = bb.y0 - 0.5;
        const totalW = (bb.x1 - bb.x0) + 1, totalH = (bb.y1 - bb.y0) + 1;
        const cols = Math.max(1, Math.ceil((totalW - ov) / (cw - ov)));
        const rows = Math.max(1, Math.ceil((totalH - ov) / (ch - ov)));
        const cajas = [];
        shapes.forEach(function (s) { segmentosDeShape(s).forEach(function (c) { cajas.push(c); }); });
        const tiles = [];
        const cajasShape = shapes.map(function (s) { return PN.cajaDeShape(s, { sa: true }); });
        let incluidas = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const wx = x0 + c * (cw - ov), wy = y0 + r * (ch - ov);
                const inc = op.escalaReal ? hojaTocaAlgo(cajas, wx, wy, wx + cw, wy + ch) : false;
                if (inc) incluidas++;
                tiles.push({ r: r, c: c, x: wx, y: wy, inc: inc });
            }
        }
        return {
            vacio: false, shapes: shapes, bb: bb, W: W, H: H, M: M, cw: cw, ch: ch, ov: ov,
            cols: cols, rows: rows, tiles: tiles, hojasReales: incluidas, papel: papel, cajas: cajasShape
        };
    };

    PN.etiquetaHoja = function (r, c) {
        let l = "", n = r;
        do { l = String.fromCharCode(65 + (n % 26)) + l; n = Math.floor(n / 26) - 1; } while (n >= 0);
        return l + (c + 1);
    };

    // ------------------------------
    // Armado del PDF
    // ------------------------------
    function fechaHoy() {
        const d = new Date();
        return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
    }

    function coma(n, d) { return (Math.round(n * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toString().replace(".", ","); }

    PN.generarPdf = function (proy, op) {
        const plan = PN.planificarPdf(proy, op);
        if (plan.vacio) throw new Error("Todavía no hay nada para exportar (si dibujaste algo, revisá que sus capas no estén ocultas).");
        const titulo = op.titulo || proy.nombre || "Patrón";
        const pdf = new Pdf(titulo);
        const talle = proy.perfil && proy.perfil.talle ? proy.perfil.talle : "";
        const opDib = { margen: op.margen, talle: talle, fs: 8 };

        if (op.ficha) paginaFicha(pdf, proy, plan, op, titulo);
        if (op.ficha && op.escalaReal) paginaImpresion(pdf, proy, plan, op, titulo);
        if (op.armado) paginaArmado(pdf, proy, plan, op, titulo);
        if (op.general) paginaGeneral(pdf, proy, plan, op, titulo, opDib);
        if (op.escalaReal) paginasEscalaReal(pdf, proy, plan, op, titulo, opDib);
        if (!pdf.paginas.length) throw new Error("Elegí al menos una sección para el PDF.");
        return { bytes: pdf.generar(), hojas: pdf.paginas.length, plan: plan };
    };

    function encabezado(pg, titulo, sub, W, H, M) {
        pg.texto(M, H - M + 6, titulo, 8, { color: GRIS, bold: true });
        pg.texto(W - M, H - M + 6, sub, 8, { color: GRIS, alin: "r" });
    }

    // --- Ficha técnica (1 o más páginas) ---
    function paginaFicha(pdf, proy, plan, op, titulo) {
        const papel = PAPELES[op.papel] || PAPELES.A4;
        const W = papel.w, H = papel.h, M = 2 * K;
        let pg = pdf.pagina(W, H);
        let y = H - M;
        const pie = function (p) {
            p.texto(W / 2, 20, "NIVAN · Ficha técnica de patronaje", 7, { alin: "c", color: GRIS });
        };
        pie(pg);
        const nueva = function () { pg = pdf.pagina(W, H); pie(pg); y = H - M; };
        const necesita = function (h) { if (y - h < M * 0.6) nueva(); };
        const seccion = function (t) {
            necesita(40);
            y -= 14;
            pg.texto(M, y, t, 12, { bold: true });
            y -= 4;
            pg.q(); pg.trazo(0.15, 0.15, 0.15); pg.grosor(0.8); pg.linea(M, y, W - M, y); pg.Q();
            y -= 12;
        };

        pg.texto(M, y - 20, titulo, 22, { bold: true });
        y -= 40;
        pg.texto(M, y, "Ficha técnica de patronaje", 11, { color: GRIS });
        y -= 16;
        const meta = [];
        if (op.autor) meta.push("Tienda / autor: " + op.autor);
        if (proy.perfil && proy.perfil.modelo) meta.push("Modelo / clienta: " + proy.perfil.modelo);
        if (proy.perfil && proy.perfil.talle) meta.push("Talle: " + proy.perfil.talle);
        meta.push("Fecha: " + fechaHoy());
        pg.texto(M, y, meta.join("   ·   "), 9, { color: [0.2, 0.2, 0.2] });
        y -= 8;

        // Medidas
        seccion("Medidas del cuerpo (cm)");
        const med = PN.MEDIDAS.filter(function (x) { return proy.medidas && proy.medidas[x.k] != null; });
        const colW = (W - 2 * M) / 2;
        const filas = Math.ceil(med.length / 2);
        necesita(filas * 14 + 6);
        for (let i = 0; i < filas; i++) {
            for (let c = 0; c < 2; c++) {
                const it = med[i + c * filas];
                if (!it) continue;
                const x = M + c * colW;
                pg.texto(x, y, it.t, 9);
                pg.texto(x + colW - 14, y, coma(proy.medidas[it.k], 1), 9, { alin: "r", bold: true });
                pg.q(); pg.trazo(0.85, 0.85, 0.85); pg.grosor(0.4); pg.linea(x, y - 3, x + colW - 14, y - 3); pg.Q();
            }
            y -= 14;
        }

        // Piezas
        const res = PN.resumenPiezas(plan.shapes, (proy.tela && proy.tela.ancho) || 140);
        seccion("Piezas del patrón");
        if (!res.piezas.length) {
            pg.texto(M, y, "No hay piezas marcadas como \"pieza de patrón\" todavía.", 9, { color: GRIS });
            y -= 14;
        } else {
            const cols = [M, M + 215, M + 262, M + 365, M + 425];
            necesita(18);
            ["Pieza", "Cant.", "Medida (ancho × alto)", "Al doblez", "Margen"].forEach(function (t, i) { pg.texto(cols[i], y, t, 8, { bold: true, color: GRIS }); });
            y -= 4;
            pg.q(); pg.trazo(0.5, 0.5, 0.5); pg.grosor(0.6); pg.linea(M, y, W - M, y); pg.Q();
            y -= 11;
            res.piezas.forEach(function (p) {
                necesita(14);
                pg.texto(cols[0], y, recortar(p.nombre, 9, false, 205), 9);
                pg.texto(cols[1], y, String(p.cant), 9);
                pg.texto(cols[2], y, coma(p.w, 1) + " × " + coma(p.h, 1) + " cm", 9);
                pg.texto(cols[3], y, p.doblez ? "Sí" : "No", 9);
                pg.texto(cols[4], y, coma(p.sa, 1) + " cm", 9);
                y -= 13;
            });
            y -= 2;
            pg.texto(M, y, "Las medidas incluyen el margen de costura. En las piezas al doblez, la medida es la pieza abierta.", 7.5, { color: GRIS });
            y -= 12;

            seccion("Consumo de tela estimado");
            const mn = Math.ceil(res.consumoMin / 5) * 5 / 100, mx = Math.ceil(res.consumoMax / 5) * 5 / 100;
            pg.texto(M, y, "Tela de " + res.anchoTela + " cm de ancho:  entre " + coma(mn, 2) + " m y " + coma(mx, 2) + " m", 10, { bold: true });
            y -= 13;
            pg.texto(M, y, "Es una estimación: el mínimo supone un buen encaje y el máximo acomodar las piezas en filas simples.", 8, { color: GRIS });
            y -= 11;
            if (res.noEntra.length) {
                pg.texto(M, y, "Atención: no entran en el ancho de tela: " + res.noEntra.join(", "), 8, { color: [0.7, 0.1, 0.1] });
                y -= 11;
            }
        }

        if (proy.notas && String(proy.notas).trim()) {
            seccion("Notas");
            String(proy.notas).split(/\n/).forEach(function (linea) {
                // corte simple por ancho
                let rest = linea;
                do {
                    let corte = rest;
                    while (anchoTexto(corte, 9, false) > W - 2 * M && corte.length > 1) {
                        const sp = corte.lastIndexOf(" ");
                        corte = sp > 0 ? corte.slice(0, sp) : corte.slice(0, -1);
                    }
                    necesita(13);
                    pg.texto(M, y, corte, 9);
                    y -= 12;
                    rest = rest.slice(corte.length).replace(/^ /, "");
                } while (rest.length);
            });
        }

    }

    // --- Cómo imprimir y pegar las hojas (página aparte, va con la ficha técnica) ---
    function paginaImpresion(pdf, proy, plan, op, titulo) {
        const papel = PAPELES[op.papel] || PAPELES.A4;
        const W = papel.w, H = papel.h, M = 2 * K;
        const pg = pdf.pagina(W, H);
        let y = H - M;
        pg.texto(W / 2, 20, "NIVAN · Cómo imprimir el patrón", 7, { alin: "c", color: GRIS });
        pg.texto(M, y - 20, titulo, 22, { bold: true });
        y -= 40;
        pg.texto(M, y, "Ficha técnica · impresión", 11, { color: GRIS });
        y -= 24;
        pg.texto(M, y, "Cómo imprimir y pegar el patrón a escala real", 12, { bold: true });
        y -= 4;
        pg.q(); pg.trazo(0.15, 0.15, 0.15); pg.grosor(0.8); pg.linea(M, y, W - M, y); pg.Q();
        y -= 14;
        const pasos = [
            "1. Imprimí las hojas \"Escala real\" en tamaño real: 100%, sin 'ajustar a la página' ni 'reducir'.",
            "2. Medí el cuadrado de control de abajo: tiene que medir exactamente 10 × 10 cm. Si no, revisá la escala de impresión.",
            "3. Cada hoja tiene un nombre (A1, A2, B1…). Ordenalas según el mapa de hojas.",
            "4. Recortá el margen y pegá una hoja con la otra haciendo coincidir las marcas de las esquinas.",
            "5. Cortá siguiendo la línea continua gruesa (incluye el margen de costura). La línea punteada es la de costura."
        ];
        pasos.forEach(function (t) {
            let rest = t;
            do {
                let corte = rest;
                while (anchoTexto(corte, 9, false) > W - 2 * M && corte.length > 1) {
                    const sp = corte.lastIndexOf(" ");
                    corte = sp > 0 ? corte.slice(0, sp) : corte.slice(0, -1);
                }
                pg.texto(M, y, corte, 9);
                y -= 12.5;
                rest = rest.slice(corte.length).replace(/^ /, "");
            } while (rest.length);
        });
        y -= 10;
        const cy2 = y - 10 * K;
        pg.q(); pg.trazo(0, 0, 0); pg.grosor(0.8); pg.guiones([]); pg.rect(M, cy2, 10 * K, 10 * K, "S"); pg.Q();
        pg.texto(M + 5 * K, cy2 + 5 * K + 3, "Control de escala", 9, { alin: "c", bold: true });
        pg.texto(M + 5 * K, cy2 + 5 * K - 9, "10 × 10 cm", 9, { alin: "c" });
        if (plan.hojasReales > 0) {
            const mx0 = M + 10 * K + 30;
            const dispW = W - M - mx0, dispH = 10 * K;
            const cel = Math.min(dispW / plan.cols, dispH / plan.rows, 34);
            pg.texto(mx0, cy2 + 10 * K - 4, "Mapa de hojas (" + plan.hojasReales + " en total, " + plan.papel.n + ")", 9, { bold: true });
            const oy = cy2 + 10 * K - 14;
            plan.tiles.forEach(function (t) {
                const x = mx0 + t.c * cel, yy = oy - (t.r + 1) * cel;
                pg.q();
                if (t.inc) { pg.relleno(0.88, 0.9, 0.93); pg.trazo(0.2, 0.2, 0.2); pg.grosor(0.6); pg.rect(x, yy, cel, cel, "B"); }
                else { pg.trazo(0.8, 0.8, 0.8); pg.grosor(0.3); pg.guiones([2, 2]); pg.rect(x, yy, cel, cel, "S"); }
                pg.Q();
                if (t.inc) pg.texto(x + cel / 2, yy + cel / 2 - 3, PN.etiquetaHoja(t.r, t.c), Math.min(9, cel * 0.35), { alin: "c", bold: true });
            });
        }
    }

    // --- Armado ficha técnica: cómo trazar el molde paso a paso, con los números de este proyecto ---
    // Cada paso sale de la geometría REAL del molde (los mismos puntos que se imprimen),
    // así que lo que dice la ficha siempre coincide con el molde, aunque cambies holguras, pinzas, glúteos, etc.
    function nfc(n, d) { d = d == null ? 1 : d; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString().replace(".", ","); }
    function nPz(v) { return v == null || isNaN(+v) ? 1 : +v; }

    const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    // Marcas: puntos con letra (A, B, C…) y líneas guía que se dibujan en la figura de cada pieza
    function Marcas() { this.lab = []; this.guias = []; this.nl = 0; }
    Marcas.prototype.p = function (x, y, t) {
        let nombre = t;
        if (nombre == null) {
            const i = this.nl++;
            nombre = i < 26 ? LETRAS[i] : LETRAS[i % 26] + Math.floor(i / 26);
        }
        this.lab.push({ p: { x: x, y: y }, t: nombre });
        return nombre;
    };
    Marcas.prototype.g = function (x1, y1, x2, y2) { this.guias.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } }); };

    function buscarPz(piezas, nombre) { return piezas.filter(function (p) { return p.name === nombre; })[0]; }

    // "a 3,5 cm a la derecha de la línea A-B y 0,6 cm hacia ARRIBA desde A"
    function ubic(x, y, rx, ry) {
        const sx = Math.abs(x) < 0.05 ? "sobre " + rx : nfc(Math.abs(x)) + " cm a la " + (x > 0 ? "derecha" : "izquierda") + " de " + rx;
        const sy = Math.abs(y) < 0.05 ? "a la altura de " + ry : nfc(Math.abs(y)) + " cm hacia " + (y < 0 ? "ARRIBA" : "abajo") + " desde " + ry;
        return sx + " y " + sy;
    }
    // "(2,1 ; 0,8)": cm a la derecha ; cm hacia abajo
    function par(p) { return "(" + nfc(p.x) + " ; " + nfc(p.y) + ")"; }

    function sumaPinzas(pz) {
        let t = 0;
        (pz.darts || []).forEach(function (d) { t += Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y); });
        return t;
    }

    // Pinzas: se miden sobre la línea de cintura
    function pasosPinzas(pz, T, refTxt) {
        const out = [];
        const ds = pz.darts || [];
        ds.forEach(function (d, i) {
            const cx = (d.a.x + d.b.x) / 2, cy = (d.a.y + d.b.y) / 2;
            const w = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), lg = Math.hypot(d.t.x - cx, d.t.y - cy);
            const g = T.p(cx, cy), h = T.p(d.a.x, d.a.y), ii = T.p(d.b.x, d.b.y), j = T.p(d.t.x, d.t.y);
            out.push("Pinza" + (ds.length > 1 ? " " + (i + 1) : "") + ": sobre la línea de cintura medí " + nfc(cx) + " cm " + refTxt + " y marcá " + g + " (centro de la pinza). A cada lado de " + g + " marcá " + nfc(w / 2) + " cm (puntos " + h + " e " + ii + "): la pinza abre " + nfc(w) + " cm en total. Desde " + g + " bajá " + nfc(lg) + " cm en vertical y marcá " + j + ". Uní " + j + " con " + h + " y con " + ii + ": queda un triángulo.");
        });
        return out;
    }


    // Diferencias entre dos piezas hermanas (delantero y trasero): lo único que hay que cambiar al calcar
    function pasosDif(pf, pb, lista, nomF, nomB) {
        const out = [];
        lista.forEach(function (e) {
            const a = pf[e.i], b = pb[e.i];
            if (!a || !b) return;
            const dx = b.x - a.x, dy = b.y - a.y;
            const ax = Math.abs(dx) >= 0.05, ay = Math.abs(dy) >= 0.05;
            if (!ax && !ay) return;
            const mov = [];
            if (ax) mov.push(nfc(Math.abs(dx)) + " cm más a la " + (dx > 0 ? "derecha" : "izquierda"));
            if (ay) mov.push(nfc(Math.abs(dy)) + " cm más " + (dy > 0 ? "abajo" : "ARRIBA"));
            out.push("Punto " + e.n + ": en el " + nomF + " está en " + par(a) + "; en el " + nomB + " va en " + par(b) + " (corrélo " + mov.join(" y ") + ").");
        });
        return out;
    }

    // Puntos de las 4 esquinas (sin letra) para dibujar rectángulos paso a paso
    function esquinasFig(pz) {
        const b = PN.cajaDeShape(pz);
        return [{ p: { x: b.x0, y: b.y0 }, t: "" }, { p: { x: b.x1, y: b.y0 }, t: "" }, { p: { x: b.x1, y: b.y1 }, t: "" }, { p: { x: b.x0, y: b.y1 }, t: "" }];
    }

    function pasosPretina(piezas) {
        const pr = buscarPz(piezas, "Pretina");
        if (!pr) return [];
        const bb = PN.cajaDeShape(pr), w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
        return [{ h: "Pretina (cortar 1)" }, { fig: pr, labels: esquinasFig(pr), guias: [] },
            "Trazá una línea horizontal de " + nfc(w) + " cm (cintura + holgura + 4 cm para el cruce del botón).",
            "A " + nfc(h) + " cm hacia abajo trazá otra horizontal igual y cerrá los dos lados con verticales: queda un rectángulo de " + nfc(w) + " × " + nfc(h) + " cm.",
            "Marcá una línea punteada justo al medio (a " + nfc(h / 2) + " cm): es el doblez de la pretina."];
    }

    function pasosFinal(o) {
        return [{ h: "Terminación" },
            "Todas las medidas de arriba son del molde TERMINADO (sin costura). Al cortar la tela sumá " + nfc(o.margen) + " cm de margen de costura alrededor de cada pieza" + (o.dobladillo > 0 ? " y " + nfc(o.dobladillo) + " cm de dobladillo en el bajo." : ".")];
    }

    function pasosDeGenerador(id, m, o, piezas) {
        const r = [];

        // ================= FALDA RECTA =================
        if (id === "falda_recta") {
            const Wq = (m.cintura + o.holgCintura) / 4;
            const marcasFR = function (pz) {
                const p = pz.pts, T = new Marcas(), nm = {};
                const L = p[4].y, ah = p[2].y, Hq = p[2].x;
                nm.A = T.p(0, 0); nm.A2 = T.p(Hq, 0); nm.B = T.p(0, L); nm.E = T.p(Hq, L); nm.C = T.p(0, ah); nm.D = T.p(Hq, ah); nm.F = T.p(p[1].x, p[1].y);
                T.g(0, 0, Hq, 0); T.g(0, 0, 0, L); T.g(Hq, 0, Hq, L); T.g(0, L, Hq, L); T.g(0, ah, Hq, ah);
                return { T: T, nm: nm, L: L, ah: ah, Hq: Hq, p: p, pz: pz };
            };
            const pf = buscarPz(piezas, "Falda Del."), pt = buscarPz(piezas, "Falda Esp.");
            const F = pf ? marcasFR(pf) : null, Tr = pt ? marcasFR(pt) : null;
            if (F) {
                const nm = F.nm, p = F.p, s2 = [];
                s2.push("Trazá una línea horizontal de " + nfc(F.Hq) + " cm: es el ancho del molde, 1/4 de la cadera ((cadera " + nfc(m.cadera) + " + holgura " + nfc(o.holgCadera) + ") ÷ 4). Marcá " + nm.A + " en la punta izquierda y " + nm.A2 + " en la derecha.");
                s2.push("Desde " + nm.A + " y desde " + nm.A2 + " bajá una vertical de " + nfc(F.L) + " cm (largo de la falda) y cerrá abajo con otra horizontal de " + nfc(F.Hq) + " cm. Marcá " + nm.B + " y " + nm.E + ". Queda un rectángulo de " + nfc(F.Hq) + " × " + nfc(F.L) + " cm: es 1/4 de la falda. El lado " + nm.A + "-" + nm.B + " es el centro delantero y va al doblez.");
                s2.push("Sobre " + nm.A + "-" + nm.B + " bajá " + nfc(F.ah) + " cm y marcá " + nm.C + "; trazá una horizontal hasta el otro lado y marcá " + nm.D + " (línea de cadera).");
                const dt = sumaPinzas(F.pz), explica = Math.abs(p[1].x - (Wq + dt)) < 0.06;
                s2.push("Cintura: desde " + nm.A + " medí " + nfc(p[1].x) + " cm hacia la derecha" + (Math.abs(p[1].y) > 0.05 ? " y subí " + nfc(-p[1].y) + " cm" : "") + ". Marcá " + nm.F + " y unilo con " + nm.A + " con una recta." + (explica ? " Esos " + nfc(p[1].x) + " cm son la cintura (" + nfc(m.cintura) + " + holgura " + nfc(o.holgCintura) + ", ÷ 4 = " + nfc(Wq) + ")" + (dt > 0.05 ? " más " + nfc(dt) + " cm que absorbe la pinza." : ".") : ""));
                s2.push("Costado: uní " + nm.F + " con " + nm.D + " con una curva suave que abrace la cadera y seguí recto hasta " + nm.E + ".");
                const pin = pasosPinzas(F.pz, F.T, "desde " + nm.A);
                if (pin.length) pin.forEach(function (x) { s2.push(x); }); else s2.push("Sin pinza delantera: el sobrante de cintura ya se sacó en el costado (punto " + nm.F + ").");
                s2.push("Piquete en " + nm.D + ". Flecha de hilo paralela al centro, a " + nfc(F.pz.grain.a.x) + " cm de él.");
                r.push({ h: "Delantero (cortar 1, al doblez)" });
                r.push({ fig: F.pz, labels: F.T.lab, guias: F.T.guias });
                s2.forEach(function (x) { r.push(x); });
            }
            if (F && Tr) {
                const nm = Tr.nm, s2 = [];
                s2.push("El trasero es igual al delantero: calcalo (o repetí el rectángulo, la cadera y los puntos con las mismas medidas) y cambiá solo esto. Las medidas son (cm a la derecha de " + nm.A + "-" + nm.B + " ; cm hacia abajo desde " + nm.A + "). El lado " + nm.A + "-" + nm.B + " es el centro trasero: lleva costura, no doblez.");
                pasosDif(F.p, Tr.p, [{ i: 1, n: nm.F }], "delantero", "trasero").forEach(function (x) { s2.push(x); });
                const pin = pasosPinzas(Tr.pz, Tr.T, "desde " + nm.A);
                if (pin.length) pin.forEach(function (x) { s2.push(x); }); else s2.push("Sin pinza trasera: el sobrante de cintura ya se sacó en el costado.");
                if (Tr.pz.lineas && Tr.pz.lineas.length >= 2) {
                    const l1 = Tr.pz.lineas[0];
                    const nG = Tr.T.p(0, l1.a.y), nH = Tr.T.p(l1.b.x, l1.b.y);
                    s2.push("Abertura trasera: desde " + nm.B + " subí " + nfc(Tr.L - l1.a.y) + " cm por el centro y marcá " + nG + ". Desde " + nG + " trazá " + nfc(l1.b.x) + " cm hacia la derecha (punto " + nH + ") y bajá recto hasta el bajo, con línea punteada.");
                }
                r.push({ h: "Trasero (cortar 2): calcá el delantero y cambiá esto" });
                r.push({ fig: Tr.pz, labels: Tr.T.lab, guias: Tr.T.guias });
                s2.forEach(function (x) { r.push(x); });
            }
            pasosPretina(piezas).forEach(function (x) { r.push(x); });
            pasosFinal(o).forEach(function (x) { r.push(x); });

        // ================= FALDA CIRCULAR =================
        } else if (id === "falda_circular") {
            const f = o.fraccion, tot = f * 2 * Math.PI, rr = (m.cintura + o.holgCintura) / tot, R = rr + o.largo, n = Math.max(1, Math.round(o.piezas));
            const th = tot / n, deg = th * 180 / Math.PI;
            const pz = piezas.filter(function (x) { return x.name.indexOf("Falda circular") === 0; })[0];
            const cerrado = th >= 2 * Math.PI - 0.01;
            const T = new Marcas(), s = [];
            const nO = T.p(0, 0), nB = T.p(0, rr), nC = T.p(0, R);
            T.g(0, 0, 0, R);
            let nL1 = "", nR1 = "", nL2 = "", nR2 = "";
            if (pz && !cerrado) {
                const pasos = pz.pts.length / 2 - 1;
                nL1 = T.p(pz.pts[0].x, pz.pts[0].y); nR1 = T.p(pz.pts[pasos].x, pz.pts[pasos].y);
                nR2 = T.p(pz.pts[pasos + 1].x, pz.pts[pasos + 1].y); nL2 = T.p(pz.pts[2 * pasos + 1].x, pz.pts[2 * pasos + 1].y);
                T.g(0, 0, pz.pts[0].x, pz.pts[0].y); T.g(0, 0, pz.pts[pasos].x, pz.pts[pasos].y);
                T.g(0, 0, pz.pts[2 * pasos + 1].x, pz.pts[2 * pasos + 1].y); T.g(0, 0, pz.pts[pasos + 1].x, pz.pts[pasos + 1].y);
            }
            r.push({ h: "Trazado" + (n > 1 ? " de cada gajo (cortar " + n + ")" : " (cortar 1)") });
            if (pz) r.push({ fig: pz, labels: T.lab, guias: T.guias });
            s.push("Marcá un punto " + nO + " cerca del borde de arriba del papel: es el centro de los círculos (la cintura se arma alrededor de él).");
            s.push("Radio de cintura: (cintura " + nfc(m.cintura) + " + holgura " + nfc(o.holgCintura) + ") ÷ (" + nfc(f, 2) + " × 2 × 3,1416) = " + nfc(rr) + " cm. Es la distancia de " + nO + " a la cintura" + (n > 1 ? " (la cintura total se reparte entre los " + n + " gajos)" : "") + ".");
            s.push("Desde " + nO + " trazá hacia abajo una línea vertical de " + nfc(R) + " cm (radio de cintura " + nfc(rr) + " + largo " + nfc(o.largo) + "). Marcá " + nB + " a " + nfc(rr) + " cm de " + nO + " (cintura) y " + nC + " al final, a " + nfc(R) + " cm (bajo). Esa línea es el hilo de la pieza.");
            if (!cerrado) {
                s.push("Ángulo de la pieza: " + nfc(deg, 1) + "°. Abrí la mitad (" + nfc(deg / 2, 1) + "°) hacia cada lado de la vertical y, desde " + nO + ", trazá dos rectas de " + nfc(R) + " cm" + (Math.abs(deg - 180) < 0.1 ? " (con 180° las dos rectas forman una sola horizontal por " + nO + ", perpendicular a la vertical)" : (Math.abs(deg - 90) < 0.1 ? " (con 90° usá la escuadra: cada recta queda a 45° de la vertical)" : ". Usá transportador; si no tenés, controlalo con la medida de control de más abajo")) + ".");
                s.push("Cintura: con una cinta métrica fija en " + nO + " (con una chinche o el dedo) y el lápiz a " + nfc(rr) + " cm, trazá el arco desde " + nL1 + " hasta " + nR1 + " pasando por " + nB + ". El arco mide " + nfc(rr * th) + " cm.");
                s.push("Bajo: con el mismo centro y el lápiz a " + nfc(R) + " cm, trazá el arco desde " + nL2 + " hasta " + nR2 + " pasando por " + nC + ". El arco mide " + nfc(R * th) + " cm.");
                s.push("Control: la distancia en línea recta entre " + nL2 + " y " + nR2 + " tiene que dar " + nfc(2 * R * Math.sin(th / 2)) + " cm, y entre " + nL1 + " y " + nR1 + ", " + nfc(2 * rr * Math.sin(th / 2)) + " cm. Si coincide, el ángulo está bien.");
                s.push("Los dos lados rectos (" + nL1 + "–" + nL2 + " y " + nR1 + "–" + nR2 + ") miden " + nfc(o.largo) + " cm cada uno. Llevan margen de costura de al menos 1,5 cm.");
            } else {
                s.push("Es un círculo completo: con la cinta fija en " + nO + " trazá una circunferencia de radio " + nfc(rr) + " cm (cintura) y otra de radio " + nfc(R) + " cm (bajo). No tiene lados rectos; se abre con un tajo recto hasta la cintura para poder ponérsela.");
            }
            s.push("Tip para ahorrar papel: si el radio de " + nfc(R) + " cm no entra en tu mesa, trazalo en tramos: marcá varios puntos a esa distancia de " + nO + " cada pocos grados y uní los puntos con una curva suave.");
            s.forEach(function (x) { r.push(x); });
            pasosPretina(piezas).forEach(function (x) { r.push(x); });
            pasosFinal(o).forEach(function (x) { r.push(x); });

        // ================= REMERA =================
        } else if (id === "remera") {
            const nn = o.escote === "v" ? 2 : 7, hold = !!o.entallado, NA = PN.NA_SISA;
            const torso = function (frente) {
                const pz = buscarPz(piezas, frente ? "Remera Del." : "Remera Esp.");
                if (!pz) return null;
                const p = pz.pts, T = new Marcas();
                const Lg = p[p.length - 1].y, B4 = p[nn + NA].x, AD = p[nn + NA].y, xh = p[p.length - 2].x;
                const dd = frente && pz.darts && pz.darts[0], nd = dd ? 2 : 0;
                const nm = {};
                nm.A = T.p(0, 0); nm.A2 = T.p(B4, 0); nm.B = T.p(0, Lg); nm.C = T.p(0, AD); nm.D = T.p(B4, AD);
                nm.E = T.p(xh, p[p.length - 2].y);
                if (hold) nm.K = T.p(p[nn + NA + 1 + nd].x, p[nn + NA + 1 + nd].y);
                if (dd) { nm.P1 = T.p(dd.a.x, dd.a.y); nm.P2 = T.p(dd.b.x, dd.b.y); nm.P3 = T.p(dd.t.x, dd.t.y); }
                nm.F = T.p(p[nn - 1].x, p[nn - 1].y); nm.G = T.p(p[0].x, p[0].y); nm.H = T.p(p[nn].x, p[nn].y);
                const guiaSisa = [];
                for (let i = 1; i < NA; i++) { T.p(p[nn + i].x, p[nn + i].y, "s" + i); guiaSisa.push("s" + i + " " + par(p[nn + i])); }
                const curvaEsc = [];
                if (nn > 2) for (let i = 1; i < nn - 1; i++) { T.p(p[i].x, p[i].y, String(i)); curvaEsc.push(i + " " + par(p[i])); }
                T.g(0, 0, 0, Lg); T.g(0, 0, B4, 0); T.g(B4, 0, B4, Lg); T.g(0, AD, B4, AD); T.g(0, Lg, B4, Lg);
                return { pz: pz, p: p, T: T, nm: nm, Lg: Lg, B4: B4, AD: AD, xh: xh, curvaEsc: curvaEsc, guiaSisa: guiaSisa };
            };
            const fr = torso(true), es = torso(false);
            const nw = fr ? fr.p[nn - 1].x : 0;
            const Wq = (m.cintura + o.holgCintura) / 4;
            const pasosTorso = function (t, frente) {
                const nm = t.nm, p = t.p, s2 = [];
                const dd = frente && t.pz.darts && t.pz.darts[0], nd = dd ? 2 : 0;
                const dN = p[0].y;
                const textoEscote = function () {
                    return "Escote: desde " + nm.A + " medí " + nfc(nw) + " cm hacia la derecha y marcá " + nm.F + ". Desde " + nm.A + " bajá " + nfc(dN) + " cm por el centro y marcá " + nm.G + " (fondo del escote" + (frente ? ", más profundo adelante" : ", más alto atrás") + "). " + (nn === 2 ? "Uní " + nm.G + " con " + nm.F + " con una recta (escote en V)." : "Uní " + nm.G + " con " + nm.F + " con una curva suave pasando por los puntos de guía (cm a la derecha de A ; cm hacia abajo desde A): " + t.curvaEsc.join(" · ") + ". El ancho del escote es cuello " + nfc(m.cuello) + " ÷ 5 + " + (o.escote === "bote" ? "4,5" : "1,5") + ".");
                };
                if (frente) {
                    s2.push("Trazá una línea horizontal de " + nfc(t.B4) + " cm: es el ancho del molde, 1/4 del busto ((busto " + nfc(m.busto) + " + holgura " + nfc(o.holgBusto) + ") ÷ 4). Marcá " + nm.A + " en la punta izquierda y " + nm.A2 + " en la derecha. Se traza solo 1/4 del cuerpo: el otro lado sale al doblez de la tela.");
                    s2.push("Desde " + nm.A + " y " + nm.A2 + " bajá una vertical de " + nfc(t.Lg) + " cm (largo de la prenda) y cerrá abajo con otra horizontal. Marcá " + nm.B + " (abajo izquierda). El lado " + nm.A + "-" + nm.B + " es el centro y va al doblez.");
                    s2.push("Desde " + nm.A + " bajá " + nfc(t.AD) + " cm sobre el centro y marcá " + nm.C + "; trazá una horizontal hasta el otro lado y marcá " + nm.D + " (línea de busto y sisa). Esa medida es busto ÷ 6 + 7,5 = " + nfc(m.busto) + " ÷ 6 + 7,5.");
                    if (hold) s2.push("Costado entallado: marcá " + nm.K + " a " + nfc(p[nn + NA + 1 + nd].x) + " cm del centro y " + nfc(p[nn + NA + 1 + nd].y) + " cm hacia abajo desde " + nm.A + " (cintura: (cintura " + nfc(m.cintura) + " + holgura " + nfc(o.holgCintura) + ") ÷ 4 = " + nfc(Wq) + "). Marcá " + nm.E + " en el bajo, a " + nfc(t.xh) + " cm del centro. Uní " + nm.D + ", " + nm.K + " y " + nm.E + " con una curva suave.");
                    else s2.push("Costado: uní " + nm.D + " con " + nm.E + " (esquina de abajo a la derecha) con una recta vertical.");
                    if (dd) {
                        const wP = Math.hypot(dd.b.x - dd.a.x, dd.b.y - dd.a.y);
                        s2.push("Pinza de busto: sobre el costado, a " + nfc(dd.a.y - t.AD) + " cm debajo de " + nm.D + ", marcá " + nm.P1 + " (" + par(dd.a) + "). Bajá " + nfc(wP) + " cm por el mismo costado y marcá " + nm.P2 + " (" + par(dd.b) + "): esa es la abertura de la pinza. Marcá la punta " + nm.P3 + " (" + par(dd.t) + ") y uní " + nm.P1 + " y " + nm.P2 + " con " + nm.P3 + " con rectas. La pinza termina antes del busto, no llega a él. El costado queda cortado por la pinza: de " + nm.D + " a " + nm.P1 + " recto, la abertura " + nm.P1 + "-" + nm.P2 + ", y de " + nm.P2 + " sigue hacia abajo, " + nfc(wP) + " cm más bajo (por eso " + nm.E + " queda a " + nfc(p[p.length - 2].y) + " cm y el bajo es una línea inclinada hasta " + nm.B + "). Al coser la pinza el bajo queda parejo.");
                    }
                    s2.push(textoEscote());
                    s2.push("Hombro: desde " + nm.A + " medí " + nfc(p[nn].x) + " cm hacia la derecha, bajá " + nfc(p[nn].y) + " cm y marcá " + nm.H + " (punta del hombro). Uní " + nm.F + " con " + nm.H + " con una recta: debe medir " + nfc(Math.hypot(p[nn].x - nw, p[nn].y)) + " cm.");
                    s2.push("Sisa: uní " + nm.H + " con " + nm.D + " con una curva suave, sin picos, que pase por los puntos de guía (cm a la derecha de A ; cm hacia abajo desde A): " + t.guiaSisa.join(" · ") + ". La curva sale casi vertical desde " + nm.H + ", se mete un poco hacia adentro y llega a " + nm.D + " casi horizontal (forma de U), así forma un ángulo parecido a una escuadra con el costado.");
                    s2.push("Piquete (1) sobre la sisa, a " + nfc(PN.largoPoli(PN.aplanar({ pts: p.slice(nn, nn + NA + 1), closed: false }, 12).pts, false) * PN.PIQ_SISA_DEL[0]) + " cm de " + nm.H + " medidos siguiendo la curva. Flecha de hilo paralela al centro, a " + nfc(t.pz.grain.a.x) + " cm de él.");
                    r.push({ h: "Delantero (cortar 1, al doblez)" });
                } else {
                    const fd = fr;
                    s2.push("La espalda es igual al delantero: calcalo sobre otro papel (rectángulo, línea de busto, costado, bajo y hombro quedan igual) y cambiá solo esto. Medidas: (cm a la derecha del centro ; cm hacia abajo desde " + nm.A + ").");
                    s2.push("Escote más alto: el fondo " + nm.G + " baja solo " + nfc(dN) + " cm (en el delantero baja " + nfc(fd.p[0].y) + " cm)." + (nn === 2 ? "" : " Los puntos de guía de la curva son: " + t.curvaEsc.join(" · ") + "."));
                    s2.push("Sisa de la espalda (igual a la del delantero): uní " + nm.H + " con " + nm.D + " con una curva suave pasando por los puntos de guía (cm a la derecha de A ; cm hacia abajo desde A): " + t.guiaSisa.join(" · ") + ".");
                    const lgA = PN.largoPoli(PN.aplanar({ pts: p.slice(nn, nn + NA + 1), closed: false }, 12).pts, false);
                    s2.push("Piquetes (2) sobre la sisa, a " + nfc(lgA * PN.PIQ_SISA_ESP[0]) + " y a " + nfc(lgA * PN.PIQ_SISA_ESP[1]) + " cm de " + nm.H + " medidos siguiendo la curva (la espalda lleva dos para no confundirla con el delantero).");
                    r.push({ h: "Espalda (cortar 1, al doblez): calcá el delantero y cambiá esto" });
                }
                r.push({ fig: t.pz, labels: t.T.lab, guias: t.T.guias });
                s2.forEach(function (x) { r.push(x); });
            };
            if (fr) pasosTorso(fr, true);
            if (es) pasosTorso(es, false);

            const man = buscarPz(piezas, "Manga");
            if (man) {
                const p = man.pts, li = man.lineas && man.lineas[0], T = new Marcas(), s = [];
                const nC = p.length - 2, N = nC - 1, M2 = N / 2, Lm = p[p.length - 1].y, Hc = li ? li.a.y : p[0].y, Wm = li ? li.b.x - li.a.x : (p[N].x - p[0].x);
                const hemW = p[p.length - 2].x - p[p.length - 1].x;
                const nA = T.p(0, 0), nB = T.p(0, Lm), nC2 = T.p(0, Hc), nD = T.p(-Wm / 2, Hc), nE = T.p(Wm / 2, Hc), nF = T.p(p[p.length - 2].x, Lm), nG = T.p(p[p.length - 1].x, Lm);
                const gDel = [], gEsp = [];
                for (let i = 1; i < M2; i++) { T.p(p[i].x, p[i].y, "d" + i); gDel.push("d" + i + " " + par(p[i])); }
                for (let i = M2 + 1; i < N; i++) { T.p(p[i].x, p[i].y, "e" + (i - M2)); gEsp.push("e" + (i - M2) + " " + par(p[i])); }
                T.g(0, 0, 0, Lm); T.g(-Wm / 2, Hc, Wm / 2, Hc);
                const largoCopa = PN.largoLados(man, 0, N - 1);
                const lgD = PN.largoLados(man, 0, M2 - 1), lgE = PN.largoLados(man, M2, N - 1);
                s.push("La manga se SACA DE LA SISA (la del delantero, que es igual a la de la espalda): 1) la mitad de arriba de la copa es la misma línea de la sisa; 2) lo que resta de sisa se copia al revés (dado vuelta sobre la recta que une la mitad con la axila); 3) se suaviza el empalme; 4) el eje de la manga sigue la línea del hombro y de ahí se mide el largo; 5) el lado de la espalda es el espejo del delantero con una pancita de 1 cm hacia afuera. Abajo está ya resuelto, con medidas.");
                s.push("Trazá una línea vertical de " + nfc(Lm) + " cm de largo: es el eje de la manga. Arriba marcá " + nA + " (punta de la copa, va a la punta del hombro) y abajo " + nB + " (bajo).");
                s.push("Desde " + nA + " bajá " + nfc(Hc) + " cm y marcá " + nC2 + " (altura de copa, línea del bíceps). Por " + nC2 + " trazá una horizontal de " + nfc(Wm) + " cm de largo total, " + nfc(Wm / 2) + " cm a cada lado del eje: marcá " + nD + " a la izquierda y " + nE + " a la derecha. Este ancho no se elige: sale de la sisa (brazo " + nfc(m.contornoBrazo) + " cm + " + nfc(Wm - m.contornoBrazo) + " cm de holgura).");
                s.push("En el bajo, centrado en " + nB + ", marcá " + nfc(hemW / 2) + " cm a cada lado: " + nG + " a la izquierda y " + nF + " a la derecha (el bajo mide " + nfc(hemW) + " cm). Uní " + nD + " con " + nG + " y " + nE + " con " + nF + " con rectas (esa recta es la costura de la axila al puño).");
                s.push("Escribí \"Del.\" a la izquierda del eje y \"Esp.\" a la derecha: el lado izquierdo de la copa es el delantero y el derecho la espalda.");
                s.push("Copa delantera (izquierda): uní " + nD + " con " + nA + " con una curva suave, sin picos, pasando por los puntos (cm a la derecha del eje, negativo = a la izquierda ; cm hacia abajo desde " + nA + "): " + gDel.join(" · ") + ". Mide " + nfc(lgD) + " cm, igual que la sisa del delantero.");
                s.push("Copa de la espalda (derecha): es la curva del delantero espejada hacia la derecha, pero con otra forma: una pancita de 1 cm hacia afuera, más llena hacia la axila. Uní " + nA + " con " + nE + " pasando por: " + gEsp.join(" · ") + ". Mide " + nfc(lgE) + " cm, igual que la sisa de la espalda.");
                s.push("Control: toda la copa de " + nD + " a " + nE + " pasando por " + nA + " mide " + nfc(largoCopa) + " cm. Si la sisa del delantero y la de la espalda miden " + nfc(fr ? PN.largoPoli(PN.aplanar({ pts: fr.p.slice(nn, nn + NA + 1), closed: false }, 12).pts, false) : 0) + " cm cada una, la copa tiene que dar eso por dos, justo.");
                s.push("Piquetes: uno en " + nA + " (hombro), UNO sobre la copa delantera y DOS sobre la copa de la espalda, a la misma proporción del largo que los piquetes de las sisas. Al coser, juntá piquete con piquete y repartí la holgura. Flecha de hilo sobre el eje.");
                r.push({ h: "Manga (cortar 2)" });
                r.push({ fig: man, labels: T.lab, guias: T.guias });
                s.forEach(function (x) { r.push(x); });
            }
            const tira = buscarPz(piezas, "Tira de cuello");
            if (tira) {
                const bb = PN.cajaDeShape(tira);
                r.push({ h: "Tira de cuello (cortar 1)" }, { fig: tira, labels: esquinasFig(tira), guias: [] },
                    "Trazá una horizontal de " + nfc(bb.x1 - bb.x0) + " cm y, a " + nfc(bb.y1 - bb.y0) + " cm hacia abajo, otra igual. Cerrá los lados: rectángulo de " + nfc(bb.x1 - bb.x0) + " × " + nfc(bb.y1 - bb.y0) + " cm (el largo es un poco menos que el contorno del escote, así la tira queda estirada y asienta).");
            }
            pasosFinal(o).forEach(function (x) { r.push(x); });

        // ================= PANTALÓN =================
        } else if (id === "pantalon") {
            const glu = 0;
            const Wq = (m.cintura + o.holgCintura) / 4;
            // Marcas con las mismas letras en delantero y trasero (así el trasero se explica por diferencias)
            const marcasPant = function (pz) {
                const p = pz.pts, T = new Marcas(), nm = {};
                const W0 = Math.max(p[5].x, p[1].x), Wp = p[2].x, tiro = p[5].y, ah = p[8].y, Lg = p[6].y;
                nm.A = T.p(0, 0); nm.A2 = T.p(W0, 0); nm.B = T.p(0, Lg); nm.B2 = T.p(W0, Lg);
                nm.C = T.p(0, ah); nm.D = T.p(0, tiro); nm.Q = T.p(Wp, ah);
                nm.H = T.p(p[2].x, p[2].y); nm.F = T.p(p[5].x, p[5].y); nm.G = T.p(p[1].x, p[1].y); nm.E = T.p(p[0].x, p[0].y);
                nm.I = T.p(p[6].x, p[6].y); nm.J = T.p(p[7].x, p[7].y);
                T.p(p[3].x, p[3].y, "1"); T.p(p[4].x, p[4].y, "2");
                T.g(0, 0, W0, 0); T.g(0, 0, 0, Lg); T.g(W0, 0, W0, Lg); T.g(0, Lg, W0, Lg);
                T.g(0, ah, W0, ah); T.g(0, tiro, W0, tiro); T.g(Wp, Math.min(0, p[1].y), Wp, tiro);
                return { T: T, nm: nm, p: p, pz: pz, W0: W0, Wp: Wp, tiro: tiro, ah: ah, Lg: Lg };
            };
            const pzF = buscarPz(piezas, "Pantalón Del."), pzT = buscarPz(piezas, "Pantalón Esp.");
            const F = pzF ? marcasPant(pzF) : null, Tr = pzT ? marcasPant(pzT) : null;
            const linAB = function (nm) { return "la línea " + nm.A + "-" + nm.B; };
            if (F) {
                const nm = F.nm, p = F.p, s2 = [];
                s2.push("Trazá una línea horizontal de " + nfc(F.W0) + " cm: es el ancho de la pierna a la altura del tiro (cadera ÷ 4 menos 1 cm, más lo que se abre la entrepierna). Marcá " + nm.A + " a la izquierda y " + nm.A2 + " a la derecha. Se traza solo media prenda: una pierna.");
                s2.push("Desde " + nm.A + " y " + nm.A2 + " bajá una vertical de " + nfc(F.Lg) + " cm (largo del pantalón) y cerrá abajo con otra horizontal. Marcá " + nm.B + " y " + nm.B2 + ". El lado " + nm.A + "-" + nm.B + " es el costado.");
                s2.push("Sobre " + nm.A + "-" + nm.B + " bajá " + nfc(F.ah) + " cm y marcá " + nm.C + " (cadera), y " + nfc(F.tiro) + " cm y marcá " + nm.D + " (tiro). Trazá una horizontal por cada una hasta el otro lado.");
                s2.push("En la línea de cadera, desde " + nm.C + " medí " + nfc(F.Wp) + " cm hacia la derecha y marcá " + nm.Q + ". Esa medida es (cadera " + nfc(m.cadera) + " + holgura " + nfc(o.holgCadera) + ") ÷ 4 menos 1 cm. Por " + nm.Q + " trazá una vertical hasta la línea de tiro: es el centro delantero.");
                s2.push("Sobre el centro marcá " + nm.H + ", a " + nfc(p[2].y) + " cm hacia abajo desde " + nm.A + ". Sobre la línea de tiro, desde la vertical de " + nm.Q + ", medí " + nfc(F.W0 - F.Wp) + " cm hacia la derecha y marcá " + nm.F + " (entrepierna): es (cadera + holgura) ÷ 16.");
                s2.push("Cintura en el centro: marcá " + nm.G + " " + ubic(p[1].x, p[1].y, linAB(nm), nm.A) + ". Uní " + nm.G + " con " + nm.H + " con una recta.");
                s2.push("Curva de entrepierna: uní " + nm.H + " con " + nm.F + " con una curva suave en forma de J acostada, pasando por los puntos de guía 1 " + par(p[3]) + " y 2 " + par(p[4]) + " (cm a la derecha de " + linAB(nm) + " ; cm hacia abajo desde " + nm.A + ").");
                s2.push("Bajo: desde " + nm.B + " medí " + nfc(p[7].x) + " cm hacia la derecha y marcá " + nm.J + "; seguí hasta " + nfc(p[6].x) + " cm de " + nm.B + " y marcá " + nm.I + ". El bajo mide " + nfc(p[6].x - p[7].x) + " cm (la botamanga " + nfc(o.boca) + " ÷ 2 menos 1).");
                s2.push("Uní " + nm.F + " con " + nm.I + " (pierna interior) y " + nm.J + " con " + nm.C + " (costado de la pierna) con rectas. " + nm.C + " queda justo sobre " + linAB(nm) + ".");
                s2.push("Costado de la cadera: marcá " + nm.E + " " + ubic(p[0].x, p[0].y, linAB(nm), nm.A) + ". Uní " + nm.C + " con " + nm.E + " con una curva suave que abrace la cadera.");
                const net = Wq - 0.5, dt = sumaPinzas(F.pz), lenC = PN.largoLados(F.pz, 0, 0);
                s2.push("Cintura: la recta " + nm.E + "-" + nm.G + " debe medir " + nfc(lenC) + " cm" + (Math.abs(lenC - (net + dt)) < 0.15 ? ": la cintura del molde (" + nfc(m.cintura + o.holgCintura) + " ÷ 4 menos 0,5 = " + nfc(net) + ")" + (dt > 0.05 ? " más " + nfc(dt) + " cm que se van en la pinza." : ".") : "."));
                const pin = pasosPinzas(F.pz, F.T, "desde " + linAB(nm));
                if (pin.length) pin.forEach(function (x) { s2.push(x); }); else s2.push("Sin pinza delantera: el sobrante de cintura ya se sacó en el costado.");
                s2.push("Piquetes en " + nm.C + " y a " + nfc(F.pz.notches[1].y) + " cm hacia abajo desde " + nm.A + " en las dos piernas (rodilla). Flecha de hilo vertical a " + nfc(F.pz.grain.a.x) + " cm de " + linAB(nm) + ".");
                r.push({ h: "Delantero (cortar 2: pierna derecha e izquierda)" });
                r.push({ fig: F.pz, labels: F.T.lab, guias: F.T.guias });
                s2.forEach(function (x) { r.push(x); });
            }
            if (F && Tr) {
                const nm = Tr.nm, p = Tr.p, s2 = [];
                s2.push("El trasero se arma sobre el delantero: calcá el delantero en otro papel (mismo largo, costado, línea de cadera y de tiro) y cambiá solo lo siguiente. Todas las medidas son (cm a la derecha de " + linAB(nm) + " ; cm hacia abajo desde " + nm.A + ").");
                s2.push("El centro trasero queda a " + nfc(Tr.Wp) + " cm del costado en la cadera ((cadera + holgura) ÷ 4 más 1 cm), en vez de " + nfc(F.Wp) + " cm. La entrepierna se abre " + nfc(Tr.W0 - Tr.Wp) + " cm desde ese centro ((cadera + holgura) ÷ 9" + (glu !== 0 ? ", ajustado por el volumen de glúteos" : "") + "), en vez de " + nfc(F.W0 - F.Wp) + " cm. El rectángulo base pasa a medir " + nfc(Tr.W0) + " cm de ancho.");
                s2.push("Cambiá estos puntos (delantero → trasero):");
                pasosDif(F.p, p, [{ i: 1, n: nm.G }, { i: 2, n: nm.H }, { i: 3, n: "1" }, { i: 4, n: "2" }, { i: 5, n: nm.F }, { i: 6, n: nm.I }, { i: 7, n: nm.J }, { i: 0, n: nm.E }], "delantero", "trasero").forEach(function (x) { s2.push(x); });
                {
                    const inclT = p[1].x - p[2].x, subeT = -p[1].y;
                    s2.push("El centro trasero " + nm.G + "-" + nm.H + (inclT > 0.15 ? " es una recta inclinada: la cintura trasera se corre " + nfc(inclT) + " cm a la derecha para cubrir la cola" : " es una recta vertical, sin inclinación") + (subeT > 0.1 ? " y la cintura trasera sube " + nfc(subeT) + " cm respecto de la delantera (tiro trasero más alto)" : "") + ". Uní " + nm.H + " con " + nm.F + " con la misma curva en J, pero más pronunciada.");
                }
                const net = Wq + 0.5, dt = sumaPinzas(Tr.pz), lenC = PN.largoLados(Tr.pz, 0, 0);
                s2.push("Cintura: la recta " + nm.E + "-" + nm.G + " debe medir " + nfc(lenC) + " cm" + (Math.abs(lenC - (net + dt)) < 0.15 ? ": la cintura del molde (" + nfc(m.cintura + o.holgCintura) + " ÷ 4 más 0,5 = " + nfc(net) + ")" + (dt > 0.05 ? " más " + nfc(dt) + " cm que se van en la pinza." : ".") : "."));
                const pin = pasosPinzas(Tr.pz, Tr.T, "desde " + linAB(nm));
                if (pin.length) pin.forEach(function (x) { s2.push(x); }); else s2.push("Sin pinza trasera: el sobrante de cintura ya se sacó en el costado.");
                s2.push("Los piquetes de rodilla y el hilo van igual que en el delantero.");
                r.push({ h: "Trasero (cortar 2): calcá el delantero y cambiá esto" });
                r.push({ fig: Tr.pz, labels: Tr.T.lab, guias: Tr.T.guias });
                s2.forEach(function (x) { r.push(x); });
            }
            pasosPretina(piezas).forEach(function (x) { r.push(x); });
            pasosFinal(o).forEach(function (x) { r.push(x); });

        // ================= RECTÁNGULO =================
        } else if (id === "rectangulo") {
            if (piezas[0]) r.push({ fig: piezas[0], labels: esquinasFig(piezas[0]), guias: [] });
            r.push("Trazá una línea horizontal de " + nfc(o.ancho) + " cm.");
            r.push("Desde cada extremo bajá una vertical de " + nfc(o.alto) + " cm y cerrá abajo con otra horizontal de " + nfc(o.ancho) + " cm.");
            if (o.radio > 0) r.push("Redondeá las 4 esquinas con un radio de " + nfc(o.radio) + " cm (apoyá un vaso o una tapa de ese tamaño).");
            r.push("Cortar " + o.cant + ". Margen de costura " + nfc(o.margen) + " cm.");
        }
        return r;
    }

    function paginaArmado(pdf, proy, plan, op, titulo) {
        const papel = PAPELES[op.papel] || PAPELES.A4;
        const W = papel.w, H = papel.h, M = 2 * K;
        let pg, y;
        const nueva = function () {
            pg = pdf.pagina(W, H);
            pg.texto(W / 2, 20, "NIVAN · Armado ficha técnica", 7, { alin: "c", color: GRIS });
            y = H - M;
        };
        const necesita = function (h) { if (y - h < M * 0.6) nueva(); };
        const parrafo = function (t, size, x, bold) {
            const maxW = W - M - x, pal = String(t).split(" ");
            let lin = "";
            const sacar = function () { necesita(size * 1.4); pg.texto(x, y, lin, size, { bold: bold }); y -= size * 1.4; lin = ""; };
            pal.forEach(function (p) {
                const cand = lin ? lin + " " + p : p;
                if (lin && anchoTexto(cand, size, bold) > maxW) { sacar(); lin = p; } else lin = cand;
            });
            if (lin) sacar();
            y -= size * 0.35;
        };
        const titulito = function (t) {
            necesita(170); y -= 8;
            pg.texto(M, y, t, 12, { bold: true }); y -= 4;
            pg.q(); pg.trazo(0.15, 0.15, 0.15); pg.grosor(0.8); pg.linea(M, y, W - M, y); pg.Q();
            y -= 13;
        };
        // Tabla de puntos de una pieza, medidos desde la esquina superior izquierda del molde
        const tabla = function (s) {
            const bb = PN.cajaDeShape(s);
            necesita(40);
            pg.texto(M, y, "Puntos de «" + (s.name || "Pieza") + "» (cm desde la esquina superior izquierda)", 9, { bold: true }); y -= 12;
            const cols = 4, cw = (W - 2 * M) / cols;
            const lista = s.pts.map(function (p, i) { return (i + 1) + (p.s ? "~" : "") + "  (" + nfc(p.x - bb.x0) + " ; " + nfc(p.y - bb.y0) + ")"; });
            for (let i = 0; i < lista.length; i += cols) {
                necesita(11);
                for (let c = 0; c < cols && i + c < lista.length; c++) pg.texto(M + c * cw, y, lista[i + c], 8);
                y -= 11;
            }
            y -= 4;
        };
        // Figura guía de UNA pieza: el molde con líneas guía punteadas y los puntos con letra de los pasos
        const figura = function (it) {
            const s = it.fig, bb = PN.cajaDeShape(s);
            let x0 = bb.x0, y0 = bb.y0, x1 = bb.x1, y1 = bb.y1;
            const ext = function (q) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); };
            (it.labels || []).forEach(function (l) { ext(l.p); });
            (it.guias || []).forEach(function (g) { ext(g.a); ext(g.b); });
            const pad = 2.2; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
            const bw = x1 - x0, bh = y1 - y0;
            const k = Math.min((W - 2 * M) / bw, 400 / bh, 3 * K);
            necesita(bh * k + 16);
            const ox = M + ((W - 2 * M) - bw * k) / 2, top = y;
            const map = function (x, yy) { return [ox + (x - x0) * k, top - (yy - y0) * k]; };
            pg.q(); pg.trazo(0.55, 0.55, 0.55); pg.grosor(0.5); pg.guiones([4, 3]);
            (it.guias || []).forEach(function (g) { const a = map(g.a.x, g.a.y), b = map(g.b.x, g.b.y); pg.linea(a[0], a[1], b[0], b[1]); });
            pg.Q();
            dibujarShapes(pg, [s], map, k, { margen: false, talle: "", fs: 7 });
            // Letras de los puntos: se corren un poco si dos quedarían encimadas
            const ocupado = [];
            const choca = function (a) { return ocupado.some(function (b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }); };
            (it.labels || []).forEach(function (l) {
                const q = map(l.p.x, l.p.y);
                pg.q(); pg.relleno(AZUL[0], AZUL[1], AZUL[2]); pg.rect(q[0] - 1.3, q[1] - 1.3, 2.6, 2.6, "f"); pg.Q();
                const tw = anchoTexto(l.t, 8.5, true);
                const cand = [[3, 3], [3, -9], [-tw - 3, 3], [-tw - 3, -9], [3, 11], [-tw - 3, 11], [3, -17], [-tw - 3, -17]];
                let el = cand[0];
                for (let i = 0; i < cand.length; i++) {
                    const c = cand[i];
                    if (!choca({ x: q[0] + c[0], y: q[1] + c[1], w: tw, h: 8 })) { el = c; break; }
                }
                ocupado.push({ x: q[0] + el[0], y: q[1] + el[1], w: tw, h: 8 });
                pg.texto(q[0] + el[0], q[1] + el[1], l.t, 8.5, { bold: true, color: AZUL });
            });
            y -= bh * k + 12;
        };

        // ---- Dibujito por paso: muestra cómo va quedando el molde ----
        const MINI_W = 170, MINI_H = 130;
        const partir = function (t, size, maxW, bold) {
            const pal = String(t).split(" "), out = [];
            let lin = "";
            pal.forEach(function (w) {
                const cand = lin ? lin + " " + w : w;
                if (lin && anchoTexto(cand, size, bold) > maxW) { out.push(lin); lin = w; } else lin = cand;
            });
            if (lin) out.push(lin);
            return out;
        };
        const mencionaLabel = function (t, nombre) {
            if (!nombre) return false;
            const e = String(nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const L = "A-Za-z0-9ÁÉÍÓÚÜáéíóúüñÑ";
            const re = /^\d+$/.test(nombre) ? new RegExp("(^|[^0-9,.])" + e + " \\(", "g") : new RegExp("(^|[^" + L + "])" + e + "(?![" + L + "])", "g");
            let m;
            while ((m = re.exec(t))) {
                const pos = m.index + m[1].length;
                if (nombre === "A" && (pos === 0 || /[.:]\s$/.test(t.slice(Math.max(0, pos - 2), pos)))) continue; // "A" preposición al inicio de frase
                return true;
            }
            return false;
        };
        // Qué puntos ya están marcados en cada paso (según las letras que nombra el texto)
        const revelacion = function (it, textos) {
            const labels = it.labels || [], n = textos.length, vistos = {}, out = [];
            const por = textos.map(function (t) { const l = []; labels.forEach(function (lb, i) { if (mencionaLabel(t, lb.t)) l.push(i); }); return l; });
            const fallback = por.every(function (l) { return !l.length; });
            textos.forEach(function (t, k) {
                const nuevos = [];
                if (fallback) { for (let i = Math.ceil(labels.length * k / n); i < Math.ceil(labels.length * (k + 1) / n); i++) nuevos.push(i); }
                else por[k].forEach(function (i) { if (!vistos[i]) nuevos.push(i); });
                nuevos.forEach(function (i) { vistos[i] = true; });
                if (k === n - 1) labels.forEach(function (_, i) { if (!vistos[i]) { vistos[i] = true; nuevos.push(i); } });
                out.push({ rev: Object.keys(vistos).map(Number), nuevos: nuevos, ultimo: k === n - 1, conecta: fallback });
            });
            return out;
        };
        const miniatura = function (it, rv, bx, yTop, num) {
            const s = it.fig, bb = PN.cajaDeShape(s), labels = it.labels || [], guias = it.guias || [];
            let x0 = bb.x0, y0 = bb.y0, x1 = bb.x1, y1 = bb.y1;
            const ext = function (q) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); };
            labels.forEach(function (l) { ext(l.p); });
            guias.forEach(function (g) { ext(g.a); ext(g.b); });
            const pad = 2; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
            const bw = x1 - x0, bh = y1 - y0;
            const k = Math.min((MINI_W - 10) / bw, (MINI_H - 10) / bh, 3 * K);
            const ox = bx + (MINI_W - bw * k) / 2, top = yTop - (MINI_H - bh * k) / 2;
            const map = function (x, yy) { return [ox + (x - x0) * k, top - (yy - y0) * k]; };
            const rev = {}, nue = {};
            rv.rev.forEach(function (i) { rev[i] = true; }); rv.nuevos.forEach(function (i) { nue[i] = true; });
            const eq = function (a, b) { return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05; };
            const info = function (pt) {
                let any = false, r = false;
                labels.forEach(function (l, i) { if (eq(l.p, pt)) { any = true; if (rev[i]) r = true; } });
                return { any: any, rev: r };
            };
            pg.q();
            pg.q(); pg.trazo(0.7, 0.7, 0.7); pg.grosor(0.5); pg.guiones([]); pg.rect(bx, yTop - MINI_H, MINI_W, MINI_H, "S"); pg.Q();
            pg.clip(bx, yTop - MINI_H, MINI_W, MINI_H);
            // guías punteadas ya trazadas
            pg.q(); pg.trazo(0.55, 0.55, 0.55); pg.grosor(0.4); pg.guiones([3, 2.5]);
            guias.forEach(function (g) {
                const ea = info(g.a), eb = info(g.b);
                const ver = rv.ultimo || ((ea.rev || eb.rev) && (ea.rev || !ea.any) && (eb.rev || !eb.any));
                if (!ver) return;
                const a = map(g.a.x, g.a.y), b = map(g.b.x, g.b.y);
                pg.linea(a[0], a[1], b[0], b[1]);
            });
            pg.Q();
            if (rv.ultimo) dibujarShapes(pg, [s], map, k, { margen: false, talle: "", fs: 6, sinRotulo: true });
            else {
                // contorno final apenas insinuado
                pg.q(); pg.trazo(0.86, 0.86, 0.86); pg.grosor(0.5); pg.guiones([2, 2]);
                pg.poli(mapPts(PN.aplanar(s, 10).pts, map), !!s.closed, "S"); pg.Q();
                if (rv.conecta) {
                    const q = rv.rev.slice().sort(function (a, b) { return a - b; }).map(function (i) { const m = map(labels[i].p.x, labels[i].p.y); return m; });
                    if (q.length > 1) { pg.q(); pg.trazo(0, 0, 0); pg.grosor(1); pg.guiones([]); pg.poli(q, false, "S"); pg.Q(); }
                }
            }
            // puntos y letras
            const NAR = [0.9, 0.4, 0.0];
            const ocupado = [];
            const choca = function (a) { return ocupado.some(function (b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }); };
            labels.forEach(function (l, i) {
                if (!rev[i]) return;
                const q = map(l.p.x, l.p.y), col = nue[i] ? NAR : AZUL;
                pg.q(); pg.relleno(col[0], col[1], col[2]); pg.rect(q[0] - 1.6, q[1] - 1.6, 3.2, 3.2, "f"); pg.Q();
                if (!l.t) return;
                const tw = anchoTexto(l.t, 7, true);
                const cand = [[3, 3], [3, -9], [-tw - 3, 3], [-tw - 3, -9], [3, 11], [-tw - 3, 11]];
                let el = cand[0];
                for (let c = 0; c < cand.length; c++) { if (!choca({ x: q[0] + cand[c][0], y: q[1] + cand[c][1], w: tw, h: 7 })) { el = cand[c]; break; } }
                ocupado.push({ x: q[0] + el[0], y: q[1] + el[1], w: tw, h: 7 });
                pg.texto(q[0] + el[0], q[1] + el[1], l.t, 7, { bold: true, color: col });
            });
            pg.Q();
            // número de paso
            pg.q(); pg.relleno(1, 1, 1); pg.rect(bx + 1, yTop - 11, 36, 10, "f"); pg.Q();
            pg.texto(bx + 3, yTop - 9, "Paso " + num, 7, { bold: true, color: GRIS });
        };
        const pasoConMini = function (num, texto, it, rv) {
            const bx = W - M - MINI_W, tx = M + 6, maxW = bx - 10 - tx;
            const lineas = partir(num + ". " + texto, 9, maxW, false);
            const alto = Math.max(lineas.length * 9 * 1.4, MINI_H - 4) + 8;
            necesita(alto);
            const base = y;
            lineas.forEach(function (l, i) { pg.texto(tx, base - i * 9 * 1.4, l, 9); });
            miniatura(it, rv, bx, base + 8, num);
            y -= alto;
        };

        nueva();
        pg.texto(M, y - 20, titulo, 22, { bold: true });
        y -= 40;
        pg.texto(M, y, "Armado ficha técnica · cómo trazar y armar el molde", 11, { color: GRIS });
        y -= 14;
        parrafo("Con esta hoja podés hacer el molde sin imprimir las hojas a escala real: solo necesitás papel (de molde, madera o diario pegado), regla larga, escuadra, cinta métrica y lápiz. Todo se mide en cm.", 9, M, false);
        parrafo("Cómo leerla: cada letra (A, B, C…) es un punto del dibujo azul. «A la derecha» y «hacia abajo» se miden mirando el papel con A arriba a la izquierda. Los puntos con número (1, 2…) son guías para trazar curvas: marcalos y uní todo con una línea suave. Las líneas punteadas del dibujo son las guías que se trazan primero. Cada paso trae un dibujito de cómo te tiene que ir quedando el molde: lo que se marca en ese paso va en NARANJA y lo que ya hiciste antes en azul; en el último paso del molde se ve terminado.", 9, M, false);

        const gens = (proy.gens || []).filter(function (g) {
            return PN.GENERADORES.filter(function (x) { return x.id === g.id; })[0] && plan.shapes.some(function (s) { return s.gen === g.id; });
        });
        gens.forEach(function (g) {
            const gen = PN.GENERADORES.filter(function (x) { return x.id === g.id; })[0];
            let piezas = [];
            try { piezas = gen.gen(g.medidas, g.params); } catch (e) { piezas = []; }
            titulito(gen.nombre);
            parrafo("Medidas usadas (cm): " + [["altura", "altura"], ["busto", "busto"], ["cintura", "cintura"], ["cadera", "cadera"]].filter(function (a) { return g.medidas[a[0]] != null; }).map(function (a) { return a[1] + " " + nfc(g.medidas[a[0]]); }).join(" · ") + ".", 9, M, false);
            let n = 0;
            let pasos = [];
            try { pasos = pasosDeGenerador(g.id, g.medidas, g.params, piezas); } catch (e) { pasos = []; }
            for (let idx = 0; idx < pasos.length; idx++) {
                const p = pasos[idx];
                if (typeof p === "string") { n++; parrafo(n + ". " + p, 9, M + 6, false); }
                else if (p.fig) {
                    y -= 2; figura(p);
                    necesita(MINI_H + 24);
                    pg.texto(M, y, "Paso a paso: así te tiene que ir quedando (naranja = lo que marcás en ese paso)", 8, { bold: true, color: GRIS });
                    y -= 10;
                    const textos = [];
                    let j = idx + 1;
                    while (j < pasos.length && typeof pasos[j] === "string") { textos.push(pasos[j]); j++; }
                    if (textos.length) {
                        const rvs = revelacion(p, textos);
                        textos.forEach(function (t, kk) { n++; pasoConMini(n, t, p, rvs[kk]); });
                    }
                    idx = j - 1;
                }
                else if (p.h) {
                    // el título no se queda solo al final de una hoja: si sigue un dibujo, pasa con él a la hoja nueva
                    necesita(pasos[idx + 1] && pasos[idx + 1].fig ? 320 : 40);
                    y -= 6; pg.texto(M, y, p.h, 10, { bold: true }); y -= 14; n = 0;
                }
            }
            if (g.id !== "falda_circular" && g.id !== "rectangulo") {
                y -= 6;
                parrafo("Tabla de control (opcional): si preferís, podés trazar cada pieza marcando estos puntos desde la esquina superior izquierda de un rectángulo del tamaño de la pieza.", 8, M, false);
                piezas.forEach(function (s) { if (s.t === "path" && s.pieza && s.pts.length <= 60) tabla(s); });
                necesita(12);
                pg.texto(M, y, "~ = punto de curva: unilo con el anterior y el siguiente con una línea suave.", 7.5, { color: GRIS }); y -= 12;
            }
            parrafo("Nota: estas instrucciones corresponden al patrón base original; si lo modificaste en el editor, el molde puede diferir.", 8, M, false);
        });

        // Piezas dibujadas a mano o importadas (sin generador): se enseñan por sus puntos
        const manuales = plan.shapes.filter(function (s) { return s.t === "path" && s.closed && s.pieza && !s.gen && s.pts.length <= 80; });
        if (manuales.length) {
            titulito("Piezas dibujadas a mano");
            parrafo("Para trazar cada pieza: dibujá un rectángulo guía del tamaño que se indica, marcá los puntos con estas medidas (cm a la derecha ; cm hacia abajo, desde la esquina superior izquierda del rectángulo) y unilos en orden. Los puntos con ~ van unidos con curva suave.", 9, M, false);
            y -= 4;
            manuales.forEach(function (s) {
                const bb = PN.cajaDeShape(s);
                necesita(30);
                parrafo("«" + (s.name || "Pieza") + "»: rectángulo guía de " + nfc(bb.x1 - bb.x0) + " cm de ancho por " + nfc(bb.y1 - bb.y0) + " cm de alto.", 9, M, true);
                tabla(s);
            });
        }
        if (!gens.length && !manuales.length) parrafo("Todavía no hay piezas de patrón para explicar. Generá un patrón o marcá piezas en el editor.", 9, M, false);
    }

    // --- Vista general en una sola hoja ---
    function paginaGeneral(pdf, proy, plan, op, titulo, opDib) {
        const papel = PAPELES[op.papel] || PAPELES.A4;
        const bw = plan.bb.x1 - plan.bb.x0, bh = plan.bb.y1 - plan.bb.y0;
        const M = 1.5 * K;
        // Elegimos la orientación que mejor aprovecha la hoja
        const opciones = [[papel.w, papel.h], [papel.h, papel.w]].map(function (d) {
            const k = Math.min((d[0] - 2 * M) / bw, (d[1] - 3 * M) / bh);
            return { W: d[0], H: d[1], k: k };
        });
        const sel = opciones[0].k >= opciones[1].k ? opciones[0] : opciones[1];
        const pg = pdf.pagina(sel.W, sel.H);
        const k = Math.min(sel.k, 4 * K);
        const ox = (sel.W - bw * k) / 2 - plan.bb.x0 * k;
        const oy = sel.H - M - 14 - ((sel.H - 2 * M - 14 - bh * k) / 2) + plan.bb.y0 * k;
        const map = function (x, y) { return [ox + x * k, oy - y * k]; };
        encabezado(pg, titulo, "Vista general · no es a escala real", sel.W, sel.H, M * 0.7);
        dibujarShapes(pg, plan.shapes, map, k, { margen: opDib.margen, talle: opDib.talle, fs: 7 });
        const esc = K / k;
        pg.texto(sel.W / 2, 22, "Escala aproximada 1:" + coma(esc, 1) + " · Para cortar usá las hojas a escala real (1:1)", 8, { alin: "c", color: GRIS });
        // Barra de 10 cm a esa escala
        pg.q(); pg.trazo(0, 0, 0); pg.grosor(1); pg.linea(M, 40, M + 10 * k, 40); pg.linea(M, 37, M, 43); pg.linea(M + 10 * k, 37, M + 10 * k, 43); pg.Q();
        pg.texto(M + 5 * k, 45, "10 cm", 7, { alin: "c" });
    }

    // --- Hojas a escala real ---
    function paginasEscalaReal(pdf, proy, plan, op, titulo, opDib) {
        const W = plan.W, H = plan.H, M = plan.M;
        plan.tiles.forEach(function (t) {
            if (!t.inc) return;
            const pg = pdf.pagina(W, H);
            const etiqueta = PN.etiquetaHoja(t.r, t.c);
            const map = function (x, y) { return [M + (x - t.x) * K, H - M - (y - t.y) * K]; };

            pg.q();
            pg.clip(M, M, plan.cw * K, plan.ch * K);
            const visibles = plan.shapes.filter(function (s, i) {
                const b = plan.cajas[i];
                return b.x1 >= t.x && b.x0 <= t.x + plan.cw && b.y1 >= t.y && b.y0 <= t.y + plan.ch;
            });
            dibujarShapes(pg, visibles, map, K, { margen: opDib.margen, talle: opDib.talle, fs: 8.5 });
            pg.Q();

            // Marcas de esquina
            pg.q(); pg.trazo(0, 0, 0); pg.grosor(0.8); pg.guiones([]);
            const L = 14;
            [[M, M, -1, -1], [W - M, M, 1, -1], [M, H - M, -1, 1], [W - M, H - M, 1, 1]].forEach(function (c) {
                pg.linea(c[0], c[1], c[0] + c[2] * L, c[1]);
                pg.linea(c[0], c[1], c[0], c[1] + c[3] * L);
            });
            pg.Q();

            // Líneas de empalme (donde empieza la hoja vecina)
            pg.q(); pg.trazo(0.7, 0.7, 0.7); pg.grosor(0.4); pg.guiones([3, 3]);
            if (t.c < plan.cols - 1) { const x = M + (plan.cw - plan.ov) * K; pg.linea(x, M, x, H - M); }
            if (t.r < plan.rows - 1) { const y = H - M - (plan.ch - plan.ov) * K; pg.linea(M, y, W - M, y); }
            pg.Q();

            // Etiqueta grande de hoja (en una esquina, sobre el contenido no molesta: es chica y gris)
            pg.texto(W / 2, H - M + 7, titulo + "  ·  Hoja " + etiqueta, 9, { alin: "c", bold: true });
            // Vecinas
            const vec = function (r, c) { return (r >= 0 && c >= 0 && r < plan.rows && c < plan.cols) ? PN.etiquetaHoja(r, c) : null; };
            const arr = vec(t.r - 1, t.c), abj = vec(t.r + 1, t.c), izq = vec(t.r, t.c - 1), der = vec(t.r, t.c + 1);
            if (arr) pg.texto(M + 10, H - M + 7, "^ " + arr, 8, { color: GRIS });
            if (abj) pg.texto(M + 10, M - 14, "v " + abj, 8, { color: GRIS });
            if (izq) pg.texto(M - 6, H / 2, "< " + izq, 8, { color: GRIS, rot: 90, alin: "c" });
            if (der) pg.texto(W - M + 12, H / 2, der + " >", 8, { color: GRIS, rot: -90, alin: "c" });
            pg.texto(W - M, H - M + 7, "fila " + (t.r + 1) + "/" + plan.rows + " · col " + (t.c + 1) + "/" + plan.cols, 7, { alin: "r", color: GRIS });

            // Pie: regla de 5 cm y aviso
            pg.q(); pg.trazo(0, 0, 0); pg.grosor(1); pg.guiones([]);
            const yb = M - 15;
            pg.linea(M + 70, yb, M + 70 + 5 * K, yb);
            for (let i = 0; i <= 5; i++) pg.linea(M + 70 + i * K, yb - 2, M + 70 + i * K, yb + (i % 5 === 0 ? 4 : 2.5));
            pg.Q();
            pg.texto(M + 72 + 5 * K, yb - 2.5, "5 cm", 7);
            pg.texto(W - M, yb - 2.5, "Imprimir al 100% · sin ajustar a la página", 7, { alin: "r", color: GRIS });
        });
    }

    if (typeof module !== "undefined" && module.exports) module.exports = PN;
})(typeof window !== "undefined" ? window : globalThis);
