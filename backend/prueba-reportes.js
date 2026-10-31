// Prueba de reportes y suspensiones parciales. Arrancá el servidor con:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  ADMIN_CLAVE=ClaveDelPanel123 node prueba-reportes.js
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const CLAVE = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
function pedir(metodo, ruta, cuerpo, cookie) {
    return new Promise(function (ok, mal) {
        const u = new URL(ruta, BASE), d = cuerpo === undefined ? null : JSON.stringify(cuerpo);
        const h = {}; if (d !== null) h['Content-Type'] = 'application/json'; if (cookie) h.Cookie = cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, c: sc ? [].concat(sc)[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
const get = function (ruta, cookie) { return pedir('GET', ruta, undefined, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + JSON.stringify(x))); if (!c) fallos++; }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = r.c;
    r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Vende Dora', email: 'vende' + t + '@gmail.com', password: pw, pais: 'UY' });
    const vend = r.c, idVend = r.j.usuario.id, mailVend = 'vende' + t + '@gmail.com';
    r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Repor Tante', email: 'repo' + t + '@gmail.com', password: pw, pais: 'UY' });
    const repo = r.c;
    r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Repor Dos', email: 'repo2' + t + '@gmail.com', password: pw, pais: 'UY' });
    const repo2 = r.c;
    await post('/api/verificacion', { fotos: { dniFrente: PNG, dniDorso: PNG, rostro: PNG } }, vend);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'pend1', nombre: 'Pendiente', precio: 100, pais: 'UY', medios: [] } }, vend);
    chequear('(preparación) con la verificación pendiente NO puede publicar → 403', r.e === 403, r);
    await post('/api/admin/entrar', { clave: CLAVE }, admin);
    await post('/api/admin/verificacion/resolver', { usuarioId: idVend, decision: 'aprobada' }, admin);
    await post('/api/admin/salir', {}, admin);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'rep1', nombre: 'Campera sospechosa', precio: 100, pais: 'UY', medios: [] } }, vend);
    chequear('(preparación) la vendedora publicó', r.e === 200, r);
    const hay = async function () { const l = await get('/api/publicaciones?pais=UY'); return (l.j.publicaciones || []).some(function (p) { return String(p.id) === 'rep1'; }); };

    console.log('Reportar');
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'rep1', motivo: 'estafa' });
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'rep1', motivo: 'estafa', detalle: 'Pide plata por fuera' }, repo);
    chequear('Una persona reporta una publicación → 200', r.e === 200, r);
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'rep1', motivo: 'estafa' }, repo);
    chequear('El mismo reporte dos veces → 409', r.e === 409, r.e);
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'rep1', motivo: 'inventado' }, repo2);
    chequear('Motivo inventado → 400', r.e === 400, r.e);
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'rep1', motivo: 'estafa' }, vend);
    chequear('No podés reportar lo tuyo → 400', r.e === 400, r.e);
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'noexiste', motivo: 'spam' }, repo);
    chequear('Publicación que no existe → 404', r.e === 404, r.e);
    r = await post('/api/reportes', { tipo: 'publicacion', objetivoId: 'rep1', motivo: 'spam', detalle: '<b>x</b>' }, repo2);
    chequear('Segunda persona reporta → 200', r.e === 200, r);
    r = await post('/api/reportes', { tipo: 'usuario', objetivoId: idVend, motivo: 'suplantacion' }, repo);
    chequear('También se puede reportar una cuenta → 200', r.e === 200, r);

    console.log('\nQuién ve los reportes');
    r = await post('/api/admin/reportes/objetivo', { tipo: 'publicacion', objetivoId: 'rep1' }, repo);
    chequear('Cuenta común → 403', r.e === 403, r.e);
    r = await post('/api/admin/reportes/objetivo', { tipo: 'publicacion', objetivoId: 'rep1' }, admin);
    chequear('Admin sin la clave → 423', r.e === 423, r.e);
    await post('/api/admin/entrar', { clave: CLAVE }, admin);
    r = await post('/api/admin/reportes/objetivo', { tipo: 'publicacion', objetivoId: 'rep1' }, admin);
    chequear('Admin con la clave ve la cuenta y los 2 reportes', r.e === 200 && r.j.reportes.length === 2 && r.j.cuenta.email === mailVend && r.j.objetivo.nombre === 'Campera sospechosa', r.j);
    chequear('Muestra el motivo en palabras y quién reportó', r.j.reportes.some(function (x) { return x.motivo === 'Estafa o intento de fraude' && x.por === 'Repor Tante' && x.detalle === 'Pide plata por fuera'; }), r.j.reportes);
    chequear('Cuenta con 3 reportes en total (2 + 1 de la cuenta)', r.j.totalesCuenta && r.j.totalesCuenta.total === 3, r.j.totalesCuenta);
    chequear('Sin código raro en el detalle', !JSON.stringify(r.j.reportes).includes('<b>'), r.j.reportes);

    console.log('\nSuspender solo para vender');
    r = await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'temporal', alcance: 'vender', dias: 7, motivo: 'Publicación engañosa', reporte: { tipo: 'publicacion', objetivoId: 'rep1' } }, admin);
    chequear('Se aplica → 200', r.e === 200 && r.j.cuenta.baneo.alcance === 'vender', r);
    r = await get('/api/yo', vend);
    chequear('Sigue pudiendo entrar y la app sabe que no puede vender', r.e === 200 && r.j.usuario.restriccion && r.j.usuario.restriccion.vender === true && r.j.usuario.restriccion.comprar === false, r.j);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'rep2', nombre: 'Otra', precio: 100, pais: 'UY', medios: [] } }, vend);
    chequear('No puede publicar → 403 con el motivo', r.e === 403 && /vender/.test(r.j.error) && /engañosa/.test(r.j.error), r.j);
    chequear('Su publicación deja de verse', !(await hay()), 'sigue visible');
    r = await post('/api/admin/reportes/objetivo', { tipo: 'publicacion', objetivoId: 'rep1' }, admin);
    chequear('Los reportes quedan como resueltos', r.j.reportes.every(function (x) { return x.estado === 'resuelto'; }), r.j.reportes);

    console.log('\nSuspender solo para comprar');
    r = await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'temporal', alcance: 'comprar', dias: 3, motivo: 'Contracargos' }, admin);
    r = await get('/api/yo', vend);
    chequear('La app sabe que no puede comprar, pero sí vender', r.j.usuario.restriccion && r.j.usuario.restriccion.comprar === true && r.j.usuario.restriccion.vender === false, r.j);
    chequear('Su publicación vuelve a verse (solo se le frenó comprar)', await hay(), 'no se ve');
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'rep1', nombre: 'Campera sospechosa', precio: 100, pais: 'UY', medios: [] } }, vend);
    chequear('Puede publicar', r.e === 200, r);

    console.log('\nComprar y vender a la vez');
    await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'temporal', alcance: 'comprar_vender', dias: 1, motivo: 'Revisión' }, admin);
    r = await get('/api/yo', vend);
    chequear('Las dos restricciones activas', r.j.usuario.restriccion && r.j.usuario.restriccion.comprar && r.j.usuario.restriccion.vender, r.j);

    console.log('\nCasos que se rechazan');
    r = await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'permanente', alcance: 'vender', motivo: 'Prueba' }, admin);
    chequear('Permanente "solo vender" → 400 (el permanente es de toda la cuenta)', r.e === 400, r.e);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'temporal', alcance: 'volar', dias: 2, motivo: 'Prueba' }, admin);
    chequear('Alcance inventado → 400', r.e === 400, r.e);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'temporal', alcance: 'vender', dias: 2, motivo: '' }, admin);
    chequear('Sin motivo → 400', r.e === 400, r.e);

    console.log('\nQuitar la suspensión');
    r = await post('/api/admin/cuenta/desbanear', { usuarioId: idVend }, admin);
    r = await get('/api/yo', vend);
    chequear('Queda sin restricciones', r.e === 200 && !r.j.usuario.restriccion, r.j);

    console.log('\nDescartar reportes');
    r = await post('/api/reportes', { tipo: 'usuario', objetivoId: idVend, motivo: 'spam' }, repo2);
    r = await post('/api/admin/reportes/descartar', { tipo: 'usuario', objetivoId: idVend }, admin);
    chequear('Se descartan → 200', r.e === 200, r);
    r = await post('/api/admin/reportes/objetivo', { tipo: 'usuario', objetivoId: idVend }, admin);
    chequear('Quedan como descartados', r.j.reportes.every(function (x) { return x.estado !== 'pendiente'; }), r.j.reportes);

    console.log('\nBaneo permanente (el de siempre)');
    r = await post('/api/admin/cuenta/banear', { usuarioId: idVend, tipo: 'permanente', motivo: 'Estafa comprobada' }, admin);
    chequear('Se aplica', r.e === 200 && r.j.cuenta.baneo.permanente, r);
    r = await post('/api/login', { email: mailVend, password: pw });
    chequear('Ya no puede entrar', r.e === 403 && r.j.baneada, r);
    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
